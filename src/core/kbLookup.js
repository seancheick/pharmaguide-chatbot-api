/**
 * Knowledge-augmented LLM context builder.
 * Looks up entities in the knowledge base and builds a context block
 * injected as a system message before the user message.
 *
 * Context depth scales with query complexity:
 *   - Simple queries: top 4 entries, ~300 tokens (fast)
 *   - Complex queries: up to 6 entries, ~500 tokens (thorough)
 */

const { getKBEntriesForEntities } = require("../config/knowledgeBase");
const { getCandidatesForGoals } = require("./wellnessGoalMap");

/**
 * Build a KB context string for LLM injection.
 * @param {object} entities - from extractEntities()
 * @param {number} complexity - query complexity score (1-5)
 * @returns {{ context: string, hits: number, entries: object[] }}
 */
function buildKBContext(entities, complexity = 2) {
  if (!entities) return { context: "", hits: 0, entries: [] };

  const allNames = [
    ...(entities.meds || []),
    ...(entities.supplements || []),
  ];

  const entries = getKBEntriesForEntities(allNames);
  if (entries.length === 0) return { context: "", hits: 0, entries: [] };

  // Scale context depth with complexity
  const maxEntries = complexity >= 4 ? 6 : 4;
  const includeFormDetails = complexity >= 3;
  const includeAllInteractions = complexity >= 4;

  const blocks = [];

  for (const entry of entries.slice(0, maxEntries)) {
    const lines = [];
    lines.push(`[${entry.canonical.toUpperCase()}]`);

    // Category
    if (entry.category) {
      lines.push(`Category: ${entry.category}`);
    }

    // Dose range
    if (entry.adult_dose_range) {
      const dr = entry.adult_dose_range;
      lines.push(`Typical adult dose: ${dr.min}–${dr.max} ${dr.unit}`);
    }

    // Upper limit
    if (entry.upper_limit && entry.upper_limit.value) {
      lines.push(`Upper limit: ${entry.upper_limit.value} ${entry.upper_limit.unit}`);
    }

    // Form-specific details for complex queries
    if (includeFormDetails && entry.forms) {
      const formLines = Object.entries(entry.forms)
        .slice(0, 3) // top 3 forms
        .map(([name, f]) => {
          const parts = [name];
          if (f.absorption) parts.push(`absorption: ${f.absorption}`);
          if (f.best_for) parts.push(`best for: ${f.best_for.join(", ")}`);
          return parts.join(" — ");
        });
      if (formLines.length > 0) {
        lines.push(`Forms: ${formLines.join(" | ")}`);
      }
    }

    // Timing (one line)
    if (entry.timing) {
      const t = entry.timing;
      const parts = [];
      if (t.best_time) parts.push(t.best_time);
      if (t.with_food) parts.push("with food");
      else if (t.with_food === false) parts.push("empty stomach");
      if (t.separate_from && t.separate_from.length > 0) {
        parts.push(`separate from: ${t.separate_from.join(", ")}`);
      }
      if (parts.length > 0) lines.push(`Timing: ${parts.join("; ")}`);
    }

    // Population flags (only if relevant to this conversation)
    const pops = entities.populations || [];
    if (entry.populations) {
      for (const pop of pops) {
        const popData = entry.populations[pop];
        if (popData) {
          const safety = popData.safe ? "Generally safe" : "Use caution/avoid";
          lines.push(`${pop}: ${safety} — ${popData.notes}`);
        }
      }
    }

    // Interactions — show more for complex queries
    if (entry.interactions && entry.interactions.length > 0) {
      const maxIx = includeAllInteractions ? 4 : 2;
      const topIx = entry.interactions
        .filter(ix => ix.severity === "high" || ix.severity === "moderate")
        .slice(0, maxIx);
      for (const ix of topIx) {
        const timingNote = ix.timing_fix ? ` (${ix.timing_fix})` : "";
        lines.push(`⚠ ${ix.with}: ${ix.severity} — ${ix.mechanism}${timingNote}`);
      }
    }

    // Common goals (helps LLM understand user intent)
    if (entry.common_goals && entry.common_goals.length > 0) {
      lines.push(`Common uses: ${entry.common_goals.join(", ")}`);
    }

    blocks.push(lines.join("\n"));
  }

  // Cross-reference: flag known interactions between the entities the user mentioned
  const crossInteractions = findCrossInteractions(entries, allNames);
  if (crossInteractions.length > 0) {
    blocks.push("CROSS-INTERACTIONS BETWEEN USER'S ITEMS:\n" + crossInteractions.join("\n"));
  }

  const context = "VERIFIED REFERENCE DATA (use to ground your response — prioritize this data over general knowledge):\n" + blocks.join("\n\n");

  return { context, hits: entries.length, entries };
}

/**
 * Find interactions between the entities the user is asking about.
 * This surfaces relevant pairwise interactions the LLM might otherwise miss.
 */
function findCrossInteractions(entries, allNames) {
  const nameSet = new Set(allNames.map(n => n.toLowerCase()));
  const results = [];

  for (const entry of entries) {
    if (!entry.interactions) continue;
    for (const ix of entry.interactions) {
      // Check if the "with" field matches any other entity the user mentioned
      const ixWith = ix.with.toLowerCase();
      for (const name of nameSet) {
        if (name === entry.canonical) continue;
        if (ixWith.includes(name) || name.includes(ixWith)) {
          results.push(`⚠ ${entry.canonical} + ${ix.with}: ${ix.severity} — ${ix.mechanism}`);
        }
      }
    }
  }

  return [...new Set(results)]; // deduplicate
}

/**
 * Build the full LLM messages array with KB context injected.
 *
 * @param {string}   systemPrompt - base system prompt
 * @param {object[]} safeHistory  - sanitized conversation history
 * @param {string}   userMessage  - current user message
 * @param {object}   entities     - from extractEntities()
 * @param {number|object} opts    - either a numeric complexity (1-5)
 *   for back-compat with existing callers, OR an options object:
 *   { complexity?: number, wellnessGoals?: string[] }
 *
 * When `wellnessGoals` is provided AND the entity-based KB lookup
 * returns zero entries, the function falls back to the goal→candidates
 * map and injects the top-ranked KB entries for those candidates.
 * This is what gives goal-only queries ("what can I take to sleep
 * better") their grounding instead of leaving the LLM to wing it.
 *
 * @returns {{ messages: object[], kbHits: number, source?: string }}
 */
function buildAugmentedMessages(systemPrompt, safeHistory, userMessage, entities, opts) {
  // Back-compat: opts can be a numeric complexity for legacy callers.
  const optsObj =
    typeof opts === "number" || opts == null
      ? { complexity: typeof opts === "number" ? opts : 2 }
      : opts;
  const complexity = typeof optsObj.complexity === "number" ? optsObj.complexity : 2;
  const wellnessGoals = Array.isArray(optsObj.wellnessGoals) ? optsObj.wellnessGoals : [];

  // Primary KB lookup driven by extracted entities.
  let { context, hits } = buildKBContext(entities, complexity);
  let source = hits > 0 ? "entities" : null;

  // Fallback: goal-only queries (no specific supplement named).
  // Synthesize a candidate-entities object and look up the goal's
  // top-ranked supplements in the KB.
  if (hits === 0 && wellnessGoals.length > 0) {
    const candidates = getCandidatesForGoals(wellnessGoals);
    if (candidates.length > 0) {
      const synthEntities = {
        meds: [],
        supplements: candidates,
        populations: entities && entities.populations ? entities.populations : [],
      };
      const goalCtx = buildKBContext(synthEntities, complexity);
      if (goalCtx.hits > 0) {
        // Prepend a hint so the LLM knows these were goal-derived
        // candidates rather than items the user explicitly named.
        const header = `WELLNESS GOAL CANDIDATES (user asked about: ${wellnessGoals.join(", ")}). Use this evidence base to discuss options, do not assume the user is already taking any of these. Always advise consulting a healthcare provider, especially if they take prescription medications.\n\n`;
        context = header + goalCtx.context;
        hits = goalCtx.hits;
        source = "wellness-goals";
      }
    }
  }

  const messages = [
    { role: "system", content: systemPrompt },
  ];

  // Inject KB context as a system message if we have hits
  if (context) {
    messages.push({ role: "system", content: context });
  }

  // Add conversation history
  messages.push(...safeHistory);

  // Add user message
  messages.push({ role: "user", content: userMessage.trim() });

  return { messages, kbHits: hits, source };
}

module.exports = { buildKBContext, buildAugmentedMessages, findCrossInteractions };

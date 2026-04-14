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
 * @param {string} systemPrompt - base system prompt
 * @param {object[]} safeHistory - sanitized conversation history
 * @param {string} userMessage - current user message
 * @param {object} entities - from extractEntities()
 * @param {number} complexity - query complexity score (1-5)
 * @returns {{ messages: object[], kbHits: number }}
 */
function buildAugmentedMessages(systemPrompt, safeHistory, userMessage, entities, complexity = 2) {
  const { context, hits } = buildKBContext(entities, complexity);

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

  return { messages, kbHits: hits };
}

module.exports = { buildKBContext, buildAugmentedMessages, findCrossInteractions };

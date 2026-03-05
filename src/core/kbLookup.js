/**
 * Knowledge-augmented LLM context builder.
 * Looks up entities in the knowledge base and builds a compact context block
 * (~300 tokens) injected as a system message before the user message.
 */

const { getKBEntriesForEntities } = require("../config/knowledgeBase");

/**
 * Build a compact KB context string for LLM injection.
 * @param {object} entities - from extractEntities()
 * @returns {{ context: string, hits: number, entries: object[] }}
 */
function buildKBContext(entities) {
  if (!entities) return { context: "", hits: 0, entries: [] };

  const allNames = [
    ...(entities.meds || []),
    ...(entities.supplements || []),
  ];

  const entries = getKBEntriesForEntities(allNames);
  if (entries.length === 0) return { context: "", hits: 0, entries: [] };

  const blocks = [];

  for (const entry of entries.slice(0, 4)) { // cap at 4 to stay under ~300 tokens
    const lines = [];
    lines.push(`[${entry.canonical.toUpperCase()}]`);

    // Dose range
    if (entry.adult_dose_range) {
      const dr = entry.adult_dose_range;
      lines.push(`Typical adult dose: ${dr.min}–${dr.max} ${dr.unit}`);
    }

    // Upper limit
    if (entry.upper_limit && entry.upper_limit.value) {
      lines.push(`Upper limit: ${entry.upper_limit.value} ${entry.upper_limit.unit}`);
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

    // Key interactions (top 2, brief)
    if (entry.interactions && entry.interactions.length > 0) {
      const topIx = entry.interactions
        .filter(ix => ix.severity === "high" || ix.severity === "moderate")
        .slice(0, 2);
      for (const ix of topIx) {
        lines.push(`⚠ ${ix.with}: ${ix.severity} — ${ix.mechanism}`);
      }
    }

    blocks.push(lines.join("\n"));
  }

  const context = "VERIFIED REFERENCE DATA (use to ground your response):\n" + blocks.join("\n\n");

  return { context, hits: entries.length, entries };
}

/**
 * Build the full LLM messages array with KB context injected.
 * @param {string} systemPrompt - base system prompt
 * @param {object[]} safeHistory - sanitized conversation history
 * @param {string} userMessage - current user message
 * @param {object} entities - from extractEntities()
 * @returns {{ messages: object[], kbHits: number }}
 */
function buildAugmentedMessages(systemPrompt, safeHistory, userMessage, entities) {
  const { context, hits } = buildKBContext(entities);

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

module.exports = { buildKBContext, buildAugmentedMessages };

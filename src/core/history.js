const { normalizeText } = require("./normalize");
const { detectPopulations } = require("../gates/detection");

const ALLOWED_POPULATIONS = new Set(["pregnancy", "elderly", "renal", "liver", "pediatric"]);
const ALLOWED_CONDITIONS = new Set(["diabetes", "thyroid", "seizure_history", "bariatric_surgery"]);

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const allowedRoles = new Set(["user", "assistant"]);
  return history
    .slice(-10)
    .map((m) => {
      const role = allowedRoles.has(m?.role) ? m.role : "user";
      const content = typeof m?.content === "string" ? m.content.slice(0, 1000) : "";
      return { role, content };
    })
    .filter((m) => m.content.trim().length > 0);
}

function getConversationContext(message, safeHistory) {
  const recentUserMessages = safeHistory
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.content);
  return normalizeText([...recentUserMessages, message].join(" "));
}

// ── Conversation State Persistence ──
// Extracts key patient facts from the full conversation so they persist
// across turns even when older messages scroll out of context.

/**
 * Extract persistent facts from the entire conversation history.
 * Returns a state object that can be merged into future turns.
 *
 * @param {string} currentMessage - current user message
 * @param {object[]} safeHistory - sanitized history
 * @param {object} previousState - state from previous response (if client sends it back)
 * @returns {{ populations: string[], known_meds: string[], known_supps: string[], conditions: string[] }}
 */
function extractConversationState(currentMessage, safeHistory, previousState = null) {
  // Client-supplied state is untrusted: keep only known enum values. These strings end up
  // in a system-role prompt message and in analytics events, so free text must never pass.
  const prev = previousState && typeof previousState === "object" ? previousState : {};
  const onlyAllowed = (val, allowed) => (Array.isArray(val) ? val.filter((v) => typeof v === "string" && allowed.has(v)) : []);

  const state = {
    populations: new Set(onlyAllowed(prev.populations, ALLOWED_POPULATIONS)),
    conditions: new Set(onlyAllowed(prev.conditions, ALLOWED_CONDITIONS)),
  };

  // Scan all user messages (including current) for persistent facts
  const allUserText = [
    ...safeHistory.filter(m => m.role === "user").map(m => m.content),
    currentMessage,
  ].join(" ");

  const t = normalizeText(allUserText);

  // Populations (these are critical safety facts — never lose them)
  for (const pop of detectPopulations(allUserText)) state.populations.add(pop);

  // Key conditions (affect safety recommendations)
  if (/\b(diabetes|diabetic|type [12] diabetes|blood sugar|a1c)\b/.test(t)) {
    state.conditions.add("diabetes");
  }
  if (/\b(thyroid|hashimoto|graves|hypothyroid|hyperthyroid)\b/.test(t)) {
    state.conditions.add("thyroid");
  }
  if (/\b(seizure|epilepsy|epileptic)\b/.test(t)) {
    state.conditions.add("seizure_history");
  }
  if (/\b(bariatric|gastric bypass|roux.en.y|sleeve|lap.?band)\b/.test(t)) {
    state.conditions.add("bariatric_surgery");
  }

  // known_meds / known_supps are kept in the shape for client compatibility but are
  // never populated: nothing server-side derives them, and echoing client values back
  // would just launder untrusted text.
  return {
    populations: [...state.populations],
    known_meds: [],
    known_supps: [],
    conditions: [...state.conditions],
  };
}

/**
 * Merge persisted state into entities so risk scoring uses full context.
 * @param {object} entities - from extractEntities()
 * @param {object} conversationState - from extractConversationState()
 * @returns {object} entities with merged populations and conditions
 */
function mergeStateIntoEntities(entities, conversationState) {
  if (!conversationState) return entities;

  // Merge populations (deduplicate) — return a NEW object, never mutate the original
  const mergedPops = new Set([...(entities.populations || []), ...(conversationState.populations || [])]);

  return {
    meds: [...(entities.meds || [])],
    supplements: [...(entities.supplements || [])],
    symptoms: [...(entities.symptoms || [])],
    intents: [...(entities.intents || [])],
    unknowns: [...(entities.unknowns || [])],
    drug_classes: [...(entities.drug_classes || [])],
    populations: [...mergedPops],
    _persisted_conditions: conversationState.conditions || [],
  };
}

module.exports = { sanitizeHistory, getConversationContext, extractConversationState, mergeStateIntoEntities };

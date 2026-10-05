const { normalizeText } = require("./normalize");

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
  // Validate and sanitize client-provided state (could be garbage or malicious)
  const safeArr = (val) => (Array.isArray(val) ? val.filter(v => typeof v === "string") : []);
  const prev = previousState && typeof previousState === "object" ? previousState : {};

  const state = {
    populations: new Set(safeArr(prev.populations)),
    known_meds: new Set(safeArr(prev.known_meds)),
    known_supps: new Set(safeArr(prev.known_supps)),
    conditions: new Set(safeArr(prev.conditions)),
  };

  // Scan all user messages (including current) for persistent facts
  const allUserText = [
    ...safeHistory.filter(m => m.role === "user").map(m => m.content),
    currentMessage,
  ].join(" ");

  const t = normalizeText(allUserText);

  // Populations (these are critical safety facts — never lose them)
  if (/\b(pregnan(t|cy)|expecting|trimester|prenatal|breastfeed(ing)?|nursing|lactating)\b/.test(t)) {
    state.populations.add("pregnancy");
  }
  if (/\b(elderly|65\+|senior|geriatric|older\s*adult|i m \d{2,}|my (mom|dad|mother|father|grandmother|grandfather).{0,20}(age|old|year))\b/.test(t)) {
    state.populations.add("elderly");
  }
  if (/\b(kidney|renal|ckd|dialysis|creatinine|gfr|nephro|one kidney)\b/.test(t)) {
    state.populations.add("renal");
  }
  if (/\b(liver (disease|damage|failure|cirrhosis)|hepatitis|cirrhosis|fatty liver)\b/.test(t)) {
    state.populations.add("liver");
  }
  if (/\b(child|kid|infant|toddler|baby|pediatric|my (son|daughter)|year.?old)\b/.test(t)) {
    state.populations.add("pediatric");
  }

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

  return {
    populations: [...state.populations],
    known_meds: [...state.known_meds],
    known_supps: [...state.known_supps],
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

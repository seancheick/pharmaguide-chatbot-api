/**
 * Thin session memory — carries forward only structured facts across turns.
 *
 * Stores ONLY:
 * - populations (pregnancy, elderly, renal)
 * - goal_category (sleep, energy, anxiety, pain, general)
 * - med_list (canonical medication names only — no free text, no doses)
 * - supp_list (canonical supplement/mineral names only — no free text, no doses)
 *
 * Does NOT store: free text, doses, lab values, or PHI.
 *
 * TTL = session (in-memory, resets on cold start).
 */

// ── Goal detection patterns ──
const GOAL_PATTERNS = [
  { pattern: /\b(sleep|insomnia|can.?t sleep|trouble sleeping|falling asleep|staying asleep)\b/i, goal: "sleep" },
  { pattern: /\b(energy|fatigue|tired|exhausted|low energy|brain fog|lethargy)\b/i, goal: "energy" },
  { pattern: /\b(anxiety|anxious|stress|nervous|calm|relax|panic)\b/i, goal: "anxiety" },
  { pattern: /\b(pain|ache|sore|inflammation|joint|muscle pain|headache|migraine)\b/i, goal: "pain" },
  { pattern: /\b(mood|depression|depressed|sad|low mood|mental health)\b/i, goal: "mood" },
  { pattern: /\b(focus|concentration|adhd|attention|cognitive|memory|brain)\b/i, goal: "focus" },
  { pattern: /\b(immune|cold|flu|sick|immunity|infection)\b/i, goal: "immune" },
  { pattern: /\b(gut|digest|bloat|ibs|stomach|probiotic|constipat)\b/i, goal: "gut" },
];

/**
 * Create a fresh session memory object.
 */
function createSessionMemory() {
  return {
    populations: [],
    goal_category: null,
    med_list: [],
    supp_list: [],
    turn_count: 0,
  };
}

/**
 * Detect goal category from message text.
 * Returns the first matched goal or null.
 */
function detectGoal(text) {
  const lower = (text || "").toLowerCase();
  for (const { pattern, goal } of GOAL_PATTERNS) {
    if (pattern.test(lower)) return goal;
  }
  return null;
}

/**
 * Update session memory with new turn data.
 * Merges populations (deduped), updates goal if detected.
 * Returns the updated memory (mutates in place).
 */
function updateSessionMemory(memory, entities, message) {
  memory.turn_count++;

  // Merge populations (deduped)
  const newPops = (entities && entities.populations) || [];
  for (const pop of newPops) {
    if (!memory.populations.includes(pop)) {
      memory.populations.push(pop);
    }
  }

  // Merge med_list (deduped, canonical names only)
  const newMeds = (entities && entities.meds) || [];
  for (const med of newMeds) {
    const canonical = med.toLowerCase();
    if (!memory.med_list.includes(canonical)) {
      memory.med_list.push(canonical);
    }
  }

  // Merge supp_list (deduped, canonical names only)
  const newSupps = (entities && entities.supplements) || [];
  for (const supp of newSupps) {
    const canonical = supp.toLowerCase();
    if (!memory.supp_list.includes(canonical)) {
      memory.supp_list.push(canonical);
    }
  }

  // Detect goal from message (first detected goal wins, don't overwrite)
  if (!memory.goal_category && message) {
    const goal = detectGoal(message);
    if (goal) memory.goal_category = goal;
  }

  return memory;
}

/**
 * Check if a clarifier should be skipped because we already know the answer.
 * Returns { skip: boolean, reason: string | null }.
 */
function shouldSkipClarifier(memory, fieldName) {
  // If we already know the population, skip population-related clarifiers
  if (fieldName === "reason_for_use" && memory.goal_category) {
    return { skip: true, reason: `goal already known: ${memory.goal_category}` };
  }

  return { skip: false, reason: null };
}

/**
 * Get a summary of what we know (for diagnostics, no PHI).
 */
function getMemorySummary(memory) {
  return {
    populations: memory.populations,
    goal_category: memory.goal_category,
    med_list: memory.med_list || [],
    supp_list: memory.supp_list || [],
    turn_count: memory.turn_count,
    has_populations: memory.populations.length > 0,
    has_goal: memory.goal_category !== null,
    has_meds: (memory.med_list || []).length > 0,
    has_supps: (memory.supp_list || []).length > 0,
  };
}

/**
 * Build a context string from session memory for LLM injection.
 * Returns empty string if nothing useful is stored.
 */
function buildMemoryContext(memory) {
  if (!memory) return "";
  const parts = [];

  if (memory.med_list && memory.med_list.length > 0) {
    parts.push(`Previously mentioned medications: ${memory.med_list.join(", ")}`);
  }
  if (memory.supp_list && memory.supp_list.length > 0) {
    parts.push(`Previously mentioned supplements: ${memory.supp_list.join(", ")}`);
  }
  if (memory.populations && memory.populations.length > 0) {
    parts.push(`Population context: ${memory.populations.join(", ")}`);
  }
  if (memory.goal_category) {
    parts.push(`User goal: ${memory.goal_category}`);
  }

  return parts.length > 0 ? parts.join(". ") + "." : "";
}

module.exports = {
  createSessionMemory,
  detectGoal,
  updateSessionMemory,
  shouldSkipClarifier,
  getMemorySummary,
  buildMemoryContext,
  GOAL_PATTERNS,
};

/**
 * Thin session memory — carries forward only structured facts across turns.
 *
 * Stores ONLY:
 * - populations (pregnancy, elderly, renal)
 * - goal_category (sleep, energy, anxiety, pain, general)
 *
 * Does NOT store: free text, med/supp names, doses, lab values.
 * Entity extraction re-derives meds/supps from conversation context each turn.
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
    turn_count: memory.turn_count,
    has_populations: memory.populations.length > 0,
    has_goal: memory.goal_category !== null,
  };
}

module.exports = {
  createSessionMemory,
  detectGoal,
  updateSessionMemory,
  shouldSkipClarifier,
  getMemorySummary,
  GOAL_PATTERNS,
};

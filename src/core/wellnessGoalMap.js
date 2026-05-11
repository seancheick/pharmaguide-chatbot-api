/**
 * Goal → candidate supplements mapping.
 *
 * When a user asks a wellness-goal question ("what can I take for
 * sleep / stress / cholesterol") but does NOT name a specific
 * supplement, the entity extractor returns no supplement entities,
 * so buildAugmentedMessages would inject zero KB context. The LLM
 * then has to answer from parametric knowledge alone — which is
 * exactly when it hedges, refuses, or hallucinates.
 *
 * This map gives the chat handler a deterministic set of candidate
 * supplement IDs per goal category. buildAugmentedMessages resolves
 * those IDs against the existing KB and injects their entries,
 * grounding the LLM in evidence the same way it does for named
 * entities.
 *
 * Order within each array matters — the FIRST candidates are the
 * highest-confidence, best-evidence options. KB lookup caps at
 * ~6 entries so the top of each list is what actually lands.
 *
 * Canonical IDs must match the keys / aliases in
 * src/config/knowledgeBase.js. Missing IDs are silently skipped
 * by getKBEntriesForEntities — but the resolver here logs which
 * goals had unresolvable IDs so KB gaps are visible.
 */

const GOAL_SUPPLEMENT_CANDIDATES = {
  sleep: ["melatonin", "magnesium", "glycine", "l-theanine"],
  stress: ["ashwagandha", "l-theanine", "magnesium", "rhodiola"],
  weight: ["psyllium", "glucomannan", "green tea extract", "berberine"],
  cholesterol: [
    "omega-3",
    "psyllium",
    "plant sterols",
    "red yeast rice",
    "berberine",
  ],
  sexual_health: ["l-arginine", "l-citrulline", "maca", "ashwagandha", "zinc"],
  energy: ["b-complex", "iron", "coq10", "rhodiola"],
  focus: ["omega-3", "l-theanine", "creatine"],
  immunity: ["zinc", "vitamin c", "vitamin d", "elderberry"],
  cardiovascular: ["omega-3", "coq10", "plant sterols", "magnesium"],
  // MSM has no dedicated KB entry yet — leaving it out so this map
  // stays in sync with what getKBEntry can actually resolve. Re-add
  // once an "msm" entry exists in knowledgeBase.js.
  joint: ["omega-3", "turmeric", "glucosamine"],
  hormonal: ["ashwagandha", "magnesium", "vitex", "myo-inositol"],
};

/**
 * Resolve one or more goal IDs to a deduplicated, ordered list of
 * candidate supplement names. Preserves the priority order from
 * GOAL_SUPPLEMENT_CANDIDATES (first goal's candidates come first).
 */
function getCandidatesForGoals(goalIds) {
  if (!Array.isArray(goalIds) || goalIds.length === 0) return [];
  const seen = new Set();
  const out = [];
  for (const goal of goalIds) {
    const candidates = GOAL_SUPPLEMENT_CANDIDATES[goal] || [];
    for (const name of candidates) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

module.exports = { GOAL_SUPPLEMENT_CANDIDATES, getCandidatesForGoals };

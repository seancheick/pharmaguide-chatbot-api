/**
 * What an answer is based on (the `basis` field of every chat response).
 *
 * The label names the material that grounded the answer, never the model that wrote it or whether it
 * came from the cache. It replaced a "confidence" label that called a strong model with two knowledge-base
 * hits "clinical guidelines" (2026-11-10 regulatory review): no guideline had been checked.
 *
 *   pharmaguide_record  the answer explains a PharmaGuide interaction record or a curated safety notice
 *   reference_data      the answer drew on PharmaGuide's supplement reference data (doses, limits, forms)
 *   general_background  neither matched: general background the user should check with a pharmacist
 *
 * A degraded "service busy" reply carries no basis.
 */

const BASIS_LABELS = {
  pharmaguide_record: "From PharmaGuide's interaction records",
  reference_data: "Uses PharmaGuide reference data",
  general_background: "General background — check with your pharmacist",
};

function resolveBasis({ gate = false, pipelineRecords = 0, kbHits = 0 } = {}) {
  if (gate || pipelineRecords > 0) return "pharmaguide_record";
  if (kbHits > 0) return "reference_data";
  return "general_background";
}

module.exports = { resolveBasis, BASIS_LABELS };

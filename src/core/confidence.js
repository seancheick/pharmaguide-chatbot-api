/**
 * Confidence signal module.
 * Determines the confidence level for API responses based on the source.
 *
 * Levels:
 *   "high"     — Gate reply backed by approved claims (deterministic)
 *   "moderate" — LLM response with KB context hits (grounded)
 *   "low"      — LLM response without KB hits (general knowledge)
 *
 * Frontend can render:
 *   high     → "Based on clinical guidelines"
 *   moderate → "Based on available evidence"
 *   low      → "General knowledge — verify with pharmacist"
 */

const CONFIDENCE_LABELS = {
  high: "Based on clinical guidelines",
  moderate: "Based on available evidence",
  low: "General knowledge — verify with pharmacist",
};

/**
 * Determine confidence level for a response.
 * @param {string} source - "gate" | "cache" | "llm" | "degraded"
 * @param {number} kbHits - number of KB entries matched (for LLM path)
 * @returns {{ confidence: string, label: string }}
 */
function resolveConfidence(source, kbHits) {
  if (source === "gate" || source === "cache") {
    return { confidence: "high", label: CONFIDENCE_LABELS.high };
  }

  if (source === "degraded") {
    return { confidence: "low", label: CONFIDENCE_LABELS.low };
  }

  // LLM path
  if (kbHits > 0) {
    return { confidence: "moderate", label: CONFIDENCE_LABELS.moderate };
  }

  return { confidence: "low", label: CONFIDENCE_LABELS.low };
}

module.exports = { resolveConfidence, CONFIDENCE_LABELS };

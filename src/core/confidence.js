/**
 * Confidence signal module.
 * Determines the confidence level for API responses based on the source,
 * provider quality, and KB grounding.
 *
 * Levels:
 *   "high"     — Gate reply backed by approved claims (deterministic),
 *                OR strong model (Gemini) with multiple KB hits
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

// Providers ranked by medical reasoning accuracy
const STRONG_PROVIDERS = new Set(["gemini"]);

/**
 * Determine confidence level for a response.
 * @param {string} source - "gate" | "cache" | "llm" | "degraded"
 * @param {number} kbHits - number of KB entries matched (for LLM path)
 * @param {string} [provider] - "gemini" | "groq" | null
 * @returns {{ confidence: string, label: string }}
 */
function resolveConfidence(source, kbHits, provider = null) {
  if (source === "gate" || source === "cache") {
    return { confidence: "high", label: CONFIDENCE_LABELS.high };
  }

  if (source === "degraded") {
    return { confidence: "low", label: CONFIDENCE_LABELS.low };
  }

  // LLM path — factor in provider strength and KB grounding
  const isStrong = STRONG_PROVIDERS.has(provider);

  if (kbHits >= 2 && isStrong) {
    // Strong model + well-grounded in KB data → high confidence
    return { confidence: "high", label: CONFIDENCE_LABELS.high };
  }

  if (kbHits > 0) {
    return { confidence: "moderate", label: CONFIDENCE_LABELS.moderate };
  }

  // No KB hits — but a strong model's general medical knowledge is still decent
  if (isStrong) {
    return { confidence: "moderate", label: CONFIDENCE_LABELS.moderate };
  }

  return { confidence: "low", label: CONFIDENCE_LABELS.low };
}

module.exports = { resolveConfidence, CONFIDENCE_LABELS };

/**
 * Graceful degradation handlers.
 * Provides safe fallback responses when infrastructure fails.
 */

const DEGRADED_RESPONSES = {
  llm_timeout: [
    "I'm experiencing a brief delay. Let me give you what I can right now.",
    "",
    "For your safety:",
    "• If this involves a **medication + supplement interaction**, please check with your pharmacist before combining them.",
    "• If you're having **symptoms**, contact your prescriber.",
    "",
    "Could you try your question again in a moment?",
  ].join("\n"),

  llm_error: [
    "I wasn't able to fully process your question right now.",
    "",
    "• If you're asking about a **supplement interaction**, your pharmacist can help immediately.",
    "• If you're experiencing **symptoms**, please contact your prescriber or go to urgent care.",
    "",
    "Try again in a moment — I'm here to help with supplements, medications, and interactions.",
  ].join("\n"),

  rate_limited: "Too many requests. Please wait a moment before trying again.",

  service_unavailable: [
    "The service is temporarily unavailable.",
    "",
    "For urgent medication or supplement questions:",
    "• Call your pharmacist",
    "• Call Poison Control: **1-800-222-1222**",
    "• For emergencies: call **911**",
  ].join("\n"),
};

/**
 * Returns a safe degraded response for the given failure mode.
 */
function getDegradedResponse(failureMode) {
  return DEGRADED_RESPONSES[failureMode] || DEGRADED_RESPONSES.llm_error;
}

/**
 * Wraps an async LLM call with timeout and graceful degradation.
 * Returns { reply, degraded: boolean }.
 */
async function withGracefulFallback(llmCallFn, timeoutMs = 8000) {
  try {
    const result = await Promise.race([
      llmCallFn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("LLM_TIMEOUT")), timeoutMs)
      ),
    ]);
    return { reply: result, degraded: false };
  } catch (error) {
    const mode = error.message === "LLM_TIMEOUT" ? "llm_timeout" : "llm_error";
    return { reply: getDegradedResponse(mode), degraded: true, error: error.message };
  }
}

module.exports = { DEGRADED_RESPONSES, getDegradedResponse, withGracefulFallback };

/**
 * Circuit breaker for Gemini provider.
 * Identical pattern to the Groq circuit breaker but independent state
 * so one provider's failures don't block the other.
 *
 * States: CLOSED → OPEN → HALF_OPEN → CLOSED
 */

const FAILURE_THRESHOLD = 4;
const OPEN_DURATION_MS = 45000; // 45s — Gemini recovers slower than Groq
const SUCCESS_THRESHOLD = 2;

let state = "CLOSED";
let failureCount = 0;
let successCount = 0;
let lastFailureTime = 0;

function getState() {
  if (state === "OPEN" && Date.now() - lastFailureTime >= OPEN_DURATION_MS) {
    state = "HALF_OPEN";
    successCount = 0;
  }
  return state;
}

function allowRequest() {
  const current = getState();
  if (current === "CLOSED") return { allowed: true, state: current };
  if (current === "HALF_OPEN") return { allowed: true, state: current };
  return { allowed: false, state: current };
}

function recordSuccess() {
  const current = getState();
  if (current === "HALF_OPEN") {
    successCount++;
    if (successCount >= SUCCESS_THRESHOLD) {
      state = "CLOSED";
      failureCount = 0;
      successCount = 0;
    }
  } else if (current === "CLOSED") {
    failureCount = 0;
  }
}

function recordFailure() {
  const current = getState();
  lastFailureTime = Date.now();

  if (current === "HALF_OPEN") {
    state = "OPEN";
    successCount = 0;
  } else if (current === "CLOSED") {
    failureCount++;
    if (failureCount >= FAILURE_THRESHOLD) {
      state = "OPEN";
    }
  }
}

function getStats() {
  return {
    state: getState(),
    failure_count: failureCount,
    success_count: successCount,
    last_failure_time: lastFailureTime ? new Date(lastFailureTime).toISOString() : null,
  };
}

function reset() {
  state = "CLOSED";
  failureCount = 0;
  successCount = 0;
  lastFailureTime = 0;
}

module.exports = {
  getState,
  allowRequest,
  recordSuccess,
  recordFailure,
  getStats,
  reset,
  FAILURE_THRESHOLD,
  OPEN_DURATION_MS,
  SUCCESS_THRESHOLD,
};

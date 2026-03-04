/**
 * Circuit breaker for LLM provider calls.
 *
 * States:
 *   CLOSED   → normal operation, requests go through
 *   OPEN     → too many failures, skip LLM and return degraded response
 *   HALF_OPEN → probe: allow one request through to test recovery
 *
 * Resets on Vercel cold start (in-memory, stateless-safe).
 */

// ── Config ──
const FAILURE_THRESHOLD = 5;     // failures before opening
const OPEN_DURATION_MS = 30000;  // 30s in OPEN before probing
const SUCCESS_THRESHOLD = 2;     // successes in HALF_OPEN to close

// ── State ──
let state = "CLOSED";
let failureCount = 0;
let successCount = 0;
let lastFailureTime = 0;

/**
 * Get current circuit state.
 * Automatically transitions OPEN → HALF_OPEN after cooldown.
 */
function getState() {
  if (state === "OPEN" && Date.now() - lastFailureTime >= OPEN_DURATION_MS) {
    state = "HALF_OPEN";
    successCount = 0;
  }
  return state;
}

/**
 * Check if a request should be allowed through.
 * Returns { allowed: boolean, state: string }.
 */
function allowRequest() {
  const current = getState();
  if (current === "CLOSED") return { allowed: true, state: current };
  if (current === "HALF_OPEN") return { allowed: true, state: current };
  // OPEN — block
  return { allowed: false, state: current };
}

/**
 * Record a successful LLM call.
 */
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
    // Reset failure count on success
    failureCount = 0;
  }
}

/**
 * Record a failed LLM call.
 */
function recordFailure() {
  const current = getState();
  lastFailureTime = Date.now();

  if (current === "HALF_OPEN") {
    // Probe failed — go back to OPEN
    state = "OPEN";
    successCount = 0;
  } else if (current === "CLOSED") {
    failureCount++;
    if (failureCount >= FAILURE_THRESHOLD) {
      state = "OPEN";
    }
  }
}

/**
 * Get circuit breaker stats for diagnostics.
 */
function getStats() {
  return {
    state: getState(),
    failure_count: failureCount,
    success_count: successCount,
    last_failure_time: lastFailureTime ? new Date(lastFailureTime).toISOString() : null,
  };
}

/**
 * Reset circuit breaker to CLOSED state.
 */
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
  // Exposed for testing
  FAILURE_THRESHOLD,
  OPEN_DURATION_MS,
  SUCCESS_THRESHOLD,
};

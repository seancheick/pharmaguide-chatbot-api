/**
 * Whether the AI path is actually producing answers.
 *
 * /api/health used to report configuration and circuit state only, so it said "gemini, CLOSED" while
 * every request failed with HTTP 402 (prepaid credit depleted). The provider chain now records, in the
 * shared Redis store, when an answer was last produced and when every provider last failed (provider and
 * HTTP status only, never error text), and /api/health reads it back.
 *
 * Never breaks a request and delays it by at most WRITE_TIMEOUT_MS: a write swallows its own errors and
 * gives up waiting after that cap; a read has a timeout. Without Redis the state is "unknown".
 *
 * Every answer is recorded (one small Redis write). A per-server throttle would let one server's recent
 * success hide another server's later failure, and vice versa. The caller awaits the write because a
 * serverless function may be frozen once it has replied, and an unfinished write would be lost.
 */

const redisClient = require("./redisClient");

const KEY_OK = "pg:llm:last_ok";
const KEY_FAIL = "pg:llm:last_fail";
const TTL_SECONDS = 7 * 24 * 3600;
const WRITE_TIMEOUT_MS = 250;

function write(key, value) {
  let timer;
  try {
    const redis = redisClient.getRedis();
    if (!redis) return Promise.resolve();
    const done = Promise.resolve(redis.set(key, JSON.stringify(value), { ex: TTL_SECONDS })).catch(() => {});
    const capped = new Promise((resolve) => { timer = setTimeout(resolve, WRITE_TIMEOUT_MS); });
    return Promise.race([done, capped]).finally(() => clearTimeout(timer));
  } catch {
    clearTimeout(timer);
    return Promise.resolve(); // monitoring must never be able to break an answer, even by throwing synchronously
  }
}

/** An answer was produced. */
function recordLlmSuccess(provider, now = Date.now()) {
  return write(KEY_OK, { at: new Date(now).toISOString(), provider: String(provider || "").slice(0, 32) });
}

/** Every provider failed (or none was tried). Provider names and HTTP statuses only. */
function recordLlmFailure(attempts = [], skipped = [], now = Date.now()) {
  return write(KEY_FAIL, {
    at: new Date(now).toISOString(),
    attempts: attempts.map((a) => ({ provider: String(a.provider || "").slice(0, 32), status: Number.isInteger(a.status) ? a.status : null })),
    skipped: skipped.map((s) => ({ provider: String(s.provider || "").slice(0, 32), reason: String(s.reason || "").slice(0, 32) })),
  });
}

const parse = (v) => {
  if (v && typeof v === "object") return v;
  try { return typeof v === "string" ? JSON.parse(v) : null; } catch { return null; }
};

/** { state: "ok" | "failing" | "unknown", last_success, last_failure } */
async function getLlmStatus({ timeoutMs = 1500 } = {}) {
  const redis = redisClient.getRedis();
  if (!redis) return { state: "unknown", reason: "no shared store configured" };
  let timer;
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), timeoutMs); });
    const [okRaw, failRaw] = await Promise.race([redis.mget(KEY_OK, KEY_FAIL), timeout]);
    const ok = parse(okRaw);
    const fail = parse(failRaw);
    let state = "unknown";
    if (ok || fail) state = fail && (!ok || fail.at > ok.at) ? "failing" : "ok";
    return { state, last_success: ok ? ok.at : null, last_failure: fail || null };
  } catch {
    return { state: "unknown", reason: "status store unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { recordLlmSuccess, recordLlmFailure, getLlmStatus, KEY_OK, KEY_FAIL, WRITE_TIMEOUT_MS };

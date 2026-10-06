/**
 * Whether the AI path is actually producing answers.
 *
 * /api/health used to report configuration and circuit state only, so it said "gemini, CLOSED" while
 * every request failed with HTTP 402 (prepaid credit depleted). The provider chain now records, in the
 * shared Redis store, when an answer was last produced and when every provider last failed (provider and
 * HTTP status only, never error text), and /api/health reads it back.
 *
 * Never blocks or breaks a request: every write is fire-and-forget and swallows its own errors, and a
 * read has a timeout. Without Redis the state is "unknown".
 */

const redisClient = require("./redisClient");

const KEY_OK = "pg:llm:last_ok";
const KEY_FAIL = "pg:llm:last_fail";
const TTL_SECONDS = 7 * 24 * 3600;
const OK_WRITE_INTERVAL_MS = 60 * 1000; // a busy instance writes "ok" about once a minute, not per answer

let lastOutcome = null; // "ok" | "fail": this instance's last outcome
let lastOkWrite = 0;

function write(key, value) {
  try {
    const redis = redisClient.getRedis();
    if (!redis) return Promise.resolve();
    return Promise.resolve(redis.set(key, JSON.stringify(value), { ex: TTL_SECONDS })).catch(() => {});
  } catch {
    return Promise.resolve(); // monitoring must never be able to break an answer, even by throwing synchronously
  }
}

/** An answer was produced. Written at most once a minute per instance, but at once after a failure. */
function recordLlmSuccess(provider, now = Date.now()) {
  if (lastOutcome === "ok" && now - lastOkWrite < OK_WRITE_INTERVAL_MS) return Promise.resolve();
  lastOutcome = "ok";
  lastOkWrite = now;
  return write(KEY_OK, { at: new Date(now).toISOString(), provider: String(provider || "").slice(0, 32) });
}

/** Every provider failed (or none was tried). Provider names and HTTP statuses only. */
function recordLlmFailure(attempts = [], skipped = [], now = Date.now()) {
  lastOutcome = "fail";
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

module.exports = { recordLlmSuccess, recordLlmFailure, getLlmStatus, KEY_OK, KEY_FAIL };

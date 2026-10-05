const crypto = require("crypto");
const { Redis } = require("@upstash/redis");
const { Ratelimit } = require("@upstash/ratelimit");

function stripOuterQuotes(v) {
  if (typeof v !== "string") return "";
  return v.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
}

const UPSTASH_URL = stripOuterQuotes(process.env.UPSTASH_REDIS_REST_URL);
const UPSTASH_TOKEN = stripOuterQuotes(process.env.UPSTASH_REDIS_REST_TOKEN);

let ratelimit = null;
try {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    const redis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
    // analytics: false: the limiter's analytics feature keeps the identifiers it is given.
    ratelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "1 m"), analytics: false, prefix: "pgchat" });
  }
} catch (e) {
  console.error("Upstash init failed:", e.message);
  ratelimit = null;
}

const rateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

function checkRateLimitMemory(ip) {
  const now = Date.now();
  const entry = rateLimits.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetTime) { entry.count = 0; entry.resetTime = now + RATE_LIMIT_WINDOW_MS; }
  entry.count += 1;
  rateLimits.set(ip, entry);
  return { success: entry.count <= MAX_REQUESTS_PER_WINDOW, reset: entry.resetTime, remaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - entry.count) };
}

// The limiter backend is an external dependency: bound how long we wait for
// it and fall back to the per-instance limiter instead of failing the request.
const LIMITER_TIMEOUT_MS = 1500;

// Visitors are never keyed by their address: only a keyed one-way hash reaches the
// limiter backend or the in-memory map. The key must be the same on every serverless
// instance (a per-process random salt would give each instance its own bucket) and
// secret, so it comes from the environment; the Upstash token is the fallback because
// it is always present whenever the shared limiter is in use.
function limiterKey(ip) {
  const secret = process.env.RATE_LIMIT_SALT || process.env.ANALYTICS_SALT || UPSTASH_TOKEN || "pharmaguide-local-dev";
  return crypto.createHmac("sha256", secret).update(String(ip)).digest("hex").slice(0, 32);
}

async function checkRateLimit(ip) {
  const key = limiterKey(ip);
  if (!ratelimit) return checkRateLimitMemory(key);
  let timer;
  try {
    return await Promise.race([
      ratelimit.limit(key),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("RATELIMIT_TIMEOUT")), LIMITER_TIMEOUT_MS); }),
    ]);
  } catch (e) {
    console.warn("[RATELIMIT] backend unavailable, using in-memory limiter:", e && e.message);
    return checkRateLimitMemory(key);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { checkRateLimit, limiterKey };

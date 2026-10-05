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
    ratelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "1 m"), analytics: true, prefix: "pgchat" });
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

async function checkRateLimit(ip) {
  if (!ratelimit) return checkRateLimitMemory(ip);
  let timer;
  try {
    return await Promise.race([
      ratelimit.limit(ip),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("RATELIMIT_TIMEOUT")), LIMITER_TIMEOUT_MS); }),
    ]);
  } catch (e) {
    console.warn("[RATELIMIT] backend unavailable, using in-memory limiter:", e && e.message);
    return checkRateLimitMemory(ip);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { checkRateLimit };

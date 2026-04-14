/**
 * Shared Upstash Redis client.
 * Used by rate limiter, topic tracker, and any future persistence needs.
 * Gracefully returns null if not configured.
 */

const { Redis } = require("@upstash/redis");

function stripOuterQuotes(v) {
  if (typeof v !== "string") return "";
  return v.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
}

let _redis = null;
let _initAttempted = false;

function getRedis() {
  if (_redis) return _redis;
  if (_initAttempted) return null;
  _initAttempted = true;

  const url = stripOuterQuotes(process.env.UPSTASH_REDIS_REST_URL);
  const token = stripOuterQuotes(process.env.UPSTASH_REDIS_REST_TOKEN);

  if (!url || !token) return null;

  try {
    _redis = new Redis({ url, token });
    return _redis;
  } catch (e) {
    console.error("Upstash Redis init failed:", e.message);
    return null;
  }
}

function isAvailable() {
  return !!getRedis();
}

module.exports = { getRedis, isAvailable };

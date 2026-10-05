/**
 * Safe, short-TTL LLM response cache.
 * Only caches generic LLM queries. Strict exclusion rules prevent
 * caching personalized, risky, or multi-turn responses.
 *
 * In-memory Map — resets on Vercel cold start (by design).
 */

const crypto = require("crypto");
const { normalizeText } = require("../core/normalize");
const { getPolicyVersion } = require("../config/safetyPolicy");

// ── Config ──
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 200;

// ── Cache storage: key → { reply, accessedAt, createdAt } ──
const cache = new Map();

// ── Stats ──
let hits = 0;
let misses = 0;

// ── Dose pattern ──
const DOSE_PATTERN = /\b\d+\s*(mg|iu|mcg|g)\b/i;
const PERSONAL_PATTERN = /\b(my labs|my results|my doctor said|my prescriber)\b/i;

/**
 * Build a cache key from all versioned components.
 */
function buildCacheKey(message, systemPromptHash, modelId) {
  const normalized = normalizeText(message);
  const policyVersion = getPolicyVersion();
  const input = [normalized, policyVersion, systemPromptHash || "", modelId || ""].join("|");
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Check if a response is cacheable. Returns false for personalized,
 * risky, or multi-turn queries.
 */
function isCacheable(message, entities, hasConversation, validationResult, route, scores) {
  // Only cache LLM-path responses
  if (route !== "llm") return false;

  // No multi-turn
  if (hasConversation) return false;

  // No populations (pregnancy, elderly, renal)
  if (entities && entities.populations && entities.populations.length > 0) return false;

  // No persisted patient conditions (diabetes, thyroid, seizure history, bariatric surgery)
  if (entities && entities._persisted_conditions && entities._persisted_conditions.length > 0) return false;

  // No symptoms
  if (entities && entities.symptoms && entities.symptoms.length > 0) return false;

  // No dose numbers
  if (DOSE_PATTERN.test(message)) return false;

  // No personal context
  if (PERSONAL_PATTERN.test(message)) return false;

  // No validator violations
  if (validationResult && !validationResult.safe) return false;

  // No elevated risk scores (any dimension >= 2 means safety-sensitive)
  if (scores) {
    const riskKeys = ["serotonin_risk", "bleeding_risk", "stimulant_risk", "hepatotoxic_risk",
      "absorption_risk", "pregnancy_teratogen_risk", "renal_clearance_risk",
      "cns_depression_risk", "myopathy_risk"];
    for (const key of riskKeys) {
      if ((scores[key] || 0) >= 1) return false;
    }
  }

  // No 3+ entities (personalization proxy)
  if (entities) {
    const totalEntities = (entities.meds || []).length + (entities.supplements || []).length;
    if (totalEntities >= 3) return false;
  }

  return true;
}

/**
 * Get a cached response. Returns null if not found or expired.
 */
function getCachedResponse(key) {
  const entry = cache.get(key);
  if (!entry) {
    misses++;
    return null;
  }

  // Check TTL
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    misses++;
    return null;
  }

  // Update access time for LRU
  entry.accessedAt = Date.now();
  hits++;
  return entry.reply;
}

/**
 * Store a response in cache. LRU eviction when full.
 */
function setCachedResponse(key, reply) {
  // Evict LRU if at capacity
  if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [k, v] of cache) {
      if (v.accessedAt < oldestTime) {
        oldestTime = v.accessedAt;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }

  const now = Date.now();
  cache.set(key, { reply, accessedAt: now, createdAt: now });
}

/**
 * Get cache statistics.
 */
function getCacheStats() {
  const total = hits + misses;
  return {
    hits,
    misses,
    size: cache.size,
    hit_rate: total > 0 ? +(hits / total * 100).toFixed(1) : 0,
  };
}

/**
 * Clear all cached entries and reset stats.
 */
function clearCache() {
  cache.clear();
  hits = 0;
  misses = 0;
}

module.exports = {
  buildCacheKey,
  isCacheable,
  getCachedResponse,
  setCachedResponse,
  getCacheStats,
  clearCache,
};

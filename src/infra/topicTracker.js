/**
 * Topic Gap Tracker — identifies and logs queries where PharmaGuide
 * has weak or missing coverage, so the team can prioritize new KB entries,
 * gates, and entity patterns.
 *
 * PHI-safe: stores only hashed keyword clusters, intent categories,
 * and aggregate counts — never raw messages.
 *
 * Persistence: Uses Upstash Redis (free tier) to store gap counts that
 * survive serverless cold starts. Falls back to in-memory if Redis unavailable.
 *
 * Gap signals:
 *   1. LLM route with 0 KB hits (answered from general knowledge, no grounding)
 *   2. Off-topic bounce (user asked something we rejected)
 *   3. Clarifier trigger (user mentioned something unrecognized)
 *   4. Zero entity extraction (nothing recognized in the query)
 *   5. Low intent score that barely passed (intent 2, borderline)
 */

const crypto = require("crypto");

// ── In-memory gap log (ring buffer) ──
const gapBuffer = [];
const MAX_GAP_BUFFER = 500;

// ── Keyword extraction (PHI-safe: only extracts supplement/med/condition terms) ──
const TOPIC_KEYWORDS = /\b(sleep|energy|fatigue|anxiety|stress|weight|hair|skin|acne|nails|gut|digest|bloat|immune|cold|flu|cough|allergy|sinus|brain|focus|memory|detox|cleanse|hangover|recovery|workout|muscle|joint|pain|inflammation|aging|wrinkle|fertility|libido|testosterone|estrogen|thyroid|diabetes|cholesterol|blood pressure|kidney|liver|heart|acid reflux|gerd|uti|infection|constipation|diarrhea|ibs|pcos|menopause|period|pms|pregnancy|depression|adhd|seizure|migraine|tinnitus)\b/gi;

const SUBSTANCE_KEYWORDS = /\b(magnesium|iron|zinc|calcium|vitamin\s*[a-ekd]\d?|b12|b6|b.?complex|folate|biotin|omega|fish oil|melatonin|ashwagandha|turmeric|curcumin|creatine|collagen|probiotics?|cbd|nac|coq10|ginkgo|elderberry|quercetin|berberine|lion.?s?\s*mane|apple cider vinegar|acv|milk thistle|saw palmetto|valerian|kava|echinacea|glutathione|l.?theanine|rhodiola|ginseng|maca|5.?htp|st\.?\s*john|charcoal|protein|electrolytes?|pre.?workout|multivitamin|prenatal|nettle|bromelain|d.?mannose|cranberry|vitex|fenugreek|glucosamine|boric acid)\b/gi;

/**
 * Extract PHI-safe topic keywords from a message.
 * Returns a sorted, deduplicated array of lowercase terms.
 */
function extractTopicKeywords(message) {
  const lower = message.toLowerCase();
  const topics = new Set();

  let m;
  const topicRe = new RegExp(TOPIC_KEYWORDS.source, "gi");
  while ((m = topicRe.exec(lower)) !== null) topics.add(m[0].trim());

  const substRe = new RegExp(SUBSTANCE_KEYWORDS.source, "gi");
  while ((m = substRe.exec(lower)) !== null) topics.add(m[0].trim());

  return [...topics].sort();
}

/**
 * Create a deterministic hash of the topic keyword cluster.
 * Same keywords in any order → same hash.
 */
function hashTopicCluster(keywords) {
  if (keywords.length === 0) return "no_keywords";
  return crypto.createHash("sha256")
    .update(keywords.join("|"))
    .digest("hex")
    .slice(0, 12);
}

/**
 * Record a topic gap signal.
 *
 * @param {object} params
 * @param {string} params.gapType - "no_kb_hits" | "off_topic" | "clarifier" | "no_entities" | "low_intent"
 * @param {string} params.message - raw user message (used for keyword extraction only, NOT stored)
 * @param {number} params.intentScore - intent score
 * @param {number} params.kbHits - KB hits
 * @param {string} params.route - triage route
 * @param {object} params.entities - extracted entities
 */
function recordGap(params) {
  const {
    gapType, message, intentScore, kbHits, route, entities,
  } = params;

  const keywords = extractTopicKeywords(message);
  const cluster = hashTopicCluster(keywords);

  const entry = {
    ts: new Date().toISOString(),
    gap_type: gapType,
    topic_cluster: cluster,
    keywords, // PHI-safe: only health/supplement terms, never names/PHI
    intent_score: intentScore,
    kb_hits: kbHits,
    route,
    entity_count: (entities.meds?.length || 0) + (entities.supplements?.length || 0),
    message_length: message.length,
  };

  gapBuffer.push(entry);
  if (gapBuffer.length > MAX_GAP_BUFFER) {
    gapBuffer.splice(0, gapBuffer.length - MAX_GAP_BUFFER);
  }

  // Log structured event for external monitoring
  if (process.env.ANALYTICS_ENABLED === "true" && process.env.NODE_ENV !== "test") {
    console.log(JSON.stringify({ _topic_gap: true, ...entry }));
  }

  // Persist to Redis (fire-and-forget — never blocks the response)
  persistGapToRedis(entry).catch(() => {});

  return entry;
}

/**
 * Analyze the current request and record gaps if detected.
 * Call this from chat.js after routing is complete.
 */
function detectAndRecordGaps(message, route, intentScore, kbHits, entities) {
  const gaps = [];

  // Gap 1: LLM route with 0 KB hits (no grounding data)
  if (route === "llm" && kbHits === 0 && (entities.meds?.length > 0 || entities.supplements?.length > 0)) {
    gaps.push(recordGap({ gapType: "no_kb_hits", message, intentScore, kbHits, route, entities }));
  }

  // Gap 2: LLM route, 0 entities, 0 KB hits (completely unrecognized topic)
  if (route === "llm" && kbHits === 0 &&
      (entities.meds?.length || 0) === 0 && (entities.supplements?.length || 0) === 0 &&
      intentScore >= 2) {
    gaps.push(recordGap({ gapType: "no_entities", message, intentScore, kbHits, route, entities }));
  }

  // Gap 3: Off-topic bounce
  if (route === "system:off-topic") {
    gaps.push(recordGap({ gapType: "off_topic", message, intentScore, kbHits, route, entities }));
  }

  // Gap 4: Clarifier triggered (unrecognized item)
  if (route === "system:clarifier") {
    gaps.push(recordGap({ gapType: "clarifier", message, intentScore, kbHits, route, entities }));
  }

  // Gap 5: Borderline intent (passed but barely — intent exactly 2)
  if (route === "llm" && intentScore === 2 && kbHits === 0) {
    gaps.push(recordGap({ gapType: "low_intent", message, intentScore, kbHits, route, entities }));
  }

  return gaps;
}

// ── Dashboard: Top topic gaps ──

/**
 * Get the most common topic gaps by keyword cluster.
 * Returns an array sorted by frequency, most common first.
 */
function getTopGaps(n = 20) {
  const clusters = {};

  for (const entry of gapBuffer) {
    const key = entry.keywords.join(" + ") || "(no keywords)";
    if (!clusters[key]) {
      clusters[key] = { keywords: entry.keywords, count: 0, gap_types: new Set(), last_seen: entry.ts };
    }
    clusters[key].count++;
    clusters[key].gap_types.add(entry.gap_type);
    clusters[key].last_seen = entry.ts;
  }

  return Object.values(clusters)
    .map(c => ({ ...c, gap_types: [...c.gap_types] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/**
 * Get gap type distribution.
 */
function getGapTypeDistribution() {
  const counts = {};
  for (const entry of gapBuffer) {
    counts[entry.gap_type] = (counts[entry.gap_type] || 0) + 1;
  }
  return counts;
}

/**
 * Get full topic gap snapshot for the dashboard.
 */
function getGapSnapshot() {
  return {
    total_gaps: gapBuffer.length,
    gap_types: getGapTypeDistribution(),
    top_gaps: getTopGaps(20),
    gap_rate: gapBuffer.length > 0
      ? `${gapBuffer.length} gaps in last ${MAX_GAP_BUFFER} queries`
      : "No gaps recorded",
  };
}

// ══════════════════════════════════════════════════
// Redis persistence (survives cold starts)
// ══════════════════════════════════════════════════

const { getRedis } = require("./redisClient");

const REDIS_PREFIX = "pgchat:gaps:";
const REDIS_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Persist a gap to Redis (fire-and-forget, never blocks the request).
 * Stores two things:
 *   1. Sorted set "pgchat:gaps:topics" — keyword cluster → count (for ranking)
 *   2. Hash "pgchat:gaps:detail:{cluster}" — gap_types, last_seen, sample keywords
 */
async function persistGapToRedis(entry) {
  const redis = getRedis();
  if (!redis) return;

  try {
    const clusterKey = entry.keywords.join(" + ") || "(no keywords)";
    const topicsKey = REDIS_PREFIX + "topics";
    const detailKey = REDIS_PREFIX + "detail:" + entry.topic_cluster;
    const typeCountKey = REDIS_PREFIX + "types";

    // Increment the topic's count in the sorted set
    await redis.zincrby(topicsKey, 1, clusterKey);
    await redis.expire(topicsKey, REDIS_TTL_SECONDS);

    // Store/update detail for this cluster
    await redis.hset(detailKey, {
      keywords: entry.keywords.join(","),
      last_seen: entry.ts,
      gap_type: entry.gap_type,
      intent_score: String(entry.intent_score),
      kb_hits: String(entry.kb_hits),
    });
    await redis.expire(detailKey, REDIS_TTL_SECONDS);

    // Increment gap type counter
    await redis.hincrby(typeCountKey, entry.gap_type, 1);
    await redis.expire(typeCountKey, REDIS_TTL_SECONDS);
  } catch (e) {
    // Never let Redis errors break the request
    if (process.env.NODE_ENV === "development") {
      console.error("[TOPIC_TRACKER] Redis persist error:", e.message);
    }
  }
}

/**
 * Get persisted top gaps from Redis.
 * Returns the same format as getTopGaps() but from persistent storage.
 *
 * @param {number} n - max results
 * @returns {Promise<object[]>} sorted by count descending
 */
async function getPersistedTopGaps(n = 20) {
  const redis = getRedis();
  if (!redis) return { source: "memory", gaps: getTopGaps(n) };

  try {
    const topicsKey = REDIS_PREFIX + "topics";

    // Get top N from sorted set (highest count first)
    const results = await redis.zrange(topicsKey, 0, n - 1, { rev: true, withScores: true });

    const gaps = [];
    for (let i = 0; i < results.length; i += 2) {
      const keywords = results[i];
      const count = results[i + 1];
      gaps.push({
        keywords: keywords === "(no keywords)" ? [] : keywords.split(" + "),
        count: Number(count),
      });
    }

    return { source: "redis", gaps };
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("[TOPIC_TRACKER] Redis read error:", e.message);
    }
    return { source: "memory", gaps: getTopGaps(n) };
  }
}

/**
 * Get persisted gap type distribution from Redis.
 */
async function getPersistedGapTypes() {
  const redis = getRedis();
  if (!redis) return { source: "memory", types: getGapTypeDistribution() };

  try {
    const typeCountKey = REDIS_PREFIX + "types";
    const types = await redis.hgetall(typeCountKey);

    // Convert string values to numbers
    const result = {};
    for (const [key, val] of Object.entries(types || {})) {
      result[key] = Number(val);
    }
    return { source: "redis", types: result };
  } catch (e) {
    return { source: "memory", types: getGapTypeDistribution() };
  }
}

/**
 * Get full persisted gap snapshot for the dashboard.
 */
async function getPersistedGapSnapshot() {
  const [topGaps, gapTypes] = await Promise.all([
    getPersistedTopGaps(20),
    getPersistedGapTypes(),
  ]);

  return {
    source: topGaps.source,
    top_gaps: topGaps.gaps,
    gap_types: gapTypes.types,
    note: topGaps.source === "redis"
      ? "Data persisted in Redis — survives cold starts, 30-day retention"
      : "In-memory only — resets on cold start. Configure UPSTASH_REDIS_REST_URL for persistence.",
  };
}

// ── Test helpers ──
function _resetGaps() {
  gapBuffer.length = 0;
}

module.exports = {
  extractTopicKeywords,
  hashTopicCluster,
  recordGap,
  detectAndRecordGaps,
  getTopGaps,
  getGapTypeDistribution,
  getGapSnapshot,
  // Redis persistence
  persistGapToRedis,
  getPersistedTopGaps,
  getPersistedGapTypes,
  getPersistedGapSnapshot,
  _resetGaps,
};

/**
 * Topic Gaps Dashboard Endpoint
 * GET /api/gaps
 *
 * Returns the top unrecognized topics users are asking about,
 * ranked by frequency. Use this to decide what KB entries to add next.
 *
 * Data persists in Upstash Redis (30-day retention) and survives
 * serverless cold starts. Falls back to in-memory buffer if Redis
 * is not configured.
 *
 * Example response:
 * {
 *   "source": "redis",
 *   "top_gaps": [
 *     { "keywords": ["spirulina"], "count": 12 },
 *     { "keywords": ["cortisol", "stress"], "count": 8 },
 *     { "keywords": ["toenail", "fungus"], "count": 5 }
 *   ],
 *   "gap_types": {
 *     "no_kb_hits": 45,
 *     "no_entities": 12,
 *     "off_topic": 3,
 *     "clarifier": 2,
 *     "low_intent": 8
 *   },
 *   "what_this_means": "..."
 * }
 */

const { getPersistedGapSnapshot, getGapSnapshot } = require("../src/infra/topicTracker");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  try {
    // Try Redis first (persistent), fall back to in-memory
    const snapshot = await getPersistedGapSnapshot();

    res.status(200).json({
      ...snapshot,
      what_this_means: {
        no_kb_hits: "User asked about a recognized supplement/med, but we have no KB entry for it. Add one.",
        no_entities: "User asked a health question but we didn't recognize any supplement or medication name. May need new entity patterns.",
        off_topic: "User got bounced by the off-topic gate. Check if the query was actually in-scope.",
        clarifier: "User mentioned something we couldn't identify. May be a brand name, misspelling, or new supplement.",
        low_intent: "Query barely passed the intent threshold (score=2). The intent scorer may need new terms for this topic.",
      },
      action: "Add KB entries for the top gaps. The keywords tell you exactly what topics to cover.",
    });
  } catch (e) {
    // Fallback to in-memory if anything fails
    const memSnapshot = getGapSnapshot();
    res.status(200).json({
      source: "memory_fallback",
      ...memSnapshot,
      error: process.env.NODE_ENV === "development" ? e.message : undefined,
    });
  }
};

/**
 * Health check endpoint
 * GET /api/health
 *
 * Reports service status including LLM provider health,
 * circuit breaker states, and detection rule counts.
 */

const geminiClient = require("../src/infra/geminiClient");
const groqClient = require("../src/infra/groqClient");
const groqCircuit = require("../src/infra/circuitBreaker");
const geminiCircuit = require("../src/infra/geminiCircuitBreaker");
const { getGapSnapshot, getPersistedGapSnapshot } = require("../src/infra/topicTracker");
const { getSnapshot: getAnalyticsSnapshot } = require("../src/infra/analytics");
const { getProvenance } = require("../src/infra/provenance");
const { getLlmStatus } = require("../src/infra/llmStatus");
const { isTrustedProxy } = require("../src/infra/proxyAuth");

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const providers = {
    gemini: {
      configured: geminiClient.isAvailable(),
      circuit: geminiCircuit.getState(),
      model: geminiClient.GEMINI_MODEL_ID,
    },
    gemini_fallback: {
      configured: geminiClient.isAvailable(),
      model: geminiClient.GEMINI_FALLBACK_MODEL_ID,
    },
    groq: {
      configured: groqClient.isAvailable(),
      circuit: groqCircuit.getState(),
      model: groqClient.GROQ_MODEL_ID,
    },
  };

  // Determine active provider (what would serve the next request)
  let activeProvider = "degraded";
  if (providers.gemini.configured && providers.gemini.circuit !== "OPEN") {
    activeProvider = "gemini";
  } else if (providers.groq.configured && providers.groq.circuit !== "OPEN") {
    activeProvider = "groq";
  }

  // Include topic gap data and analytics if requested
  const includeGaps = req.query?.gaps === "true" || req.query?.detailed === "true";
  const includeAnalytics = req.query?.analytics === "true" || req.query?.detailed === "true";

  const response = {
    status: 'ok',
    service: 'PharmaGuide AI Chatbot',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    ruleset: getProvenance(),
    providers,
    active_provider: activeProvider,
  };

  // Is the AI path actually answering? Configuration and circuit state cannot see a payment or quota failure.
  // Anyone gets the state; which provider failed and with what HTTP status (billing detail) only a caller
  // that holds the proxy secret sees.
  const llm = await getLlmStatus();
  response.llm = { state: llm.state, last_success: llm.last_success || null };
  if (llm.reason) response.llm.reason = llm.reason;
  if (isTrustedProxy(req)) response.llm.last_failure = llm.last_failure || null;

  if (includeGaps) {
    // Use persisted Redis data if available (async)
    return getPersistedGapSnapshot().then(gaps => {
      response.topic_gaps = gaps;
      if (includeAnalytics) response.analytics = getAnalyticsSnapshot();
      res.status(200).json(response);
    }).catch(() => {
      response.topic_gaps = getGapSnapshot();
      if (includeAnalytics) response.analytics = getAnalyticsSnapshot();
      res.status(200).json(response);
    });
  }

  if (includeAnalytics) {
    response.analytics = getAnalyticsSnapshot();
  }

  res.status(200).json(response);
};

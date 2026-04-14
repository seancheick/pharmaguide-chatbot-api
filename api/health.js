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

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const providers = {
    gemini: {
      configured: geminiClient.isAvailable(),
      circuit: geminiCircuit.getState(),
      model: geminiClient.GEMINI_MODEL_ID,
    },
    groq: {
      configured: groqClient.isAvailable(),
      circuit: groqCircuit.getState(),
      model: "llama-3.3-70b-versatile",
    },
  };

  // Determine active provider (what would serve the next request)
  let activeProvider = "degraded";
  if (providers.gemini.configured && providers.gemini.circuit !== "OPEN") {
    activeProvider = "gemini";
  } else if (providers.groq.configured && providers.groq.circuit !== "OPEN") {
    activeProvider = "groq";
  }

  res.status(200).json({
    status: 'ok',
    service: 'PharmaGuide AI Chatbot',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    providers,
    active_provider: activeProvider,
  });
};

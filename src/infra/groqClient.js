const Groq = require("groq-sdk");

// Single owner of the Groq model id (router, /api/health and llmClient all read it here).
// llama-3.3-70b-versatile was shut down by Groq on 2026-08-16 (HTTP 404 since).
// gpt-oss is a reasoning model: reasoning tokens count against max_tokens, so
// keep reasoning low and hidden or answers come back empty/truncated.
// NOTE: on Groq's free "on_demand" tier this model's limit is 8,000 tokens per
// minute and the production system prompt alone is ~10.4k tokens, so requests
// get HTTP 413 until the prompt is slimmed or the account moves to Dev Tier.
const GROQ_MODEL_ID = "openai/gpt-oss-120b";
const GROQ_MODEL_PARAMS = { reasoning_effort: "low", include_reasoning: false };

// Lazy init — Groq SDK throws if apiKey is missing at construction time.
// With multi-provider support, Groq is now a fallback and may not be configured.
let _groq = null;

function getGroq() {
  if (_groq) return _groq;
  if (!process.env.GROQ_API_KEY) return null;
  _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

// Keep backward-compatible `groq` export as a getter
module.exports = {
  get groq() { return getGroq(); },
  isAvailable() { return !!process.env.GROQ_API_KEY; },
  GROQ_MODEL_ID,
  GROQ_MODEL_PARAMS,
};

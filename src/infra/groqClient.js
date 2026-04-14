const Groq = require("groq-sdk");

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
};

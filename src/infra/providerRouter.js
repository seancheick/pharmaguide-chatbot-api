/**
 * Smart LLM provider router.
 *
 * Selects the best provider for each query based on:
 *   1. Query complexity (simple timing question vs. multi-drug interaction)
 *   2. Provider availability (API key configured + circuit healthy)
 *   3. Automatic fallback chain: Gemini → Groq → degraded
 *
 * Also tunes generation parameters (temperature, max tokens) per-query
 * so complex clinical questions get longer, more careful answers.
 */

const gemini = require("./geminiClient");
const groqClient = require("./groqClient");
const { allowRequest: allowGroq, recordSuccess: groqSuccess, recordFailure: groqFailure } = require("./circuitBreaker");
const { allowRequest: allowGemini, recordSuccess: geminiSuccess, recordFailure: geminiFailure } = require("./geminiCircuitBreaker");
const { getDegradedResponse } = require("./gracefulDegradation");

// ── Query complexity scoring ──────────────────────────

/**
 * Score query complexity from 1 (trivial) to 5 (highly complex).
 * Used to pick the right model and tune generation params.
 */
function scoreComplexity(message, entities, kbHits, convoContext) {
  let score = 1;
  const lower = (convoContext || message).toLowerCase();

  // Multiple medications / supplements → more complex
  const totalItems = (entities.meds?.length || 0) + (entities.supplements?.length || 0);
  if (totalItems >= 4) score += 2;
  else if (totalItems >= 2) score += 1;

  // Interaction-checking intent
  if (entities.intents?.includes("interaction_check")) score += 1;

  // Population-specific (pregnancy, renal, elderly) adds nuance
  if (entities.populations?.length > 0) score += 1;

  // Symptoms present → needs careful reasoning
  if (entities.symptoms?.length > 0) score += 1;

  // Dosing questions with specific numbers
  if (entities.intents?.includes("dosing")) score += 0.5;

  // Open-ended clinical questions (infections, conditions + meds)
  const clinicalMarkers = /\b(infection|antibiotic|surgery|chemotherapy|dialysis|transplant|chronic|autoimmune|liver disease|kidney disease|heart failure)\b/;
  if (clinicalMarkers.test(lower)) score += 1;

  // Multi-turn conversation adds context complexity
  if (convoContext && convoContext.length > message.length * 2) score += 0.5;

  // No KB hits → LLM must rely on its own knowledge → need a stronger model
  if (kbHits === 0 && totalItems > 0) score += 1;

  return Math.min(5, Math.round(score));
}

// ── Generation parameters by complexity ───────────────

function getGenerationParams(complexity) {
  if (complexity >= 4) {
    return { temperature: 0.2, maxTokens: 1000, topP: 0.8 };
  }
  if (complexity >= 3) {
    return { temperature: 0.3, maxTokens: 800, topP: 0.85 };
  }
  // Simple queries
  return { temperature: 0.3, maxTokens: 650, topP: 0.9 };
}

// ── Provider selection ────────────────────────────────

/**
 * Attempt an LLM call with automatic fallback.
 *
 * Priority: Gemini (if available + circuit healthy) → Groq → degraded.
 *
 * @param {object[]} messages - OpenAI-format messages array
 * @param {object} opts - { complexity, entities, kbHits }
 * @returns {Promise<{ text: string, provider: string, modelId: string, usage: object, degraded: boolean }>}
 */
async function callWithFallback(messages, opts = {}) {
  const { complexity = 2 } = opts;
  const params = getGenerationParams(complexity);

  const providers = buildProviderChain();
  // Capture WHICH providers were tried and how each failed. Surfaces
  // in the degraded response (production-visible) so we can debug
  // chain failures without needing Vercel log access. Also logged
  // via console.warn for the Vercel Functions tab.
  const attempts = [];
  const skipped = [];

  if (gemini.isAvailable()) {
    const c = allowGemini();
    if (!c.allowed) skipped.push({ provider: "gemini", reason: "circuit_open", state: c.state });
  } else {
    skipped.push({ provider: "gemini", reason: "not_configured" });
  }
  if (groqClient.isAvailable()) {
    const c = allowGroq();
    if (!c.allowed) skipped.push({ provider: "groq", reason: "circuit_open", state: c.state });
  } else {
    skipped.push({ provider: "groq", reason: "not_configured" });
  }

  for (const provider of providers) {
    try {
      const result = await provider.call(messages, params);
      provider.onSuccess();
      return {
        text: result.text,
        provider: provider.name,
        modelId: provider.modelId,
        usage: result.usage || {},
        degraded: false,
      };
    } catch (err) {
      provider.onFailure();
      const reason = err && err.status ? `status_${err.status}` : (err && err.message) || "unknown";
      attempts.push({
        provider: provider.name,
        status: err && err.status ? err.status : null,
        message: (err && err.message) ? String(err.message).slice(0, 220) : "unknown",
      });
      // Always-on log so failures show in Vercel Functions tab.
      console.warn(`[PROVIDER] ${provider.name} failed: ${reason}`);
      // Continue to next provider
    }
  }

  // All providers failed → degraded response
  console.warn(`[PROVIDER] all providers exhausted. attempts=${JSON.stringify(attempts)} skipped=${JSON.stringify(skipped)}`);
  return {
    text: getDegradedResponse("llm_error"),
    provider: "degraded",
    modelId: "system:degraded",
    usage: {},
    degraded: true,
    _failures: attempts,
    _skipped: skipped,
  };
}

/**
 * Build the ordered list of available providers.
 */
function buildProviderChain() {
  const chain = [];

  // 1. Gemini (primary — more accurate for medical reasoning)
  if (gemini.isAvailable()) {
    const circuit = allowGemini();
    if (circuit.allowed) {
      chain.push({
        name: "gemini",
        modelId: gemini.GEMINI_MODEL_ID,
        call: (messages, params) => gemini.chatCompletion(messages, {
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          topP: params.topP,
          timeout: 12000,
        }),
        onSuccess: geminiSuccess,
        onFailure: geminiFailure,
      });
    }
  }

  // 2. Groq (fallback — fast, good enough for most queries)
  if (groqClient.isAvailable()) {
    const groqCircuit = allowGroq();
    if (groqCircuit.allowed) {
      chain.push({
        name: "groq",
        modelId: "llama-3.3-70b-versatile",
        call: async (messages, params) => {
          const completion = await groqClient.groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages,
            temperature: params.temperature,
            max_tokens: params.maxTokens,
            top_p: params.topP,
            stream: false,
          }, { timeout: 8000 });
          const text = completion.choices?.[0]?.message?.content?.trim() || "";
          return { text, usage: completion.usage || {} };
        },
        onSuccess: groqSuccess,
        onFailure: groqFailure,
      });
    }
  }

  return chain;
}

module.exports = {
  callWithFallback,
  scoreComplexity,
  getGenerationParams,
};

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
const { recordLlmSuccess, recordLlmFailure } = require("./llmStatus");
const groqClient = require("./groqClient");
const { allowRequest: allowGroq, recordSuccess: groqSuccess, recordFailure: groqFailure } = require("./circuitBreaker");
const { allowRequest: allowGemini, recordSuccess: geminiSuccess, recordFailure: geminiFailure } = require("./geminiCircuitBreaker");
const { getDegradedResponse } = require("./gracefulDegradation");

// Time budget. The website proxy gives up after 15 s, so the whole chain must finish
// well inside that to still hand back the degraded reply: each provider's own timeout
// is capped by what is left of CHAIN_DEADLINE_MS, and a provider is not started with
// less than MIN_ATTEMPT_MS left.
const PRIMARY_TIMEOUT_MS = 8000;
const LITE_TIMEOUT_MS = 5000;
const GROQ_TIMEOUT_MS = 5000;
const CHAIN_DEADLINE_MS = 12000;
const MIN_ATTEMPT_MS = 1500;

// Short breaker for the interim gemini-lite tier: 3 consecutive hard failures
// (soft failures such as a cut-off answer do not count) skip it for 30 s.
const LITE_FAILURE_THRESHOLD = 3;
const LITE_OPEN_MS = 30000;
const liteBreaker = { failures: 0, openUntil: 0 };

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

/** The same messages with the first system message (the prompt) replaced. */
function withSystemPrompt(messages, text) {
  const index = messages.findIndex((m) => m.role === "system");
  return index === -1 ? messages : messages.map((m, i) => (i === index ? { ...m, content: text } : m));
}

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
  // Capture WHICH providers were tried and how each failed. Returned in the
  // degraded response (development only) and always logged via console.warn
  // for the Vercel Functions tab.
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

  const startedAt = Date.now();
  const deadlineMs = opts.deadlineMs || CHAIN_DEADLINE_MS;

  for (const provider of providers) {
    const remaining = deadlineMs - (Date.now() - startedAt);
    if (remaining < MIN_ATTEMPT_MS) {
      attempts.push({ provider: provider.name, status: null, message: "skipped: chain time budget used up" });
      console.warn(`[PROVIDER] ${provider.name} skipped: chain time budget used up`);
      continue;
    }
    try {
      const result = await provider.call(messages, { ...params, timeoutMs: Math.min(provider.timeoutMs, remaining), slimSystemPrompt: opts.slimSystemPrompt });
      provider.onSuccess();
      recordLlmSuccess(provider.name);
      return {
        text: result.text,
        provider: provider.name,
        modelId: provider.modelId,
        usage: result.usage || {},
        degraded: false,
      };
    } catch (err) {
      // A soft failure (answer cut off / blocked / empty) is not an outage:
      // try the next provider but do not push this one toward an open circuit.
      if (!(err && err.soft)) provider.onFailure();
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
  recordLlmFailure(attempts, skipped);
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
        timeoutMs: PRIMARY_TIMEOUT_MS,
        call: (messages, params) => gemini.chatCompletion(messages, {
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          topP: params.topP,
          timeout: params.timeoutMs,
        }),
        onSuccess: geminiSuccess,
        onFailure: geminiFailure,
      });
    }
  }

  // 2. Second Gemini model — interim tier until the eval-driven model choice.
  //    Covers a model-specific outage/overload of the primary. Named
  //    "gemini-lite" so confidence scoring does not treat it as the strong
  //    primary. It has its own short breaker, independent of the primary's: in a
  //    shared Gemini outage the primary circuit is open and this tier would
  //    otherwise add up to LITE_TIMEOUT_MS to every request before Groq.
  if (gemini.isAvailable() && Date.now() >= liteBreaker.openUntil) {
    chain.push({
      name: "gemini-lite",
      modelId: gemini.GEMINI_FALLBACK_MODEL_ID,
      timeoutMs: LITE_TIMEOUT_MS,
      call: (messages, params) => gemini.chatCompletion(messages, {
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        topP: params.topP,
        timeout: params.timeoutMs,
        model: gemini.GEMINI_FALLBACK_MODEL_ID,
      }),
      onSuccess: () => { liteBreaker.failures = 0; },
      onFailure: () => {
        liteBreaker.failures += 1;
        if (liteBreaker.failures >= LITE_FAILURE_THRESHOLD) {
          liteBreaker.openUntil = Date.now() + LITE_OPEN_MS;
          liteBreaker.failures = 0;
        }
      },
    });
  }

  // 3. Groq (cross-vendor fallback). See groqClient.js: currently rejected
  //    with HTTP 413 on the free tier because the system prompt is too large.
  if (groqClient.isAvailable()) {
    const groqCircuit = allowGroq();
    if (groqCircuit.allowed) {
      chain.push({
        name: "groq",
        modelId: groqClient.GROQ_MODEL_ID,
        timeoutMs: GROQ_TIMEOUT_MS,
        call: async (messages, params) => {
          const completion = await groqClient.groq.chat.completions.create({
            model: groqClient.GROQ_MODEL_ID,
            messages: params.slimSystemPrompt ? withSystemPrompt(messages, params.slimSystemPrompt) : messages,
            temperature: params.temperature,
            max_tokens: params.maxTokens,
            top_p: params.topP,
            stream: false,
            ...groqClient.GROQ_MODEL_PARAMS,
          }, { timeout: params.timeoutMs });
          const choice = completion.choices?.[0];
          if (choice?.finish_reason === "length") throw gemini.softError("GROQ_TRUNCATED", groqClient.GROQ_MODEL_ID);
          const text = choice?.message?.content?.trim() || "";
          if (!text) throw gemini.softError("GROQ_EMPTY", groqClient.GROQ_MODEL_ID);
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

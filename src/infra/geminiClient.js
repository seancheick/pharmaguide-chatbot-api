/**
 * Google Gemini LLM client for PharmaGuide.
 *
 * Uses Gemini 2.5 Flash as the primary model — strong medical reasoning,
 * fast inference, and lower hallucination rate than open-source alternatives.
 *
 * Falls back gracefully if GEMINI_API_KEY is not configured.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");

let genAI = null;
let model = null;

const GEMINI_MODEL_ID = "gemini-2.5-flash";
// Interim same-vendor fallback tier, used when the primary fails. The model
// choice is replaced by the eval-driven bake-off; do not treat it as final.
const GEMINI_FALLBACK_MODEL_ID = "gemini-3.5-flash-lite";

// Hidden "thinking" tokens count against maxOutputTokens: 2.5 Flash spent 622
// of a 650-token cap thinking and cut the visible answer off mid-sentence.
// Budget 0 turns thinking off. 3.5 Flash-Lite does not think by default and
// rejects thinkingBudget (HTTP 400), so this is configured per model.
const THINKING_CONFIG = { [GEMINI_MODEL_ID]: { thinkingBudget: 0 } };

// A "soft" failure means the provider answered but the answer is unusable
// (cut off, blocked, empty). The router tries the next provider without
// counting it against this provider's circuit breaker.
function softError(code, detail) {
  const err = new Error(detail ? `${code}: ${detail}` : code);
  err.soft = true;
  err.code = code;
  return err;
}

function isAvailable() {
  return !!process.env.GEMINI_API_KEY;
}

function getClient() {
  if (!isAvailable()) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

function getModel() {
  if (model) return model;
  const client = getClient();
  if (!client) return null;
  model = client.getGenerativeModel({ model: GEMINI_MODEL_ID });
  return model;
}

/**
 * Call Gemini with OpenAI-style messages array.
 * Converts system/user/assistant messages to Gemini's format.
 *
 * @param {object[]} messages - [{role, content}] array (OpenAI format)
 * @param {object} options - { temperature, maxTokens, topP, timeout }
 * @returns {Promise<{ text: string, usage: object }>}
 */
async function chatCompletion(messages, options = {}) {
  const {
    temperature = 0.3,
    maxTokens = 900,
    topP = 0.85,
    timeout = 12000,
    model: modelId = GEMINI_MODEL_ID,
  } = options;

  const geminiModel = getModel();
  if (!geminiModel) {
    throw new Error("GEMINI_NOT_CONFIGURED");
  }

  // Separate system instruction from conversation
  const systemParts = messages
    .filter(m => m.role === "system")
    .map(m => m.content);
  const systemInstruction = systemParts.join("\n\n");

  // Convert conversation messages to Gemini format
  const contents = [];
  for (const msg of messages) {
    if (msg.role === "system") continue;
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }

  // Ensure conversation starts with a user message (Gemini requirement)
  if (contents.length === 0 || contents[0].role !== "user") {
    contents.unshift({ role: "user", parts: [{ text: "Hello" }] });
  }

  const modelWithConfig = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: systemInstruction || undefined,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      topP,
      ...(THINKING_CONFIG[modelId] ? { thinkingConfig: THINKING_CONFIG[modelId] } : {}),
    },
  });

  // Use Promise.race for reliable timeout — Gemini SDK may not honor AbortController signal
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("GEMINI_TIMEOUT")), timeout);
  });

  try {
    const result = await Promise.race([
      modelWithConfig.generateContent({ contents }),
      timeoutPromise,
    ]);

    const response = result.response;

    // Never serve a partial medical answer: anything other than a natural
    // stop is a failed attempt, and the router moves on to the next provider.
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") throw softError("GEMINI_TRUNCATED", `${modelId} hit the ${maxTokens}-token cap`);
    if (finishReason && finishReason !== "STOP") throw softError("GEMINI_BLOCKED", `${modelId} finishReason=${finishReason}`);
    let text;
    try {
      text = response.text();
    } catch (e) {
      // text() throws when the prompt or answer was blocked by safety filters
      throw softError("GEMINI_BLOCKED", String(e.message).slice(0, 120));
    }
    if (!text || !text.trim()) throw softError("GEMINI_EMPTY", modelId);
    const usage = response.usageMetadata || {};

    return {
      text,
      usage: {
        prompt_tokens: usage.promptTokenCount || 0,
        completion_tokens: usage.candidatesTokenCount || 0,
        total_tokens: usage.totalTokenCount || 0,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  chatCompletion,
  isAvailable,
  GEMINI_MODEL_ID,
  GEMINI_FALLBACK_MODEL_ID,
  THINKING_CONFIG,
  softError,
};

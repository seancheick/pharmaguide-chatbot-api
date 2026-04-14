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
    model: GEMINI_MODEL_ID,
    systemInstruction: systemInstruction || undefined,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      topP,
    },
  });

  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeout);

  try {
    const result = await modelWithConfig.generateContent(
      { contents },
      { signal: abortController.signal },
    );
    clearTimeout(timer);

    const response = result.response;
    const text = response.text();
    const usage = response.usageMetadata || {};

    return {
      text,
      usage: {
        prompt_tokens: usage.promptTokenCount || 0,
        completion_tokens: usage.candidatesTokenCount || 0,
        total_tokens: usage.totalTokenCount || 0,
      },
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError" || abortController.signal.aborted) {
      throw new Error("GEMINI_TIMEOUT");
    }
    throw err;
  }
}

module.exports = {
  chatCompletion,
  isAvailable,
  GEMINI_MODEL_ID,
};

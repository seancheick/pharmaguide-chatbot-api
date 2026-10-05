/**
 * One call to one candidate model.
 *
 * Plain fetch, no SDKs: every provider looks the same, and a test can stub the network.
 * A call never throws. A failed or cut-off call is a RESULT, because availability and
 * truncation are things the evaluation measures.
 *
 * Result: { ok, text, finishReason, truncated, usage: { in, out, reasoning }, latencyMs, error? }
 *   usage.out is what the provider bills as output (hidden reasoning included).
 *   error never contains the request, only the provider's status and a short message.
 */

const { THINKING_CONFIG } = require("../../src/infra/geminiClient");

const DEFAULT_TIMEOUT_MS = 30000;
const TRUNCATED = new Set(["length", "MAX_TOKENS"]);

const shorten = (text) => String(text || "").replace(/\s+/g, " ").slice(0, 240);

function failure(startedAt, error, extra = {}) {
  return { ok: false, text: "", finishReason: null, truncated: false, usage: { in: 0, out: 0, reasoning: 0 }, latencyMs: Date.now() - startedAt, error, ...extra };
}

async function postJson(fetchImpl, url, headers, body, timeoutMs) {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch { /* not JSON: reported below */ }
  return { status: res.status, ok: res.ok, json, raw };
}

async function callGemini(entry, messages, params, { key, fetchImpl, timeoutMs }) {
  const startedAt = Date.now();
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  if (contents.length === 0 || contents[0].role !== "user") contents.unshift({ role: "user", parts: [{ text: "Hello" }] });

  // Same generation settings as production, including thinking off for 2.5 Flash.
  const thinking = THINKING_CONFIG[entry.model];
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    generationConfig: {
      temperature: params.temperature,
      maxOutputTokens: params.maxTokens,
      topP: params.topP,
      ...(thinking ? { thinkingConfig: thinking } : {}),
    },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${entry.model}:generateContent`;
  const res = await postJson(fetchImpl, url, { "x-goog-api-key": key }, body, timeoutMs);
  if (!res.ok) return failure(startedAt, { status: res.status, message: shorten(res.json?.error?.message || res.raw) });

  const candidate = res.json?.candidates?.[0];
  const text = (candidate?.content?.parts || []).map((p) => p.text || "").join("");
  const meta = res.json?.usageMetadata || {};
  const reasoning = meta.thoughtsTokenCount || 0;
  const finishReason = candidate?.finishReason || null;
  return {
    ok: true,
    text,
    finishReason,
    truncated: TRUNCATED.has(finishReason),
    usage: { in: meta.promptTokenCount || 0, out: (meta.candidatesTokenCount || 0) + reasoning, reasoning },
    latencyMs: Date.now() - startedAt,
  };
}

async function callOpenAICompat(entry, messages, params, { key, fetchImpl, timeoutMs, baseUrl, model }) {
  const startedAt = Date.now();
  const request = entry.request || {};
  const omit = new Set(request.omit || []);
  const body = {
    model,
    messages,
    [request.tokenParam || "max_tokens"]: params.maxTokens,
    ...(request.extra || {}),
  };
  if (!omit.has("temperature")) body.temperature = params.temperature;
  if (!omit.has("top_p")) body.top_p = params.topP;

  const res = await postJson(fetchImpl, `${baseUrl}/chat/completions`, { authorization: `Bearer ${key}` }, body, timeoutMs);
  if (!res.ok) return failure(startedAt, { status: res.status, message: shorten(res.json?.error?.message || res.raw) });

  const choice = res.json?.choices?.[0];
  const usage = res.json?.usage || {};
  const finishReason = choice?.finish_reason || null;
  return {
    ok: true,
    text: choice?.message?.content || "",
    finishReason,
    truncated: TRUNCATED.has(finishReason),
    usage: {
      in: usage.prompt_tokens || 0,
      out: usage.completion_tokens || 0,
      reasoning: usage.completion_tokens_details?.reasoning_tokens || 0,
    },
    latencyMs: Date.now() - startedAt,
  };
}

/**
 * @param entry     a models.json entry
 * @param messages  the exact messages production would send
 * @param params    { temperature, maxTokens, topP }
 * @param options   { keys, viaOpenRouter, fetchImpl, timeoutMs }
 */
async function callModel(entry, messages, params, options = {}) {
  const { keys = {}, viaOpenRouter = false, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const startedAt = Date.now();
  try {
    if (viaOpenRouter) {
      if (!entry.openrouter) return failure(startedAt, { message: `${entry.id} has no OpenRouter id` });
      const key = keys.OPENROUTER_API_KEY;
      if (!key) return failure(startedAt, { message: "OPENROUTER_API_KEY is not set" });
      return await callOpenAICompat(entry, messages, params, { key, fetchImpl, timeoutMs, baseUrl: "https://openrouter.ai/api/v1", model: entry.openrouter });
    }
    const key = keys[entry.keyEnv];
    if (!key) return failure(startedAt, { message: `${entry.keyEnv} is not set` });
    if (entry.adapter === "gemini") return await callGemini(entry, messages, params, { key, fetchImpl, timeoutMs });
    return await callOpenAICompat(entry, messages, params, { key, fetchImpl, timeoutMs, baseUrl: entry.baseUrl, model: entry.model });
  } catch (e) {
    return failure(startedAt, { message: shorten(e && e.name === "TimeoutError" ? `timeout after ${timeoutMs} ms` : e && e.message) });
  }
}

module.exports = { callModel, DEFAULT_TIMEOUT_MS };

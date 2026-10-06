/**
 * Runs a case through the REAL production handler with only the model call swapped out.
 *
 * Routing, deterministic gates, knowledge-base retrieval, the system prompt, post-processing
 * and the safety validator are all production code, so a model is scored on exactly what a
 * user would have received. A case that a deterministic gate answers never reaches the model;
 * that is reported as "not model-dependent" instead of being scored.
 *
 * Requiring this module scrubs the environment (rate-limit backend, proxy secret, analytics,
 * provider keys) BEFORE the handler loads, so a run cannot write to production Redis or fall
 * through to a production provider. Keys for the candidates are passed in explicitly.
 */

for (const name of [
  "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
  "PG_PROXY_SECRET", "PG_REQUIRE_PROXY_SECRET",
  "ANALYTICS_ENABLED", "GEMINI_API_KEY", "GROQ_API_KEY",
]) delete process.env[name];

const providerRouter = require("../../src/infra/providerRouter");
const { getDegradedResponse } = require("../../src/infra/gracefulDegradation");
const { clearCache } = require("../../src/infra/responseCache");
const { callModel } = require("./adapters");
const { recordBlock } = require("./cases");

let active = null; // the case turn currently being answered

// Installed before the handler is required: the handler destructures it at load time.
providerRouter.callWithFallback = async (messages, opts = {}) => {
  const ctx = active;
  if (!ctx) throw new Error("eval harness: the model was called outside a case");
  // The record goes right after the production system prompt, unless production already supplied it
  // (src/core/pipelineInteractions.js matches the agents the question names).
  const supplied = ctx.record && messages.some((m) => m.role === "system" && m.content.includes(`Record: ${ctx.record.id}\n`));
  const sent = ctx.record && !supplied ? [messages[0], { role: "system", content: recordBlock(ctx.record) }, ...messages.slice(1)] : messages;

  if (!ctx.entry) {
    ctx.modelCalls.push({ dry: true, sent });
    return { text: "OK.", provider: "dry", modelId: "dry", usage: {}, degraded: false };
  }
  const params = providerRouter.getGenerationParams(opts.complexity || 2);
  const call = await callModel(ctx.entry, sent, params, ctx.options);
  ctx.modelCalls.push({ call, sent });
  if (!call.ok || call.truncated || !call.text.trim()) {
    // What the real chain does when every provider fails.
    return { text: getDegradedResponse("llm_error"), provider: "degraded", modelId: "system:degraded", usage: {}, degraded: true, _failures: [], _skipped: [] };
  }
  return { text: call.text, provider: ctx.entry.id, modelId: ctx.entry.model, usage: call.usage, degraded: false };
};

const handler = require("../../api/chat");

let socket = 0;
async function post(body) {
  const out = {};
  const req = { method: "POST", headers: { "x-forwarded-for": `10.99.${Math.floor(++socket / 250)}.${socket % 250}` }, body, socket: {} };
  const res = {
    setHeader() {},
    status(code) { out.status = code; return this; },
    json(j) { out.json = j; return this; },
    end() { return this; },
  };
  await handler(req, res);
  return out;
}

/**
 * @param c        a case
 * @param entry    a models.json entry, or null for a dry run that only reports whether the model is reached
 * @param options  { keys, viaOpenRouter, fetchImpl, timeoutMs, supplyRecord }
 * @returns { turns: [{ status, json }], last: outcome of the last turn that reached the model, or { calledModel: false, route } }
 */
async function runCase(c, entry, options = {}) {
  const { supplyRecord = true } = options;
  clearCache(); // an answer cached for one model must never be served to the next
  const history = [];
  let state;
  const turns = [];
  let last = null;

  for (const turn of c.turns) {
    const modelCalls = [];
    const warnings = [];
    active = { entry, options, record: supplyRecord ? c.record || null : null, modelCalls };
    const realWarn = console.warn;
    console.warn = (...args) => warnings.push(args);
    let r;
    try {
      r = await post({ message: turn.message, history: history.slice(-10), ...(state ? { _state: state } : {}) });
    } finally {
      console.warn = realWarn;
      active = null;
    }
    turns.push(r);
    history.push({ role: "user", content: turn.message });
    if (r.json && typeof r.json.reply === "string") history.push({ role: "assistant", content: r.json.reply });
    if (r.json && r.json._state) state = r.json._state;

    const rejected = warnings.find((w) => typeof w[0] === "string" && w[0].startsWith("[VALIDATOR] LLM response rejected"));
    const reached = modelCalls[modelCalls.length - 1];
    last = reached
      ? { calledModel: true, call: reached.call, sent: reached.sent, validatorRules: rejected ? rejected[1] : [], route: r.json && r.json.model, finalReply: r.json && r.json.reply }
      : { calledModel: false, route: r.json && r.json.model, finalReply: r.json && r.json.reply };
  }
  return { turns, last: { ...last, results: turns } };
}

/** Which cases reach the model at all? One dry pass, no network. */
async function classify(cases) {
  const dependent = [];
  const gated = [];
  for (const c of cases) {
    const { last } = await runCase(c, null);
    (last.calledModel ? dependent : gated).push({ case: c, route: last.route });
  }
  return { dependent, gated };
}

module.exports = { runCase, classify };

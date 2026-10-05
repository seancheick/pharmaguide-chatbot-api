/**
 * Pinned canaries + Wave A regression tests (production safety/reliability).
 *
 * No live calls: the LLM provider chain is stubbed, the rate limiter runs in
 * memory, and the limiter-outage test runs in a child process pointed at an
 * unreachable host.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// Never touch real services from the suite, whatever the shell exports.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.GEMINI_API_KEY = "test-key-not-used";
delete process.env.GROQ_API_KEY;

const { CANARIES } = require("./canaries");
const providerRouter = require("../src/infra/providerRouter");
const STUB_REPLY = "Turmeric may support joint comfort for some people. Curcumin alone is poorly absorbed, so many products add black pepper extract.";
providerRouter.callWithFallback = async () => ({
  text: STUB_REPLY, provider: "gemini", modelId: "stub-llm", usage: {}, degraded: false,
});
// Lets one test make the optional form-recommendation decorator blow up.
const formAdvisor = require("../src/core/formAdvisor");
const realGetFormRecommendation = formAdvisor.getFormRecommendation;
let forceDecoratorCrash = false;
formAdvisor.getFormRecommendation = (...args) => {
  if (forceDecoratorCrash) throw new Error("simulated decorator failure");
  return realGetFormRecommendation(...args);
};
const handler = require("../api/chat");

let ipCounter = 0;
async function send(body) {
  const out = {};
  const req = { method: "POST", headers: { "x-forwarded-for": `10.20.0.${++ipCounter}` }, body, socket: {} };
  const res = {
    setHeader() {},
    status(code) { out.status = code; return this; },
    json(j) { out.json = j; return this; },
    end() { return this; },
  };
  await handler(req, res);
  return out;
}

// ─── Pinned canaries through the real handler ───────────────────────

for (const canary of CANARIES) {
  test(`canary ${canary.id} (wave ${canary.wave})`, async () => {
    for (const p of canary.prime || []) await send({ message: p.message });
    const results = [];
    const history = [];
    let state;
    for (const turn of canary.turns) {
      const r = await send({ message: turn.message, history: history.slice(-10), ...(state ? { _state: state } : {}) });
      results.push(r);
      history.push({ role: "user", content: turn.message });
      if (r.json && typeof r.json.reply === "string") history.push({ role: "assistant", content: r.json.reply });
      if (r.json && r.json._state) state = r.json._state;
    }
    assert.deepEqual(canary.check(results), []);
  });
}

// ─── Finding 1: KB data must never be compiled as regex syntax ──────

test("every KB entry survives form detection and recommendation", () => {
  const { getAllEntries } = require("../src/config/knowledgeBase");
  const { detectMentionedForm, getFormRecommendation } = require("../src/core/formAdvisor");
  const entities = { meds: [], supplements: [], populations: [], symptoms: [], intents: [], unknowns: [] };
  for (const entry of getAllEntries()) {
    assert.doesNotThrow(() => detectMentionedForm("what form is best for me", entry.canonical), `detectMentionedForm: ${entry.canonical}`);
    assert.doesNotThrow(() => getFormRecommendation("what form is best for sleep", entry.canonical, entities), `getFormRecommendation: ${entry.canonical}`);
  }
});

test("punctuated form names match the user's own wording", () => {
  const { detectMentionedForm } = require("../src/core/formAdvisor");
  const hit = detectMentionedForm("is curcumin + piperine better than plain turmeric", "turmeric");
  assert.ok(hit && /piperine/.test(hit.form), `expected the curcumin + piperine form, got ${JSON.stringify(hit && hit.form)}`);
});

test("a failing optional decorator never turns a finished answer into a 500", async () => {
  forceDecoratorCrash = true;
  try {
    const r = await send({ message: "Is turmeric good for joint pain?" });
    assert.equal(r.status, 200);
    assert.equal(r.json.reply, STUB_REPLY);
  } finally {
    forceDecoratorCrash = false;
  }
});

test("a malformed request body is a clean 400, not an unhandled crash", async () => {
  const out = {};
  const req = { method: "POST", headers: {}, socket: {}, get body() { throw new SyntaxError("Unexpected token in JSON"); } };
  const res = { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.json = j; return this; }, end() { return this; } };
  await handler(req, res);
  assert.equal(out.status, 400);
});

// ─── Finding 2: drug classes must survive the state merge ────────────

test("mergeStateIntoEntities keeps drug_classes (PDE5/nitrate gate depends on it)", () => {
  const { extractEntities } = require("../src/core/entities");
  const { mergeStateIntoEntities, extractConversationState } = require("../src/core/history");
  const raw = extractEntities("viagra with nitroglycerin", null);
  const merged = mergeStateIntoEntities(raw, extractConversationState("viagra with nitroglycerin", []));
  assert.deepEqual(merged.drug_classes.sort(), ["nitrate", "pde5_inhibitor"]);
});

// ─── Finding 3/4: unusable answers move on to the next provider ──────

function stubGeminiSdk(responseFor) {
  const sdk = require("@google/generative-ai");
  const seen = [];
  sdk.GoogleGenerativeAI.prototype.getGenerativeModel = function (config) {
    seen.push(config);
    return { generateContent: async () => ({ response: responseFor(config) }) };
  };
  return seen;
}

test("Gemini: thinking off for 2.5 Flash only; truncated/blocked/empty answers are soft failures", async () => {
  const gemini = require("../src/infra/geminiClient");
  const messages = [{ role: "system", content: "sys" }, { role: "user", content: "hi" }];
  const ok = (text, finishReason = "STOP") => ({ candidates: [{ finishReason }], text: () => text, usageMetadata: {} });

  let seen = stubGeminiSdk(() => ok("A complete answer."));
  const good = await gemini.chatCompletion(messages, { maxTokens: 650 });
  assert.equal(good.text, "A complete answer.");
  const primaryCfg = seen.filter((c) => c.generationConfig).pop();
  assert.deepEqual(primaryCfg.generationConfig.thinkingConfig, { thinkingBudget: 0 });

  seen = stubGeminiSdk(() => ok("fine"));
  await gemini.chatCompletion(messages, { model: gemini.GEMINI_FALLBACK_MODEL_ID });
  const liteCfg = seen.filter((c) => c.generationConfig).pop();
  assert.equal(liteCfg.model, gemini.GEMINI_FALLBACK_MODEL_ID);
  assert.equal(liteCfg.generationConfig.thinkingConfig, undefined, "3.5 Flash-Lite rejects thinkingBudget");

  stubGeminiSdk(() => ok("answer that stops mid-sen", "MAX_TOKENS"));
  await assert.rejects(gemini.chatCompletion(messages), (e) => e.soft === true && e.code === "GEMINI_TRUNCATED");
  stubGeminiSdk(() => ok("whatever", "SAFETY"));
  await assert.rejects(gemini.chatCompletion(messages), (e) => e.soft === true && e.code === "GEMINI_BLOCKED");
  stubGeminiSdk(() => ok("   "));
  await assert.rejects(gemini.chatCompletion(messages), (e) => e.soft === true && e.code === "GEMINI_EMPTY");
});

test("router: soft failure falls through to the next provider without tripping the breaker", async () => {
  // The stub installed at the top of this file replaced callWithFallback on the shared
  // module object; load a pristine copy to exercise the real function.
  delete require.cache[require.resolve("../src/infra/providerRouter.js")];
  const router = require("../src/infra/providerRouter.js");
  const gemini = require("../src/infra/geminiClient");
  const breaker = require("../src/infra/geminiCircuitBreaker");
  breaker.reset();

  const calls = [];
  gemini.chatCompletion = async (messages, opts) => {
    calls.push(opts.model || gemini.GEMINI_MODEL_ID);
    if (!opts.model) throw gemini.softError("GEMINI_TRUNCATED", "cut off");
    return { text: "Complete fallback answer.", usage: {} };
  };

  const result = await router.callWithFallback([{ role: "user", content: "hi" }], { complexity: 2 });
  assert.equal(result.degraded, false);
  assert.equal(result.provider, "gemini-lite");
  assert.deepEqual(calls, [gemini.GEMINI_MODEL_ID, gemini.GEMINI_FALLBACK_MODEL_ID]);
  assert.equal(breaker.getStats().failure_count, 0, "a truncated answer is not an outage");

  // A real failure still counts toward the breaker.
  gemini.chatCompletion = async (messages, opts) => {
    if (!opts.model) throw Object.assign(new Error("boom"), { status: 503 });
    return { text: "Fallback.", usage: {} };
  };
  await router.callWithFallback([{ role: "user", content: "hi" }], { complexity: 2 });
  assert.equal(breaker.getStats().failure_count, 1);
  breaker.reset();
});

test("router: a shared Gemini outage stops costing a gemini-lite attempt on every request", async () => {
  delete require.cache[require.resolve("../src/infra/providerRouter.js")];
  const router = require("../src/infra/providerRouter.js");
  const gemini = require("../src/infra/geminiClient");
  require("../src/infra/geminiCircuitBreaker").reset();
  delete process.env.GROQ_API_KEY;

  let liteCalls = 0;
  gemini.chatCompletion = async (messages, opts) => {
    if (opts.model) liteCalls++;
    throw Object.assign(new Error("503 overloaded"), { status: 503 });
  };
  for (let i = 0; i < 3; i++) await router.callWithFallback([{ role: "user", content: "hi" }], { complexity: 2 });
  assert.equal(liteCalls, 3, "the lite tier is tried until its breaker opens");
  const result = await router.callWithFallback([{ role: "user", content: "hi" }], { complexity: 2 });
  assert.equal(liteCalls, 3, "after 3 hard failures the lite tier is skipped");
  assert.equal(result.degraded, true);

  // Soft failures (cut-off answers) never open the breaker.
  delete require.cache[require.resolve("../src/infra/providerRouter.js")];
  const router2 = require("../src/infra/providerRouter.js");
  let softLiteCalls = 0;
  gemini.chatCompletion = async (messages, opts) => {
    if (opts.model) softLiteCalls++;
    throw gemini.softError("GEMINI_TRUNCATED", "cap");
  };
  for (let i = 0; i < 5; i++) await router2.callWithFallback([{ role: "user", content: "hi" }], { complexity: 2 });
  assert.equal(softLiteCalls, 5);
  require("../src/infra/geminiCircuitBreaker").reset();
});

// ─── Finding 5: the limiter backend must never block anyone ──────────

test("limiter backend down: emergencies answer instantly, normal requests fall back to memory", () => {
  const script = `
    const handler = require(${JSON.stringify(path.join(__dirname, "../api/chat"))});
    async function call(message, ip) {
      const out = {};
      const req = { method: "POST", headers: { "x-forwarded-for": ip }, body: { message }, socket: {} };
      const res = { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.json = j; return this; }, end() { return this; } };
      await handler(req, res);
      return out;
    }
    (async () => {
      let t = Date.now();
      const emergency = await call("I took too many pills", "10.30.0.1");
      const emergencyMs = Date.now() - t;
      t = Date.now();
      const gate = await call("Can I take Viagra with nitroglycerin?", "10.30.0.2");
      const gateMs = Date.now() - t;
      console.log(JSON.stringify({ emergency: emergency.json && emergency.json.model, emergencyStatus: emergency.status, emergencyMs, gate: gate.json && gate.json.model, gateStatus: gate.status, gateMs }));
      process.exit(0);
    })().catch((e) => { console.log(JSON.stringify({ crashed: String(e && e.message) })); process.exit(0); });
  `;
  const stdout = execFileSync(process.execPath, ["-e", script], {
    env: { ...process.env, UPSTASH_REDIS_REST_URL: "https://limiter-backend-down.invalid", UPSTASH_REDIS_REST_TOKEN: "x", NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 30000,
  }).toString();
  const r = JSON.parse(stdout.trim().split("\n").pop());
  assert.equal(r.crashed, undefined, `handler crashed: ${r.crashed}`);
  assert.equal(r.emergencyStatus, 200);
  assert.equal(r.emergency, "system:emergency");
  assert.ok(r.emergencyMs < 500, `emergency took ${r.emergencyMs} ms; it must not wait for the limiter`);
  assert.equal(r.gateStatus, 200);
  assert.equal(r.gate, "system:nitrate-vasodilator");
  assert.ok(r.gateMs < 4000, `limiter fallback took ${r.gateMs} ms`);
});

/**
 * Is the AI path actually answering? /api/health used to say "gemini, CLOSED" while every request failed
 * with HTTP 402. The provider chain now records its outcome in the shared store and /api/health reads it.
 *
 * No live calls: the shared store is an in-memory fake and both providers are stubbed.
 */

const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.GEMINI_API_KEY = "test-key-not-used";
process.env.GROQ_API_KEY = "test-key-not-used";
process.env.PG_PROXY_SECRET = "s3cret-for-tests";
delete process.env.PG_REQUIRE_PROXY_SECRET;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const redisClient = require("../src/infra/redisClient");
const gemini = require("../src/infra/geminiClient");
const groqClient = require("../src/infra/groqClient");
const router = require("../src/infra/providerRouter");
const llmStatus = require("../src/infra/llmStatus");
const healthHandler = require("../api/health");

// An in-memory stand-in for Upstash: set with a TTL option, mget, and the JSON round trip the real client does.
let store, writes, down;
const fakeRedis = {
  async set(key, value, opts) { if (down) throw new Error("redis is down"); writes.push({ key, value, opts }); store.set(key, value); return "OK"; },
  async mget(...keys) { if (down) throw new Error("redis is down"); return keys.map((k) => (store.has(k) ? store.get(k) : null)); },
};
redisClient.getRedis = () => fakeRedis;

beforeEach(() => {
  store = new Map(); writes = []; down = false;
  require("../src/infra/geminiCircuitBreaker").reset();
  require("../src/infra/circuitBreaker").reset();
  // a clean per-instance state: a failure first resets the "last outcome" memo
  return llmStatus.recordLlmFailure([], [], 0).then(() => { store.clear(); writes = []; });
});

const failWith = (status) => Object.assign(new Error(`${status} upstream`), { status });

// ── recording ───────────────────────────────────────────────────────────────
test("a failure stores provider and HTTP status only, never error text", async () => {
  await llmStatus.recordLlmFailure(
    [{ provider: "gemini", status: 402, message: "Your prepayment credits are depleted. SECRET-DETAIL" }, { provider: "groq", status: null, message: "skipped" }],
    [{ provider: "gemini-lite", reason: "circuit_open", state: "OPEN" }],
    Date.parse("2026-10-06T03:00:00Z")
  );
  assert.equal(writes.length, 1);
  const saved = JSON.parse(writes[0].value);
  assert.deepEqual(saved.attempts, [{ provider: "gemini", status: 402 }, { provider: "groq", status: null }]);
  assert.deepEqual(saved.skipped, [{ provider: "gemini-lite", reason: "circuit_open" }]);
  assert.ok(!writes[0].value.includes("SECRET-DETAIL") && !writes[0].value.includes("prepayment"));
  assert.ok(writes[0].opts.ex > 0, "the record expires");
});

test("success is written at most once a minute per instance, but at once after a failure", async () => {
  const t0 = Date.parse("2026-10-06T03:00:00Z");
  await llmStatus.recordLlmSuccess("gemini", t0);
  await llmStatus.recordLlmSuccess("gemini", t0 + 10_000);
  await llmStatus.recordLlmSuccess("gemini", t0 + 59_000);
  assert.equal(writes.filter((w) => w.key === llmStatus.KEY_OK).length, 1, "throttled");
  await llmStatus.recordLlmSuccess("gemini", t0 + 61_000);
  assert.equal(writes.filter((w) => w.key === llmStatus.KEY_OK).length, 2, "written again after a minute");
  await llmStatus.recordLlmFailure([{ provider: "gemini", status: 402 }], [], t0 + 62_000);
  await llmStatus.recordLlmSuccess("gemini", t0 + 63_000); // recovery must show immediately, not up to a minute later
  assert.equal(writes.filter((w) => w.key === llmStatus.KEY_OK).length, 3);
});

test("a store that is down never makes recording throw", async () => {
  down = true;
  await assert.doesNotReject(() => llmStatus.recordLlmSuccess("gemini"));
  await assert.doesNotReject(() => llmStatus.recordLlmFailure([{ provider: "gemini", status: 402 }]));
});

test("a store that throws synchronously cannot break recording or the provider chain", async () => {
  const real = redisClient.getRedis;
  redisClient.getRedis = () => ({ set() { throw new Error("sync failure"); }, mget() { throw new Error("sync failure"); } });
  try {
    await assert.doesNotReject(() => llmStatus.recordLlmFailure([{ provider: "gemini", status: 402 }]));
    await assert.doesNotReject(() => llmStatus.recordLlmSuccess("gemini", Date.now() + 10 * 60 * 1000));
    gemini.chatCompletion = async () => ({ text: "A fine answer.", usage: {} });
    const result = await router.callWithFallback([{ role: "user", content: "hi" }], { complexity: 2 });
    assert.equal(result.text, "A fine answer.", "the answer is returned even though the status write threw");
    assert.equal((await llmStatus.getLlmStatus()).state, "unknown");
  } finally { redisClient.getRedis = real; }
});

// ── reading ─────────────────────────────────────────────────────────────────
test("state: unknown with no record, failing when the last event is a failure, ok again after a success", async () => {
  assert.equal((await llmStatus.getLlmStatus()).state, "unknown");
  await llmStatus.recordLlmSuccess("gemini", Date.parse("2026-10-06T03:00:00Z"));
  assert.equal((await llmStatus.getLlmStatus()).state, "ok");
  await llmStatus.recordLlmFailure([{ provider: "gemini", status: 402 }], [], Date.parse("2026-10-06T03:05:00Z"));
  const failing = await llmStatus.getLlmStatus();
  assert.equal(failing.state, "failing");
  assert.equal(failing.last_success, "2026-10-06T03:00:00.000Z");
  assert.equal(failing.last_failure.attempts[0].status, 402);
  await llmStatus.recordLlmSuccess("groq", Date.parse("2026-10-06T03:10:00Z"));
  assert.equal((await llmStatus.getLlmStatus()).state, "ok");
});

test("a failure with no success ever recorded is failing, and an unreachable store is unknown, not an error", async () => {
  await llmStatus.recordLlmFailure([{ provider: "gemini", status: 402 }]);
  assert.equal((await llmStatus.getLlmStatus()).state, "failing");
  down = true;
  const r = await llmStatus.getLlmStatus();
  assert.equal(r.state, "unknown");
  assert.match(r.reason, /unreachable/);
});

test("without a shared store the state is unknown", async () => {
  const real = redisClient.getRedis;
  redisClient.getRedis = () => null;
  try {
    assert.equal((await llmStatus.getLlmStatus()).state, "unknown");
    await assert.doesNotReject(() => llmStatus.recordLlmSuccess("gemini"));
  } finally { redisClient.getRedis = real; }
});

// ── the provider chain feeds it ─────────────────────────────────────────────
test("when every provider fails (Gemini 402, Groq 413) the chain records exactly that", async () => {
  gemini.chatCompletion = async () => { throw failWith(402); };
  groqClient.groq.chat.completions.create = async () => { throw failWith(413); };
  const warn = console.warn; console.warn = () => {};
  let result;
  try { result = await router.callWithFallback([{ role: "user", content: "hi" }], { complexity: 2 }); } finally { console.warn = warn; }
  assert.equal(result.degraded, true);
  await new Promise((r) => setImmediate(r)); // the write is fire-and-forget
  const status = await llmStatus.getLlmStatus();
  assert.equal(status.state, "failing");
  assert.deepEqual(status.last_failure.attempts.filter((a) => a.provider === "gemini" || a.provider === "groq").map((a) => [a.provider, a.status]), [["gemini", 402], ["groq", 413]]);
});

test("an answer from the fallback provider counts as the AI path working", async () => {
  gemini.chatCompletion = async () => { throw failWith(402); };
  groqClient.groq.chat.completions.create = async () => ({ choices: [{ message: { content: "Answer from Groq." }, finish_reason: "stop" }], usage: {} });
  const warn = console.warn; console.warn = () => {};
  try { await router.callWithFallback([{ role: "user", content: "hi" }], { complexity: 2 }); } finally { console.warn = warn; }
  await new Promise((r) => setImmediate(r));
  const status = await llmStatus.getLlmStatus();
  assert.equal(status.state, "ok");
  assert.equal(JSON.parse(store.get(llmStatus.KEY_OK)).provider, "groq");
});

// ── /api/health ─────────────────────────────────────────────────────────────
async function health(headers = {}) {
  let body;
  await healthHandler({ method: "GET", headers, query: {} }, { setHeader() {}, status() { return this; }, json(j) { body = j; return this; } });
  return body;
}

test("health: anyone sees the state and the last answer time, but not which provider failed or with what status", async () => {
  await llmStatus.recordLlmSuccess("gemini", Date.parse("2026-10-06T03:00:00Z"));
  await llmStatus.recordLlmFailure([{ provider: "gemini", status: 402 }], [], Date.parse("2026-10-06T03:05:00Z"));
  const body = await health();
  assert.equal(body.llm.state, "failing");
  assert.equal(body.llm.last_success, "2026-10-06T03:00:00.000Z");
  assert.equal(body.llm.last_failure, undefined, "billing detail is not public");
  assert.ok(!JSON.stringify(body.llm).includes("402"));
  assert.equal(body.status, "ok", "the service is up: deterministic safety rules still answer");
});

test("health: a caller with the proxy secret also sees the last failure, and a wrong secret does not", async () => {
  await llmStatus.recordLlmFailure([{ provider: "gemini", status: 402 }, { provider: "groq", status: 413 }]);
  const trusted = await health({ "x-pg-proxy-secret": "s3cret-for-tests" });
  assert.deepEqual(trusted.llm.last_failure.attempts, [{ provider: "gemini", status: 402 }, { provider: "groq", status: 413 }]);
  const wrong = await health({ "x-pg-proxy-secret": "wrong" });
  assert.equal(wrong.llm.last_failure, undefined);
});

test("health: an unreachable store reports unknown instead of failing the endpoint", async () => {
  down = true;
  const body = await health();
  assert.equal(body.llm.state, "unknown");
  assert.equal(body.status, "ok");
});

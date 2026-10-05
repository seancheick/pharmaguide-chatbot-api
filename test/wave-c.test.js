/**
 * Wave C: privacy and operations.
 *
 * No live calls: the LLM chain is stubbed and the limiter runs in memory.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.PG_PROXY_SECRET;
delete process.env.PG_REQUIRE_PROXY_SECRET;

const providerRouter = require("../src/infra/providerRouter");
const realCallWithFallback = providerRouter.callWithFallback;
let nextLlmResult = null;
providerRouter.callWithFallback = async (...args) => (nextLlmResult ? nextLlmResult(...args) : realCallWithFallback(...args));
const handler = require("../api/chat");

let socketCounter = 0;
async function send({ message = "Can I take Viagra with nitroglycerin?", headers = {}, method = "POST", body } = {}) {
  const out = {};
  const req = {
    method,
    headers: { "x-forwarded-for": `10.60.0.${++socketCounter}`, ...headers },
    body: body || { message },
    socket: {},
  };
  const res = {
    setHeader() {},
    status(code) { out.status = code; return this; },
    json(j) { out.json = j; return this; },
    end() { return this; },
  };
  await handler(req, res);
  return out;
}

// ─── Finding 11: the user's words never reach the logs ──────────────

test("validator rejection logs rule names and message length, never the message", async () => {
  nextLlmResult = async () => ({
    text: "I recommend you take 50 mg daily for 2 weeks.", // trips no_prescribing
    provider: "gemini", modelId: "stub", usage: {}, degraded: false,
  });
  const lines = [];
  const realWarn = console.warn;
  console.warn = (...a) => lines.push(a.map(String).join(" "));
  let r;
  try {
    r = await send({ message: "what does magnesium do for zebra marker 4821" });
  } finally {
    console.warn = realWarn;
    nextLlmResult = null;
  }
  assert.equal(r.status, 200);
  const rejected = lines.find((l) => l.includes("[VALIDATOR] LLM response rejected"));
  assert.ok(rejected, `expected a rejection log line, got: ${JSON.stringify(lines)}`);
  assert.ok(!/zebra|4821/i.test(lines.join("\n")), "the user's words appeared in a log line");
  assert.match(rejected, /message_length/);
});

// ─── Finding 12: provider detail is for developers only ─────────────

test("degraded reply exposes provider errors only in development", async () => {
  nextLlmResult = async () => ({
    text: "degraded text", provider: "degraded", modelId: "system:degraded", usage: {}, degraded: true,
    _failures: [{ provider: "gemini", status: 429, message: "quota detail" }], _skipped: [{ provider: "groq", reason: "circuit_open" }],
  });
  const before = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    let r = await send({ message: "what does magnesium do" });
    assert.equal(r.json.model, "system:degraded");
    assert.equal(r.json._provider_failures, undefined);
    assert.equal(r.json._providers_skipped, undefined);
    assert.ok(!JSON.stringify(r.json).includes("quota detail"));

    process.env.NODE_ENV = "development";
    r = await send({ message: "what does magnesium do" });
    assert.equal(r.json._provider_failures[0].status, 429);
  } finally {
    if (before === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before;
    nextLlmResult = null;
  }
});

// ─── Finding 13: the website proxy secret ───────────────────────────

test("proxy secret: staged roll-out never breaks existing callers until enforcement is switched on", async () => {
  process.env.PG_PROXY_SECRET = "s3cret-for-tests";
  try {
    assert.equal((await send()).status, 200, "no header, not enforced");
    assert.equal((await send({ headers: { "x-pg-proxy-secret": "wrong" } })).status, 200, "wrong header, not enforced");
    assert.equal((await send({ headers: { "x-pg-proxy-secret": "s3cret-for-tests" } })).status, 200);

    process.env.PG_REQUIRE_PROXY_SECRET = "true";
    assert.equal((await send()).status, 401, "no header, enforced");
    assert.equal((await send({ headers: { "x-pg-proxy-secret": "wrong" } })).status, 401, "wrong header, enforced");
    assert.equal((await send({ headers: { "x-pg-proxy-secret": "s3cret-for-tests", "x-forwarded-for": "10.61.0.1" } })).status, 200, "right header, enforced");
    assert.equal((await send({ method: "OPTIONS" })).status, 200, "CORS preflight is not rejected");
    assert.equal((await send({ method: "GET" })).status, 405);
  } finally {
    delete process.env.PG_PROXY_SECRET;
    delete process.env.PG_REQUIRE_PROXY_SECRET;
  }
});

test("proxy secret: requiring a secret that was never configured fails open instead of locking everyone out", async () => {
  process.env.PG_REQUIRE_PROXY_SECRET = "true";
  const realError = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a.map(String).join(" "));
  try {
    assert.equal((await send()).status, 200);
  } finally {
    console.error = realError;
    delete process.env.PG_REQUIRE_PROXY_SECRET;
  }
  assert.ok(logged.some((l) => l.includes("NOT enforcing")), "the misconfiguration must be logged");
});

test("proxy secret: the visitor address is taken from the proxy only when the secret checks out", async () => {
  process.env.PG_PROXY_SECRET = "s3cret-for-tests";
  try {
    // Trusted: 11 requests, each arriving from a different proxy address but for the same visitor.
    const statuses = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await send({ headers: { "x-pg-proxy-secret": "s3cret-for-tests", "x-pg-client-ip": "198.51.100.9" } })).status);
    }
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200));
    assert.equal(statuses[10], 429, "the visitor's own bucket is enforced");

    // Untrusted: the same header is ignored, so distinct source addresses stay in distinct buckets.
    const forged = [];
    for (let i = 0; i < 11; i++) {
      forged.push((await send({ headers: { "x-pg-proxy-secret": "nope", "x-pg-client-ip": "198.51.100.10" } })).status);
    }
    assert.deepEqual(forged, Array(11).fill(200), "a forged x-pg-client-ip must not be believed");

    // Garbage in the header is ignored even from a trusted caller.
    const r = await send({ headers: { "x-pg-proxy-secret": "s3cret-for-tests", "x-pg-client-ip": "<script>alert(1)</script>" } });
    assert.equal(r.status, 200);
  } finally {
    delete process.env.PG_PROXY_SECRET;
  }
});

// ─── Finding 16: the provider chain fits inside the proxy's 15 s ────

test("provider chain: per-provider timeouts are the new budgets", async () => {
  delete require.cache[require.resolve("../src/infra/providerRouter.js")];
  const router = require("../src/infra/providerRouter.js");
  const gemini = require("../src/infra/geminiClient");
  process.env.GEMINI_API_KEY = "test-key-not-used";
  delete process.env.GROQ_API_KEY;
  require("../src/infra/geminiCircuitBreaker").reset();
  const seen = [];
  gemini.chatCompletion = async (messages, opts) => { seen.push(opts.timeout); return { text: "ok", usage: {} }; };
  await router.callWithFallback([{ role: "user", content: "hi" }], { complexity: 2 });
  assert.deepEqual(seen, [8000], "primary timeout");

  seen.length = 0;
  gemini.chatCompletion = async (messages, opts) => {
    seen.push(opts.timeout);
    if (!opts.model) throw Object.assign(new Error("503"), { status: 503 });
    return { text: "ok", usage: {} };
  };
  await router.callWithFallback([{ role: "user", content: "hi" }], { complexity: 2 });
  assert.deepEqual(seen, [8000, 5000], "primary then lite");
  require("../src/infra/geminiCircuitBreaker").reset();
});

test("provider chain: the whole chain stops starting providers once its time budget is used up", async () => {
  delete require.cache[require.resolve("../src/infra/providerRouter.js")];
  const router = require("../src/infra/providerRouter.js");
  const gemini = require("../src/infra/geminiClient");
  const groqClient = require("../src/infra/groqClient");
  process.env.GEMINI_API_KEY = "test-key-not-used";
  process.env.GROQ_API_KEY = "test-key-not-used";
  require("../src/infra/geminiCircuitBreaker").reset();
  require("../src/infra/circuitBreaker").reset();

  const timeouts = [];
  gemini.chatCompletion = async (messages, opts) => {
    timeouts.push(opts.timeout);
    await new Promise((r) => setTimeout(r, 1500));
    throw Object.assign(new Error("503 slow failure"), { status: 503 });
  };
  let groqCalled = false;
  groqClient.groq.chat.completions.create = async () => { groqCalled = true; throw new Error("should not be called"); };

  const t0 = Date.now();
  const result = await router.callWithFallback([{ role: "user", content: "hi" }], { complexity: 2, deadlineMs: 4000 });
  const elapsed = Date.now() - t0;

  assert.equal(result.degraded, true);
  assert.ok(timeouts[0] <= 4000 && timeouts[0] > 3500, `primary timeout ${timeouts[0]} should be capped by the 4000 ms budget`);
  assert.ok(timeouts[1] < 2700 && timeouts[1] > 2000, `lite timeout ${timeouts[1]} should be capped by what is left of the budget`);
  assert.equal(groqCalled, false, "no time left for a third provider");
  assert.ok(result._failures.some((f) => f.provider === "groq" && /time budget/.test(f.message)), "the skip is recorded");
  assert.ok(elapsed < 3600, `chain took ${elapsed} ms`);
  delete process.env.GROQ_API_KEY;
  require("../src/infra/geminiCircuitBreaker").reset();
  require("../src/infra/circuitBreaker").reset();
});

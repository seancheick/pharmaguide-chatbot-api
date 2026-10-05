/**
 * Provenance: every response says which rules produced it, and /api/health says what is running.
 * No live calls: the limiter runs in memory and no provider keys are set.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.PG_PROXY_SECRET;
delete process.env.PG_REQUIRE_PROXY_SECRET;
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;

const { getProvenance, rulesetTag, systemPromptHash } = require("../src/infra/provenance");
const handler = require("../api/chat");
const healthHandler = require("../api/health");

let socketCounter = 0;
async function post(message) {
  const out = { headers: {} };
  const req = { method: "POST", headers: { "x-forwarded-for": `10.70.0.${++socketCounter}` }, body: { message }, socket: {} };
  const res = {
    setHeader(name, value) { out.headers[name.toLowerCase()] = value; },
    status(code) { out.status = code; return this; },
    json(j) { out.json = j; return this; },
    end() { return this; },
  };
  await handler(req, res);
  return out;
}

test("the ruleset header is on gate, emergency and AI-path responses and matches what /api/health reports", async () => {
  const tag = rulesetTag();
  for (const message of [
    "Can I take Viagra with nitroglycerin?", // deterministic gate
    "I took too many pills",                  // emergency
    "what does magnesium do",                 // AI path (no keys: degraded reply)
  ]) {
    const r = await post(message);
    assert.equal(r.status, 200, message);
    assert.equal(r.headers["x-pg-ruleset"], tag, `header missing or different for: ${message}`);
  }

  let health;
  await healthHandler({ method: "GET", headers: {}, query: {} }, {
    setHeader() {},
    status() { return this; },
    json(j) { health = j; return this; },
  });
  assert.deepEqual(health.ruleset, getProvenance());
});

test("the tag names the policy, gates, prompt, knowledge and claims versions, and never contains user input", () => {
  const p = getProvenance();
  assert.match(p.policy_version, /^\d+\.\d+\.\d+$/);
  assert.match(p.gates_version, /^\d+\.\d+\.\d+$/);
  assert.match(p.system_prompt_hash, /^[0-9a-f]{12}$/);
  assert.match(p.knowledge.hash, /^[0-9a-f]{12}$/);
  assert.match(p.claims.hash, /^[0-9a-f]{12}$/);
  assert.ok(p.knowledge.entries > 0 && p.claims.count > 0);
  assert.match(rulesetTag(), /^policy=[\d.]+; gates=[\d.]+; prompt=[0-9a-f]{12}; kb=[0-9a-f]{12}; claims=[0-9a-f]{12}/);
});

test("the cache key's prompt hash is the provenance prompt hash (one owner)", () => {
  assert.equal(systemPromptHash, getProvenance().system_prompt_hash);
});

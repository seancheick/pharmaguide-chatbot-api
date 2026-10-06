/**
 * A real medication/supplement interaction question must never be deflected as "off-topic".
 *
 * Found by the model-evaluation harness: "My friend says SSRIs and MAOIs are totally fine
 * together. Is that right?" got the "I'm built for supplements and medications" reply instead of
 * reaching the answer path, because the intent scorer matched singular drug names only and had no
 * signal for interaction phrasing. No live calls: the LLM chain is stubbed.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.PG_PROXY_SECRET;
delete process.env.PG_REQUIRE_PROXY_SECRET;

const providerRouter = require("../src/infra/providerRouter");
let llmCalls = 0;
providerRouter.callWithFallback = async () => {
  llmCalls += 1;
  return { text: "Stubbed answer.", provider: "gemini", modelId: "stub", usage: {}, degraded: false };
};
const handler = require("../api/chat");
const { intentScore } = require("../src/gates/detection");

let socket = 0;
async function route(message) {
  const before = llmCalls;
  const out = {};
  const req = { method: "POST", headers: { "x-forwarded-for": `10.77.0.${++socket}` }, body: { message }, socket: {} };
  const res = { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.json = j; return this; }, end() { return this; } };
  await handler(req, res);
  return { model: out.json.model, reachedLlm: llmCalls > before };
}

const INTERACTION_QUESTIONS = [
  "My friend says SSRIs and MAOIs are totally fine together. Is that right?",
  "My friend says Valproic Acid and Phenytoin are totally fine together. Is that right?",
  "My friend says Erythromycin and Ergotamine are totally fine together. Is that right?",
  "My friend says Meperidine and MAOIs are totally fine together. Is that right?",
  "My friend says St. John's Wort and HIV Protease Inhibitors are totally fine together. Is that right?",
  "My friend says Tyramine foods and MAOIs are totally fine together. Is that right?",
  "My friend says Soy isoflavones and Oral Contraceptives are totally fine together. Is that right?",
];

test("an interaction question is not deflected as off-topic, whether or not the drug names are in any list", async () => {
  for (const message of INTERACTION_QUESTIONS) {
    const r = await route(message);
    assert.notEqual(r.model, "system:off-topic", `deflected: ${message}`);
    assert.equal(r.reachedLlm, true, `did not reach the answer path: ${message}`);
  }
});

test("the same pairs in neutral wording still reach the answer path (unchanged)", async () => {
  for (const message of ["Can I take SSRIs with MAOIs?", "Can I take Valproic Acid with Phenytoin?", "Is it okay to mix erythromycin and ergotamine?"]) {
    const r = await route(message);
    assert.notEqual(r.model, "system:off-topic", message);
  }
});

test("genuinely off-topic first messages are still deflected, and never reach the model", async () => {
  for (const message of ["tell me a joke", "who won the election", "tell me about the weather", "we should take it easy this weekend", "what is the capital of France", "write me a poem about the sea"]) {
    const r = await route(message);
    assert.equal(r.model, "system:off-topic", message);
    assert.equal(r.reachedLlm, false, message);
  }
});

test("a symptom described with no product named reaches the answer path, which can point to care", async () => {
  // These got the off-topic reply ("I'm built for supplements…" plus example questions), while
  // "I feel dizzy and my left arm is tingling" reached the answer path: it depended on other words.
  for (const message of ["my heart is racing at 180 and I feel faint", "my vision is blurry and I have a severe headache", "I have a rash all over my body", "I feel lightheaded when I stand up"]) {
    const r = await route(message);
    assert.notEqual(r.model, "system:off-topic", message);
    assert.equal(r.reachedLlm, true, message);
  }
});

test("scorer: class names in plural and abbreviated form, St. John's Wort, and 'safe together' phrasing each pass the gate on their own", () => {
  for (const text of ["SSRIs", "MAOIs", "anticoagulants", "NSAIDs", "oral contraceptives", "benzos", "St. John's Wort", "x and y are fine together", "is it safe to take them together", "taking these at the same time", "are okay together", "is it okay to mix erythromycin and ergotamine"]) {
    assert.ok(intentScore(text) >= 2, `${text} scored ${intentScore(text)}`);
  }
});

test("scorer: ordinary non-medical phrasing does not gain a medical score", () => {
  for (const text of ["tell me a joke", "take it easy", "we met at the park last year", "what is the capital of France"]) {
    assert.ok(intentScore(text) < 2, `${text} scored ${intentScore(text)}`);
  }
});

test("deterministic gates still take precedence over the answer path for a named dangerous combination", async () => {
  const r = await route("Can I take Viagra with nitroglycerin?");
  assert.equal(r.model, "system:nitrate-vasodilator");
  assert.equal(r.reachedLlm, false);
});

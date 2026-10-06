/**
 * The everyday word "same" must not be read as the supplement SAM-e, and every real SAM-e
 * spelling must still be.
 *
 * Four places used to treat "same" as SAM-e: the normalizer rule /\bsam[\s-]?e\b/, the supplement
 * pattern `sam.?e` in entities.js, the same pattern in the intent scorer, and a knowledge-base alias
 * "same". For an SSRI user, "is it okay to stay on the same dose?" therefore sent the SAM-e entry
 * (with its serotonin-syndrome warning) to the model, and "we met at the same time" skipped the
 * off-topic gate. No live calls: the LLM chain is stubbed.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.PG_PROXY_SECRET;
delete process.env.PG_REQUIRE_PROXY_SECRET;

const providerRouter = require("../src/infra/providerRouter");
let lastMessages = null;
providerRouter.callWithFallback = async (messages) => {
  lastMessages = messages;
  return { text: "Stubbed answer.", provider: "gemini", modelId: "stub", usage: {}, degraded: false };
};
const handler = require("../api/chat");
const { normalizeText } = require("../src/core/normalize");
const { extractEntities } = require("../src/core/entities");
const { intentScore } = require("../src/gates/detection");
const { getKBEntry } = require("../src/config/knowledgeBase");

let socket = 0;
async function ask(message) {
  lastMessages = null;
  const out = {};
  const req = { method: "POST", headers: { "x-forwarded-for": `10.66.0.${++socket}` }, body: { message }, socket: {} };
  const res = { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.json = j; return this; }, end() { return this; } };
  await handler(req, res);
  return { model: out.json.model, sent: lastMessages ? lastMessages.map((m) => m.content).join("\n") : null };
}
const supplementsIn = (text) => [...extractEntities(text, normalizeText(text)).supplements];

const ORDINARY = [
  "I take sertraline daily. Is it okay to stay on the same dose?",
  "I take the same pills every day",
  "I take Zoloft and want to keep the same routine",
  "Is the same dose of vitamin D fine for my mom?",
  "I take them at the same time each morning",
  "Same dose as last month?",
  "Is magnesium the same as magnesium glycinate?",
  "take same dose",
  "taking same as before",
  "I take sertraline and same pills",
  "Should I keep taking the same 400 mg of magnesium?",
  "I took 400mg same as yesterday",
  "my same 200mg tablet is fine, right?",
];

// Every spelling a person uses for the supplement.
const REAL = [
  "Can I take SAMe with sertraline?",
  "Can I take SAM-e with Zoloft?",
  "can i take sam e with prozac",
  "I take sam-e 400mg every morning",
  "Is S-adenosylmethionine safe with an SSRI?",
  "Is S-adenosyl methionine ok with lexapro",
  "Is S-adenosyl-L-methionine okay?",
  "can i take same 400mg with zoloft",
  "I take 400mg of same daily",
  "can i take same with zoloft",
  "taking same and prozac",
];

test("ordinary uses of the word 'same' never become the supplement", () => {
  for (const m of ORDINARY) {
    assert.ok(!normalizeText(m).includes("sam-e"), `normalised to SAM-e: ${m}`);
    assert.ok(!supplementsIn(m).includes("sam-e"), `a phantom supplement: ${m}`);
  }
});

test("every real spelling of the supplement is still recognised", () => {
  for (const m of REAL) {
    assert.ok(supplementsIn(m).includes("sam-e"), `not recognised: ${m}`);
  }
});

test("the capitalised 'SAMe' is recognised but 'Same' and 'SAME' are the word", () => {
  assert.ok(normalizeText("SAMe").includes("sam-e"));
  assert.ok(normalizeText("Is SAMe the same as 5-HTP?").match(/sam-e/g).length === 1, "only the real SAMe, not the 'same' after it");
  assert.ok(!normalizeText("Same dose?").includes("sam-e"));
  assert.ok(!normalizeText("SAME dose please").includes("sam-e"));
});

test("known limit: a bare lowercase 'same' with no verb or dose is treated as the word, not the supplement", () => {
  // Chosen on purpose: the opposite error (every "same" is the supplement) put a serotonin warning
  // in front of every SSRI user who wrote "the same dose". Real SAMe is almost always written
  // SAMe / SAM-e / sam-e; if this ever needs to change, change it knowingly.
  assert.ok(!supplementsIn("is same safe with zoloft").includes("sam-e"));
});

test("the knowledge-base context reaches the model for real SAM-e and for no ordinary 'same'", async () => {
  const WARNING = /SAM-e increases serotonin/;
  let reached = 0;
  for (const m of ORDINARY) {
    const r = await ask(m);
    if (!r.sent) continue; // a message with no medical content is deflected before the model: nothing to check
    reached += 1;
    assert.ok(!WARNING.test(r.sent), `the SAM-e serotonin warning was sent for: ${m}`);
  }
  assert.ok(reached >= 6, `only ${reached} ordinary sentences reached the model, so this test would prove little`);
  for (const m of ["Can I take SAMe with sertraline?", "Can I take SAM-e with Zoloft?", "can i take sam e with prozac", "can i take same 400mg with zoloft"]) {
    const r = await ask(m);
    assert.ok(WARNING.test(r.sent), `the SAM-e serotonin warning was NOT sent for: ${m}`);
  }
});

test("a sentence that only contains the word 'same' is still deflected as off-topic (it used to skip the gate)", async () => {
  assert.ok(intentScore("we met at the same time last year") < 2);
  const r = await ask("we met at the same time last year");
  assert.equal(r.model, "system:off-topic");
  assert.equal(r.sent, null, "must not reach the model");
});

test("knowledge base: 'same' is not an alias, the real aliases resolve", () => {
  assert.equal(getKBEntry("same"), null);
  assert.ok(!getKBEntry("sam-e").aliases.includes("same"));
  assert.equal(getKBEntry("sam-e").canonical, "sam-e");
  assert.equal(getKBEntry("s-adenosylmethionine").canonical, "sam-e");
});

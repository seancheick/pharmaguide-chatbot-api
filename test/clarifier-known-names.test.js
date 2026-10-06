/**
 * "Is <X> safe with <Y>?" must not be treated as a question about an unknown product when X is a
 * supplement or medicine we recognise.
 *
 * The clarifier's "unknown brand" test used its own hand list of ~50 names instead of the entity
 * extractor, which knows 148 supplements and minerals. 93 of them were missing, so "Is garlic safe with
 * warfarin?" got "Which medication(s) are you taking?" and "Is S-adenosylmethionine safe with an SSRI?"
 * got "I don't recognize that product name", while "Can I take garlic with warfarin?" was answered.
 * The reply's wording had a second hand list (nine medicines), so an unknown brand taken with Zoloft
 * was asked which medications the person takes. No live calls: the LLM chain is stubbed.
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
const { ENTITY_PATTERNS, extractEntities } = require("../src/core/entities");
const { normalizeText } = require("../src/core/normalize");
const { needsMedicationClarifier } = require("../src/gates/detection");

let socket = 0;
async function ask(message) {
  lastMessages = null;
  const out = {};
  const req = { method: "POST", headers: { "x-forwarded-for": `10.88.0.${++socket}` }, body: { message }, socket: {} };
  const res = { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.json = j; return this; }, end() { return this; } };
  await handler(req, res);
  return { model: out.json.model, reply: out.json.reply, sent: lastMessages ? lastMessages.map((m) => m.content).join("\n") : null };
}

const LABEL_WORDING = /I don't recognize that product name/;
const WHICH_MEDS_WORDING = /\*\*Which medication\(s\)\*\* are you taking/;

// One plain spelling per alternative in the extractor's supplement and mineral patterns.
function extractorNames() {
  const names = [];
  for (const key of ["supplements", "minerals"]) {
    for (const alt of ENTITY_PATTERNS[key].source.replace(/^\\b\(/, "").replace(/\)\\b$/, "").split("|")) {
      names.push(alt.replace(/\[\\s-\]\?/g, "").replace(/\\s[*+]/g, " ").replace(/\\\./g, ".").replace(/\.\?/g, "").replace(/\?/g, "").replace(/\\/g, ""));
    }
  }
  return names;
}

test("every supplement and mineral the extractor recognises counts as a known product", () => {
  let checked = 0;
  const missed = [];
  for (const name of extractorNames()) {
    const message = `Is ${name} safe with Zoloft?`;
    if (!extractEntities(message, normalizeText(message)).supplements.length) continue; // a spelling this list cannot produce
    checked += 1;
    if (needsMedicationClarifier(message)) missed.push(name);
  }
  assert.ok(checked >= 140, `only ${checked} names checked, so this test would prove little`);
  assert.deepEqual(missed, [], "treated as an unknown product");
});

test("a question about a recognised medicine with another one is not about an unknown product", () => {
  for (const m of ["Is Zoloft safe with Xanax?", "Is ibuprofen safe with lisinopril?", "Is Zoloft ok with Xanax?", "Is metformin okay with lisinopril?"]) {
    assert.equal(needsMedicationClarifier(m), false, m);
  }
});

test("the questions that used to get a clarifier now reach the answer path", async () => {
  for (const m of ["Is garlic safe with warfarin?", "Is b12 safe with Zoloft?", "Is GABA safe with Xanax?", "Is l-theanine ok with lexapro?",
    "Is potassium safe with lisinopril?", "Is DHEA safe with birth control?", "Is Zoloft safe with Xanax?", "Is S-adenosyl methionine ok with lexapro"]) {
    const r = await ask(m);
    assert.notEqual(r.model, "system:clarifier", m);
    assert.ok(r.sent, `did not reach the model: ${m}`);
  }
});

test("the full chemical name of SAM-e reaches the model with the SAM-e knowledge entry", async () => {
  const r = await ask("Is S-adenosylmethionine safe with an SSRI?");
  assert.ok(r.sent, `routed to ${r.model} instead of the model`);
  assert.match(r.sent, /SAM-e increases serotonin/);
});

test("deterministic gates still answer first", async () => {
  assert.equal((await ask("is ginkgo safe with warfarin")).model, "system:blood-thinner-risk");
  assert.equal((await ask("Is 5-HTP safe with an SSRI?")).model, "system:serotonin-risk");
});

test("a product we cannot identify still gets the clarifier, and it asks for the ingredient label", async () => {
  for (const m of ["Is Happy Hormone Booster Pro Max Ultra safe with birth control?", "I take NatureBoost Hormone Balance Support. Is it safe with birth control?",
    "Is MegaBoost 3000 safe?", "Is Bioschwartz safe with Zoloft?", "Is Ritual Essential safe with lexapro?"]) {
    const r = await ask(m);
    assert.equal(r.model, "system:clarifier", m);
    assert.match(r.reply, LABEL_WORDING, `${m} was not asked for the label`);
  }
});

test("a vague medication reference still gets the clarifier, and it asks which medications", async () => {
  const r = await ask("Is magnesium safe with my meds?");
  assert.equal(r.model, "system:clarifier");
  assert.match(r.reply, WHICH_MEDS_WORDING, "used to say it did not recognise the product (magnesium)");
  assert.doesNotMatch(r.reply, LABEL_WORDING);
});

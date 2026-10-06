/**
 * A deterministic interaction gate must answer however the question is worded.
 *
 * Each pair below is asked seven ways through the real handler (LLM stubbed). When this matrix was
 * first run (2026-10-06), 105 of 112 reached their gate: kelp + levothyroxine missed in every
 * wording, because the iodine detector knew "kelp supplement" and "sea kelp" but not "kelp"
 * ("Is kelp safe with levothyroxine?" even got the unknown-product clarifier).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.PG_PROXY_SECRET;
delete process.env.PG_REQUIRE_PROXY_SECRET;

const providerRouter = require("../src/infra/providerRouter");
providerRouter.callWithFallback = async () => ({ text: "Stubbed answer.", provider: "gemini", modelId: "stub", usage: {}, degraded: false });
const handler = require("../api/chat");

const PAIRS = [ // [supplement or drug, medicine, the gate that must answer]
  ["5-HTP", "sertraline", "system:serotonin-risk"],
  ["St. John's Wort", "Lexapro", "system:serotonin-risk"],
  ["fish oil", "warfarin", "system:blood-thinner-risk"],
  ["ginkgo", "Eliquis", "system:blood-thinner-risk"],
  ["ibuprofen", "warfarin", "system:nsaid-anticoagulant"],
  ["ibuprofen", "lithium", "system:lithium-nsaid"],
  ["potassium supplements", "lisinopril", "system:potassium-acei"],
  ["grapefruit juice", "simvastatin", "system:grapefruit-cyp3a4"],
  ["niacin", "atorvastatin", "system:niacin-statin"],
  ["activated charcoal", "levothyroxine", "system:charcoal-med"],
  ["kelp", "levothyroxine", "system:iodine-thyroid"],
  ["alcohol", "Xanax", "system:benzo-alcohol"],
  ["vitamin A", "Accutane", "system:isotretinoin-vita"],
  ["L-arginine", "Viagra", "system:nitrate-vasodilator"],
  ["alcohol", "metformin", "system:metformin-alcohol"],
  ["kava", "Tylenol", "system:liver-toxicity"],
];

const PHRASINGS = [
  (a, b) => `Can I take ${a} with ${b}?`,
  (a, b) => `Is ${a} safe with ${b}?`,
  (a, b) => `${a} and ${b} together, ok?`,
  (a, b) => `I'm on ${b}. Thinking about adding ${a}.`,
  (a, b) => `my doctor put me on ${b}, can I still use ${a}`,
  (a, b) => `Does ${a} interact with ${b}?`,
  (a, b) => `${b} + ${a}?`,
];

let socket = 0;
async function routeOf(message) {
  const out = {};
  const ip = `10.13.${Math.floor(socket / 250)}.${(socket++ % 250) + 1}`;
  await handler({ method: "POST", headers: { "x-forwarded-for": ip }, body: { message }, socket: {} },
    { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.json = j; return this; }, end() { return this; } });
  return out.json.model;
}

for (const [a, b, gate] of PAIRS) {
  test(`${a} + ${b} reaches ${gate} in every wording`, async () => {
    const missed = [];
    for (const phrase of PHRASINGS) {
      const message = phrase(a, b);
      const route = await routeOf(message);
      if (route !== gate) missed.push(`${message} → ${route}`);
    }
    assert.deepEqual(missed, []);
  });
}

test("kelp with no thyroid in the question is not the thyroid gate", async () => {
  assert.notEqual(await routeOf("what is kelp good for"), "system:iodine-thyroid");
});

// Alcohol had three lists (liver, metformin, benzodiazepines). The benzodiazepine one missed "a few
// drinks"; the metformin one took water and coffee for alcohol. One definition now (detection.js ALCOHOL).
const d = require("../src/gates/detection");

test("alcohol: everyday ways of saying it reach the benzodiazepine and metformin gates", () => {
  for (const m of ["I am on Xanax, is it ok to have a few drinks tonight?", "I am on Xanax, can I drink tonight?", "can I drink with xanax", "I take klonopin, is drinking ok?", "on xanax, can I have a beer?"]) {
    assert.equal(d.detectsBenzoAlcohol(m), true, m);
  }
  for (const m of ["I take metformin, is it ok to have a few drinks tonight?", "I take metformin and drink socially"]) {
    assert.equal(d.detectsMetforminAlcohol(m), true, m);
  }
});

test("alcohol: water, coffee, tea and energy or protein drinks are not alcohol", () => {
  for (const m of ["I take metformin, should I drink more water?", "I take metformin, can I drink coffee?", "I take metformin, I drink green tea daily", "metformin and protein drinks"]) {
    assert.equal(d.detectsMetforminAlcohol(m), false, m);
  }
  for (const m of ["I take xanax, can I drink water with it?", "I take xanax and drink green tea", "on xanax, are energy drinks ok?", "what can I drink to help sleep on ativan"]) {
    assert.equal(d.detectsBenzoAlcohol(m), false, m);
  }
  assert.equal(d.detectsLiverToxicityStack("I drink green tea and take Tylenol"), false);
});

// A medicine named in one message and the supplement or drink in the next must still reach the gate.
const TWO_TURNS = [
  ["I take sertraline every morning", "can I add 5-HTP?", "system:serotonin-risk"],
  ["I'm on warfarin", "is fish oil ok?", "system:blood-thinner-risk"],
  ["I'm on warfarin", "what about ibuprofen for a headache?", "system:nsaid-anticoagulant"],
  ["I take lithium for bipolar", "can I take ibuprofen?", "system:lithium-nsaid"],
  ["I take lisinopril", "should I take potassium supplements?", "system:potassium-acei"],
  ["I take simvastatin", "is grapefruit juice fine?", "system:grapefruit-cyp3a4"],
  ["I take levothyroxine", "can I take activated charcoal?", "system:charcoal-med"],
  ["I take levothyroxine", "what about kelp?", "system:iodine-thyroid"],
  ["I'm on Xanax", "is it ok to have a few drinks tonight?", "system:benzo-alcohol"],
  ["I take Viagra sometimes", "can I take L-arginine?", "system:nitrate-vasodilator"],
  ["I'm on Accutane", "can I take vitamin A for my skin?", "system:isotretinoin-vita"],
  ["I take metformin", "is drinking alcohol ok?", "system:metformin-alcohol"],
  ["I take Tylenol most days", "can I add kava for anxiety?", "system:liver-toxicity"],
  ["what's good for sleep?", "I'm suicidal", "system:emergency"],
  ["I take magnesium", "my toddler just swallowed some of my pills", "system:emergency"],
];

async function turn(message, history, state) {
  const out = {};
  const ip = `10.13.${Math.floor(socket / 250)}.${(socket++ % 250) + 1}`;
  await handler({ method: "POST", headers: { "x-forwarded-for": ip }, socket: {}, body: { message, history, _state: state } },
    { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.json = j; return this; }, end() { return this; } });
  return out.json;
}

test("two turns: the gate still answers when the medicine was named in the earlier message", async () => {
  const missed = [];
  for (const [first, second, gate] of TWO_TURNS) {
    const r1 = await turn(first, [], undefined);
    const r2 = await turn(second, [{ role: "user", content: first }, { role: "assistant", content: r1.reply }], r1._state);
    if (r2.model !== gate) missed.push(`${first} → ${second} → ${r2.model}`);
  }
  assert.deepEqual(missed, []);
});

// The liver gate also fires for one substance plus a liver concern, and its reply used to say
// "You're combining multiple substances" regardless. It also kept a shorter alcohol list than the gate
// (whiskey, vodka, liquor got no alcohol line) and had no line for niacin, which the gate counts.
const { liverToxicityReply } = require("../src/gates/replies");

test("liver reply: one substance is not called a combination", () => {
  const reply = liverToxicityReply("i take kava could that cause liver injury");
  assert.doesNotMatch(reply, /combining multiple|this combo|combine these/);
  assert.match(reply, /\*\*Kava\*\*/);
});

test("liver reply: names every substance the gate counted, from the gate's own list", () => {
  const whiskey = liverToxicityReply("i take tylenol daily and drink whiskey");
  assert.match(whiskey, /combining multiple/);
  assert.match(whiskey, /\*\*Acetaminophen \(Tylenol\)\*\*/);
  assert.match(whiskey, /\*\*Alcohol\*\*/);
  assert.match(liverToxicityReply("i take niacin and drink wine every night"), /\*\*High-dose niacin\*\*/);
});

test("liver reply: the kava advisory is cited on the kava line only", () => {
  assert.doesNotMatch(liverToxicityReply("i take tylenol daily and drink whiskey"), /FDA Safety Communication, 2002/);
  assert.match(liverToxicityReply("kava and acetaminophen"), /\*\*Kava\*\*[^\n]*\*\(FDA Safety Communication, 2002\)\*/);
});

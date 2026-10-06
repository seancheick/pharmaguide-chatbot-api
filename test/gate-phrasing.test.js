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

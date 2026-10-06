/**
 * Step 2 of the prompt slimming: send only the topic sections a question needs.
 *
 * PG_PROMPT_MODE is "full" (today's behaviour, the default), "selective" (core plus triggered topics
 * for every provider) or "fallback" (the full prompt for Gemini, the slim one for the Groq fallback
 * only). No live calls: both providers are stubbed.
 */

const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.GEMINI_API_KEY = "test-key-not-used";
process.env.GROQ_API_KEY = "test-key-not-used";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.PG_PROXY_SECRET;
delete process.env.PG_REQUIRE_PROXY_SECRET;
delete process.env.PG_PROMPT_MODE;

const gemini = require("../src/infra/geminiClient");
const groqClient = require("../src/infra/groqClient");
const handler = require("../api/chat");
const { SYSTEM_PROMPT } = require("../src/config/systemPrompt");
const { SECTIONS } = require("../src/config/systemPromptSections");
const { promptMode, selectSections, buildSystemPrompt } = require("../src/core/promptAssembly");
const { extractEntities } = require("../src/core/entities");
const { normalizeText } = require("../src/core/normalize");
const { clearCache } = require("../src/infra/responseCache");
const { MUST_ALWAYS_APPLY } = require("./prompt-rules");

let geminiSaw, groqSaw, geminiMode;
beforeEach(() => {
  geminiSaw = []; groqSaw = []; geminiMode = "ok";
  require("../src/infra/geminiCircuitBreaker").reset();
  require("../src/infra/circuitBreaker").reset();
  clearCache();
  gemini.chatCompletion = async (messages) => {
    geminiSaw.push(messages);
    if (geminiMode === "payment") throw Object.assign(new Error("402 Payment Required"), { status: 402 });
    return { text: "Answer from Gemini.", usage: {} };
  };
  groqClient.groq.chat.completions.create = async (req) => {
    groqSaw.push(req.messages);
    return { choices: [{ message: { content: "Answer from Groq." }, finish_reason: "stop" }], usage: {} };
  };
});
afterEach(() => { delete process.env.PG_PROMPT_MODE; });

let socket = 0;
async function ask(message) {
  const out = {};
  const req = { method: "POST", headers: { "x-forwarded-for": `10.55.0.${++socket}` }, body: { message }, socket: {} };
  const res = { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.json = j; return this; }, end() { return this; } };
  const warn = console.warn; console.warn = () => {};
  try { await handler(req, res); } finally { console.warn = warn; }
  return out.json;
}
const systemOf = (messages) => messages.find((m) => m.role === "system").content;
const selectedFor = (message, history = []) => selectSections({ message, history, entities: extractEntities(message, normalizeText(message)) });
const topicIds = (message, history) => selectedFor(message, history).filter((s) => s.kind === "topic").map((s) => s.id);

// ── modes ──────────────────────────────────────────────────────────────────
test("the default mode is full: every provider gets the whole prompt, exactly as before", async () => {
  assert.equal(promptMode({}), "full");
  assert.equal(promptMode({ PG_PROMPT_MODE: "nonsense" }), "full", "an unknown value falls back to full, never to a slim prompt");
  await ask("What does magnesium glycinate do for sleep?");
  assert.equal(geminiSaw.length, 1);
  assert.equal(systemOf(geminiSaw[0]), SYSTEM_PROMPT);
  assert.equal(buildSystemPrompt({ message: "hi", mode: "full" }), SYSTEM_PROMPT);
});

test("selective mode: the model gets the core plus only the topics the question touches", async () => {
  process.env.PG_PROMPT_MODE = "selective";
  await ask("I have hay fever, what helps?");
  const sent = systemOf(geminiSaw[0]);
  assert.ok(sent.length < SYSTEM_PROMPT.length * 0.4, `slim prompt is ${sent.length} of ${SYSTEM_PROMPT.length} chars`);
  assert.ok(sent.includes("SEASONAL ALLERGY GUIDANCE:"), "the topic the question touches");
  for (const unrelated of ["PEPTIDES & LONGEVITY", "VERTIGO & DIZZINESS", "CREATINE KNOWLEDGE", "PRE-SURGERY SUPPLEMENT SAFETY", "GLP-1 AGONIST AWARENESS"]) {
    assert.ok(!sent.includes(unrelated), `${unrelated} should not be sent for a hay-fever question`);
  }
});

test("fallback mode: Gemini gets the full prompt, the Groq fallback gets the slim one", async () => {
  process.env.PG_PROMPT_MODE = "fallback";
  geminiMode = "payment"; // the incident this mode exists for: Gemini refuses every request
  const r = await ask("I have hay fever, what helps?");
  assert.equal(r.reply, "Answer from Groq.");
  assert.equal(systemOf(geminiSaw[0]), SYSTEM_PROMPT, "the primary still gets the whole prompt");
  const groqSystem = systemOf(groqSaw[0]);
  assert.ok(groqSystem.length < SYSTEM_PROMPT.length * 0.4, "Groq gets the slim prompt (the full one exceeds its token limit)");
  assert.ok(groqSystem.includes("STRICT BOUNDARIES — never cross these"));
  assert.ok(groqSystem.includes("SEASONAL ALLERGY GUIDANCE:"));
});

test("fallback mode: when Gemini answers, Groq is never called and nothing changes", async () => {
  process.env.PG_PROMPT_MODE = "fallback";
  await ask("I have hay fever, what helps?");
  assert.equal(groqSaw.length, 0);
  assert.equal(systemOf(geminiSaw[0]), SYSTEM_PROMPT);
});

test("an answer written from the slim fallback prompt is never cached under the full prompt's key", async () => {
  process.env.PG_PROMPT_MODE = "fallback";
  geminiMode = "payment";
  await ask("What is BPC-157?");
  await ask("What is BPC-157?");
  assert.equal(groqSaw.length, 2, "the second identical question was answered again, not served from the cache");

  clearCache();
  geminiMode = "ok";
  delete process.env.PG_PROMPT_MODE;
  await ask("What is BPC-157?");
  await ask("What is BPC-157?");
  assert.equal(geminiSaw.filter((m) => m.length).length >= 1, true);
});

test("selective mode keys the cache on the slim prompt, so a full-mode answer is never served for it", async () => {
  await ask("What is BPC-157?");                 // full mode: answered and cached under the full prompt
  const callsAfterFull = geminiSaw.length;
  process.env.PG_PROMPT_MODE = "selective";
  await ask("What is BPC-157?");
  assert.equal(geminiSaw.length, callsAfterFull + 1, "a different prompt, so a different cache key");
});

// ── the rules never go missing ─────────────────────────────────────────────
const QUESTIONS = [
  "What does magnesium glycinate do for sleep?", "Is turmeric good for joint pain?", "Can I take creatine with my kidney condition?",
  "I take sertraline and want to add 5-HTP", "What can I take to sleep better?", "Does metformin deplete B12?", "I have hay fever, what helps?",
  "I'm having surgery next month, what should I stop?", "I feel dizzy when I stand up", "Can I take ashwagandha with levothyroxine?",
  "I'm on Ozempic, how should I take my vitamins?", "Is it okay to drink coffee with iron pills?", "What is BPC-157?", "Which form of magnesium is best?",
  "Review my stack: magnesium, zinc, D3, fish oil, ashwagandha, creatine", "My doctor said my ferritin is low", "heartburn after taking fish oil",
  "is nac safe", "hi", "How accurate are you?", "", "🙂🙂🙂", "x".repeat(2000),
];

test("every safety and behaviour rule is in the slim prompt for every question, even one that matches nothing", () => {
  for (const message of QUESTIONS) {
    const entities = extractEntities(message, normalizeText(message));
    const slim = buildSystemPrompt({ message, entities, mode: "selective" });
    for (const rule of MUST_ALWAYS_APPLY) assert.ok(slim.includes(rule), `missing "${rule}" for: ${JSON.stringify(message.slice(0, 40))}`);
  }
});

test("selection keeps the original order and never drops a core section", () => {
  const core = SECTIONS.filter((s) => s.kind === "core").map((s) => s.id);
  for (const message of QUESTIONS) {
    const ids = selectedFor(message).map((s) => s.id);
    assert.deepEqual(ids.filter((id) => core.includes(id)), core, `core sections changed for: ${message.slice(0, 40)}`);
    const positions = ids.map((id) => SECTIONS.findIndex((s) => s.id === id));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "sections must stay in prompt order");
  }
});

test("a message that matches nothing gets exactly the core", () => {
  assert.deepEqual(topicIds("hi"), []);
  assert.deepEqual(topicIds("How accurate are you?"), []);
});

// ── recall: a topic is selected when its own subject comes up ───────────────
const PROBES = {
  "seasonal-allergy": ["hay fever is awful this spring", "does quercetin help with pollen"],
  "supplement-form-guide": ["which form of magnesium is best", "magnesium citrate vs glycinate"],
  "food-drug-interactions": ["can I drink alcohol with metformin", "does grapefruit matter"],
  "timing-optimizer": ["what time of day should I take zinc", "should I space calcium and iron apart"],
  "gi-digestive-otc": ["heartburn at night", "I get bloated after protein"],
  "vaginal-health": ["recurrent yeast infections", "does cranberry help with a UTI"],
  "iron-absorption": ["does coffee block iron", "my ferritin is low"],
  "nutrient-depletion": ["what does omeprazole deplete", "do statins lower coq10"],
  "vertigo-dizziness": ["I get vertigo when I turn over in bed", "room spinning dizziness"],
  "hormone-support": ["how to raise testosterone naturally", "supplements for menopause"],
  "peptides": ["what is bpc-157", "is ipamorelin legal"],
  "longevity-protocols": ["is the bryan johnson stack worth it", "does nmn work for longevity"],
  "stack-review": ["here is my stack, am I good?", "review my supplements"],
  "creatine": ["how much creatine should I take", "creatine and hair loss"],
  "pre-surgery": ["what should I stop before surgery", "I have an operation in two weeks"],
  "glp1-agonists": ["vitamins on ozempic", "tirzepatide and supplements"],
  "stimulant-interactions": ["adderall and caffeine", "is pre-workout okay with vyvanse"],
  "stacking-cofactors": ["I take a multivitamin and extra vitamin d", "overlap between prenatal and iron"],
  "clinical-knowledge": ["does biotin affect lab tests", "is kava bad for the liver", "kidney disease and magnesium"],
  "condition-specific": ["what helps with prostate health", "natural remedy for bloating"],
  "wellness-goals": ["what can I take to sleep better", "something for focus and energy", "red yeast rice and my statin"],
};

test("each topic is selected for questions about its own subject (hand-written probes, every topic covered)", () => {
  const topics = SECTIONS.filter((s) => s.kind === "topic").map((s) => s.id);
  assert.deepEqual(Object.keys(PROBES).sort(), [...topics].sort(), "a topic section has no probe: add one");
  for (const [id, questions] of Object.entries(PROBES)) {
    for (const q of questions) assert.ok(topicIds(q).includes(id), `${id} was not selected for: ${q}`);
  }
});

test("each name in a section's own bold headings selects that section (recall from the prompt's own vocabulary)", () => {
  const SKIP = /^(key message|what it does|dosing|forms|timing|water|women|teenagers|vegetarians\/vegans|key context|tier \d.*|if on levothyroxine.*)$/i;
  for (const id of ["clinical-knowledge", "supplement-form-guide", "nutrient-depletion", "seasonal-allergy", "food-drug-interactions", "peptides", "vaginal-health"]) {
    const section = SECTIONS.find((s) => s.id === id);
    // "Vitamin C" and "NAC" are headings inside the allergy section, but a question about them alone is not an allergy question.
    const generic = id === "seasonal-allergy" ? /^(vitamin c|nac)$/i : /(?!)/;
    const titles = [...section.text.matchAll(/\*\*([^*\n]{2,60})\*\*/g)].map((m) => m[1].replace(/[:()]+$/, "").trim()).filter((t) => t && !SKIP.test(t) && !generic.test(t));
    assert.ok(titles.length >= 4, `${id}: expected several headings, found ${titles.length}`);
    for (const t of titles) assert.ok(topicIds(t).includes(id), `${id} was not selected for its own heading: "${t}"`);
  }
});

test("a question in an earlier turn keeps its topic for a short follow-up", () => {
  const history = [{ role: "user", content: "I'm having surgery next month" }, { role: "assistant", content: "..." }];
  assert.ok(!topicIds("what about the dose?").includes("pre-surgery"));
  assert.ok(topicIds("what about the dose?", history).includes("pre-surgery"));
});

// ── what it buys ───────────────────────────────────────────────────────────
test("on realistic questions the slim prompt is about a third of the full one", () => {
  const real = QUESTIONS.filter((q) => q && q.length < 200);
  const sizes = real.map((message) => buildSystemPrompt({ message, entities: extractEntities(message, normalizeText(message)), mode: "selective" }).length);
  const average = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  assert.ok(average < SYSTEM_PROMPT.length * 0.4, `average slim prompt is ${Math.round(average / SYSTEM_PROMPT.length * 100)}% of the full prompt`);
  assert.ok(Math.max(...sizes) < SYSTEM_PROMPT.length * 0.7, "even the largest slim prompt (a six-item stack review) stays well under the full prompt");
});

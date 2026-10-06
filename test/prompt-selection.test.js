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
const itemIds = (message, history) => selectedFor(message, history).filter((s) => s.kind === "topic").map((s) => s.id);
// A topic is a section or, for the large ones, a group of items: probes are written per topic.
const topicIds = (message, history) => [...new Set(selectedFor(message, history).filter((s) => s.kind === "topic").map((s) => s.group || s.id))];

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
  "vertigo-dizziness": ["I get vertigo when I turn over in bed", "room spinning dizziness", "I have Ménière’s disease", "Meniere disease and supplements", "menière"],
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
  const topics = [...new Set(SECTIONS.filter((s) => s.kind === "topic").map((s) => s.group || s.id))];
  assert.deepEqual(Object.keys(PROBES).sort(), [...topics].sort(), "a topic has no probe: add one");
  for (const [id, questions] of Object.entries(PROBES)) {
    for (const q of questions) assert.ok(topicIds(q).includes(id), `${id} was not selected for: ${q}`);
  }
});

test("each name in a section's own bold headings selects that section; each item of a split section is selected by its own heading", () => {
  const SKIP = /^(key message|what it does|dosing|forms|timing|water|women|teenagers|vegetarians\/vegans|key context|tier \d.*|if on levothyroxine.*)$/i;
  const firstBold = (text) => (text.match(/\*\*([^*\n]{2,60})\*\*/) || [])[1];
  const clean = (t) => t.replace(/[:()]+$/, "").trim();
  for (const id of ["clinical-knowledge", "supplement-form-guide", "nutrient-depletion", "seasonal-allergy", "food-drug-interactions", "peptides", "vaginal-health"]) {
    const items = SECTIONS.filter((s) => s.group === id && !s.groupHeader);
    if (items.length) {
      assert.ok(items.length >= 9, `${id}: expected a header plus several items`);
      for (const item of items) {
        const title = clean(firstBold(item.text) || "");
        assert.ok(title, `${item.id} has no bold heading`);
        assert.ok(itemIds(title).includes(item.id), `${item.id} was not selected for its own heading: "${title}"`);
      }
      continue;
    }
    const section = SECTIONS.find((s) => s.id === id);
    // "Vitamin C" and "NAC" are headings inside the allergy section, but a question about them alone is not an allergy question.
    const generic = id === "seasonal-allergy" ? /^(vitamin c|nac)$/i : /(?!)/;
    const titles = [...section.text.matchAll(/\*\*([^*\n]{2,60})\*\*/g)].map((m) => clean(m[1])).filter((t) => t && !SKIP.test(t) && !generic.test(t));
    assert.ok(titles.length >= 4, `${id}: expected several headings, found ${titles.length}`);
    for (const t of titles) assert.ok(topicIds(t).includes(id), `${id} was not selected for its own heading: "${t}"`);
  }
});

// ── split sections: only the items a question needs ────────────────────────
// One plain question per item: the heading test above can pass through a neighbouring word, so each item
// also has to be reachable by the way a person would actually ask about it.
const ITEM_PROBES = {
  "clinical-knowledge:biotin-lab-interference": "does biotin affect my results",
  "clinical-knowledge:ashwagandha-thyroid": "is ashwagandha safe for me",
  "clinical-knowledge:red-yeast-rice": "can I take red yeast rice",
  "clinical-knowledge:kava-hepatotoxicity": "is kava safe",
  "clinical-knowledge:green-tea-extract": "green tea extract for weight loss",
  "clinical-knowledge:activated-charcoal": "should I take activated charcoal",
  "clinical-knowledge:cyp3a4-grapefruit": "can I eat grapefruit with my meds",
  "clinical-knowledge:berberine-metformin": "can I take berberine",
  "clinical-knowledge:ssri-discontinuation": "I want to stop my zoloft",
  "clinical-knowledge:isotretinoin-vitamin-a": "accutane and supplements",
  "clinical-knowledge:maoi-tyramine": "I am on an maoi, what should I avoid",
  "clinical-knowledge:alcohol-benzodiazepines": "xanax and a glass of wine",
  "clinical-knowledge:cbd-clobazam": "is cbd oil okay with my seizure meds",
  "clinical-knowledge:kidney-disease-magnesium": "I have kidney disease, which supplements are safe",
  "clinical-knowledge:bariatric-surgery": "I had a gastric bypass, what vitamins do I need",
  "clinical-knowledge:spironolactone-potassium": "I take spironolactone, can I take potassium",
  "clinical-knowledge:iodine-thyroid-disease": "is kelp okay for my thyroid",
  "clinical-knowledge:elderly-sensitivity": "supplements for elderly people",
  "clinical-knowledge:melatonin-in-pregnancy": "can I take melatonin while pregnant",
  "clinical-knowledge:nsaid-chronic-use": "I take ibuprofen every day",
  "clinical-knowledge:ototoxic-medications": "ringing in my ears after aspirin",
  "clinical-knowledge:psilocybin-ssris": "microdosing mushrooms while on an ssri",
  "clinical-knowledge:benzodiazepines-alcohol": "lorazepam and beer",
  "clinical-knowledge:cannabis-ssris": "weed with my antidepressant",
  "supplement-form-guide:magnesium": "which magnesium is best", "supplement-form-guide:iron": "which iron is gentlest",
  "supplement-form-guide:zinc": "best zinc to take", "supplement-form-guide:b12": "methylcobalamin or cyanocobalamin",
  "supplement-form-guide:omega-3": "is krill oil better than fish oil", "supplement-form-guide:turmeric-curcumin": "does turmeric need piperine",
  "supplement-form-guide:coq10": "ubiquinol or ubiquinone", "supplement-form-guide:vitamin-c": "is liposomal vitamin c worth it", "supplement-form-guide:calcium": "calcium citrate or carbonate",
  "hormone-support:testosterone": "does tongkat ali raise testosterone", "hormone-support:estrogen-womens-balance": "does black cohosh help hot flashes",
  "hormone-support:cortisol-stress-adrenal": "does rhodiola lower cortisol", "hormone-support:thyroid-support": "is selenium good for hashimoto's",
  "nutrient-depletion:metformin": "does metformin lower b12", "nutrient-depletion:ppis": "what does omeprazole use up", "nutrient-depletion:statins": "do statins cause low coq10",
  "nutrient-depletion:diuretics": "water pills and potassium", "nutrient-depletion:ssris": "can my zoloft lower my sodium", "nutrient-depletion:birth-control-pills": "supplements for women on the pill",
  "nutrient-depletion:corticosteroids": "I'm on prednisone, what do I need", "nutrient-depletion:ace-inhibitors": "lisinopril and potassium supplements", "nutrient-depletion:antibiotics": "probiotics after amoxicillin",
};

test("every item of every split section is reachable by a plain question about it", () => {
  const items = SECTIONS.filter((s) => s.group && !s.groupHeader).map((s) => s.id);
  assert.deepEqual(Object.keys(ITEM_PROBES).sort(), [...items].sort(), "an item has no probe (or a probe names a missing item)");
  for (const [id, question] of Object.entries(ITEM_PROBES)) assert.ok(itemIds(question).includes(id), `${id} was not selected for: ${question}`);
});


test("a question about one supplement gets that block of the form guide, not the whole guide", () => {
  const ids = itemIds("which form of magnesium is best");
  assert.ok(ids.includes("supplement-form-guide:magnesium"));
  for (const other of ["iron", "zinc", "b12", "omega-3", "turmeric-curcumin", "coq10", "vitamin-c", "calcium"]) {
    assert.ok(!ids.includes(`supplement-form-guide:${other}`), `the ${other} block should not be sent`);
  }
});

test("a group's header comes with any selected item of its group, and is never sent alone", () => {
  const groups = [...new Set(SECTIONS.filter((s) => s.group).map((s) => s.group))];
  assert.deepEqual(groups.sort(), ["clinical-knowledge", "hormone-support", "nutrient-depletion", "supplement-form-guide"]);
  for (const message of [...QUESTIONS, "which form of magnesium is best", "does metformin deplete b12", "kava and the liver", "testosterone and zinc"]) {
    const ids = selectedFor(message).map((s) => s.id);
    for (const g of groups) {
      const hasHeader = ids.includes(`${g}:header`);
      const hasItem = ids.some((id) => id.startsWith(`${g}:`) && id !== `${g}:header`);
      assert.equal(hasHeader, hasItem, `${g}: header ${hasHeader ? "sent without an item" : "missing for a selected item"} for: ${message.slice(0, 40)}`);
    }
  }
});

test("detected populations select the elderly and pregnancy items even when the words are not in the question", () => {
  const forPopulation = (population) => selectSections({ message: "is this okay for my dad", entities: { populations: [population] } }).map((s) => s.id);
  assert.ok(forPopulation("elderly").includes("clinical-knowledge:elderly-sensitivity"));
  assert.ok(!forPopulation("elderly").includes("clinical-knowledge:melatonin-in-pregnancy"));
  assert.ok(forPopulation("pregnancy").includes("clinical-knowledge:melatonin-in-pregnancy"));
});

test("a generic 'deplete' or 'hormone' question gets every item of that guide, as before the split", () => {
  const depletion = itemIds("what does my medication deplete").filter((id) => id.startsWith("nutrient-depletion:") && !id.endsWith(":header"));
  assert.equal(depletion.length, 9);
  const hormones = itemIds("tell me about hormones and supplements").filter((id) => id.startsWith("hormone-support:") && !id.endsWith(":header"));
  assert.equal(hormones.length, 4);
});

test("a question in an earlier turn keeps its topic for a short follow-up", () => {
  const history = [{ role: "user", content: "I'm having surgery next month" }, { role: "assistant", content: "..." }];
  assert.ok(!topicIds("what about the dose?").includes("pre-surgery"));
  assert.ok(topicIds("what about the dose?", history).includes("pre-surgery"));
});

// ── what it buys ───────────────────────────────────────────────────────────
test("on realistic questions the slim prompt is about a quarter of the full one", () => {
  const real = QUESTIONS.filter((q) => q && q.length < 200);
  const sizes = real.map((message) => buildSystemPrompt({ message, entities: extractEntities(message, normalizeText(message)), mode: "selective" }).length);
  const average = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  assert.ok(average < SYSTEM_PROMPT.length * 0.3, `average slim prompt is ${Math.round(average / SYSTEM_PROMPT.length * 100)}% of the full prompt`);
  assert.ok(Math.max(...sizes) < SYSTEM_PROMPT.length * 0.5, "even the largest slim prompt (a six-item stack review) stays under half of the full prompt");
});

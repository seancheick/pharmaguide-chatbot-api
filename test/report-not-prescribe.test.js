/**
 * PharmaGuide reports, it does not prescribe (2026-11-10 regulatory review).
 *
 * The chat may state what studies used or what a named authority sets (an attributed report). It may not
 * tell this user to take, start or swap something for their condition (a treatment instruction). The
 * three validator sentences below passed the old validator; the two questions were answered with
 * directives by the live chat (audit evidence, 2026-11-10).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "PG_PROXY_SECRET", "PG_REQUIRE_PROXY_SECRET"]) delete process.env[k];
const providerRouter = require("../src/infra/providerRouter");
let llm = providerRouter.callWithFallback;
providerRouter.callWithFallback = (...args) => llm(...args);
const chatHandler = require("../api/chat");
const responseCache = require("../src/infra/responseCache");

const { validateResponse, SAFE_FALLBACK_REPLY } = require("../src/postprocess/safetyValidator");
const { SECTIONS, composePrompt } = require("../src/config/systemPromptSections");
const { resolveBasis, BASIS_LABELS } = require("../src/core/confidence");

const rules = (reply, route = "llm") => validateResponse(reply, route, { meds: [], supplements: [] }, null).violations.filter((v) => !v.nonBlocking).map((v) => v.rule);

test("a dose instruction for the user's condition is rejected", () => {
  for (const reply of [
    "For your seasonal allergies, take quercetin 500 mg daily.",
    "To treat your anxiety, take magnesium glycinate 300 mg every night.",
    "Start taking berberine 500 mg twice daily to manage your diabetes.",
    "You should take 2,000 IU of vitamin D every morning.",
    "• Take ashwagandha 600 mg at bedtime for stress.",
    "I suggest starting quercetin 1000 mg a few weeks before allergy season.",
  ]) {
    assert.ok(rules(reply).includes("no_directive_dosing"), `not flagged: ${reply}`);
  }
});

test("swapping a prescription for a supplement is rejected", () => {
  for (const reply of [
    "You could replace your metformin with berberine.",
    "Try berberine instead of your metformin.",
    "Many people switch from your statin to red yeast rice.",
  ]) {
    assert.ok(rules(reply).includes("no_medication_substitution"), `not flagged: ${reply}`);
  }
});

test("attributed reports, safety ceilings and timing are allowed", () => {
  for (const reply of [
    "Trials of quercetin for hay fever used 500–1000 mg/day; the evidence is moderate.",
    "NIH sets the adult upper limit for supplemental magnesium at 350 mg/day.",
    "Don't take more than 45 mg of iron a day unless your clinician advises it.",
    "Take levothyroxine 30–60 minutes before breakfast, apart from calcium and iron.",
    "Berberine is not a replacement for metformin, and combining them can lower blood sugar too far.",
    "Do not use berberine instead of your metformin without your prescriber.",
    "Ask your prescriber: \"Could berberine be an adjunct to my metformin?\"",
    "Studies gave participants 300 mg of magnesium at night.",
  ]) {
    assert.deepEqual(rules(reply), [], `wrongly flagged: ${reply}`);
  }
});

// Review of 87e994f: the first version of the rule rejected these warnings, and two rejected drafts
// replaced the warning with the generic fallback. Under-warning is the worse failure.
test("a warning about an amount is never mistaken for an instruction", () => {
  for (const reply of [
    "Taking 10 g of niacin can damage the liver.",
    "Taking 3,000 mcg or more of retinol in pregnancy is linked to birth defects.",
    "Taking high doses, such as 10,000 IU daily for months, can cause toxicity.",
    "Using 2 g of vitamin C daily may cause kidney stones.",
    "Adding 500 mg of berberine to metformin can drop blood sugar too low.",
    "Avoid St. John's wort. Taking 900 mg/day with sertraline can cause serotonin syndrome.",
    "NIH sets the upper limit at 350 mg/day; taking 400 mg or more increases diarrhea risk.",
    "Taking 3 g or more of sustained-release niacin daily can cause liver failure.",
    "Taking 50,000 IU weekly is a loading protocol prescribed by a clinician for confirmed deficiency.",
    "Try to keep caffeine under 400 mg a day.",
    "Keep iron below 45 mg a day unless your clinician advises more.",
    "Take your levothyroxine 4 hours apart from 500 mg calcium.",
    "Take calcium 500 mg at least 4 hours after levothyroxine.",
    "Take 500 mg calcium 4 hours apart from your medications.",
    "You need to talk to your doctor before taking 500 mg of berberine.",
    "Consider taking it with food; studies used 300 mg at night.",
    "If you take warfarin, use caution with fish oil doses of 3 g a day.",
    "Start with your prescriber: ask whether 1000 IU fits your levels.",
  ]) {
    assert.deepEqual(rules(reply), [], `wrongly flagged: ${reply}`);
  }
});

test("a dose instruction without an imperative verb, or hidden behind a ceiling word, is rejected", () => {
  for (const reply of [
    "I'd go with magnesium glycinate 300 mg at bedtime.",
    "A good starting dose for you is 500 mg of quercetin twice daily.",
    "Aim for 2,000 IU of vitamin D daily.",
    "You'll want 400 mg of magnesium at night.",
    "Supplement with 2000 IU vitamin D3 daily.",
    "You need 1000 mcg of B12 daily.",
    "You should be taking 500 mg quercetin daily.",
    "My recommendation: quercetin 500 mg twice daily.",
    "Use 5 ml of the liquid twice daily.",
    "For your allergies, quercetin 500 mg daily is a good choice.",
    "Take quercetin over several weeks, 500 mg twice daily.",
    "Start taking it more than 2 weeks before the season, 500 mg daily.",
    // Review of d033ffb: timing words after the dose exempted these.
    "Take 300 mg magnesium 1 hour before bed.",
    "Take 500 mg quercetin daily, separate from iron.",
    "Take 400 mg magnesium 2 hours after dinner.",
    "Take berberine 500 mg daily before discussing metformin with your prescriber.",
  ]) {
    assert.ok(rules(reply).includes("no_directive_dosing"), `not flagged: ${reply}`);
  }
});

test("a swap of a medicine for a supplement is rejected however it is worded; a refuted claim passes", () => {
  for (const reply of [
    "Replace metformin with berberine.",
    "Try berberine instead of metformin.",
    "Berberine is a natural alternative to metformin.",
    "Consider berberine as an alternative to your metformin.",
    "Use red yeast rice instead of a statin.",
    "Many people swap their statin for red yeast rice.",
    "You could switch to berberine rather than metformin.",
    "Instead of taking your metformin, try berberine.",
    "You may not need your statin if you take red yeast rice.",
    "You can come off your statin and use red yeast rice.",
    "Replace your blood pressure pills with garlic.",
  ]) {
    assert.ok(rules(reply).includes("no_medication_substitution"), `not flagged: ${reply}`);
  }
  for (const reply of [
    "Some websites claim you can replace your metformin with berberine; that is not supported.",
    "Berberine is not an alternative to metformin.",
    "Take magnesium in the evening instead of the morning.",
    "Electrolyte drinks replace lost sodium with a balanced mix.",
    "Rather than your morning coffee, try green tea.",
  ]) {
    assert.deepEqual(rules(reply).filter((r) => r === "no_medication_substitution"), [], `wrongly flagged: ${reply}`);
  }
});

test("the new rules apply to model answers only, never to curated gate replies", () => {
  assert.deepEqual(rules("Take quercetin 500 mg daily.", "system:some-gate").filter((r) => r === "no_directive_dosing"), []);
});

test("the prompt reports and attributes; it holds no treatment directives or substitution", () => {
  const prompt = composePrompt(SECTIONS);
  assert.doesNotMatch(prompt, /clinical pharmacist educator/i);
  assert.doesNotMatch(prompt, /\bRecommend:/);
  assert.doesNotMatch(prompt, /metformin alternative/i);
  assert.doesNotMatch(prompt, /recommend evidence-graded options/i);
  assert.doesNotMatch(prompt, /Be specific: forms, doses/);
  const core = SECTIONS.filter((s) => s.kind === "core").map((s) => s.text).join("");
  assert.match(core, /REPORT, DON'T PRESCRIBE/);
  assert.match(core, /never tell this user to take, start, stop or swap/i);
});

test("the answer label names what grounded it, never the model or the cache", () => {
  assert.equal(resolveBasis({ pipelineRecords: 1, kbHits: 0 }), "pharmaguide_record");
  assert.equal(resolveBasis({ pipelineRecords: 0, kbHits: 3 }), "reference_data");
  assert.equal(resolveBasis({ pipelineRecords: 0, kbHits: 0 }), "general_background");
  assert.equal(resolveBasis({ gate: true }), "pharmaguide_record");
  for (const label of Object.values(BASIS_LABELS)) assert.doesNotMatch(label, /guideline|verified|clinical/i);
});

async function ask(message, drafts) {
  const calls = [];
  llm = async (messages) => {
    calls.push(messages);
    return { text: drafts[Math.min(calls.length - 1, drafts.length - 1)], provider: "stub", modelId: "stub-llm", usage: {}, degraded: false };
  };
  const out = {};
  try {
    await chatHandler({ method: "POST", headers: { "x-forwarded-for": `10.77.0.${calls.length + Math.floor(Math.random() * 200)}` }, socket: {}, body: { message, history: [] } },
      { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.json = j; return this; }, end() { return this; } });
  } finally {
    responseCache.clearCache();
  }
  return { body: out.json, calls };
}

test("a prescriptive draft is rewritten once as a report instead of falling back", async () => {
  const report = "Trials of quercetin for hay fever used 500–1000 mg/day, and the evidence is moderate. Ask your pharmacist whether it fits with what you already take.";
  const { body, calls } = await ask("What supplement helps with seasonal allergies?", ["For your seasonal allergies, take quercetin 500 mg daily.", report]);
  assert.equal(calls.length, 2, "one regeneration");
  assert.ok(calls[1].some((m) => m.role === "system" && /report/i.test(m.content)), "the retry carries the corrective instruction");
  assert.equal(body.reply.split("\n\n")[0], report.split("\n\n")[0]);
  assert.ok(["reference_data", "general_background", "pharmaguide_record"].includes(body.basis));
  assert.equal(body.confidence, undefined, "the old model-strength label is gone");
});

test("a draft that stays prescriptive after the retry gets the safe fallback", async () => {
  const bad = "Start taking berberine 500 mg twice daily to manage your diabetes.";
  const { body, calls } = await ask("what helps blood sugar?", [bad, bad]);
  assert.equal(calls.length, 2);
  assert.equal(body.reply, SAFE_FALLBACK_REPLY);
});

test("the fallback carries no basis, and the response names the provider that wrote the served reply", async () => {
  const bad = "Start taking berberine 500 mg twice daily to manage your diabetes.";
  const { body } = await ask("what is quercetin?", [bad, bad]);
  assert.equal(body.reply.startsWith(SAFE_FALLBACK_REPLY), true);
  assert.equal(body.basis, undefined, "a canned fallback is not grounded in PharmaGuide data");

  const calls = [];
  llm = async () => {
    calls.push(1);
    return calls.length === 1
      ? { text: bad, provider: "gemini", modelId: "first-model", usage: {}, degraded: false }
      : { text: "Trials of quercetin used 500–1000 mg/day; the evidence is moderate.", provider: "groq", modelId: "retry-model", usage: {}, degraded: false };
  };
  const out = {};
  try {
    await chatHandler({ method: "POST", headers: { "x-forwarded-for": "10.78.0.9" }, socket: {}, body: { message: "what is quercetin used for?", history: [] } },
      { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.json = j; return this; }, end() { return this; } });
  } finally {
    responseCache.clearCache();
  }
  assert.equal(out.json.model, "retry-model");
});

test("a clarifying question or a redirect carries no basis; a curated safety reply does", async () => {
  for (const [message, route] of [["is my medication ok with zinc", "system:clarifier"], ["i have arthritis what do i do", "system:medical-condition"]]) {
    const { body } = await ask(message, ["unused"]);
    assert.equal(body.model, route, message);
    assert.equal(body.basis, undefined, `${route} is not grounded in a record`);
  }
  const { body } = await ask("is niacin safe with my atorvastatin", ["unused"]);
  assert.equal(body.model, "system:niacin-statin");
  assert.equal(body.basis, "pharmaguide_record");

  // A gate reply the validator rejects is served as the generic fallback, which explains no record.
  const { ROUTE_REPLY_MAP } = require("../src/gates/replies");
  const original = ROUTE_REPLY_MAP["system:niacin-statin"];
  ROUTE_REPLY_MAP["system:niacin-statin"] = () => "You have diabetes.";
  try {
    const { body: rejected } = await ask("is niacin safe with my atorvastatin", ["unused"]);
    assert.equal(rejected.reply, SAFE_FALLBACK_REPLY);
    assert.equal(rejected.basis, undefined, "a fallback is not grounded in a record");
  } finally {
    ROUTE_REPLY_MAP["system:niacin-statin"] = original;
  }
});

test("the rewrite shares the first draft's time budget and is skipped when too little is left", async () => {
  const { CHAIN_DEADLINE_MS, MIN_ATTEMPT_MS } = providerRouter;
  const bad = "Start taking berberine 500 mg twice daily to manage your diabetes.";
  const good = "Trials of berberine used 500 mg two or three times a day; the evidence is moderate.";
  const realNow = Date.now;
  for (const [elapsed, expectRetry] of [[5000, true], [CHAIN_DEADLINE_MS - MIN_ATTEMPT_MS + 500, false]]) {
    let offset = 0;
    Date.now = () => realNow() + offset;
    const opts = [];
    llm = async (messages, o) => {
      opts.push(o);
      if (opts.length === 1) offset += elapsed;
      return { text: opts.length === 1 ? bad : good, provider: "stub", modelId: "stub-llm", usage: {}, degraded: false };
    };
    const out = {};
    try {
      await chatHandler({ method: "POST", headers: { "x-forwarded-for": `10.79.0.${elapsed % 200}` }, socket: {}, body: { message: "what helps blood sugar?", history: [] } },
        { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.json = j; return this; }, end() { return this; } });
    } finally {
      Date.now = realNow;
      responseCache.clearCache();
    }
    if (expectRetry) {
      assert.equal(opts.length, 2, "rewrite runs");
      assert.ok(opts[1].deadlineMs <= CHAIN_DEADLINE_MS - elapsed, `rewrite budget ${opts[1].deadlineMs} exceeds what is left`);
    } else {
      assert.equal(opts.length, 1, "no rewrite with too little time left");
      assert.equal(out.json.reply, SAFE_FALLBACK_REPLY);
    }
  }
});

test("the release gate blocks a pipeline bundle more than 90 days old", () => {
  const { checkPipelineBundleAge } = require("../src/infra/releaseGuard");
  const built = new Date(require("../src/data/pipeline/MANIFEST.json").built_at);
  const at = (days) => new Date(built.getTime() + days * 86400000).toISOString();
  assert.equal(checkPipelineBundleAge(at(30)).valid, true);
  assert.equal(checkPipelineBundleAge(at(91)).valid, false);
  assert.match(checkPipelineBundleAge(at(91)).issues[0], /sync_pipeline/);
});

test("the depletion reply raises questions for the prescriber; it never gives a self-dosing amount", () => {
  const { depletionReply } = require("../src/gates/replies");
  for (const med of ["atorvastatin", "metformin", "prednisone", "hydrochlorothiazide", "birth control", "gabapentin", "omeprazole"]) {
    const reply = depletionReply(`does ${med} deplete anything`);
    assert.ok(reply, med);
    assert.doesNotMatch(reply, /replenish/i, med);
    assert.match(reply, /Ask your prescriber about/, med);
    for (const sentence of reply.split(/(?<=[.;])\s+|\n/)) {
      if (/\b\d[\d,.-]*\s*(?:mg|mcg|iu)\b/i.test(sentence)) assert.match(sentence, /\b(?:trials?|studies|studied)\b/i, `${med}: a dose not attributed to studies: ${sentence}`);
    }
  }
  assert.match(depletionReply("does furosemide deplete anything"), /Potassium — only supplement under provider supervision/, "the potassium caution stays");
});

test("every depletion entry states its own guidance, never a cross-reference to another medicine", () => {
  const { DEPLETION_MAP, depletionReply } = require("../src/gates/replies");
  for (const [med, data] of Object.entries(DEPLETION_MAP)) {
    assert.doesNotMatch(data.discuss, /\bsame (?:as|probiotic|caution)\b/i, `${med}: ${data.discuss}`);
  }
  for (const med of ["simvastatin", "rosuvastatin", "pravastatin", "lovastatin", "pantoprazole", "esomeprazole", "lansoprazole", "fluoxetine", "escitalopram", "azithromycin", "losartan"]) {
    const reply = depletionReply(`does ${med} deplete anything`);
    assert.ok(reply, med);
    assert.doesNotMatch(reply, /\bsame (?:as|probiotic|caution)\b/i, med);
  }
});

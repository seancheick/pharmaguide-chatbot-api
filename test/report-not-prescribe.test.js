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

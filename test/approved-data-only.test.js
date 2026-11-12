/**
 * Chat states only what the pipeline's approved data carries.
 *
 * An outside review of the 2026-11-11 interaction-audit batches found two places where chat could
 * contradict the pipeline: a hand-written depletion table (DEPLETION_MAP) holding claims the pipeline
 * had rejected, and a ciprofloxacin interval ("Separate minerals by 2h", "separate by 2–4 hours")
 * written here rather than read from a record. A depletion, an interaction action or a timing
 * interval now comes from the synced bundle only:
 *   medication_depletions.json   scripts/sync_pipeline.js keeps verified + approved entries only
 *   interactions_verified.json   mineral-spacing notes quote a record's management text verbatim
 * No live calls: the LLM chain is stubbed and records whether it was consulted.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "PG_PROXY_SECRET", "PG_REQUIRE_PROXY_SECRET"]) delete process.env[k];

const providerRouter = require("../src/infra/providerRouter");
let sent = null;
let stubText = "Stubbed answer.";
providerRouter.callWithFallback = async (messages) => {
  sent = messages;
  return { text: stubText, provider: "gemini", modelId: "stub", usage: {}, degraded: false };
};
const handler = require("../api/chat");
const D = require("../src/core/depletions");
const P = require("../src/core/pipelineInteractions");
const replies = require("../src/gates/replies");
const { recordTimingNote, applyTimingPolicy, NO_TIMING_RECORD } = require("../src/postprocess");
const { SECTIONS } = require("../src/config/systemPromptSections");
const { SYSTEM_PROMPT } = require("../src/config/systemPrompt");
const MANIFEST = require("../src/data/pipeline/MANIFEST.json");
const BUNDLE = require("../src/data/pipeline/medication_depletions.json");
const CLASSES = require("../src/data/pipeline/drug_classes.json").classes;
const RECORDS = require("../src/data/pipeline/interactions_verified.json").interactions;

let socket = 0;
async function ask(message, history = []) {
  sent = null;
  const out = {};
  await handler({ method: "POST", headers: { "x-forwarded-for": `10.17.0.${++socket}` }, socket: {}, body: { message, history } },
    { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.json = j; return this; }, end() { return this; } });
  return { model: out.json.model, reply: out.json.reply, askedModel: sent !== null };
}

// Every stated interval ("2 hours", "2–4 hours", "6 h", "2+ hours"), as "2", "2-4", "6".
const HOURS = /\b(\d+(?:\.\d+)?)(?:\s*(?:[-–]|to)\s*(\d+(?:\.\d+)?))?\+?\s*(?:hours?|hrs?|h)\b/gi;
const intervals = (text) => new Set([...String(text).matchAll(HOURS)].map((m) => (m[2] ? `${m[1]}-${m[2]}` : m[1])));
const subset = (a, b) => [...a].every((x) => b.has(x));

// A word that names a depletion subject: a member for a class, the generic name for a drug.
const RXCUI_NAME = new Map(Object.values(CLASSES).flatMap((c) => (c.member_rxcuis || []).map((rx, i) => [rx, c.member_names[i]])));
const wordFor = (drugId) => (CLASSES[drugId] ? CLASSES[drugId].member_names[0] : RXCUI_NAME.get(drugId));
const claimLines = (reply) => reply.split("\n").filter((l) => l.startsWith("• "));

// ── the bundle: verified and approved entries only ─────────────────────────
test("the depletion bundle is synced from the pipeline and holds only verified, approved entries", () => {
  const meta = MANIFEST.files["medication_depletions.json"];
  assert.ok(meta, "medication_depletions.json is copied by scripts/sync_pipeline.js and pinned in MANIFEST.json");
  assert.equal(meta.source, "scripts/data/medication_depletions.json");
  assert.ok(BUNDLE.depletions.length > 0);
  for (const e of BUNDLE.depletions) assert.ok(D.isApproved(e), `${e.id} is not verified and approved`);
  assert.equal(meta.kept, BUNDLE.depletions.length);
  assert.ok(meta.withheld.length > 0, "the entries left out are listed, so the backlog stays visible");
  const kept = new Set(BUNDLE.depletions.map((e) => e.id));
  for (const w of meta.withheld) assert.ok(!kept.has(w.id), `${w.id} was withheld but is bundled`);
});

test("the loader fails closed: a bundle copied whole, or from before approval existed, still yields approved entries only", () => {
  const entry = (id, status, approval) => ({
    id, drug_ref: { type: "drug", id: "6809", display_name: "Metformin" },
    depleted_nutrient: { standard_name: id, canonical_id: id.toLowerCase() },
    alert_body: `${id} body.`, recommendation: `${id} recommendation.`,
    citation_review_status: status, ...(approval === undefined ? {} : { b1_clinical_approval_status: approval }),
  });
  const doc = { depletions: [
    entry("KEPT", "verified", "approved_for_controlled_beta"),
    entry("PENDING", "verified", "pending_delta_review"),
    entry("NOT_VISIBLE", "verified", "approved_not_consumer_visible"),
    entry("NEEDS_REVISION", "needs_revision", "approved_for_controlled_beta"),
    entry("REJECTED", "rejected", "approved_for_controlled_beta"),
    entry("UNVERIFIED", "unverified", "approved_for_controlled_beta"),
    entry("NO_APPROVAL_FIELD", "verified", undefined),
    entry("FUTURE_STATUS", "verified", "approved_for_everyone"),
  ] };
  const ids = D.buildNotes(doc).flatMap((s) => s.entries.map((e) => e.id));
  assert.deepEqual(ids, ["KEPT"]);
});

test("DEPLETION_MAP is gone: chat code holds no depletion table of its own", () => {
  assert.equal(replies.DEPLETION_MAP, undefined);
  const root = path.join(__dirname, "..");
  for (const dir of ["api", "src"]) {
    for (const f of fs.readdirSync(path.join(root, dir), { recursive: true })) {
      if (!f.endsWith(".js")) continue;
      assert.doesNotMatch(fs.readFileSync(path.join(root, dir, f), "utf8"), /DEPLETION_MAP|DEPLETION_ALIASES/, `${dir}/${f}`);
    }
  }
});

// ── depletion replies: the approved notes, verbatim, never the model ───────
test("a depletion question is answered from the approved notes, quoted verbatim, and never by the model", async () => {
  for (const subject of D.notes()) {
    const word = subject.type === "drug_class" ? CLASSES[subject.id].member_names[0] : subject.name;
    const { model, reply, askedModel } = await ask(`does ${word} deplete any nutrients?`);
    assert.equal(model, "system:depletion", word);
    assert.equal(askedModel, false, `${word}: the model was asked`);
    for (const e of subject.entries) {
      assert.ok(reply.includes(e.alert_body), `${word}: ${e.id} body not quoted`);
      assert.ok(reply.includes(e.recommendation), `${word}: ${e.id} recommendation not quoted`);
    }
    // Every claim line is one approved entry of a subject the word names.
    const named = D.subjectsIn(word).flatMap((s) => s.entries);
    for (const line of claimLines(reply)) {
      assert.ok(named.some((e) => line.includes(e.depleted_nutrient.standard_name) && line.includes(e.alert_body)), `${word}: unapproved claim: ${line}`);
    }
  }
});

test("a pipeline-rejected or unapproved depletion never returns: the old table's claims and every withheld entry", async () => {
  // Claims DEPLETION_MAP made that the pipeline rejected, left unreviewed or has not approved.
  const OLD_CLAIMS = [
    ["metformin", "folate"], ["omeprazole", "b12"], ["omeprazole", "magnesium"], ["pantoprazole", "iron"],
    ["furosemide", "potassium"], ["furosemide", "magnesium"], ["hydrochlorothiazide", "potassium"],
    ["prednisone", "potassium"], ["prednisone", "vitamin c"], ["birth control", "b6"], ["birth control", "folate"],
    ["birth control", "magnesium"], ["sertraline", "sodium"], ["gabapentin", "calcium"], ["warfarin", "vitamin k"],
    ["ciprofloxacin", "calcium"], ["doxycycline", "iron"], ["levothyroxine", "calcium"], ["amoxicillin", "probiotics"],
  ];
  for (const [med, nutrient] of OLD_CLAIMS) {
    const { model, reply, askedModel } = await ask(`does ${med} deplete ${nutrient}?`);
    assert.equal(model, "system:depletion", `${med}/${nutrient}`);
    assert.equal(askedModel, false, `${med}/${nutrient}: the model was asked`);
    for (const line of claimLines(reply)) assert.doesNotMatch(line, new RegExp(nutrient, "i"), `${med}/${nutrient}: ${line}`);
    assert.equal(intervals(reply).size, 0, `${med}/${nutrient}: an interval in a depletion reply: ${reply}`);
  }
  // Every entry the sync left out, asked about with its own medicine and nutrient.
  for (const w of MANIFEST.files["medication_depletions.json"].withheld) {
    const word = wordFor(w.drug);
    if (!word) continue; // a synthetic subject no medicine name reaches
    const { reply } = await ask(`does ${word} deplete ${w.nutrient}?`);
    const approvedSame = D.subjectsIn(word).some((s) => s.entries.some((e) => e.depleted_nutrient.standard_name === w.nutrient));
    if (approvedSame) continue;
    for (const line of claimLines(reply)) assert.ok(!line.includes(w.nutrient), `${w.id} returned: ${line}`);
  }
});

test("a medicine without an approved note gets a coverage statement, never 'safe' and never a guess", async () => {
  const { model, reply, askedModel } = await ask("what does birth control deplete?");
  assert.equal(model, "system:depletion");
  assert.equal(askedModel, false);
  assert.equal(claimLines(reply).length, 0);
  assert.match(reply, /no approved medication.nutrient note for birth control/i);
  assert.match(reply, /not a finding/i);
  assert.doesNotMatch(reply, /\bsafe\b/i);
});

test("a depletion question naming no recognised medicine is still answered here, not by the model", async () => {
  const { model, reply, askedModel } = await ask("what nutrients does my medication deplete?");
  assert.equal(model, "system:depletion");
  assert.equal(askedModel, false);
  assert.equal(claimLines(reply).length, 0);
  assert.match(reply, /which medicine/i);
});

test("the model is never handed a medication-depletion table", () => {
  assert.ok(!SECTIONS.some((s) => s.group === "nutrient-depletion" || /^nutrient-depletion/.test(s.id)), "the nutrient-depletion prompt group is gone");
  for (const old of ["depletes B12", "deplete B12, magnesium", "may deplete B6", "deplete potassium, magnesium", "may lower sodium", "CoQ10 (100-200 mg/day)", "Probiotics 2h from antibiotics", "Separate minerals from thyroid meds by 4h"]) {
    assert.ok(!SYSTEM_PROMPT.includes(old), `the prompt still says: ${old}`);
  }
});

// ── intervals: quoted from the record, never written here ──────────────────
test("medicine + mineral: the reply states only the interval and action the synced record carries", async () => {
  const PAIRS = ["Can I take zinc with cipro?", "Can I take calcium with ciprofloxacin?", "Is iron ok with doxycycline?", "When should I take magnesium with levothyroxine?", "magnesium and levofloxacin timing"];
  for (const q of PAIRS) {
    const records = P.findInteractions(q);
    assert.ok(records.length > 0, `${q}: no synced record joins the pair`);
    const allowed = new Set(records.flatMap((r) => [...intervals(r.management)]));
    stubText = "Separate them by 2 hours.\nTake the mineral 3 hours later.\nThe 2–4 hours rule applies to most antibiotics.\nThis is a well-known absorption issue.";
    const { reply, askedModel } = await ask(q);
    assert.equal(askedModel, true, `${q}: expected the answer path`);
    for (const r of records) assert.ok(reply.includes(r.management), `${q}: ${r.id} management not quoted`);
    assert.ok(subset(intervals(reply), allowed), `${q}: interval not in the record: ${[...intervals(reply)]} vs ${[...allowed]}\n${reply}`);
    assert.doesNotMatch(reply, /Take the mineral 3 hours later|2–4 hours rule/, q);
    assert.match(reply, /well-known absorption issue/, `${q}: a line with no interval is left alone`);
  }
  stubText = "Stubbed answer.";
});

test("cipro + zinc today quotes the class record; a drug-specific record, once synced, is quoted word for word", () => {
  const zinc = RECORDS.filter((r) => /zinc/i.test(r.agent2_name) && P.findInteractions("zinc with ciprofloxacin").some((x) => x.id === r.id));
  assert.ok(zinc.length > 0, "a synced record joins cipro and zinc");
  for (const r of zinc) assert.ok(recordTimingNote(zinc).includes(r.management));
  // The shape of the label-specific record in pipeline PR #452 (DSI_ZINC_CIPROFLOXACIN): no code change needed.
  const specific = {
    id: "DSI_ZINC_CIPROFLOXACIN", agent1_id: "2551", agent1_name: "Ciprofloxacin", agent1_type: "drug",
    agent2_id: "C0043481", agent2_name: "Zinc", agent2_type: "supplement",
    management: "Take ciprofloxacin tablets or liquid at least 2 hours before or 6 hours after zinc supplements or multivitamins that contain zinc, as the ciprofloxacin label directs.",
  };
  const note = recordTimingNote([specific]);
  assert.ok(note.includes(specific.management));
  assert.deepEqual([...intervals(note)].sort(), ["2", "6"]);
  assert.equal(recordTimingNote([]), null, "no record, no interval");
});

test("the depletion reply for ciprofloxacin states no interval and no mineral claim", async () => {
  for (const q of ["does ciprofloxacin deplete anything", "does cipro deplete calcium or magnesium?"]) {
    const { reply, askedModel } = await ask(q);
    assert.equal(askedModel, false, q);
    assert.equal(intervals(reply).size, 0, `${q}: ${reply}`);
    assert.equal(claimLines(reply).length, 0, `${q}: ${reply}`);
  }
});

test("the PPI gate quotes the approved PPI notes only: no B12, magnesium or iron claim and no interval", async () => {
  const ppi = D.subjectsIn("omeprazole");
  assert.ok(ppi.length > 0, "an approved PPI note exists");
  const { model, reply } = await ask("can I take iron with omeprazole?");
  assert.equal(model, "system:ppi-nutrient");
  for (const line of claimLines(reply)) assert.doesNotMatch(line, /\bB12\b|magnesium|\biron\b/i, line);
  assert.equal(intervals(reply).size, 0, reply);
  // A depletion question gets every approved PPI note; a "can I take" question only the asked nutrient's (review tests below).
  const { reply: all } = await ask("what does omeprazole deplete?");
  for (const e of ppi.flatMap((s) => s.entries)) assert.ok(all.includes(e.alert_body), e.id);
  for (const line of claimLines(all)) assert.doesNotMatch(line, /\bB12\b|magnesium|\biron\b/i, line);
  assert.equal(intervals(all).size, 0, all);
});

test("the statin gate quotes the approved CoQ10 note, without the amount the pipeline removed", () => {
  const reply = replies.statinMyopathyReply();
  const coq10 = D.subjectsIn("atorvastatin").flatMap((s) => s.entries).find((e) => e.depleted_nutrient.canonical_id === "coq10");
  assert.ok(coq10, "the approved statin CoQ10 note is bundled");
  assert.ok(reply.includes(coq10.alert_body) && reply.includes(coq10.recommendation));
  assert.doesNotMatch(reply, /\b100\s*[-–]\s*200\s*mg/i);
});

// ── Review of dc550e9 (2026-11-11) ─────────────────────────────────────────
// An independent review found: an interval in words or minutes slipped through; the scrub ran only for
// the old trigger list; an answer that was all interval came back empty; a dose limit or an emergency
// line with "24 hours" was deleted; authored intervals were still in the prompt, the knowledge base and
// the medicine notes; a depletion reply ignored the nutrient asked; brand names missed their notes.
// Questions here are written the way people type them, never built from the bundle's own names.
const { normalizeText } = require("../src/core/normalize");
const { clearCache, buildCacheKey } = require("../src/infra/responseCache");
const { KNOWLEDGE_BASE } = require("../src/config/knowledgeBase");
const { TEMPORAL_DATA } = require("../src/core/temporalContext");

async function askWith(message, text, history = []) {
  clearCache();
  stubText = text;
  try { return await ask(message, history); } finally { stubText = "Stubbed answer."; }
}

// Any stated interval, digits or words. Owned by this test, independent of the code under test.
const ANY_INTERVAL = /\b(?:\d+(?:[.,]\d+)?\s*[½¼¾]?|one|two|three|four|five|six|eight|twelve|thirty|sixty|ninety|an?|half an?|a few|a couple of|couple of|several)(?:\s*(?:-|–|to|or)\s*(?:\d+|two|three|four|six|more))?\+?\s*(?:hours?|hrs?|h|minutes?|mins?)\b/i;
const MEDICINE_WORD = /\b(?:medications?|medicines?|meds|drugs?|antibiotics?|thyroid|levothyroxine|synthroid|bisphosphonates?|alendronate|levodopa|tetracyclines?|doxycycline|quinolones?|fluoroquinolones?|cipro\w*|ppis?|omeprazole|famotidine|warfarin|metronidazole|amoxicillin|dolutegravir)\b/i;
const SUPPLEMENT_WORD = /\b(?:calcium|iron|magnesium|zinc|minerals?|multivitamins?|probiotics?|fiber|psyllium|glucomannan|charcoal|quercetin|carnitine|coffee|dairy|milk|juice|antacids?)\b/i;
const authoredInterval = (s) => ANY_INTERVAL.test(s) && MEDICINE_WORD.test(s) && SUPPLEMENT_WORD.test(s);
// Lines that pass that test without being a medicine + supplement spacing interval.
const NOT_SPACING = [
  "absolute zero alcohol during treatment and 48 hours after", // metronidazole + alcohol (drug–alcohol; see PR follow-ups)
  "can affect some drugs for **24–72 hours**", // grapefruit: how long an effect lasts, not a spacing interval
  "levothyroxine (alone, 30-60 min before food)", // anchored to food: levothyroxine's empty-stomach label direction
];
const spacingOffenders = (lines) => lines.filter((l) => authoredInterval(l) && !NOT_SPACING.some((n) => l.includes(n)));
const timingRecords = (records) => records.filter((r) => r.management && (/supplement/.test(`${r.agent1_type} ${r.agent2_type}`) && SUPPLEMENT_WORD.test(`${r.agent1_name} ${r.agent2_name}`) || ANY_INTERVAL.test(r.management)));

const INTERVAL_FORMS = [
  "wait two hours before calcium", "give it 2 or more hours", "wait four hours after your thyroid pill",
  "take it 120 minutes later", "leave a gap of a few hours between them", "then wait 2½ hours",
  "wait half an hour after", "take them a couple of hours apart", "wait an hour after your dose",
  "keep them 30–60 minutes apart", "take them two to four hours apart", "separate them by 4 hours",
  "wait at least 2h before the mineral", "leave 4-6 h between them", "take the zinc 2 hrs later",
  "leave a 4-hour gap", "leave a four-hour gap", "take them 2 hours apart for maximum absorption",
  "leave 4-6 h between doses",
];

test("a medicine + mineral answer keeps none of the model's own intervals, in any form, and keeps the rest of what it said", async () => {
  const q = "Can I take calcium with my levothyroxine?";
  const records = timingRecords(P.findInteractions(q));
  assert.ok(records.length > 0, "a synced record joins calcium and levothyroxine");
  for (const phrase of INTERVAL_FORMS) {
    const { reply, askedModel } = await askWith(q, `Calcium can block levothyroxine absorption, so ${phrase}.`);
    assert.equal(askedModel, true, `${phrase}: expected the answer path`);
    assert.ok(!reply.toLowerCase().includes(phrase.toLowerCase()), `kept "${phrase}":\n${reply}`);
    assert.match(reply, /Calcium can block levothyroxine absorption/, `"${phrase}": the rest of the sentence was lost\n${reply}`);
    for (const r of records) assert.ok(reply.includes(r.management), `"${phrase}": ${r.id} not quoted`);
  }
  // The reviewer's case: the model's "two hours" sat right above the record's "at least 4 hours".
  const { reply } = await askWith("When should I take calcium with levothyroxine?", "Take levothyroxine first, then wait two hours before calcium.\nCalcium can block absorption.");
  assert.doesNotMatch(reply, /two hours/i, reply);
  assert.match(reply, /Calcium can block absorption\./);
  for (const r of records) assert.ok(reply.includes(r.management), r.id);
});

test("the timing scrub keeps dose limits, emergency lines, label directions and plain statements", () => {
  const keep = [
    "Do not exceed 4,000 mg of acetaminophen in 24 hours.",
    "If you have chest pain or trouble breathing, call 911 — symptoms within 24 hours need care.",
    "Calcium binds levothyroxine and can block its absorption.",
    "Never take iron at the same time as levothyroxine.",
    "Take levothyroxine 30–60 minutes before breakfast, as its label directs.",
    "Ibuprofen can be taken every 6 hours as needed.",
    "Serotonin syndrome symptoms usually start within 6 hours of a dose change.",
  ];
  const out = applyTimingPolicy([...keep, "Separate them by 4 hours."].join("\n"), []);
  for (const line of keep) assert.ok(out.includes(line), `dropped: ${line}\n${out}`);
  assert.doesNotMatch(out, /Separate them by 4 hours/);
});

test("when the model's interval goes and no record carries one, the rest stays, the reply says so, and it is never empty", async () => {
  const q = "When should I take zinc with levothyroxine?";
  assert.equal(P.findInteractions(q).length, 0, "no synced record joins zinc and levothyroxine");
  let { reply } = await askWith(q, "Zinc may reduce levothyroxine absorption, so separate them by 4 hours.");
  assert.match(reply, /Zinc may reduce levothyroxine absorption/, reply);
  assert.doesNotMatch(reply, /4 hours/, reply);
  assert.ok(reply.includes(NO_TIMING_RECORD), reply);
  ({ reply } = await askWith(q, "Separate them by 4 hours."));
  assert.ok(reply.trim().length > 0, "empty reply");
  assert.ok(reply.includes(NO_TIMING_RECORD), reply);
  assert.doesNotMatch(reply, /\bsafe\b/i);
});

test("any medicine + supplement question gets the scrub and the record quote, not only the old trigger list", async () => {
  const cases = [
    ["Can I take magnesium with moxifloxacin?", "Yes, but separate them by 2 hours.\nMagnesium can bind the antibiotic.", "separate them by 2 hours"],
    ["Can I take calcium with Fosamax?", "Separate calcium from alendronate by 2 hours.", "2 hours"],
    ["Can I take magnesium with dolutegravir?", "Take magnesium 2 hours after dolutegravir.", "2 hours"],
    ["Is it ok to take iron with my Tivicay?", "Wait two hours after the iron.", "two hours"],
    ["Can I take probiotics with amoxicillin?", "Probiotics are fine. Take them 2 hours apart from the antibiotic.", "2 hours"],
    ["I take Synthroid and a multivitamin, what time should I take each?", "Take Synthroid first thing, then wait 4 hours before the multivitamin.", "4 hours"],
  ];
  for (const [q, text, phrase] of cases) {
    const { reply, askedModel } = await askWith(q, text);
    assert.ok(!reply.includes(phrase), `${q}: kept "${phrase}"\n${reply}`);
    // "Yes, but separate them…" must not become a bare "Yes.": the yes was conditional on the clause removed.
    assert.doesNotMatch(reply, /^\s*(?:yes|sure|okay|ok)[.!]?\s*$/im, `${q}: an unqualified yes is left\n${reply}`);
    if (!askedModel) { assert.doesNotMatch(reply, ANY_INTERVAL, `${q}: a gate stated an interval\n${reply}`); continue; }
    const timed = timingRecords(P.findInteractions(q));
    if (timed.length > 0) for (const r of timed) assert.ok(reply.includes(r.management), `${q}: ${r.id} not quoted`);
    else assert.ok(reply.includes(NO_TIMING_RECORD), `${q}: no limit line\n${reply}`);
  }
});

test("no prompt line, knowledge-base entry, medicine note or gate template authors a medicine + supplement interval", () => {
  const found = [];
  for (const s of SECTIONS) for (const line of spacingOffenders(s.text.split("\n"))) found.push(`prompt ${s.id}: ${line}`);
  for (const [name, e] of Object.entries(KNOWLEDGE_BASE)) {
    const t = e.timing || {};
    for (const x of [t.best_time, ...(t.separate_from || [])].filter(Boolean)) if (spacingOffenders([`${name}: ${x}`]).length) found.push(`kb ${name} timing: ${x}`);
    for (const ix of e.interactions || []) {
      const line = `${name} + ${ix.with}: ${ix.mechanism} ${ix.timing_fix || ""}`;
      if (spacingOffenders([line]).length) found.push(`kb ${line}`);
    }
  }
  for (const [name, d] of Object.entries(TEMPORAL_DATA)) if (spacingOffenders([`${name}: ${d.notes || ""}`]).length) found.push(`temporal ${name}: ${d.notes}`);
  const templates = fs.readFileSync(path.join(__dirname, "../src/gates/replies.js"), "utf8").split("\n");
  for (const line of spacingOffenders(templates)) found.push(`template: ${line.trim()}`);
  assert.deepEqual(found, []);
});

test("the prompt sent for a thyroid medicine + multivitamin timing question carries no authored interval", async () => {
  const { askedModel } = await askWith("I take Synthroid and a multivitamin, what time should I take each?", "Stubbed answer.");
  assert.equal(askedModel, true);
  assert.deepEqual(spacingOffenders(sent.map((m) => m.content).join("\n").split("\n")), []);
});

test("a depletion question about one nutrient answers for that nutrient, also when there is no approved note", async () => {
  for (const [q, nutrient] of [["does Prilosec deplete magnesium?", "magnesium"], ["does Lasix deplete potassium?", "potassium"], ["Does omeprazole deplete vitamin B12?", "B12"], ["Does metformin deplete folate?", "folate"]]) {
    const { reply, askedModel } = await ask(q);
    assert.equal(askedModel, false, q);
    assert.match(reply, new RegExp(`no approved[^\\n]*${nutrient}`, "i"), `${q}:\n${reply}`);
    for (const line of claimLines(reply)) assert.doesNotMatch(line, new RegExp(nutrient, "i"), `${q}: ${line}`);
    assert.doesNotMatch(reply, /\bsafe\b/i, q);
  }
  const { reply } = await ask("does metformin deplete b12?");
  const b12 = D.subjectsIn("metformin").flatMap((s) => s.entries).find((e) => /b12/i.test(e.depleted_nutrient.standard_name));
  assert.ok(reply.includes(b12.alert_body), reply);
  assert.doesNotMatch(reply, /no approved[^\n]*b12/i, reply);
  // A medicine's salt or class name is part of the medicine, not a nutrient asked about.
  for (const [q, want] of [["I take levothyroxine sodium, does it lower my iron?", ["iron"]], ["does naproxen sodium deplete anything?", []],
    ["I'm on losartan potassium, does it affect magnesium?", ["magnesium"]], ["is a calcium channel blocker bad for potassium?", ["potassium"]]]) {
    assert.deepEqual(D.nutrientsIn(q), want, q);
  }
});

test("brand names reach the approved notes for their medicine", async () => {
  const cases = [
    ["does Depakote deplete carnitine?", "class:valproate", /carnitine/i],
    ["does Tegretol deplete vitamin d?", "2002", /vitamin d/i],
    ["I take Xenical, does it deplete vitamin E?", "37925", /vitamin e/i],
    ["does Azulfidine deplete folic acid?", "9524", /folate/i],
    ["does Colcrys deplete B12?", "2683", /b12/i],
  ];
  for (const [q, id, nutrient] of cases) {
    const { reply, askedModel } = await ask(q);
    assert.equal(askedModel, false, q);
    const entry = D.notes().find((s) => s.id === id).entries.find((e) => nutrient.test(e.depleted_nutrient.standard_name));
    assert.ok(entry, `${id}: no approved ${nutrient} note`);
    assert.ok(reply.includes(entry.alert_body), `${q}:\n${reply}`);
    assert.doesNotMatch(reply, /Which medicine are you asking about/, q);
  }
});

test("small guards: no 'undefined' timing line, a non-string status fails, the filtered count matches, the cache key carries the bundle", () => {
  assert.equal(recordTimingNote([{ agent1_name: "Levothyroxine", agent1_type: "drug", agent2_name: "Calcium", agent2_type: "supplement" }]), null);
  assert.equal(D.isApproved({ citation_review_status: ["verified"], b1_clinical_approval_status: ["approved_for_controlled_beta"] }), false);
  assert.equal(BUNDLE._metadata.total_entries, BUNDLE.depletions.length);
  const bundle = Object.values(MANIFEST.files).map((f) => f.sha256).join(",");
  assert.equal(buildCacheKey("q", "h", "m"), buildCacheKey("q", "h", "m", bundle));
  assert.notEqual(buildCacheKey("q", "h", "m"), buildCacheKey("q", "h", "m", "another bundle"));
  assert.equal(normalizeText("Prilosec"), "omeprazole"); // brand spellings normalise before matching
});

// ── CodeRabbit review of dc550e9 (PR #35 threads), checked on 993c88a ──────
test("a depletion question never takes a message from a risk gate or a verified interaction record", async () => {
  for (const q of ["Does my medication deplete vitamins? Can I take potassium supplements with an ACE inhibitor?", "Does lisinopril deplete zinc? Can I take potassium supplements with it?"]) {
    const { model, reply } = await ask(q);
    assert.equal(model, "system:potassium-acei", `${q}\n${reply}`);
  }
  for (const [q, id] of [["Does warfarin deplete anything? I also take ginkgo.", "DSI_WAR_GINKGO"], ["Does omeprazole deplete B12? Can I take it with clopidogrel?", "DDI_CLOPIDOGREL_OMEPRAZOLE"]]) {
    const { model, reply, askedModel } = await askWith(q, "Stubbed answer.");
    assert.ok(!["system:depletion", "system:ppi-nutrient"].includes(model), `${q}: answered by the depletion gate\n${reply}`);
    if (askedModel) assert.ok(sent.map((m) => m.content).join("\n").includes(RECORDS.find((r) => r.id === id).management), `${q}: ${id} not supplied`);
  }
  // Controls: a plain depletion question is still answered from the approved notes.
  assert.equal((await ask("Does metformin deplete B12?")).model, "system:depletion");
  assert.equal((await ask("Does my medication deplete vitamins?")).model, "system:depletion");
});

test("timing records are chosen for the current question; earlier turns fill in only what it leaves out", async () => {
  const quote = (id) => RECORDS.find((r) => r.id === id).management;
  const history = [{ role: "user", content: "Can I take iron with cipro?" }, { role: "assistant", content: "Iron can bind ciprofloxacin." }];
  let { reply } = await askWith("What about zinc with doxycycline?", "Zinc can reduce doxycycline absorption.", history);
  assert.ok(reply.includes(quote("DSI_TETRACYCLINES_ZINC")), `current pair not quoted:\n${reply}`);
  for (const id of ["DSI_FLUOROQUINOLONES_IRON", "DSI_ZINC_FLUOROQUINOLONE", "DSI_TETRACYCLINES_IRON"]) assert.ok(!reply.includes(quote(id)), `${id} from another pair quoted:\n${reply}`);
  // A follow-up that names nothing still gets the pair from the turn before.
  ({ reply } = await askWith("How far apart should I take them?", "Separate them by 3 hours.", [{ role: "user", content: "Can I take zinc with doxycycline?" }, { role: "assistant", content: "Zinc can bind doxycycline." }]));
  assert.ok(reply.includes(quote("DSI_TETRACYCLINES_ZINC")), reply);
  assert.doesNotMatch(reply, /3 hours/);
});

test("a PPI + nutrient 'can I take' question gets a coverage statement and only that nutrient's notes", async () => {
  const ppi = D.notes().find((s) => s.id === "class:proton_pump_inhibitors");
  const calcium = ppi.entries.find((e) => /calcium/i.test(e.depleted_nutrient.standard_name));
  for (const q of ["Can I take iron with omeprazole?", "Can I take my iron pill with Prilosec?"]) {
    const { reply } = await askWith(q, "Stubbed answer.");
    assert.ok(!reply.includes(calcium.alert_body), `${q}: answered with the calcium note\n${reply}`);
    assert.match(reply, /no verified interaction or timing record[^\n]*iron/i, `${q}\n${reply}`);
    assert.doesNotMatch(reply, /\bsafe\b|\d+\s*(?:hours?|h)\b/i, q);
  }
  const { reply } = await askWith("Can I take calcium with omeprazole?", "Stubbed answer.");
  assert.ok(reply.includes(calcium.alert_body), reply);
});

test("an approved class is found by its displayed name; a generic-only medicine gets the coverage statement", async () => {
  const cls = D.notes().find((s) => s.id === "class:enzyme_inducing_antiseizure_medications");
  const note = cls.entries.find((e) => /calcium/i.test(e.depleted_nutrient.standard_name));
  assert.ok(note, "the class has an approved calcium note");
  let { reply } = await ask("Do enzyme-inducing antiseizure medications deplete calcium?");
  assert.ok(reply.includes(note.alert_body), reply);
  ({ reply } = await ask("What does cholestyramine deplete?"));
  assert.match(reply, /no approved medication–nutrient note for cholestyramine/i, reply);
  assert.doesNotMatch(reply, /Which medicine are you asking about/, reply);
});

test("a matcher with no aliases matches nothing", () => {
  assert.equal(P.agentMatcher("Missing class", "class:not_in_drug_classes", "drug_class").test("what is the weather today"), false);
  const notes = D.buildNotes({ depletions: [{ ...BUNDLE.depletions[0], drug_ref: { id: "class:not_in_drug_classes", type: "class", display_name: "" } }] });
  assert.deepEqual(D.subjectsIn("what is the weather today", notes), []);
});

test("the timing scrub leaves a duration that is not spacing ('5 hours per night')", () => {
  const text = "You reported sleeping 5 hours per night. Which magnesium product do you use?";
  assert.equal(applyTimingPolicy(text, []), text);
  assert.equal(applyTimingPolicy("I walk 2 hours a day and take zinc with my thyroid pill.", []), "I walk 2 hours a day and take zinc with my thyroid pill.");
  assert.doesNotMatch(applyTimingPolicy("Take magnesium at night 4 hours after levothyroxine.", []), /4 hours/);
  // A duration or a sleep word does not excuse a spacing instruction in the same clause.
  for (const line of ["Separate them by 4 hours each day.", "For better sleep take magnesium 4 hours after levothyroxine."]) {
    assert.doesNotMatch(applyTimingPolicy(line, []), /4 hours/, line);
  }
});

// ── CodeRabbit review of d9169e0 (PR #35 threads), checked on d9169e0 ──────
const turns = (...said) => said.flatMap((content) => [{ role: "user", content }, { role: "assistant", content: "OK." }]);
const quoteOf = (id) => RECORDS.find((r) => r.id === id).management;
const suppliedText = () => (sent || []).map((m) => m.content).join("\n");

test("a depletion question is answered for the medicine and nutrient it names, each medicine checked on its own", async () => {
  const metforminB12 = D.subjectsIn("metformin").flatMap((s) => s.entries).find((e) => /b12/i.test(e.depleted_nutrient.standard_name));
  // An earlier medicine's note does not stand in for the one asked about now.
  let { reply } = await ask("Does omeprazole deplete B12?", turns("I take metformin."));
  assert.match(reply, /no approved[^\n]*b12[^\n]*proton pump/i, reply);
  assert.ok(!reply.includes(metforminB12.alert_body), `metformin's note answered an omeprazole question:\n${reply}`);
  // Two medicines in one question: the gap is stated for the one without a note.
  ({ reply } = await ask("Do metformin or omeprazole deplete B12?"));
  assert.match(reply, /no approved[^\n]*b12[^\n]*proton pump/i, reply);
  assert.doesNotMatch(reply, /no approved[^\n]*b12[^\n]*metformin/i, reply);
  assert.ok(reply.includes(metforminB12.alert_body), reply);
  // The nutrient comes from the question; an earlier one is not reported again.
  for (const q of ["Does metformin deplete B12?", "Does it deplete B12?"]) {
    ({ reply } = await ask(q, turns("Does metformin deplete folate?")));
    assert.doesNotMatch(reply, /folate/i, `${q}: the earlier nutrient was answered\n${reply}`);
    assert.ok(reply.includes(metforminB12.alert_body), `${q}\n${reply}`);
  }
  // Controls: a follow-up that names no medicine still uses the one named before.
  ({ reply } = await ask("Does it deplete B12?", turns("I take omeprazole.")));
  assert.match(reply, /no approved[^\n]*b12[^\n]*proton pump/i, reply);
});

test("a record for a different pair is never supplied for the pair the question names", async () => {
  const levoCalcium = quoteOf("DSI_LEVOTHYROXINE_CALCIUM");
  const { reply } = await askWith("Can I take zinc with levothyroxine?", "Zinc may reduce levothyroxine absorption.", turns("Can I take calcium with levothyroxine?"));
  assert.ok(!reply.includes(levoCalcium) && !suppliedText().includes(levoCalcium), `the calcium record answered a zinc question:\n${reply}`);
  // Controls: a follow-up naming one side keeps the earlier pair, also when one word names a drug and its class.
  await askWith("What about with calcium?", "Stubbed answer.", turns("I take levothyroxine."));
  assert.ok(suppliedText().includes(levoCalcium), "one-sided follow-up lost its record");
  await askWith("Can I take it with cipro?", "Stubbed answer.", turns("I take zinc."));
  assert.ok(suppliedText().includes(quoteOf("DSI_ZINC_FLUOROQUINOLONE")), "cipro (drug and class) lost the zinc record");
});

test("the timing scrub: spacing goes from a safety sentence, a long interval between products and a number-free 'apart'", async () => {
  // A spacing clause inside an emergency sentence goes; the emergency clause stays.
  const mixed = applyTimingPolicy("Call 911 if you have severe symptoms; take zinc 2 hours after ciprofloxacin.", []);
  assert.match(mixed, /Call 911 if you have severe symptoms/, mixed);
  assert.doesNotMatch(mixed, /2 hours/, mixed);
  // A 24-hour interval that spaces two products goes.
  assert.doesNotMatch(applyTimingPolicy("Wait 24 hours between calcium and levothyroxine.", []), /24 hours/);
  // "Take iron apart from milk" is a spacing instruction like "separate them".
  const { reply } = await askWith("Can I take my iron pill with milk at the same time?", "Calcium in dairy blocks iron absorption. Take iron apart from milk, cheese and yogurt.");
  assert.doesNotMatch(reply, /apart from milk|cheese and yogurt/i, `removed clause left its list behind:\n${reply}`);
  assert.match(reply, /Calcium in dairy blocks iron absorption\./, reply);
  // A clause of its own after the removed one stays.
  assert.equal(applyTimingPolicy("Take iron apart from milk, then drink orange juice with it.", []).split("\n")[0], "Drink orange juice with it.");
  assert.equal(applyTimingPolicy("Separate them by 2 hours, or stop the supplement.", []).split("\n")[0], "Stop the supplement.");
  // Controls: an emergency window, an avoidance window and a safety line are not spacing.
  for (const line of [
    "Call poison control if a child swallows iron — an overdose can be fatal within 6 hours.",
    "Avoid alcohol during treatment and for 48 hours after the last dose.",
    "Keep iron supplements away from children.",
    "Apart from iron, your multivitamin also has zinc.",
  ]) assert.equal(applyTimingPolicy(line, []), line);
  for (const line of ["Keep them apart.", "Iron is best taken apart from dairy."]) assert.equal(applyTimingPolicy(line, []).includes(line), false, line);
});

test("no prompt line or knowledge-base entry tells the model to take iron apart from a food", () => {
  const found = [];
  for (const s of SECTIONS) for (const line of s.text.split("\n")) if (/take iron apart/i.test(line)) found.push(`prompt ${s.id}: ${line}`);
  for (const ix of KNOWLEDGE_BASE.iron.interactions) if (/\bapart\b/i.test(ix.mechanism)) found.push(`kb iron + ${ix.with}: ${ix.mechanism}`);
  assert.deepEqual(found, []);
});

test("an onset statement in a follow-up is kept; a follow-up about the pair is still scrubbed", async () => {
  let { reply } = await askWith("How soon would I notice symptoms?", "Symptoms usually start within 6 hours after a dose change. Ask your pharmacist.", turns("I take metformin and zinc."));
  assert.match(reply, /Symptoms usually start within 6 hours after a dose change\./, reply);
  assert.ok(!reply.includes(NO_TIMING_RECORD), reply);
  assert.doesNotMatch(applyTimingPolicy("Take zinc 6 hours after a dose of ciprofloxacin.", []), /6 hours/);
  // Control: a follow-up that names nothing about the earlier pair keeps the scrub and the record.
  ({ reply } = await askWith("Should I worry?", "Not really, just take them 2 hours apart.", turns("Can I take calcium with levothyroxine?")));
  assert.doesNotMatch(reply, /2 hours apart/, reply);
  assert.ok(reply.includes(quoteOf("DSI_LEVOTHYROXINE_CALCIUM")), reply);
});

// Reported on 25f8d77: the list-tail rule dropped instructions of their own after a removed spacing clause.
test("a removed spacing clause takes only the rest of its own list, never the next instruction", () => {
  const first = (line) => applyTimingPolicy(line, []).split("\n")[0];
  for (const [line, want] of [
    ["Separate them; avoid alcohol.", "Avoid alcohol."],
    ["Separate them, avoid grapefruit.", "Avoid grapefruit."],
    ["Separate them by 4 hours; tell your doctor.", "Tell your doctor."],
    ["Take calcium and levothyroxine at different times, see your doctor.", "See your doctor."],
    ["Separate the zinc and ciprofloxacin, stop the zinc, and call your doctor.", "Stop the zinc, and call your doctor."],
    ["Take iron apart from levothyroxine, call your doctor.", "Call your doctor."],
    ["Keep calcium apart from levothyroxine, monitor your TSH.", "Monitor your TSH."],
    ["If your heartbeat is irregular, call 911; space them apart, get help.", "If your heartbeat is irregular, call 911; get help."],
    ["Take iron apart from milk, cheese and yogurt, and ask your pharmacist.", "Ask your pharmacist."],
    ["Separate them, otherwise absorption drops.", "Otherwise absorption drops."],
  ]) assert.equal(first(line), want, line);
  // The list itself still goes with the clause that named it.
  assert.equal(first("Take iron apart from milk, cheese and yogurt."), NO_TIMING_RECORD.split("\n")[0]);
  assert.equal(first("Take iron apart from milk, cheese, yogurt, and calcium-fortified juice."), NO_TIMING_RECORD.split("\n")[0]);
});

// CodeRabbit review of 2f4cf70 (PR #35 threads 4546766897, 4546766892).
test("a safety sentence keeps its safety part word for word and loses only the interval joined to it by 'and'", () => {
  const first = (line) => applyTimingPolicy(line, []).split("\n")[0];
  assert.equal(first("Do not exceed the maximum daily dose and separate calcium from levothyroxine by 2 hours."), "Do not exceed the maximum daily dose.");
  assert.equal(first("Call 911 if you have chest pain and take zinc 2 hours after ciprofloxacin."), "Call 911 if you have chest pain.");
  assert.equal(first("Do not exceed 2 tablets a day and take them 4 hours apart from calcium, or call your doctor."), "Do not exceed 2 tablets a day, or call your doctor.");
  for (const line of [
    "Do not exceed 4,000 mg of acetaminophen in 24 hours.",
    "If you have chest pain or trouble breathing, call 911 — symptoms within 24 hours need care.",
    "Do not combine them, and do not exceed the maximum daily dose.",
    "Wait 48 hours after the last dose before starting the new medicine.",
    "Call 911 if you have chest pain and shortness of breath.",
  ]) assert.equal(applyTimingPolicy(line, []), line);
  // A leftover that is only a negated time phrase goes with the clause it qualified.
  assert.equal(first("Space them 2 hours apart, not at night."), NO_TIMING_RECORD.split("\n")[0]);
});

test("a do-not-combine warning ('not at the same time') is kept: it is not spacing and states no interval", () => {
  for (const line of [
    "Do not take sildenafil at the same time as nitrate medications.",
    "Don't take SAMe and your SSRI at the same time; the combination can cause serotonin syndrome.",
  ]) assert.equal(applyTimingPolicy(line, []), line);
});

// Reported on fde79f6: a minimum interval between doses of one product is dosing, not spacing.
test("an interval between doses of one product is kept; one between two products still goes", () => {
  for (const line of [
    "Do not exceed the maximum daily dose and wait at least 4 hours between doses.",
    "Do not exceed 4,000 mg a day and keep doses at least 4 hours apart.",
    "Do not take more than 6 tablets in 24 hours, and wait 4 hours between doses.",
    "Wait 4 hours between doses.",
    "Take the next dose 4 hours after the last dose.",
    "Wait 4 hours between doses of acetaminophen and do not exceed 4,000 mg a day.",
    "Wait 4 hours after the last dose before taking another.",
  ]) assert.equal(applyTimingPolicy(line, []), line);
  const first = (line) => applyTimingPolicy(line, []).split("\n")[0];
  assert.equal(first("Do not exceed the maximum daily dose and separate calcium from levothyroxine by 2 hours."), "Do not exceed the maximum daily dose.");
  // "Doses" of two products named on the same line, or a dose followed by a second product, are spacing.
  for (const line of ["Calcium can block levothyroxine. Leave 4 hours between doses.", "Wait 4 hours after the last dose before taking calcium.",
    "- Calcium can block levothyroxine.\n- Leave 4 hours between doses.",
    "Space your iron and thyroid doses 4 hours apart.", "Leave 4 hours between doses of both.",
    // Products the matchers do not know are read from the clause's shape.
    "Leave 4 hours between doses of psyllium and levothyroxine.", "Leave 4 hours between doses of fiber and your other supplements.",
    "Keep doses of psyllium 4 hours apart from levothyroxine.", "Take psyllium 4 hours after the last dose."]) {
    assert.doesNotMatch(applyTimingPolicy(line, []), /4 hours/, line);
  }
  // "St." does not end the sentence, so the whole clause goes and no "John's wort…" fragment is left behind.
  assert.equal(applyTimingPolicy("Leave 2 hours between doses of St. John's wort and your birth control.", []), NO_TIMING_RECORD);
});

// Reported by Sean on 2026-11-12 (dsld_clean scripts/audits/clinical_review_20261111/DR_PHAM_ANSWERS_20261112.md,
// Part B 3A): the scrub sorts a stated time into three cases. Spacing between two products goes unless a
// record supplies it; an interval between doses of one medicine and a deadline for clinical follow-up stay.
test("an interval between doses of the one medicine the clause names is kept, also in a reply naming two products", () => {
  for (const line of [
    "Wait at least 4 hours between acetaminophen doses.",
    "Magnesium is fine with acetaminophen. Wait at least 4 hours between acetaminophen doses.",
    "Leave 6 hours between your ibuprofen doses.",
    "Calcium does not change this: wait 4 hours between doses of acetaminophen.",
    "Wait 4 hours after your last dose of acetaminophen before the next dose.",
    "Magnesium is fine with acetaminophen. Wait 4 hours after your last dose of acetaminophen before the next dose.",
  ]) assert.equal(applyTimingPolicy(line, []), line);
  // Controls: doses with no owner in a two-product reply, doses of two products, and a generic owner still go.
  for (const line of [
    "Calcium can block levothyroxine. Leave 4 hours between doses.",
    "Leave 4 hours between calcium and levothyroxine doses.",
    "Leave 4 hours between levothyroxine doses and calcium.",
    "Calcium can block levothyroxine. Leave 4 hours between supplement doses.",
    "Wait 4 hours after your levothyroxine dose.",
    // "After the last dose" with no next dose of the same product may be spacing from the other one.
    "Calcium can block levothyroxine. Wait 4 hours after your last dose of levothyroxine.",
  ]) assert.doesNotMatch(applyTimingPolicy(line, []), /4 hours/, line);
});

test("a deadline for clinical follow-up is kept; spacing joined to it still goes", () => {
  for (const line of [
    "Call your doctor within 2 hours if the rash worsens.",
    "If the swelling spreads, contact your prescriber within an hour.",
    "Check your blood sugar within 30 minutes if you feel shaky.",
    // The deadline bounds the call, whatever the rest of the clause names (PR #36 review).
    "Call your doctor within 2 hours if you take calcium with levothyroxine.",
    "Call your doctor within 2 hours after taking magnesium.",
    "Call your doctor or pharmacist within 2 hours if the rash worsens.",
  ]) assert.equal(applyTimingPolicy(line, []), line);
  const first = (line) => applyTimingPolicy(line, []).split("\n")[0];
  assert.equal(first("Call your doctor and take zinc 2 hours after ciprofloxacin."), "Call your doctor.");
  // A time that is not a deadline, or a deadline measured between two products, is still spacing.
  for (const line of ["Tell your doctor you take them 2 hours apart.", "Ask your pharmacist about taking them 2 hours apart.",
    "Call your doctor if you need to take calcium 2 hours after levothyroxine.", "Ask your pharmacist whether 2 hours is enough.",
    "Call your doctor if you take calcium within 2 hours of levothyroxine.",
    "Ask your pharmacist about calcium within 2 hours of levothyroxine."]) {
    assert.doesNotMatch(applyTimingPolicy(line, []), /2 hours/, line);
  }
  // A deadline for the call does not carry a spacing interval that follows it. When that interval is the call's
  // condition, the clause goes whole: keeping the call alone would make it unconditional, and the scrub never
  // rewrites inside a clause.
  assert.equal(applyTimingPolicy("Call your doctor within 2 hours if you took calcium 1 hour after levothyroxine.", []), NO_TIMING_RECORD);
});

test("clock times that place two products apart are spacing; one product's clock times are not", async () => {
  for (const line of [
    "Take levothyroxine at 8 am and calcium at 9 am.",
    "Take levothyroxine at 8 am. Take calcium at 9 am.",
    "Take levothyroxine at 7:00 a.m., and your calcium at noon.",
    "- Take levothyroxine at 6 AM.\n- Take the zinc at 10 AM.",
    "Take levothyroxine at 8 am. Call your doctor about taking calcium at 9 am.",
    "Take magnesium at midnight and acetaminophen at 12 pm.",
    "Take levothyroxine at 7 am. Take calcium at 11 am and 3 pm.",
  ]) {
    const out = applyTimingPolicy(line, []);
    assert.doesNotMatch(out, /\d\s*(?:a\.?m|p\.?m)|noon/i, `${line}\n${out}`);
    assert.ok(out.includes(NO_TIMING_RECORD), out);
  }
  // With a record for the pair, the record's interval replaces the model's schedule.
  const { reply } = await askWith("When should I take calcium with levothyroxine?", "Take levothyroxine at 8 am and calcium at 9 am. Calcium can block absorption.");
  assert.doesNotMatch(reply, /9 am/, reply);
  assert.match(reply, /Calcium can block absorption\./, reply);
  assert.ok(reply.includes(quoteOf("DSI_LEVOTHYROXINE_CALCIUM")), reply);
  // Controls: one product at several times, one timed product beside an untimed one, two products at one time
  // however it is written, and a time for calling the doctor.
  for (const line of [
    "Take acetaminophen at 8 am and 2 pm.",
    "Take levothyroxine at 7 am on an empty stomach. Calcium can block its absorption.",
    "Take acetaminophen at 8 am and 2 pm; magnesium does not interact with it.",
    "Take magnesium at noon and acetaminophen at 12 pm.",
    "Take magnesium at 8 am and acetaminophen at 08:00.",
    "Take levothyroxine at 8 am. Call your doctor at 9 am about calcium.",
    "Take acetaminophen at 8 am and 2 pm. Take magnesium at 8 am.",
    "Take acetaminophen at 8 am. Take acetaminophen again at 2 pm.",
  ]) assert.equal(applyTimingPolicy(line, []), line);
});

// Reported by Sean on 2026-11-12 (follow-up to PR #36): a removed clause that sets the time or condition of the clause
// beside it takes that clause with it, so the scrub never leaves an unconditional order or a dangling fragment.
test("a removed time window takes the clause it conditions; independent clauses stay", () => {
  for (const line of [
    "For 4 hours after levothyroxine, avoid calcium and iron.",
    "Within 4 hours of your levothyroxine dose, don't take calcium.",
    "Within 2 hours of taking levothyroxine, avoid calcium.",
    "After taking levothyroxine, wait 4 hours before calcium.",
    "Avoid calcium and iron, for 4 hours after levothyroxine.",
    "If you take calcium, separate it from levothyroxine by 4 hours.",
    "If you took calcium within 4 hours of levothyroxine, call your doctor.",
    "Avoid taking calcium within 4 hours of levothyroxine.",
    // The interval is the call's condition: the call alone would be an order the model never gave.
    "Call your doctor within 2 hours if you take calcium 4 hours after levothyroxine.",
  ]) assert.equal(applyTimingPolicy(line, []), NO_TIMING_RECORD, line);
  // Controls: an independent clause, with or without a condition of its own, stays word for word.
  const first = (line) => applyTimingPolicy(line, []).split("\n")[0];
  assert.equal(first("Separate them; avoid alcohol."), "Avoid alcohol.");
  assert.equal(first("If you miss a dose, don't double up; take them 4 hours apart."), "If you miss a dose, don't double up.");
  assert.equal(first("Zinc may reduce levothyroxine absorption, so separate them by 4 hours."), "Zinc may reduce levothyroxine absorption.");
  assert.equal(first("If you have trouble breathing, call 911; take zinc 2 hours after ciprofloxacin."), "If you have trouble breathing, call 911.");
  // A window goes with its own clause only: a conjunction, semicolon or "so" starts a clause of its own.
  assert.equal(first("Take calcium with food, and if you also take levothyroxine, keep them 4 hours apart."), "Take calcium with food.");
  assert.equal(first("Avoid alcohol; for 4 hours after levothyroxine, avoid calcium."), "Avoid alcohol.");
  assert.equal(first("Calcium blocks levothyroxine, when taken together, so separate them by 4 hours."), "Calcium blocks levothyroxine, when taken together.");
  assert.equal(first("Avoid calcium, for 4 hours after levothyroxine, and take iron at night."), "Take iron at night.");
  // A condition between two clauses goes with the one it leads, unless it carries the spacing itself and may time
  // either (PR #37 review).
  assert.equal(first("Take calcium with food, if you also take levothyroxine, keep them 4 hours apart."), "Take calcium with food.");
  assert.equal(applyTimingPolicy("Avoid calcium, for 4 hours after levothyroxine, take iron at night.", []), NO_TIMING_RECORD);
  // An emergency instruction keeps its own condition; only the spacing between them goes (PR #37 review).
  assert.equal(first("If you have trouble breathing, after taking calcium 4 hours after levothyroxine, call 911."), "If you have trouble breathing, call 911.");
  for (const line of [
    "Do not take calcium and levothyroxine at the same time.",
    "Call your doctor within 2 hours if the rash worsens.",
    "Call your doctor within 2 hours if you take calcium with levothyroxine.",
    "Before bed, take magnesium with water.",
  ]) assert.equal(applyTimingPolicy(line, []), line);
});

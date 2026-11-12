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
const { mineralSpacingNote } = require("../src/postprocess");
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
  for (const r of zinc) assert.ok(mineralSpacingNote(zinc).includes(r.management));
  // The shape of the label-specific record in pipeline PR #452 (DSI_ZINC_CIPROFLOXACIN): no code change needed.
  const specific = {
    id: "DSI_ZINC_CIPROFLOXACIN", agent1_id: "2551", agent1_name: "Ciprofloxacin", agent1_type: "drug",
    agent2_id: "C0043481", agent2_name: "Zinc", agent2_type: "supplement",
    management: "Take ciprofloxacin tablets or liquid at least 2 hours before or 6 hours after zinc supplements or multivitamins that contain zinc, as the ciprofloxacin label directs.",
  };
  const note = mineralSpacingNote([specific]);
  assert.ok(note.includes(specific.management));
  assert.deepEqual([...intervals(note)].sort(), ["2", "6"]);
  assert.equal(mineralSpacingNote([]), null, "no record, no interval");
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
  for (const e of ppi.flatMap((s) => s.entries)) assert.ok(reply.includes(e.alert_body), e.id);
  for (const line of claimLines(reply)) assert.doesNotMatch(line, /\bB12\b|magnesium|\biron\b/i, line);
  assert.equal(intervals(reply).size, 0, reply);
});

test("the statin gate quotes the approved CoQ10 note, without the amount the pipeline removed", () => {
  const reply = replies.statinMyopathyReply();
  const coq10 = D.subjectsIn("atorvastatin").flatMap((s) => s.entries).find((e) => e.depleted_nutrient.canonical_id === "coq10");
  assert.ok(coq10, "the approved statin CoQ10 note is bundled");
  assert.ok(reply.includes(coq10.alert_body) && reply.includes(coq10.recommendation));
  assert.doesNotMatch(reply, /\b100\s*[-–]\s*200\s*mg/i);
});

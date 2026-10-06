/**
 * The pipeline's verified interaction records are supplied to the model (Wave D step 4).
 *
 * "The pipeline owns clinical truth; the chatbot explains it." src/data/pipeline/ is a byte-for-byte
 * copy of the pipeline export (scripts/sync_pipeline.js); src/core/pipelineInteractions.js finds the
 * records that join two agents a conversation names and api/chat.js hands them to the model. The live
 * case that motivated it: "Is garlic safe with warfarin?" was answered "not safe … 🔴 Major … avoid
 * culinary garlic" while the pipeline record DSI_WAR_GARLIC says caution, culinary amounts generally safe.
 * No live calls: the LLM chain is stubbed.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.PG_PROXY_SECRET;
delete process.env.PG_REQUIRE_PROXY_SECRET;

const providerRouter = require("../src/infra/providerRouter");
let sent = null;
providerRouter.callWithFallback = async (messages) => {
  sent = messages;
  return { text: "Stubbed answer.", provider: "gemini", modelId: "stub", usage: {}, degraded: false };
};
const handler = require("../api/chat");
const P = require("../src/core/pipelineInteractions");
const { getProvenance, rulesetTag } = require("../src/infra/provenance");

const DIR = path.join(__dirname, "..", "src", "data", "pipeline");
const MANIFEST = require("../src/data/pipeline/MANIFEST.json");
const RECORDS = require("../src/data/pipeline/interactions_verified.json").interactions;
const CLASSES = require("../src/data/pipeline/drug_classes.json").classes;

let socket = 0;
async function ask(message, history = []) {
  sent = null;
  const out = {};
  await handler({ method: "POST", headers: { "x-forwarded-for": `10.16.0.${++socket}` }, socket: {}, body: { message, history } },
    { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.json = j; return this; }, end() { return this; } });
  return { model: out.json.model, system: sent ? sent.filter((m) => m.role === "system").map((m) => m.content).join("\n") : null };
}

// ── the bundled data is the pipeline's, unedited ────────────────────────────
test("every bundled file matches the checksum the sync wrote: the data is never edited here by hand", () => {
  for (const [name, meta] of Object.entries(MANIFEST.files)) {
    const buf = fs.readFileSync(path.join(DIR, name));
    assert.equal(crypto.createHash("sha256").update(buf).digest("hex"), meta.sha256, `${name} differs from the pipeline export (run scripts/sync_pipeline.js)`);
  }
  assert.ok(MANIFEST.db_version && MANIFEST.schema_version && MANIFEST.source_commit, "versions and source commit are recorded");
  assert.equal(MANIFEST.interactions, RECORDS.length);
});

test("every drug class a record names is defined in the bundled class list", () => {
  for (const r of RECORDS) for (const k of ["agent1", "agent2"]) {
    if (r[`${k}_type`] === "drug_class") assert.ok(CLASSES[r[`${k}_id`]], `${r.id}: ${r[`${k}_id`]} has no member list`);
  }
});

test("provenance reports the pipeline version in /api/health and the X-PG-Ruleset header", () => {
  assert.equal(getProvenance().pipeline.db_version, MANIFEST.db_version);
  assert.match(rulesetTag(), new RegExp(`pipeline=${MANIFEST.db_version.replace(/\./g, "\\.")}`));
});

// ── matching ────────────────────────────────────────────────────────────────
// An everyday name per agent: a common member for a class, the pipeline name without qualifiers otherwise.
const COMMON = {
  "class:ssris": "sertraline", "class:maois": "phenelzine", "class:nsaids": "ibuprofen", "class:statins": "atorvastatin",
  "class:anticoagulants": "warfarin", "class:doacs": "apixaban", "class:antiplatelet_agents": "clopidogrel",
  "class:benzodiazepines": "alprazolam", "class:beta_blockers": "metoprolol", "class:ace_inhibitors": "lisinopril",
  "class:calcium_channel_blockers": "amlodipine", "class:antihypertensives": "lisinopril", "class:diabetes_meds": "metformin",
  "class:diuretics": "furosemide", "class:potassium_sparing_diuretics": "spironolactone", "class:fluoroquinolones": "ciprofloxacin",
  "class:tetracycline_antibiotics": "doxycycline", "class:oral_contraceptives": "birth control", "class:corticosteroids": "prednisone",
  "class:antipsychotics": "quetiapine", "class:anticonvulsants": "lamotrigine", "class:immunosuppressants": "tacrolimus",
  "class:hiv_protease_inhibitors": "ritonavir", "class:bisphosphonates": "alendronate", "class:stimulants": "adderall",
  "class:triptans": "sumatriptan", "class:sedatives": "sleeping pills",
};
const everyday = (r, k) => (r[`${k}_type`] === "drug_class" ? COMMON[r[`${k}_id`]] : r[`${k}_name`].replace(/\s*\([^)]*\)/g, "").split("/")[0].trim());

test("every verified record is found when a person names its two agents in everyday words", () => {
  const missed = [];
  for (const r of RECORDS) {
    const q = `Can I take ${everyday(r, "agent2")} with ${everyday(r, "agent1")}?`;
    if (!P.findInteractions(q).some((x) => x.id === r.id)) missed.push(`${r.id}: ${q}`);
  }
  assert.deepEqual(missed, []);
});

test("brand names and class words reach the records", () => {
  const ids = (q) => P.findInteractions(q).map((r) => r.id);
  assert.ok(ids("I take Zoloft, can I add St. John's wort?").includes("DSI_SSRI_SJW"));
  assert.ok(ids("on plavix, is ginkgo ok").includes("DSI_GINKGO_ANTIPLATELET"));
  assert.ok(ids("I take lipitor, can I take red yeast rice?").includes("DSI_STATINS_RYR"));
  assert.ok(ids("I take pradaxa and turmeric").includes("DSI_ANTICOAG_TURMERIC"), "dabigatran etexilate is matched as dabigatran");
  assert.ok(ids("I'm on a blood thinner, can I take turmeric?").includes("DSI_ANTICOAG_TURMERIC"), "a class word");
});

test("no record without two named agents, and no near-miss drug stands in for another", () => {
  assert.deepEqual(P.findInteractions("what is magnesium good for"), []);
  assert.deepEqual(P.findInteractions("I take warfarin"), []);
  assert.deepEqual(P.findInteractions("I take xanax and drink water with it").filter((r) => /alcohol/i.test(r.agent1_name + r.agent2_name)), []);
  assert.ok(!P.agentsIn("I take pantoprazole").has("7646"), "pantoprazole is not omeprazole");
  assert.deepEqual(P.findInteractions("I take metformin and I drink most nights").map((r) => r.id), ["DDI_METFORMIN_ALCOHOL"], "alcohol uses the gates' shared definition");
});

test("at most three records, most severe first", () => {
  const found = P.findInteractions("I take warfarin, sertraline and lithium, plus st john's wort, ginkgo, garlic, fish oil and turmeric");
  assert.ok(found.length <= 3 && found.length > 0);
  const rank = { contraindicated: 0, avoid: 1, caution: 2, monitor: 3 };
  for (let i = 1; i < found.length; i++) assert.ok(rank[found[i - 1].severity] <= rank[found[i].severity]);
  assert.equal(found[0].id, "DSI_SSRI_SJW", "the contraindicated pair comes first, ahead of nine other matches");
});

test("the block carries the record verbatim with the instruction not to contradict it", () => {
  const r = RECORDS.find((x) => x.id === "DSI_WAR_GARLIC");
  const block = P.recordBlock(r);
  assert.ok(block.includes(`Severity: ${r.severity}`) && block.includes(`Mechanism: ${r.mechanism}`) && block.includes(`Management: ${r.management}`));
  assert.match(block, /do not contradict it or add to it/);
  assert.match(block, /Record: DSI_WAR_GARLIC/);
});

// ── through the handler ─────────────────────────────────────────────────────
test("the answer path gives the model the verified record: garlic with warfarin is 'caution'", async () => {
  const r = await ask("Is garlic safe with warfarin?");
  assert.ok(r.system, `went to ${r.model}, not the model`);
  assert.match(r.system, /Record: DSI_WAR_GARLIC\nInteraction: Garlic \(supplement\) \+ Warfarin\nSeverity: caution/);
});

test("the earlier message counts: the medicine named first, the supplement next", async () => {
  const r = await ask("is garlic ok?", [{ role: "user", content: "I take warfarin" }, { role: "assistant", content: "Okay." }]);
  assert.ok(r.system, `went to ${r.model}, not the model`);
  assert.match(r.system, /Record: DSI_WAR_GARLIC/);
});

test("no record block when nothing pairs up, and deterministic gates still answer first", async () => {
  const plain = await ask("What does magnesium glycinate do for sleep?");
  assert.ok(plain.system && !/VERIFIED PHARMAGUIDE RECORD/.test(plain.system));
  const gate = await ask("Can I take Viagra with nitroglycerin?");
  assert.equal(gate.model, "system:nitrate-vasodilator");
  assert.equal(gate.system, null, "the model is not called");
});

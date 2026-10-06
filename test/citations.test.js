/**
 * No citation the chatbot shows can be invented.
 *
 * 2026-10-06: checked against PubMed (scripts/verify_references.js), the reference list held three
 * papers that do not exist ("Rybak, JAMA 1995", "Warner et al., Drugs & Aging 2011", "Samaras et al.,
 * Psychopharmacology 2020") and eight real papers cited with the wrong journal, year or author; two
 * gate replies showed the wrong ones to users. Every journal reference now carries its PubMed ID and was
 * verified for title, year, journal, first author, topic and retraction. The model's own citations are
 * kept only when they match a verified reference. No live calls here: the PubMed check is the script.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.PG_PROXY_SECRET;
delete process.env.PG_REQUIRE_PROXY_SECRET;

const providerRouter = require("../src/infra/providerRouter");
let stubText = "";
providerRouter.callWithFallback = async () => ({ text: stubText, provider: "gemini", modelId: "stub", usage: {}, degraded: false });
const handler = require("../api/chat");
const { REFERENCES } = require("../src/config/references");
const { stripUnverifiedCitations } = require("../src/postprocess");

const NOT_IN_PUBMED = new Set(["regulatory", "drug_reference", "reference"]); // FDA, Lexicomp, NIH ODS, textbooks

test("every journal reference carries a PubMed ID, and no two share one", () => {
  const pmids = [];
  for (const [id, r] of Object.entries(REFERENCES)) {
    if (NOT_IN_PUBMED.has(r.type)) continue;
    assert.match(String(r.pmid || ""), /^\d{6,9}$/, `${id} has no PubMed ID (run scripts/verify_references.js)`);
    pmids.push(r.pmid);
  }
  assert.equal(new Set(pmids).size, pmids.length);
});

test("the references found not to exist are gone", () => {
  for (const id of ["rybak-1995", "warner-2011", "samaras-2020", "sarris-2011", "lanas-2006"]) assert.equal(REFERENCES[id], undefined, id);
  const text = ["src/gates/replies.js", "src/gates/gates.json"].map((f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8")).join("\n");
  assert.ok(!/JAMA 1995|Am J Gastro 2006/.test(text), "a wrong citation is still shown to users");
});

test("every citation written into a fixed reply or gate is a verified reference", () => {
  for (const file of ["src/gates/replies.js", "src/gates/gates.json"]) {
    const text = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    const cites = text.match(/\*\(([A-Z][^()\n]{1,90}?[ ,](?:19|20)\d{2})\)\*/g) || [];
    assert.ok(cites.length > 0, `${file}: no citations found, so this test would prove nothing`);
    for (const c of cites) assert.equal(stripUnverifiedCitations(" " + c), " " + c, `${file}: unverified citation ${c}`);
  }
});

test("a citation the model writes survives only if it is a verified reference", () => {
  assert.equal(stripUnverifiedCitations("Raises serotonin *(Boyer & Shannon, NEJM 2005)*."), "Raises serotonin *(Boyer & Shannon, NEJM 2005)*.");
  assert.equal(stripUnverifiedCitations("Grapefruit blocks CYP3A4 (Bailey et al., CMAJ 2013)."), "Grapefruit blocks CYP3A4 (Bailey et al., CMAJ 2013).");
  assert.equal(stripUnverifiedCitations("Raises bleeding risk *(Smith et al., Lancet 2019)*."), "Raises bleeding risk.");
  assert.equal(stripUnverifiedCitations("A study found this (NEJM, 2005)."), "A study found this.", "a journal and year alone cannot be checked");
  assert.equal(stripUnverifiedCitations("Take up to 4000 IU (about 2000 IU is typical)."), "Take up to 4000 IU (about 2000 IU is typical).");
});

test("through the handler: an invented citation never reaches the user", async () => {
  stubText = "Ashwagandha may lower cortisol modestly *(Chandrasekhar et al., Indian J Psychol Med 2031)*. Melatonin is short-acting *(Boyer & Shannon, NEJM 2005)*.";
  const out = {};
  await handler({ method: "POST", headers: { "x-forwarded-for": "10.17.0.1" }, socket: {}, body: { message: "what does ashwagandha do for stress?" } },
    { setHeader() {}, status(c) { out.status = c; return this; }, json(j) { out.json = j; return this; }, end() { return this; } });
  assert.ok(!/Chandrasekhar/.test(out.json.reply), out.json.reply);
  assert.match(out.json.reply, /Boyer & Shannon, NEJM 2005/);
});

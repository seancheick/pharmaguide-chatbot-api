#!/usr/bin/env node
/**
 * Verify every journal reference against PubMed, so no citation the chatbot shows can be invented.
 *
 * For each reference in src/config/references.js that is a journal article it checks, against the
 * PubMed record: the title, the year, the journal and the first author; then that the paper is about
 * what it is cited for (its title or abstract names a topic of a claim that cites it, or its domain),
 * and that it is not retracted.
 * A reference that already has a `pmid` is checked against that record; one without is searched by
 * title. Non-journal sources (FDA, NIH ODS fact sheets, drug references, textbooks) are listed apart.
 *
 *   node scripts/verify_references.js            report (needs PUBMED_API_KEY in the env or .env.local)
 *   node scripts/verify_references.js --json     machine-readable report
 *
 * Network only; never run from the test suite. test/references.test.js checks the pinned results offline.
 */
const fs = require("fs");
const path = require("path");
const { REFERENCES } = require("../src/config/references");
const { APPROVED_CLAIMS } = require("../src/config/approvedClaims");

const NOT_IN_PUBMED = new Set(["regulatory", "drug_reference", "reference"]);
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function apiKey() {
  if (process.env.PUBMED_API_KEY) return process.env.PUBMED_API_KEY;
  try {
    const line = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").find((l) => l.startsWith("PUBMED_API_KEY="));
    return line ? line.slice("PUBMED_API_KEY=".length).replace(/^["']|["']$/g, "").trim() : "";
  } catch { return ""; }
}
const KEY = apiKey();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function eutils(endpoint, params) {
  const q = new URLSearchParams({ ...params, tool: "pharmaguide-chatbot", ...(KEY ? { api_key: KEY } : {}) });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${EUTILS}/${endpoint}?${q}`);
    if (res.ok) return endpoint === "efetch.fcgi" ? res.text() : res.json();
    await sleep(800 * (attempt + 1));
  }
  throw new Error(`${endpoint} failed`);
}

const norm = (s) => String(s || "").toLowerCase().replace(/<[^>]+>/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const words = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 2));
function similarity(a, b) {
  const A = words(a), B = words(b);
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / Math.max(1, Math.max(A.size, B.size));
}

// What a reference is cited for: the tags of the claims that cite it, plus its domains.
const GENERIC = new Set(["drug-supplement", "drug-drug", "supplement", "safety", "general", "dosing", "interaction", "population"]);
function topicsFor(id, ref) {
  const t = new Set();
  for (const c of Object.values(APPROVED_CLAIMS)) if ((c.reference_ids || []).includes(id)) for (const tag of c.tags || []) if (!GENERIC.has(tag)) t.add(tag);
  for (const d of ref.domains || []) t.add(d);
  return [...t];
}
const SYNONYMS = {
  serotonin: ["serotonin", "serotonergic"], ssri: ["ssri", "serotonin reuptake", "antidepressant", "sertraline", "fluoxetine", "paroxetine"],
  "5-htp": ["5 htp", "hydroxytryptophan", "5 hydroxytryptophan"], bleeding: ["bleed", "hemorrha", "haemorrha", "anticoagul", "fibrinoly", "platelet"],
  cyp3a4: ["cyp3a4", "cyp 3a4", "cytochrome", "grapefruit"], hepatotoxic: ["liver", "hepat"], teratogen: ["teratogen", "birth defect", "malformation"],
  pregnancy: ["pregnan", "gestation", "fetal", "foetal"], renal: ["renal", "kidney"], ototoxic: ["ototox", "tinnitus", "hearing"],
  nsaid_chronic: ["nsaid", "anti inflammatory", "gastrointestinal"], nsaid: ["nsaid", "anti inflammatory", "ibuprofen", "naproxen"],
  lithium: ["lithium"], "st-johns-wort": ["st john", "hypericum"], kava: ["kava", "piper methysticum"], "vitamin-a": ["vitamin a", "retin"],
  magnesium: ["magnesium"], iodine: ["iodine", "iodide", "thyroid"], ashwagandha: ["ashwagandha", "withania"], isotretinoin: ["isotretinoin"],
  niacin: ["niacin", "nicotinic"], statin: ["statin", "simvastatin", "atorvastatin"], potassium: ["potassium", "hyperkalemia", "hyperkalaemia"],
  "ace-inhibitor": ["ace inhibitor", "angiotensin"], potassium_acei: ["potassium", "hyperkalemia", "hyperkalaemia", "spironolactone"], charcoal: ["charcoal"], "vitamin-d": ["vitamin d", "cholecalciferol"], discontinuation: ["discontinu", "withdrawal"],
};
function topicHit(text, topics) {
  const t = norm(text);
  for (const topic of topics) {
    const forms = SYNONYMS[topic] || [norm(topic.replace(/-/g, " "))];
    for (const f of forms) if (t.includes(norm(f))) return `${topic} ("${f}")`;
  }
  return null;
}

async function findPmid(ref) {
  if (ref.pmid) return String(ref.pmid);
  const author = norm(String(ref.short).split(/[ ,&]/)[0]);
  const keyWords = norm(ref.title).split(" ").filter((w) => w.length > 3).slice(0, 4);
  const tries = [
    `${author}[1au] AND ${ref.year}[dp] AND ${keyWords.slice(0, 2).join(" AND ")}`,
    `${author}[au] AND (${ref.year - 1}:${ref.year + 1}[dp]) AND ${keyWords.slice(0, 2).join(" AND ")}`,
    `${author}[1au] AND ${ref.year}[dp]`,
    `${norm(ref.title)}[Title]`,
  ];
  let best = null;
  for (const term of tries) {
    const r = await eutils("esearch.fcgi", { db: "pubmed", term, retmode: "json", retmax: "20" });
    const ids = (r.esearchresult && r.esearchresult.idlist) || [];
    if (ids.length) {
      const s = await eutils("esummary.fcgi", { db: "pubmed", id: ids.join(","), retmode: "json" });
      for (const id of ids) {
        const sim = similarity(s.result[id].title, ref.title);
        if (!best || sim > best.sim) best = { id, sim };
      }
      if (best && best.sim >= 0.8) return best.id;
    }
    await sleep(150);
  }
  return best && best.sim >= 0.6 ? best.id : null;
}

(async () => {
  const rows = [];
  for (const [id, ref] of Object.entries(REFERENCES)) {
    if (NOT_IN_PUBMED.has(ref.type)) { rows.push({ id, status: "not_in_pubmed", type: ref.type, title: ref.title }); continue; }
    const pmid = await findPmid(ref);
    if (!pmid) { rows.push({ id, status: "NOT_FOUND", title: ref.title }); continue; }
    const s = (await eutils("esummary.fcgi", { db: "pubmed", id: pmid, retmode: "json" })).result[pmid];
    const abstract = await eutils("efetch.fcgi", { db: "pubmed", id: pmid, rettype: "abstract", retmode: "text" });
    const year = Number(String(s.pubdate || s.epubdate || "").slice(0, 4));
    const firstAuthor = (s.authors && s.authors[0] && s.authors[0].name || "").split(" ")[0];
    const checks = {
      title: similarity(s.title, ref.title) >= 0.8,
      year: Math.abs(year - ref.year) <= 1,
      journal: similarity(s.fulljournalname, ref.source) > 0 || norm(ref.source).includes(norm(s.source)),
      author: !firstAuthor || norm(ref.short).includes(norm(firstAuthor)),
      // A retracted paper is a blocker (the same rule as the pipeline's scripts/api_audit tooling).
      not_retracted: !(s.pubtype || []).some((t) => /retract/i.test(t)),
    };
    const topics = topicsFor(id, ref);
    const about = topicHit(`${s.title} ${abstract}`, topics);
    const ok = Object.values(checks).every(Boolean) && !!about;
    rows.push({ id, status: ok ? "VERIFIED" : "MISMATCH", pmid, checks, about, topics, pubmed: { title: s.title, year, journal: s.fulljournalname, first_author: firstAuthor } });
    await sleep(150);
  }
  if (process.argv.includes("--json")) { console.log(JSON.stringify(rows, null, 2)); return; }
  for (const r of rows) {
    if (r.status === "not_in_pubmed") { console.log(`-    ${r.id}  (${r.type}: not a PubMed source)`); continue; }
    if (r.status === "NOT_FOUND") { console.log(`✗    ${r.id}  NOT FOUND in PubMed: "${r.title}"`); continue; }
    const failed = Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k);
    console.log(`${r.status === "VERIFIED" ? "✓" : "✗"}    ${r.id}  PMID ${r.pmid}${failed.length ? "  mismatch: " + failed.join(",") : ""}${r.about ? "  about: " + r.about : "  NOT ABOUT: " + r.topics.join("/")}`);
    if (r.status !== "VERIFIED") console.log(`       PubMed: ${r.pubmed.first_author} · ${r.pubmed.journal} ${r.pubmed.year} · "${r.pubmed.title}"`);
  }
  const n = (s) => rows.filter((r) => r.status === s).length;
  console.log(`\n${n("VERIFIED")} verified, ${n("MISMATCH")} mismatched, ${n("NOT_FOUND")} not found, ${n("not_in_pubmed")} not PubMed sources`);
})().catch((e) => { console.error(e.message); process.exit(1); });

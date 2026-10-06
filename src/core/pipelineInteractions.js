/**
 * Verified interaction records from the PharmaGuide pipeline, supplied to the model as facts.
 *
 * The pipeline owns clinical truth; the chatbot explains it. src/data/pipeline/ holds a byte-for-byte
 * copy of the pipeline's export (scripts/sync_pipeline.js, pinned by MANIFEST.json): the verified
 * interaction records and the drug-class membership lists. This module only recognises the agents a
 * conversation names and returns the records that join two of them. Everything clinical (severity,
 * mechanism, management, evidence, class membership) comes from the export; what lives here is chat
 * glue: brand names, the everyday words for a class ("blood thinner"), and spellings.
 *
 * Deterministic gates still answer first; this enriches only the answer path.
 */

const { normalizeText, escapeRegex } = require("./normalize");
const { BRAND_TO_GENERIC } = require("./unknownResolver");
const { ALCOHOL } = require("../gates/detection");
const MANIFEST = require("../data/pipeline/MANIFEST.json");
const INTERACTIONS = require("../data/pipeline/interactions_verified.json").interactions;
const CLASSES = require("../data/pipeline/drug_classes.json").classes;

// Chat glue: everyday words for a class, and for a few agents whose pipeline name is not what people
// type. Clinical membership of a class is the pipeline's member_names list, never this table.
const CLASS_WORDS = {
  "class:ssris": ["ssri", "ssris"],
  "class:maois": ["maoi", "maois"],
  "class:nsaids": ["nsaid", "nsaids", "anti inflammatory", "anti inflammatories"],
  "class:statins": ["statin", "statins", "cholesterol medication", "cholesterol meds"],
  "class:anticoagulants": ["anticoagulant", "anticoagulants", "blood thinner", "blood thinners"],
  "class:doacs": ["doac", "doacs"],
  "class:antiplatelet_agents": ["antiplatelet", "antiplatelets"],
  "class:benzodiazepines": ["benzodiazepine", "benzodiazepines", "benzo", "benzos"],
  "class:beta_blockers": ["beta blocker", "beta blockers"],
  "class:ace_inhibitors": ["ace inhibitor", "ace inhibitors"],
  "class:calcium_channel_blockers": ["calcium channel blocker", "calcium channel blockers"],
  "class:antihypertensives": ["blood pressure medication", "blood pressure meds", "blood pressure pills", "antihypertensive", "antihypertensives"],
  "class:diabetes_meds": ["diabetes medication", "diabetes meds", "diabetes pills"],
  "class:diuretics": ["diuretic", "diuretics", "water pill", "water pills"],
  "class:potassium_sparing_diuretics": ["potassium sparing diuretic", "potassium sparing diuretics"],
  "class:fluoroquinolones": ["fluoroquinolone", "fluoroquinolones", "cipro"],
  "class:tetracycline_antibiotics": ["tetracycline", "tetracyclines"],
  "class:oral_contraceptives": ["birth control", "oral contraceptive", "oral contraceptives"],
  "class:corticosteroids": ["steroid", "steroids", "corticosteroid", "corticosteroids"],
  "class:antipsychotics": ["antipsychotic", "antipsychotics"],
  "class:anticonvulsants": ["anticonvulsant", "anticonvulsants", "seizure medication", "seizure meds"],
  "class:immunosuppressants": ["immunosuppressant", "immunosuppressants"],
  "class:hiv_protease_inhibitors": ["protease inhibitor", "protease inhibitors"],
  "class:bisphosphonates": ["bisphosphonate", "bisphosphonates"],
  "class:stimulants": ["stimulant medication", "adhd medication", "adhd meds", "adderall", "ritalin", "vyvanse", "concerta"],
  "class:triptans": ["triptan", "triptans"],
  "class:sedatives": ["sedative", "sedatives", "sleeping pills"],
};
const AGENT_WORDS = {
  C0041479: ["tyramine", "aged cheese", "aged cheeses", "cured meats"], // Tyramine (high-tyramine foods)
  "ref:iodinated_contrast": ["contrast dye", "iv contrast", "ct contrast", "contrast media"],
  C4704022: ["cbd", "cannabidiol"],
};

const SALT = /\s+(?:etexilate|sodium|potassium|calcium|magnesium|hydrochloride|hcl|mesylate|maleate|succinate|tartrate|besylate|acetate|citrate|fumarate|sulfate|phosphate)$/i;

// "(supplement)", "(high dose)", "(class)" qualify the pipeline's name; they are not what people type.
const QUALIFIER = /\s*\((?:supplement|high dose(?: supplement)?|high-dose|polyphenols|class)\)/gi;

function aliasesFor(name, id, type) {
  const out = new Set();
  const add = (s) => { const n = normalizeText(String(s)).trim(); if (n.length >= 3) out.add(n); };
  if (type === "drug_class") {
    const cls = CLASSES[id] || {};
    for (const m of cls.member_names || []) {
      add(m);
      // "dabigatran etexilate", "losartan potassium": people say the drug, not the salt.
      const base = m.replace(SALT, "");
      if (base !== m) add(base);
    }
    for (const w of CLASS_WORDS[id] || []) add(w);
  } else {
    const base = name.replace(QUALIFIER, "");
    add(base);
    for (const part of base.split("/")) add(part);
    const inner = base.match(/\(([^)]+)\)/);
    if (inner) { add(inner[1]); add(base.replace(/\s*\([^)]*\)/, "")); }
    for (const w of AGENT_WORDS[id] || []) add(w);
  }
  // Brand names of every generic recognised above (chat glue owned by unknownResolver).
  for (const [brand, generic] of Object.entries(BRAND_TO_GENERIC)) {
    if (out.has(normalizeText(generic).trim())) add(brand);
  }
  return [...out];
}

// One matcher per agent id, built once per cold start. An id can appear under several names
// ("Green Tea Extract", "Green Tea (polyphenols)"): every name contributes its aliases.
const AGENTS = new Map();
for (const r of INTERACTIONS) {
  for (const k of ["agent1", "agent2"]) {
    const id = r[`${k}_id`];
    if (!id) continue;
    const prev = AGENTS.get(id);
    const aliases = [...new Set([...(prev ? prev.aliases : []), ...aliasesFor(r[`${k}_name`], id, r[`${k}_type`])])];
    // Alcohol has one definition, shared with the gates (it knows "drink water" is not alcohol).
    const re = id === "ref:alcohol" ? ALCOHOL : new RegExp(`\\b(?:${aliases.map(escapeRegex).join("|")})\\b`);
    AGENTS.set(id, { id, aliases, re });
  }
}

// A word a supplement, food or reference agent owns never names a drug class. The pipeline's class
// lists include glucosamine (NSAIDs), cannabidiol (anticonvulsants) and melatonin (sedatives), so
// "glucosamine with warfarin" also named the NSAID class and supplied the NSAID + anticoagulant record.
// Real drugs stay class members: warfarin still names the anticoagulant class.
const AGENT_TYPE = new Map(INTERACTIONS.flatMap((r) => [[r.agent1_id, r.agent1_type], [r.agent2_id, r.agent2_type]]));
const NON_DRUG_WORDS = new Set([...AGENTS.values()].filter((a) => !["drug", "drug_class"].includes(AGENT_TYPE.get(a.id))).flatMap((a) => a.aliases));
for (const agent of AGENTS.values()) {
  if (AGENT_TYPE.get(agent.id) !== "drug_class") continue;
  agent.aliases = agent.aliases.filter((alias) => !NON_DRUG_WORDS.has(alias));
  agent.re = new RegExp(`\\b(?:${agent.aliases.map(escapeRegex).join("|")})\\b`);
}

const SEVERITY_RANK ={ contraindicated: 0, avoid: 1, caution: 2, monitor: 3 };
const MAX_RECORDS = 3;

/** Agent ids named in the text (any spelling, brand or class member). */
function agentsIn(text) {
  const t = normalizeText(String(text || ""));
  return new Set([...AGENTS.values()].filter((a) => a.re.test(t)).map((a) => a.id));
}

/** The verified records that join two agents named in the text, most severe first (at most 3). */
function findInteractions(text) {
  const named = agentsIn(text);
  if (named.size < 2) return [];
  return INTERACTIONS
    .filter((r) => r.agent1_id !== r.agent2_id && named.has(r.agent1_id) && named.has(r.agent2_id))
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || a.id.localeCompare(b.id))
    .slice(0, MAX_RECORDS);
}

/**
 * A record as supplied context: what the model is told, verbatim from the pipeline. No record id: the
 * model cited it as a source ("*(DSI_WAR_GLUCOSAMINE)*"); api/chat.js also strips any that slips out.
 */
function recordBlock(record) {
  const r = record.raw || record;
  return [
    "VERIFIED PHARMAGUIDE RECORD (authoritative: explain it in plain language; do not contradict it or add to it)",
    `Interaction: ${r.agent2_name ?? r.agent2} + ${r.agent1_name ?? r.agent1}`,
    `Severity: ${r.severity}`,
    `Mechanism: ${r.mechanism}`,
    `Management: ${r.management}`,
    `Evidence: ${r.evidence_level} (confidence: ${r.clinical_confidence})`,
  ].join("\n");
}

// Record ids look like DSI_WAR_GARLIC, SSI_IRON_GREENTEA, DDI_METFORMIN_ALCOHOL.
const RECORD_ID = /\s*\*?\((?:DSI|SSI|DDI)_[A-Z0-9_]+\)\*?|\b(?:DSI|SSI|DDI)_[A-Z0-9_]+\b/g;

module.exports = { RECORD_ID, findInteractions, agentsIn, recordBlock, AGENTS, PIPELINE_VERSION: MANIFEST.db_version, MANIFEST };

/**
 * Medication–nutrient notes from the PharmaGuide pipeline (scripts/data/medication_depletions.json).
 *
 * The pipeline owns these notes; chat quotes them. scripts/sync_pipeline.js copies the file into
 * src/data/pipeline/ keeping only entries that pass isApproved(), and this module applies the same rule
 * again when it loads the bundle, so an entry copied whole or from an older pipeline still fails closed.
 * Nothing clinical is written here: a reply names the nutrient and quotes alert_body + recommendation.
 */

const { normalizeText, escapeRegex } = require("./normalize");
const { agentMatcher, MEDICINE_NAME } = require("./pipelineInteractions");
const CLASSES = require("../data/pipeline/drug_classes.json").classes;
const MANIFEST = require("../data/pipeline/MANIFEST.json");

/**
 * The pipeline's two gates for consumer copy: the citation review is verified (the app's own rule) and
 * the exact current record is approved for controlled beta. Any other value, a missing one or one that
 * is not a string, fails.
 */
function isApproved(entry) {
  const value = (k) => (entry && typeof entry[k] === "string" ? entry[k].trim().toLowerCase() : "");
  return value("citation_review_status") === "verified" && value("b1_clinical_approval_status") === "approved_for_controlled_beta";
}

// Everyday words for nutrients (chat glue), keyed by the note's nutrient name once normalised
// (normalizeText already turns "Coenzyme Q10" into "coq10"). The keys also cover nutrients whose notes
// are withheld, so "does Prilosec deplete magnesium?" is recognised and answered as having no approved note.
const NUTRIENT_WORDS = {
  "vitamin b12": ["b12", "cobalamin", "methylcobalamin", "cyanocobalamin"],
  folate: ["folic acid", "vitamin b9", "b9", "methylfolate"],
  "vitamin b6": ["b6", "pyridoxine"],
  thiamin: ["thiamine", "vitamin b1", "b1"],
  riboflavin: ["vitamin b2", "b2"],
  niacin: ["vitamin b3", "b3"],
  coq10: ["ubiquinol", "ubiquinone"],
  "l carnitine": ["carnitine", "levocarnitine"],
  "vitamin a": ["retinol"],
  "vitamin c": ["ascorbic acid"],
  "vitamin d": ["vitamin d3", "d3", "cholecalciferol"],
  "vitamin e": ["tocopherol"],
  "vitamin k": ["vitamin k1", "vitamin k2", "k2"],
  biotin: [], calcium: [], choline: [], copper: [], iodine: [], iron: [], magnesium: [], melatonin: [],
  potassium: [], selenium: [], sodium: [], zinc: [],
};
const nutrientKey = (entry) => normalizeText(((entry && entry.depleted_nutrient) || {}).standard_name || "");

// Display names: the pipeline's own (approved and withheld notes), otherwise the key.
const NUTRIENT_LABEL = new Map();
const withheld = ((MANIFEST.files || {})["medication_depletions.json"] || {}).withheld || [];
for (const name of [...withheld.map((w) => w.nutrient), ...require("../data/pipeline/medication_depletions.json").depletions.map((e) => e.depleted_nutrient.standard_name)]) {
  if (name) NUTRIENT_LABEL.set(normalizeText(name), name);
}
const NUTRIENTS = [...new Set([...Object.keys(NUTRIENT_WORDS), ...NUTRIENT_LABEL.keys()])].map((key) => ({
  key,
  label: NUTRIENT_LABEL.get(key) || key,
  re: new RegExp(`\\b(?:${[key, ...(NUTRIENT_WORDS[key] || [])].map(escapeRegex).join("|")})\\b`),
}));

/** The nutrients a text asks about (keys), ignoring words that are part of a medicine's name ("calcium channel blocker"). */
function nutrientsIn(text) {
  const t = normalizeText(String(text || "")).replace(new RegExp(MEDICINE_NAME.source, "g"), " ");
  return NUTRIENTS.filter((n) => n.re.test(t)).map((n) => n.key);
}
const nutrientLabel = (key) => (NUTRIENTS.find((n) => n.key === key) || { label: key }).label;

// A drug subject is named by its generic name: the class lists give it by RxCUI; otherwise the
// display name before any parenthesis ("Orlistat (fat-blocking weight-loss medication)").
const RXCUI_NAME = new Map(Object.values(CLASSES).flatMap((c) => (c.member_rxcuis || []).map((rx, i) => [rx, c.member_names[i]])));

/** Approved entries grouped by the medicine (drug or class) they are about, each with its matcher. */
function buildNotes(doc) {
  const subjects = new Map();
  for (const entry of ((doc && doc.depletions) || []).filter(isApproved)) {
    const ref = entry.drug_ref || {};
    if (!ref.id) continue;
    if (!subjects.has(ref.id)) {
      const type = ref.type === "class" ? "drug_class" : "drug";
      const name = type === "drug_class" ? ref.display_name : RXCUI_NAME.get(ref.id) || String(ref.display_name || "").replace(/\s*\(.*$/, "");
      subjects.set(ref.id, { id: ref.id, type, name, label: ref.display_name, re: agentMatcher(name, ref.id, type), entries: [] });
    }
    subjects.get(ref.id).entries.push(entry);
  }
  return [...subjects.values()];
}

let bundled = null;
/** The notes in the synced bundle (built on first use). */
const notes = () => (bundled ||= buildNotes(require("../data/pipeline/medication_depletions.json")));

/** The subjects a text names (any member, brand or class word). */
function subjectsIn(text, list = notes()) {
  const t = normalizeText(String(text || ""));
  return list.filter((s) => s.re.test(t));
}

module.exports = { isApproved, buildNotes, notes, subjectsIn, nutrientsIn, nutrientKey, nutrientLabel };

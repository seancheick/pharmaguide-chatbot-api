/**
 * Medication–nutrient notes from the PharmaGuide pipeline (scripts/data/medication_depletions.json).
 *
 * The pipeline owns these notes; chat quotes them. scripts/sync_pipeline.js copies the file into
 * src/data/pipeline/ keeping only entries that pass isApproved(), and this module applies the same rule
 * again when it loads the bundle, so an entry copied whole or from an older pipeline still fails closed.
 * Nothing clinical is written here: a reply names the nutrient and quotes alert_body + recommendation.
 */

const { normalizeText } = require("./normalize");
const { agentMatcher } = require("./pipelineInteractions");
const CLASSES = require("../data/pipeline/drug_classes.json").classes;

/**
 * The pipeline's two gates for consumer copy: the citation review is verified (the app's own rule) and
 * the exact current record is approved for controlled beta. Any other value, or a missing one, fails.
 */
function isApproved(entry) {
  const value = (k) => String((entry && entry[k]) || "").trim().toLowerCase();
  return value("citation_review_status") === "verified" && value("b1_clinical_approval_status") === "approved_for_controlled_beta";
}

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

module.exports = { isApproved, buildNotes, notes, subjectsIn };

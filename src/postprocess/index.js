const { normalizeText, escapeRegex } = require("../core/normalize");
const { mentionsMineralSpacingTrigger } = require("../gates/detection");

function mineralSpacingNote() {
  return "• **Timing note:** Minerals (magnesium/iron/calcium/zinc) can reduce absorption of **thyroid meds** and some **antibiotics** — separate by **2–4 hours**.";
}

function stripModelSpacingAdvice(text) {
  const lines = text.split("\n");
  const shouldRemoveLine = (line) => {
    const l = line.toLowerCase();
    const hasSpacingLanguage = l.includes("space") || l.includes("separate") || l.includes("absorption conflict") || l.includes("take at a different time") || l.includes("2-4 hours") || l.includes("2\u20134 hours");
    const mentionsTargets = l.includes("thyroid") || l.includes("levothyroxine") || l.includes("tetracycline") || l.includes("fluoroquinolone") || l.includes("antibiotic");
    const mentionsMinerals = l.includes("magnesium") || l.includes("iron") || l.includes("calcium") || l.includes("zinc") || l.includes("mineral");
    return hasSpacingLanguage && (mentionsTargets || mentionsMinerals);
  };
  let result = lines.filter((line) => !shouldRemoveLine(line)).join("\n");
  result = result.replace(/[,;.]*\s*(separate|space)\s+(this\s+)?(mineral|it|them)\s+(by\s+)?2[\u2013-]4\s+hours[^.]*\.?/gi, ".");
  result = result.replace(/\.\s*\./g, ".");
  return result.trim();
}

function enforceOneQuestion(text) {
  const questionPattern = /[^\n.!?]*\?/g;
  const questions = text.match(questionPattern);
  if (!questions || questions.length <= 1) return text;
  const questionsToRemove = questions.slice(0, -1);
  let result = text;
  for (const q of questionsToRemove) {
    const trimmed = q.trim();
    result = result.replace(new RegExp("\\n?[•\\-]?\\s*" + escapeRegex(trimmed) + "\\s*", ""), "\n");
  }
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Dose-over-limit post-processor.
 * Injects a warning into the reply if the user mentioned a dose that exceeds
 * the known upper limit from the knowledge base.
 *
 * @param {string} reply - LLM or gate reply text
 * @param {object[]} doses - from extractDoses()
 * @returns {string} reply with dose warning appended if needed
 */
function addDoseWarnings(reply, doses) {
  if (!doses || doses.length === 0) return reply;

  const overLimit = doses.filter(d => d.exceeds_upper_limit === true);
  if (overLimit.length === 0) return reply;

  const warnings = overLimit.map(d => {
    const name = (d.kb_entry || d.substance).charAt(0).toUpperCase() + (d.kb_entry || d.substance).slice(1);
    const freqNote = d.frequency > 1 ? ` (${d.amount} ${d.unit} x${d.frequency}/day = ${d.daily_amount} ${d.unit}/day)` : "";
    return `• **${name}**: ${d.daily_amount} ${d.unit}/day${freqNote} exceeds the recommended daily upper limit. Discuss with your prescriber or pharmacist before continuing at this dose.`;
  });

  const warningBlock = "\n\n**⚠ Dose flag:**\n" + warnings.join("\n");
  return reply + warningBlock;
}

/**
 * Strip Markdown link syntax from LLM responses.
 * Converts [text](url) → text (keeps the display text, drops the URL).
 * Also strips raw URLs that aren't emergency hotlines or pharmaguide.io.
 * This prevents ugly raw Markdown in frontends that don't render it.
 */
function stripMarkdownLinks(reply) {
  const ALLOWED_DOMAINS = ["pharmaguide.io"];
  return reply.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    // Keep allowed links as plain text with URL visible
    const isAllowed = ALLOWED_DOMAINS.some(d => url.toLowerCase().includes(d));
    if (isAllowed) return `${text} (${url})`;
    // Strip non-allowed URLs entirely — just keep the display text
    return text;
  });
}

// Citations the model writes are kept only when they are references we have verified against PubMed
// (src/config/references.js, scripts/verify_references.js) or the listed regulatory and fact-sheet
// sources. Anything else ("(Smith et al., Lancet 2019)") cannot be checked here, so it is removed:
// an invented citation in a health answer is worse than none.
const { REFERENCES } = require("../config/references");
const citeKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const VERIFIED_CITATIONS = Object.values(REFERENCES).map((r) => ({ key: citeKey(r.short), author: citeKey(String(r.short).split(/[ ,&]/)[0]), year: String(r.year) }));
// "(Author et al., Journal 2005)", "(NEJM, 2005)": starts with a capital, ends with a year.
const CITATION = /\s*\*?\(([A-Z][^()\n]{1,90}?[ ,]((?:19|20)\d{2}))\)\*?/g;
function isVerifiedCitation(inner, year) {
  const k = citeKey(inner);
  return VERIFIED_CITATIONS.some((v) => v.key === k || (v.year === year && v.author.length > 2 && k.split(" ")[0] === v.author));
}
function stripUnverifiedCitations(reply) {
  return String(reply).replace(CITATION, (match, inner, year) => (isVerifiedCitation(inner, year) ? match : ""));
}

module.exports = { stripUnverifiedCitations, mineralSpacingNote, stripModelSpacingAdvice, enforceOneQuestion, escapeRegex, addDoseWarnings, stripMarkdownLinks };

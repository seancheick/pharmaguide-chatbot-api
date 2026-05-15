const { normalizeText } = require("../core/normalize");
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

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  // [display text](url) → display text
  return reply.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

module.exports = { mineralSpacingNote, stripModelSpacingAdvice, enforceOneQuestion, escapeRegex, addDoseWarnings, stripMarkdownLinks };

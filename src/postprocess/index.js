const { normalizeText, escapeRegex } = require("../core/normalize");
const { mentionsMineralSpacingTrigger } = require("../gates/detection");
const { namesMedicine } = require("../core/pipelineInteractions");

// ── Timing: a spacing interval comes from a supplied verified record, never from the model ──────────
//
// For a question that pairs a medicine with a supplement, mineral or binding food (or that a supplied
// record covers), applyTimingPolicy removes every spacing interval and spacing instruction the model
// wrote, keeps everything else it said, and quotes the supplied records' management text. With no record
// to quote, it says there is none. It never writes an interval of its own.

const MINERAL = /\b(?:magnesium|iron|calcium|zinc)\b/i;

// A stated interval in any everyday form: "2 hours", "2-4 hrs", "6 h", "2+ hours", "2 or more hours",
// "2½ hours", "120 minutes", "two hours", "two to four hours", "a 4-hour gap", "an hour", "a few hours".
const NUM = String.raw`\d+(?:[.,]\d+)?(?:\s*[½¼¾])?`;
const WORD = String.raw`(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|forty[\s-]five|sixty|ninety)`;
const span = (n) => String.raw`${n}(?:\s*(?:-|–|—|to|or)\s*${n})?(?:\s*\+|\s+or\s+(?:more|longer|so))?`;
const INTERVAL_SOURCE = String.raw`\b(?:${span(NUM)}\s*-?\s*(?:hours?|hrs?|h|minutes?|mins?|min)\b|${span(WORD)}(?:\s+|-)(?:hours?|hrs?|minutes?|mins?)\b|(?:half\s+an?|a\s+half|a\s+few|a\s+couple(?:\s+of)?|couple(?:\s+of)?|an?|few|several)\s+(?:hours?|minutes?)\b)`;
const INTERVAL = new RegExp(INTERVAL_SOURCE, "i");

// What an interval can be other than spacing between two products: a dose frequency ("every 6 hours"),
// a time anchored to a meal, bed or a lab draw (a label direction such as "30–60 minutes before
// breakfast"), or a window of a day or more ("in 24 hours", "within 24 hours"). "4 hours between doses"
// stays spacing: the doses may be the two products'.
const DOSE_FREQUENCY_BEFORE = /\bevery\s+$/i;
const ANCHORED_AFTER = /^\s*(?:before|after|prior\s+to|ahead\s+of|following)\s+(?:(?:a|an|your|the|first|each|any)\s+)*(?:bed\w*|sleep\w*|breakfast|lunch|dinner|supper|meals?|eating|food|exercise|workouts?|waking|you\s+wake|you\s+eat|blood\s+(?:draws?|tests?|work)|labs?|lab\s+tests?)\b/i;
// A sentence about an emergency or a maximum dose is never touched.
const SAFETY_LINE = /\b(?:911|emergency|poison\s+control|urgent\s+care|seek\s+(?:immediate\s+|urgent\s+)?(?:medical\s+)?(?:care|help|attention)|do\s+not\s+exceed|maximum\s+(?:daily\s+)?dose|no\s+more\s+than\s+[\d,.]+\s*(?:mg|mcg|g|iu|doses?|tablets?|capsules?|pills?|times))\b/i;
// A clause about how a reaction or an effect runs ("symptoms usually start within 6 hours") is not spacing,
// unless it also says to separate, wait or keep apart.
const DESCRIBES_COURSE = /\b(?:symptoms?|signs?|onset|peaks?|peaking|lasts?|lasting|wears?\s+off|half[\s-]?life)\b/i;
const SPACING_VERB = /\b(?:separat\w*|spac\w*|apart|wait\w*|gap|between|later|away\s+from|(?:before|after)\s+(?:taking|you\s+take))\b/i;
// A spacing instruction with no number ("separate them", "take them at different times") about a medicine
// or mineral: the record, or the limit line, says how.
const SPACING_ACTION = /\b(?:separat\w*|space\s+(?:them|it|these|those|out|apart)|spac(?:ed|ing)|absorption\s+conflict|at\s+(?:a\s+)?different\s+times?)\b/i;
const SPACING_SUBJECT = /\b(?:thyroid|levothyroxine|tetracyclines?|fluoroquinolones?|quinolones?|antibiotics?|medications?|medicines?|meds|magnesium|iron|calcium|zinc|minerals?|them|it|both|the\s+two)\b/i;

const WORD_VALUE = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, sixty: 60, ninety: 90 };

function isSpacingInterval(clause, m) {
  const before = clause.slice(0, m.index);
  const after = clause.slice(m.index + m[0].length);
  if (DOSE_FREQUENCY_BEFORE.test(before) || ANCHORED_AFTER.test(after)) return false;
  if (DESCRIBES_COURSE.test(clause) && !SPACING_VERB.test(clause)) return false;
  if (/hours?|hrs?|\bh\b/i.test(m[0])) {
    const first = m[0].match(/\d+(?:[.,]\d+)?|[a-z]+/i)[0].toLowerCase();
    const value = /\d/.test(first) ? parseFloat(first.replace(",", ".")) : WORD_VALUE[first];
    if (value >= 24) return false;
  }
  return true;
}

const statesSpacing = (clause) => [...clause.matchAll(new RegExp(INTERVAL_SOURCE, "gi"))].some((m) => isSpacingInterval(clause, m));
const instructsSpacing = (clause) => SPACING_ACTION.test(clause) && SPACING_SUBJECT.test(clause);

// One sentence: drop the clauses that state spacing, keep the rest ("Zinc may reduce levothyroxine
// absorption, so separate them by 4 hours." keeps "Zinc may reduce levothyroxine absorption.").
function scrubSentence(sentence) {
  if (SAFETY_LINE.test(sentence)) return { text: sentence, removed: false };
  const clauses = sentence.split(/(?<=[,;:])\s+|\s+(?=[—–]\s)|\s+(?=(?:so|then|but)\s)/i);
  const kept = clauses.filter((c) => !statesSpacing(c) && !instructsSpacing(c));
  if (kept.length === clauses.length) return { text: sentence, removed: false };
  let text = kept.join(" ").trim()
    .replace(/[\s,;:—–-]+$/, "")
    .replace(/\s+(?:so|and|but|then|or)$/i, "")
    .replace(/^(?:[—–-]\s*)?(?:so|and|but|then|or)\s+/i, "");
  if (!/[\p{L}\p{N}]/u.test(text.replace(/\*\*[^*]*\*\*/g, ""))) return { text: "", removed: true };
  text = text.charAt(0).toUpperCase() + text.slice(1);
  const end = sentence.trim().match(/[.!?]$/);
  if (end && !/[.!?]$/.test(text)) text += end[0];
  return { text, removed: true };
}

function scrubSpacing(reply) {
  let removed = false;
  const lines = [];
  for (const line of String(reply || "").split("\n")) {
    const [, prefix = "", body] = line.match(/^(\s*(?:[-*•]|\d+[.)])\s+)?(.*)$/);
    const sentences = body.split(/(?<=[.!?])\s+(?=[\p{Lu}*"(])/u).map(scrubSentence);
    if (!sentences.some((s) => s.removed)) { lines.push(line); continue; }
    removed = true;
    const text = sentences.map((s) => s.text).filter(Boolean).join(" ");
    if (/[\p{L}\p{N}]/u.test(text.replace(/\*\*[^*]*\*\*/g, ""))) lines.push(prefix + text);
  }
  return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), removed };
}

const NO_TIMING_RECORD = "PharmaGuide has no reviewed timing record for this combination, so this answer gives no spacing interval. The label or your pharmacist can tell you how far apart to take them.";

/**
 * Timing from the verified records supplied for this request, quoted verbatim: every record that pairs
 * a medicine with a mineral, and every record whose management states an interval. Null when none.
 */
function recordTimingNote(records) {
  const isMineral = (r) => [1, 2].some((k) => r[`agent${k}_type`] === "supplement" && MINERAL.test(r[`agent${k}_name`] || ""));
  const quoted = (records || []).filter((r) => typeof r.management === "string" && r.management.trim() && (isMineral(r) || INTERVAL.test(r.management)));
  if (quoted.length === 0) return null;
  return quoted.map((r) => `• **Timing (PharmaGuide record, ${r.agent2_name} + ${r.agent1_name}):** ${r.management}`).join("\n");
}

/** The model's spacing goes; the supplied records' timing is quoted, or the reply says there is none. */
function applyTimingPolicy(reply, records) {
  const { text, removed } = scrubSpacing(reply);
  const note = recordTimingNote(records);
  const extra = note || (removed ? NO_TIMING_RECORD : null);
  return [text, extra].filter((p) => p && p.trim()).join("\n\n") || NO_TIMING_RECORD;
}

// Supplements, minerals and binding foods named in everyday words beyond the entity lists.
const PAIRED_WITH_MEDICINE = /\b(?:multi\s*vitamins?|multis?|prenatals?|vitamins?|supplements?|minerals?|antacids?|tums|rolaids|maalox|mylanta|milk\s+of\s+magnesia|dairy|milk|cheese|yogurt|juice|coffee|fiber)\b/;

/** Does this request pair a medicine with a supplement, mineral or binding food, or does a record cover it? */
function inTimingScope({ message, userText, entities, records }) {
  if ((records || []).length > 0) return true;
  if (mentionsMineralSpacingTrigger(message || "")) return true;
  const t = normalizeText(userText || message || "");
  const supplement = ((entities && entities.supplements) || []).length > 0 || PAIRED_WITH_MEDICINE.test(t);
  const medicine = ((entities && entities.meds) || []).length > 0 || namesMedicine(t);
  return supplement && medicine;
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

module.exports = { stripUnverifiedCitations, recordTimingNote, applyTimingPolicy, inTimingScope, NO_TIMING_RECORD, enforceOneQuestion, escapeRegex, addDoseWarnings, stripMarkdownLinks };

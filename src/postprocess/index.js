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
// A clause about how a reaction or an effect runs ("symptoms usually start within 6 hours"), or about sleep,
// is not spacing, unless it also says to separate, wait or keep apart.
const DESCRIBES_COURSE = /\b(?:symptoms?|signs?|onset|peaks?|peaking|lasts?|lasting|wears?\s+off|half[\s-]?life|sleep\w*|slept)\b/i;
// A duration per day or night ("5 hours per night", "2 hours a day") is how long something lasts, not spacing,
// unless the clause also says to separate, wait, or take one before or after the other.
const DURATION_AFTER = /^\s*(?:per|a|an|each|every)\s+(?:night|day|week)\b|^\s*of\s+sleep\b/i;
const SPACING_VERB = /\b(?:separat\w*|spac\w*|apart|wait\w*|gap|between|later|away\s+from|before|after)\b/i;
// A window of a day or more is spacing only when it is put between two products ("wait 24 hours between
// calcium and levothyroxine"), not when it times an effect or an avoidance ("for 48 hours after the last dose").
const LONG_SPACING_VERB = /\b(?:separat\w*|spac\w*|apart|between)\b/i;
// "Symptoms usually start within 6 hours after a dose change" times a reaction to a change in the medicine.
const AFTER_CHANGE = /^\s*(?:after|following)\s+(?:(?:a|the|any|each|your)\s+)?(?:dose\s+(?:change|increase|decrease|adjustment)s?|change\s+in\s+(?:the\s+|your\s+)?dose|starting|stopping|switching)\b/i;
// A spacing instruction with no number ("separate them", "take iron apart from milk", "take them at different
// times") about a medicine or mineral: the record, or the limit line, says how.
const SPACING_ACTION = /\b(?:separat\w*|space\s+(?:them|it|these|those|out|apart)|spac(?:ed|ing)|(?:tak(?:e|en|ing)|keep(?:ing)?|kept)\b[^.;,]*?\bapart|absorption\s+conflict|at\s+(?:a\s+)?different\s+times?)\b/i;
const SPACING_SUBJECT = /\b(?:thyroid|levothyroxine|tetracyclines?|fluoroquinolones?|quinolones?|antibiotics?|medications?|medicines?|meds|magnesium|iron|calcium|zinc|minerals?|them|it|both|the\s+two)\b/i;

const WORD_VALUE = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, sixty: 60, ninety: 90 };

function isSpacingInterval(clause, m) {
  const before = clause.slice(0, m.index);
  const after = clause.slice(m.index + m[0].length);
  if (DOSE_FREQUENCY_BEFORE.test(before) || ANCHORED_AFTER.test(after)) return false;
  if ((DURATION_AFTER.test(after) || DESCRIBES_COURSE.test(clause)) && !SPACING_VERB.test(clause)) return false;
  if (DESCRIBES_COURSE.test(clause) && AFTER_CHANGE.test(after) && !LONG_SPACING_VERB.test(clause) && !/\bwait\w*|\bgap\b/i.test(clause)) return false;
  if (/hours?|hrs?|\bh\b/i.test(m[0])) {
    const first = m[0].match(/\d+(?:[.,]\d+)?|[a-z]+/i)[0].toLowerCase();
    const value = /\d/.test(first) ? parseFloat(first.replace(",", ".")) : WORD_VALUE[first];
    if (value >= 24 && !LONG_SPACING_VERB.test(clause)) return false;
  }
  return true;
}

const statesSpacing = (clause) => [...clause.matchAll(new RegExp(INTERVAL_SOURCE, "gi"))].some((m) => isSpacingInterval(clause, m));
const instructsSpacing = (clause) => SPACING_ACTION.test(clause) && SPACING_SUBJECT.test(clause);
// A clause that puts time between two products ("take zinc 2 hours after ciprofloxacin").
const spacesProducts = (clause) => instructsSpacing(clause) || (SPACING_VERB.test(clause) && statesSpacing(clause));
// A removed clause that ends on a list ("…apart from milk,"): only the short segments after it that carry
// on that list ("cheese and yogurt") go with it.
const ENDS_ON_LIST = /\b(?:from|with|like|including|such\s+as|containing)\s+[^,;:]+,$/i;
// Verbs that start an instruction of its own.
const INSTRUCTION_VERB = String.raw`avoid|stop|tell|see|call|monitor|get|check|ask|keep|take|don'?t|do|never|talk|contact|seek|consult|use|drink|eat|let|watch|report|go|speak|follow|discuss|limit|skip|wait|try|consider|space|separate|leave|give|allow|make|have|hold|start|restart|continue|switch|read`;
// Words that start a clause or an instruction of its own, never the rest of a list.
const CLAUSE_OPENER = new RegExp(String.raw`^(?:[—–]|(?:(?:and|or)\s+)?(?:please\s+)?(?:so|but|then|which|while|because|if|as|since|though|although|unless|when|otherwise|this|that|it|they|you|i|we|${INSTRUCTION_VERB})\b)`, "i");
const CLAUSE_SPLIT = String.raw`(?<=[,;:])\s+|\s+(?=[—–]\s)|\s+(?=(?:so|then|but)\s)`;
// A safety sentence is also split before "and" + an instruction, so the safety part is kept word for word
// ("Do not exceed the maximum daily dose and separate them by 2 hours" keeps "Do not exceed the maximum daily dose").
const SAFETY_CLAUSE_SPLIT = new RegExp(String.raw`${CLAUSE_SPLIT}|\s+(?=and\s+(?:${INSTRUCTION_VERB})\b)`, "i");

// One sentence: drop the clauses that state spacing, keep the rest ("Zinc may reduce levothyroxine
// absorption, so separate them by 4 hours." keeps "Zinc may reduce levothyroxine absorption.").
// In an emergency or maximum-dose sentence only a clause that spaces two products goes; the emergency
// clause and any other stay ("Call 911 if…; take zinc 2 hours after ciprofloxacin" keeps "Call 911 if…").
function scrubSentence(sentence) {
  const safety = SAFETY_LINE.test(sentence);
  const clauses = sentence.split(safety ? SAFETY_CLAUSE_SPLIT : new RegExp(CLAUSE_SPLIT, "i"));
  const kept = [];
  let listOpen = false;
  for (const c of clauses) {
    const s = c.trim();
    const remove = safety ? !SAFETY_LINE.test(c) && spacesProducts(c) : statesSpacing(c) || instructsSpacing(c);
    // The rest of a removed clause's list goes with it ("…apart from milk, cheese and yogurt"); an
    // instruction or clause of its own after it stays ("…apart from levothyroxine, call your doctor").
    const tail = listOpen && !SAFETY_LINE.test(c) && !CLAUSE_OPENER.test(s) && s.split(/\s+/).length <= 4;
    const dropped = remove || tail;
    listOpen = dropped && /,$/.test(s) && (tail || ENDS_ON_LIST.test(s));
    // A removed clause's closing comma or semicolon still separates what is kept around it.
    const last = kept.length - 1;
    if (dropped && last >= 0 && /[,;]$/.test(s) && !/[,;:]$/.test(kept[last].trim())) kept[last] = kept[last].trimEnd() + s.slice(-1);
    if (!dropped) kept.push(c);
  }
  if (kept.length === clauses.length) return { text: sentence, removed: false };
  let text = kept.join(" ").trim()
    .replace(/[\s,;:—–-]+$/, "")
    .replace(/\s+(?:so|and|but|then|or)$/i, "")
    .replace(/^(?:[—–-]\s*)?(?:so|and|but|then|or)\s+/i, "");
  if (!/[\p{L}\p{N}]/u.test(text.replace(/\*\*[^*]*\*\*/g, ""))) return { text: "", removed: true };
  // A bare yes was conditional on the spacing just removed ("Yes, but separate them…"): it goes too. So does a
  // leftover that only qualified it with a negated time ("Space them 2 hours apart, not at night").
  if (/^(?:yes|yeah|yep|sure|okay|ok|absolutely|of\s+course|not\s+(?:(?:at|in|during|before|after|with|on)\s+)?(?:the\s+|a\s+)?(?:night|nighttime|bedtime|bed|morning|evening|afternoon|meals?|food|breakfast|lunch|dinner|once|together|same\s+time))$/i.test(text.replace(/[\s,.!*]+/g, " ").trim())) return { text: "", removed: true };
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

/**
 * Which parts of the system prompt a question needs.
 *
 * The prompt is stored as sections (src/config/systemPromptSections.js). Core sections hold every
 * rule and are ALWAYS sent. Topic sections hold domain guidance and are sent only when the question,
 * the last few user turns, the detected entities or the detected wellness goal touch that domain.
 * A missed topic costs optional guidance, never a rule.
 *
 * PG_PROMPT_MODE
 *   full        (default) every section for every provider: today's behaviour.
 *   selective   core plus the triggered topics, for every provider.
 *   fallback    full prompt for Gemini; core plus triggered topics only for the Groq fallback, whose
 *               free-tier limit (8,000 tokens per minute) the full prompt exceeds.
 */

const crypto = require("crypto");
const { SECTIONS, composePrompt } = require("../config/systemPromptSections");
const { normalizeText } = require("./normalize");
const { extractKnownItems } = require("./entities");
const { detectWellnessGoal } = require("../gates/detection");

const MODES = new Set(["full", "selective", "fallback"]);
const RECENT_USER_TURNS = 3;

function promptMode(env = process.env) {
  const mode = String(env.PG_PROMPT_MODE || "full").toLowerCase();
  return MODES.has(mode) ? mode : "full";
}

/** The question plus the last few user turns, so a follow-up ("what about iron?") keeps its topic. */
function contextOf(message, history) {
  const earlier = (history || []).filter((m) => m && m.role === "user" && typeof m.content === "string").slice(-RECENT_USER_TURNS).map((m) => m.content);
  return [...earlier, message].join(" ");
}

function selectSections({ message, history = [], entities = {} }, sections = SECTIONS) {
  const raw = contextOf(message, history);
  const text = normalizeText(raw);
  const itemCount = extractKnownItems(raw).size;
  const hasSupplement = (entities.supplements || []).length > 0;
  const hasWellnessGoal = detectWellnessGoal(raw).length > 0;

  // Sections whose selection also depends on what was detected, not only on words.
  const byDetection = {
    "supplement-form-guide": hasSupplement,
    "clinical-knowledge": (entities.meds || []).length > 0, // any medication: the interaction knowledge rides along
    "timing-optimizer": itemCount >= 4,
    "stack-review": itemCount >= 3,
    "wellness-goals": hasWellnessGoal,
  };
  return sections.filter((s) => s.kind === "core" || byDetection[s.id] === true || (s.triggers || []).some((re) => re.test(text)));
}

/** The prompt for one question. `mode` "full" is the whole prompt; anything else is core plus triggered topics. */
function buildSystemPrompt({ message, history, entities, mode = promptMode() }) {
  if (mode === "full") return composePrompt(SECTIONS);
  return composePrompt(selectSections({ message, history, entities }));
}

const promptHash = (text) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);

module.exports = { promptMode, selectSections, buildSystemPrompt, promptHash, MODES };

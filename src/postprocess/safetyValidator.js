/**
 * Post-response safety validator.
 * Runs on every reply (system + LLM) as defense-in-depth.
 * Returns { safe, violations[], fallback? }
 */

const SAFE_FALLBACK_REPLY = [
  "I want to make sure I give you accurate, safe information.",
  "",
  "• Could you **rephrase your question** with the specific supplement or medication name?",
  "• If you're experiencing symptoms, please contact your prescriber or pharmacist.",
  "",
  "I'm here to help with supplements, medications, and interactions.",
].join("\n");

function validateResponse(reply, route, entities, state) {
  const violations = [];
  const lower = reply.toLowerCase();

  // 1. No diagnosing language
  if (checkDiagnosingLanguage(lower)) {
    violations.push({ rule: "no_diagnosing", detail: "Reply contains diagnosing language" });
  }

  // 2. No stop-medication instructions
  if (checkStopMedInstructions(lower, route)) {
    violations.push({ rule: "no_stop_med", detail: "Reply instructs to stop prescribed medication" });
  }

  // 3. No dosing for pregnancy/children
  if (checkProhibitedDosing(lower, entities)) {
    violations.push({ rule: "no_prohibited_dosing", detail: "Reply provides dosing for pregnancy or children" });
  }

  // 4. Single question constraint
  if (checkMultipleQuestions(reply)) {
    violations.push({ rule: "single_question", detail: "Reply contains multiple questions" });
  }

  // 5. No prescribing language
  if (checkPrescribingLanguage(lower)) {
    violations.push({ rule: "no_prescribing", detail: "Reply contains prescribing language" });
  }

  // 6. Response length sanity
  if (reply.length > 5000) {
    violations.push({ rule: "length_limit", detail: "Reply exceeds 5000 characters" });
  }

  // 7. No empty response for safety routes
  if (route && route.startsWith("system:") && reply.trim().length === 0) {
    violations.push({ rule: "no_empty_safety", detail: "Safety route produced empty reply" });
  }

  const safe = violations.length === 0;
  return {
    safe,
    violations,
    fallback: safe ? null : SAFE_FALLBACK_REPLY,
  };
}

function checkDiagnosingLanguage(lower) {
  // Detects phrases where the bot appears to diagnose a condition
  // Excludes: "could be", "may be", "might be", "sounds like it could be"
  // Targets: "you have [condition]", "this is [condition]", "you are diagnosed with"
  const diagnosingPatterns = [
    /\byou have\b.{0,30}\b(disease|disorder|syndrome|condition|deficiency|infection|cancer|tumor|diabetes|hypothyroidism|hyperthyroidism)\b/,
    /\byou are (suffering from|diagnosed with|experiencing)\b/,
    /\bmy diagnosis is\b/,
    /\bi('m| am) diagnosing you\b/,
    /\bthis confirms (you have|a diagnosis of)\b/,
    /\byour diagnosis\b/,
  ];
  return diagnosingPatterns.some((p) => p.test(lower));
}

function checkStopMedInstructions(lower, route) {
  // Allow "stop the serotonergic supplement" in serotonin-urgent context
  if (route === "system:serotonin-urgent") return false;
  // Allow "stop" in context of supplements, not prescribed meds
  const stopPatterns = [
    /\bstop (taking (your )?|your )?(prescribed|medication|antidepressant|blood thinner|statin|insulin|thyroid med|blood pressure med|heart med)/,
    /\bdiscontinue your (prescribed|medication|antidepressant|blood thinner|statin)/,
    /\bquit (taking |your )?(prescribed|medication|antidepressant)/,
    /\bdo not take your (prescribed|medication|antidepressant)/,
  ];
  return stopPatterns.some((p) => p.test(lower));
}

function checkProhibitedDosing(lower, entities) {
  // Check if we're providing specific dosing for pregnancy or children
  const populations = entities?.populations || [];
  const isPregnancy = populations.includes("pregnancy") || /\bpregnan(t|cy)\b/.test(lower);
  const isChild = /\b(child|kid|infant|toddler|baby|pediatric|your (son|daughter))\b/.test(lower);

  if (!isPregnancy && !isChild) return false;

  // Check for specific dosing numbers in context of these populations
  const hasDosing = /\b(take|give|dose|dosage|recommend|suggest|try|administer)\b.{0,40}\b\d+\s*(mg|iu|mcg|ml|g|gram|milligram|microgram)\b/.test(lower);
  // Allow referring to upper limits (e.g., "upper limit is 3,000 mcg")
  const isUpperLimit = /\b(upper limit|maximum|not exceed|no more than|limit is)\b/.test(lower);

  return hasDosing && !isUpperLimit;
}

function checkMultipleQuestions(reply) {
  const questions = reply.match(/[^\n.!?]*\?/g);
  if (!questions) return false;
  // Filter out rhetorical or quoted questions
  const realQuestions = questions.filter((q) => {
    const t = q.trim();
    // Skip if inside quotes (prescriber prompts)
    if (/["*]/.test(t.charAt(0))) return false;
    // Skip if very short (likely part of a larger sentence)
    if (t.length < 10) return false;
    return true;
  });
  return realQuestions.length > 3; // Allow some flexibility — flag egregious cases
}

function checkPrescribingLanguage(lower) {
  const prescribingPatterns = [
    /\bi (am |)(prescribing|ordering|writing a prescription)\b/,
    /\btake this prescription\b/,
    /\bi recommend you take \d+\s*mg.{0,20}(daily|twice|three times).{0,20}for \d+ (days|weeks|months)\b/,
  ];
  return prescribingPatterns.some((p) => p.test(lower));
}

// ══════════════════════════════════════════════════
// Response linter — quality/style checks (non-blocking)
// Unlike validateResponse, lint warnings don't trigger fallback.
// Used for drift detection and quality monitoring.
// ══════════════════════════════════════════════════

// Prohibited jargon that makes responses less accessible
const PROHIBITED_PHRASES = [
  /\bbioavailability\b/,
  /\bpharmacokinetic/,
  /\bhalf[\s-]?life\b/,
  /\bserum (level|concentration)/,
  /\bplasma (level|concentration)/,
  /\btrough level/,
  /\barea under the curve\b/,
  /\bcytochrome p450\b/,  // use "liver enzyme" instead
  /\bfirst[\s-]?pass (metabolism|effect)/,
  /\brenal clearance\b/,   // use "kidney" instead
  /\bhepatic\b/,           // use "liver" instead
];

// Word count bands: gate replies are short, LLM can be longer
const WORD_COUNT_BANDS = {
  gate: { min: 20, max: 400 },
  llm: { min: 20, max: 500 },
};

/**
 * Lint a response for style/quality issues.
 * Returns { warnings: [{ rule, detail }], clean: boolean }.
 */
function lintResponse(reply, source, entities) {
  const warnings = [];
  const lower = reply.toLowerCase();
  const wordCount = reply.split(/\s+/).filter(w => w.length > 0).length;
  const band = source === "llm" ? WORD_COUNT_BANDS.llm : WORD_COUNT_BANDS.gate;

  // 1. Word count out of band
  if (wordCount < band.min) {
    warnings.push({ rule: "word_count_low", detail: `${wordCount} words (min: ${band.min})` });
  }
  if (wordCount > band.max) {
    warnings.push({ rule: "word_count_high", detail: `${wordCount} words (max: ${band.max})` });
  }

  // 2. Prohibited jargon
  for (const pattern of PROHIBITED_PHRASES) {
    if (pattern.test(lower)) {
      const match = lower.match(pattern);
      warnings.push({ rule: "prohibited_jargon", detail: `Contains "${match[0]}"` });
    }
  }

  // 3. Interaction intent should have severity context
  const hasInteractionIntent = entities && entities.intents && entities.intents.includes("interaction_check");
  if (hasInteractionIntent && source === "gate") {
    const hasSeverityMarker = /\*\*[^*]*(risk|caution|warning|safe|concern)/i.test(reply);
    if (!hasSeverityMarker) {
      warnings.push({ rule: "missing_severity_context", detail: "Interaction reply lacks bold severity marker" });
    }
  }

  // 4. Response coherence — shouldn't start with lowercased fragment
  if (/^[a-z]/.test(reply.trim()) && !reply.trim().startsWith("http")) {
    warnings.push({ rule: "starts_lowercase", detail: "Response starts with lowercase letter" });
  }

  return {
    warnings,
    clean: warnings.length === 0,
  };
}

module.exports = { validateResponse, SAFE_FALLBACK_REPLY, lintResponse, PROHIBITED_PHRASES, WORD_COUNT_BANDS };

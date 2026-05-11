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

  // 8. No fabricated URLs, emails, or non-emergency phone numbers (LLM only).
  // Strip them in place rather than rejecting the whole reply — the rest
  // of the content is usually legitimate and rejecting it would force
  // the SAFE_FALLBACK_REPLY and lose useful clinical context.
  let sanitizedReply = reply;
  if (route === "llm") {
    const stripped = stripFabricatedContactInfo(reply);
    if (stripped.changed) {
      sanitizedReply = stripped.reply;
      // Non-blocking — log it but don't fail the response.
      violations.push({
        rule: "stripped_fabricated_info",
        detail: "Stripped URLs/emails/phones from reply",
        nonBlocking: true,
      });
    }
  }

  // Only blocking violations gate the response. Non-blocking ones
  // (like the URL strip above) are recorded but pass through.
  const blockingViolations = violations.filter((v) => !v.nonBlocking);
  const safe = blockingViolations.length === 0;
  return {
    safe,
    violations,
    fallback: safe ? null : SAFE_FALLBACK_REPLY,
    // Sanitized reply — caller can use this in place of the raw LLM
    // output when safe (the URL strip is the only sanitization for now).
    sanitizedReply: safe ? sanitizedReply : null,
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
  // Rule fires only if the response is RECOMMENDING dosing FOR
  // pregnancy or children specifically — not when it merely mentions
  // those populations as context ("Pregnant women may need higher
  // intake — talk to your provider" is responsible clinical framing,
  // not a violation).
  //
  // Strategy: locate dosing lines and check whether each one is in
  // local proximity to a pregnancy/child mention WITHOUT an
  // educational/upper-limit qualifier nearby.

  const populations = entities?.populations || [];
  const hasPregnancyEntity = populations.includes("pregnancy");

  // Tokens that mark a passage as EDUCATIONAL / safe-context rather
  // than prescriptive. Generous list — matches the natural language
  // LLMs use when discussing dose ceilings and population caveats.
  const educationalRe =
    /\b(max|maximum|upper limit|tolerable upper|tolerable upper intake|ul\b|not exceed|do(?:n't| not) exceed|no more than|limit(?: is|ed to)?|ceiling|ceiling of|stay (?:under|below)|under|below|cap|capped|threshold|recommended daily allowance|rda|adequate intake|ai\b|reference daily intake|talk to (?:your |a )?(?:doctor|provider|prescriber|clinician|pharmacist|obstetrician|pediatrician)|consult (?:your |a )?(?:doctor|provider|prescriber|clinician|pharmacist|obstetrician|pediatrician)|under (?:medical|professional|clinician) (?:guidance|supervision))\b/;

  // Find each dosing-pattern hit and look at a generous local window
  // around it (±120 chars). If a pregnancy/child token is present
  // within that window AND no educational qualifier is, flag it.
  const dosingRe = /\b(take|give|dose|dosage|recommend|suggest|try|administer)\b.{0,40}\b\d+\s*(mg|iu|mcg|ml|g|gram|milligram|microgram)\b/g;
  const childRe = /\b(child|kid|infant|toddler|baby|pediatric|your (?:son|daughter))\b/;
  const pregnancyRe = /\bpregnan(?:t|cy)\b/;

  let match;
  while ((match = dosingRe.exec(lower)) !== null) {
    const start = Math.max(0, match.index - 120);
    const end = Math.min(lower.length, match.index + match[0].length + 120);
    const window = lower.slice(start, end);

    const localPregnancy = hasPregnancyEntity || pregnancyRe.test(window);
    const localChild = childRe.test(window);
    if (!localPregnancy && !localChild) continue;

    if (!educationalRe.test(window)) {
      return true;
    }
  }
  return false;
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

function checkFabricatedContactInfo(reply) {
  // Kept for back-compat with any caller checking the boolean.
  return stripFabricatedContactInfo(reply).changed;
}

/**
 * Strip non-allowlisted URLs, emails, and phone numbers from the reply.
 * Returns { reply, changed } — the sanitized text plus a flag so the
 * validator can record that the strip happened (for monitoring) without
 * rejecting the whole response.
 *
 * Allowlist: pharmaguide.io for URLs/emails; emergency hotlines for
 * phones (911, 988, Poison Control, SAMHSA, Crisis Textline).
 */
function stripFabricatedContactInfo(reply) {
  const ALLOWED_PHONES = ["911", "988", "1-800-222-1222", "1-888-426-4435", "1-855-764-7661", "741741"];
  const ALLOWED_DOMAINS = ["pharmaguide.io"];

  let changed = false;
  let out = reply;

  // URLs — replace non-allowlisted with the surrounding text minus the URL.
  out = out.replace(/https?:\/\/[^\s)]+|www\.[^\s)]+/gi, (match) => {
    const isAllowed = ALLOWED_DOMAINS.some((d) => match.toLowerCase().includes(d));
    if (isAllowed) return match;
    changed = true;
    return "";
  });

  // Emails — drop non-allowlisted.
  out = out.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (match) => {
    const isAllowed = ALLOWED_DOMAINS.some((d) => match.toLowerCase().includes(d));
    if (isAllowed) return match;
    changed = true;
    return "";
  });

  // Phones — drop non-emergency.
  out = out.replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, (match) => {
    const digits = match.replace(/\D/g, "");
    const isAllowed = ALLOWED_PHONES.some((p) => digits === p.replace(/\D/g, "") || digits.endsWith(p.replace(/\D/g, "")));
    if (isAllowed) return match;
    changed = true;
    return "";
  });

  // Tidy up artifacts from removal (double spaces, "(see )" stubs)
  if (changed) {
    out = out
      .replace(/\(\s*[,;:.]?\s*\)/g, "")
      .replace(/\[\s*\]/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([,.;:])/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return { reply: out, changed };
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

module.exports = {
  validateResponse,
  SAFE_FALLBACK_REPLY,
  lintResponse,
  stripFabricatedContactInfo,
  PROHIBITED_PHRASES,
  WORD_COUNT_BANDS,
};

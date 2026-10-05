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
  let sanitizedReply = reply;
  if (route === "llm") {
    const stripped = stripFabricatedContactInfo(reply);
    if (stripped.changed) {
      sanitizedReply = stripped.reply;
      violations.push({
        rule: "stripped_fabricated_info",
        detail: "Stripped URLs/emails/phones from reply",
        nonBlocking: true,
      });
    }
  }

  const blockingViolations = violations.filter((v) => !v.nonBlocking);
  const safe = blockingViolations.length === 0;
  return {
    safe,
    violations,
    fallback: safe ? null : SAFE_FALLBACK_REPLY,
    sanitizedReply: safe ? sanitizedReply : null,
  };
}

// Wording that makes a match harmless: "if you have kidney disease, avoid…" is a
// conditional, "you mentioned you have diabetes" repeats the user's own statement.
const CONDITIONAL_BEFORE = /\b(?:if|when|unless|whether|in case|should|even if|assuming|suppose|since|because|as|given|mentioned|said|told|noted|stated|shared|reported|know|ask|tell)\W+(?:\w+\W+){0,3}$/;
// "do not / never / without / before you stop…" protects the user instead of instructing them.
const NEGATED_OR_PROTECTIVE_BEFORE = /\b(?:do not|don't|dont|never|should not|shouldn't|must not|cannot|can't|not|without|before|avoid|unless|if you|whether|how to|when to|ask about|talk to .{0,30} about|no need to|says|tells you|told you|advises|recommends|instructs)\W+(?:\w+\W+){0,3}$/;
// "do not take your medication at the same time as calcium" is timing advice, not "skip your dose".
const TIMING_OR_COMBINATION_AFTER = /^\W*(?:\w+\W+){0,3}?(?:with|at the same time|together|alongside|within|hours?|apart|before|after|without|until|unless|if)\b/;

// True when at least one match of `re` is NOT neutralised by the text around it.
function hasUnneutralisedMatch(lower, re, { beforeOk, afterOk } = {}) {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m;
  while ((m = g.exec(lower)) !== null) {
    const prefix = lower.slice(Math.max(0, m.index - 40), m.index);
    const suffix = lower.slice(m.index + m[0].length, m.index + m[0].length + 60);
    if (beforeOk && beforeOk.test(prefix)) continue;
    if (afterOk && afterOk.test(suffix)) continue;
    return true;
  }
  return false;
}

function checkDiagnosingLanguage(lower) {
  const conditionalAware = [
    /\byou have\b.{0,30}\b(disease|disorder|syndrome|condition|infection|cancer|tumor|diabetes|hypothyroidism|hyperthyroidism)\b/,
    /\byou are (suffering from|diagnosed with|experiencing)\b/,
  ];
  if (conditionalAware.some((p) => hasUnneutralisedMatch(lower, p, { beforeOk: CONDITIONAL_BEFORE }))) return true;
  const diagnosingPatterns = [
    /\bmy diagnosis is\b/,
    /\bi('m| am) diagnosing you\b/,
    /\bthis confirms (you have|a diagnosis of)\b/,
    /\byour diagnosis\b/,
  ];
  return diagnosingPatterns.some((p) => p.test(lower));
}

function checkStopMedInstructions(lower, route) {
  if (route === "system:serotonin-urgent") return false;
  const stopOpts = { beforeOk: NEGATED_OR_PROTECTIVE_BEFORE };
  const instructToStop = [
    /\bstop (taking (your )?|your )?(prescribed|medication|antidepressant|blood thinner|statin|insulin|thyroid med|blood pressure med|heart med)/,
    /\bdiscontinue your (prescribed|medication|antidepressant|blood thinner|statin)/,
    /\bquit (taking |your )?(prescribed|medication|antidepressant)/,
  ];
  if (instructToStop.some((p) => hasUnneutralisedMatch(lower, p, stopOpts))) return true;
  return hasUnneutralisedMatch(lower, /\bdo not take your (prescribed|medication|antidepressant)/, { afterOk: TIMING_OR_COMBINATION_AFTER });
}

function checkProhibitedDosing(lower, entities) {
  const populations = entities?.populations || [];
  const hasPregnancyEntity = populations.includes("pregnancy");

  const educationalRe =
    /\b(max|maximum|upper limit|tolerable upper|tolerable upper intake|ul\b|not exceed|do(?:n't| not) exceed|no more than|limit(?: is|ed to|ing)?|ceiling|ceiling of|stay (?:under|below)|under|below|cap|capped|threshold|recommended daily allowance|rda|adequate intake|ai\b|reference daily intake|avoid|should avoid|do(?:n't| not) take|unsafe|risk|danger|caution|warning|linked to|associated with|birth defects?|teratogen|talk to (?:your |a )?(?:doctor|provider|prescriber|clinician|pharmacist|obstetrician|ob.?gyn|pediatrician)|consult (?:your |a )?(?:doctor|provider|prescriber|clinician|pharmacist|obstetrician|ob.?gyn|pediatrician)|under (?:medical|professional|clinician) (?:guidance|supervision)|discuss with|ask (?:your |a )?(?:doctor|provider|prescriber))\b/;

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
  const realQuestions = questions.filter((q) => {
    const t = q.trim();
    if (/["*]/.test(t.charAt(0))) return false;
    if (t.length < 10) return false;
    return true;
  });
  return realQuestions.length > 3;
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
  return stripFabricatedContactInfo(reply).changed;
}

function stripFabricatedContactInfo(reply) {
  const ALLOWED_PHONES = ["911", "988", "1-800-222-1222", "1-888-426-4435", "1-855-764-7661", "741741"];
  const ALLOWED_DOMAINS = ["pharmaguide.io"];

  let changed = false;
  let out = reply;

  out = out.replace(/https?:\/\/[^\s)]+|www\.[^\s)]+/gi, (match) => {
    const isAllowed = ALLOWED_DOMAINS.some((d) => match.toLowerCase().includes(d));
    if (isAllowed) return match;
    changed = true;
    return "";
  });

  out = out.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (match) => {
    const isAllowed = ALLOWED_DOMAINS.some((d) => match.toLowerCase().includes(d));
    if (isAllowed) return match;
    changed = true;
    return "";
  });

  out = out.replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, (match) => {
    const digits = match.replace(/\D/g, "");
    const isAllowed = ALLOWED_PHONES.some((p) => digits === p.replace(/\D/g, "") || digits.endsWith(p.replace(/\D/g, "")));
    if (isAllowed) return match;
    changed = true;
    return "";
  });

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

const PROHIBITED_PHRASES = [
  /\bbioavailability\b/,
  /\bpharmacokinetic/,
  /\bhalf[\s-]?life\b/,
  /\bserum (level|concentration)/,
  /\bplasma (level|concentration)/,
  /\btrough level/,
  /\barea under the curve\b/,
  /\bcytochrome p450\b/,
  /\bfirst[\s-]?pass (metabolism|effect)/,
  /\brenal clearance\b/,
  /\bhepatic\b/,
];

const WORD_COUNT_BANDS = {
  gate: { min: 20, max: 400 },
  llm: { min: 20, max: 500 },
};

function lintResponse(reply, source, entities) {
  const warnings = [];
  const lower = reply.toLowerCase();
  const wordCount = reply.split(/\s+/).filter(w => w.length > 0).length;
  const band = source === "llm" ? WORD_COUNT_BANDS.llm : WORD_COUNT_BANDS.gate;

  if (wordCount < band.min) {
    warnings.push({ rule: "word_count_low", detail: `${wordCount} words (min: ${band.min})` });
  }
  if (wordCount > band.max) {
    warnings.push({ rule: "word_count_high", detail: `${wordCount} words (max: ${band.max})` });
  }

  for (const pattern of PROHIBITED_PHRASES) {
    if (pattern.test(lower)) {
      const match = lower.match(pattern);
      warnings.push({ rule: "prohibited_jargon", detail: `Contains "${match[0]}"` });
    }
  }

  const hasInteractionIntent = entities && entities.intents && entities.intents.includes("interaction_check");
  if (hasInteractionIntent && source === "gate") {
    const hasSeverityMarker = /\*\*[^*]*(risk|caution|warning|safe|concern)/i.test(reply);
    if (!hasSeverityMarker) {
      warnings.push({ rule: "missing_severity_context", detail: "Interaction reply lacks bold severity marker" });
    }
  }

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

const { normalizeText } = require("./normalize");
const { extractKnownItems, ENTITY_PATTERNS } = require("./entities");
const detection = require("../gates/detection");

function buildConversationState(message, safeHistory) {
  // Combine all user messages + current message for entity accumulation
  const allUserText = [
    ...safeHistory.filter((m) => m.role === "user").map((m) => m.content),
    message,
  ].join(" ");

  const ctx = normalizeText(allUserText);

  // Extract accumulated meds and supplements
  const known_meds = [];
  for (const key of ["antidepressants", "stimulantMeds", "medications"]) {
    const p = new RegExp(ENTITY_PATTERNS[key].source, "g");
    let m;
    while ((m = p.exec(ctx)) !== null) {
      if (!known_meds.includes(m[0])) known_meds.push(m[0]);
    }
  }

  const known_supplements = [];
  for (const key of ["minerals", "supplements"]) {
    const p = new RegExp(ENTITY_PATTERNS[key].source, "g");
    let m;
    while ((m = p.exec(ctx)) !== null) {
      if (!known_supplements.includes(m[0])) known_supplements.push(m[0]);
    }
  }

  // Population flags
  const populations = [];
  if (detection.mentionsPregnancyContext(ctx)) populations.push("pregnancy");
  if (/\b(elderly|65\+|senior|geriatric|older\s*adult)\b/.test(ctx)) populations.push("elderly");
  if (/\b(kidney|renal|ckd|dialysis|creatinine|gfr|nephro)\b/.test(ctx)) populations.push("renal");

  // Thyroid condition
  let thyroid_condition = null;
  if (/\bhashimoto/.test(ctx)) thyroid_condition = "hashimotos";
  else if (/\bgraves\b/.test(ctx)) thyroid_condition = "graves";
  else if (/\bhypothyroid/.test(ctx)) thyroid_condition = "hypothyroid";
  else if (/\bhyperthyroid/.test(ctx)) thyroid_condition = "hyperthyroid";

  // Anticoagulant
  let anticoagulant = null;
  const acMatch = ctx.match(/\b(warfarin|eliquis|xarelto|pradaxa|plavix|aspirin|clopidogrel)\b/);
  if (acMatch) anticoagulant = acMatch[0];

  // Risk flags from current message
  const last_risk_flags = [];
  if (detection.mentionsHighRiskSerotonergic(ctx) && detection.mentionsAntidepressant(ctx)) last_risk_flags.push("serotonin");
  if (detection.mentionsAnticoagulantRiskSupplement(ctx) && detection.mentionsBloodThinner(ctx)) last_risk_flags.push("bleeding");
  if (detection.mentionsStimulantMed(ctx) && detection.mentionsStimulantSupp(ctx)) last_risk_flags.push("stimulant");
  if (detection.detectsLiverToxicityStack(ctx)) last_risk_flags.push("liver");

  // Last question asked by assistant
  let last_question_asked = null;
  const assistantMessages = safeHistory.filter((m) => m.role === "assistant");
  if (assistantMessages.length > 0) {
    const lastAssistant = assistantMessages[assistantMessages.length - 1].content;
    const questions = lastAssistant.match(/[^\n.!?]*\?/g);
    if (questions && questions.length > 0) {
      last_question_asked = questions[questions.length - 1].trim();
    }
  }

  // Turn count
  const turn_count = safeHistory.filter((m) => m.role === "user").length + 1;

  return {
    known_meds,
    known_supplements,
    populations,
    thyroid_condition,
    anticoagulant,
    last_risk_flags,
    last_question_asked,
    turn_count,
  };
}

module.exports = { buildConversationState };

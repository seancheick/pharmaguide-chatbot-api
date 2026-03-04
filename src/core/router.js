const { normalizeText } = require("./normalize");
const detection = require("../gates/detection");

function routeByRisk(scores, entities, convoContext, message, hasConversation) {
  const normalizedMsg = normalizeText(message);
  const ctx = convoContext;

  // 1. SSRI discontinuation (when serotonergic ingredients present)
  if (detection.detectsSSRIDiscontinuation(ctx)) return "system:ssri-discontinuation";

  // 2. serotonin_risk >= 3 → serotonin-urgent
  if (scores.serotonin_risk >= 3) return "system:serotonin-urgent";

  // 3. serotonin_risk >= 2 → serotonin-risk
  if (scores.serotonin_risk >= 2) return "system:serotonin-risk";

  // 4. bleeding_risk >= 2 → blood-thinner-risk
  if (scores.bleeding_risk >= 2) return "system:blood-thinner-risk";

  // 5. symptom triage (non-emergency symptoms + supplement context)
  if (detection.mentionsNonEmergencySymptom(message) && detection.mentionsSupplementOrDose(ctx)) {
    // 6. vitD + heart symptoms (specific sub-route)
    if (detection.mentionsHighDoseVitaminD(ctx) && detection.mentionsHeartSymptoms(message)) return "system:vitd-palpitations";
    return "system:symptom-triage";
  }

  // 6b. vitD + heart symptoms (standalone, context-aware)
  if (detection.mentionsHighDoseVitaminD(ctx) && detection.mentionsHeartSymptoms(message)) return "system:vitd-palpitations";

  // 7. pregnancy_teratogen >= 2 → pregnancy-retinol
  const prenatalInfoOnly = /\b(prenatal|multivitamin)\s+(has|contains?|includes?|lists?|says?)\b/.test(normalizeText(message)) && !/(add|take|start|also|extra|supplement|on top|plus|stack)\b/.test(normalizeText(message));
  if (!prenatalInfoOnly && scores.pregnancy_teratogen_risk >= 2) return "system:pregnancy-retinol";

  // 8. pregnancy + limited evidence
  if (detection.mentionsPregnancyContext(ctx) && detection.mentionsPregnancyLimitedEvidence(message)) return "system:pregnancy-limited";

  // 9. isotretinoin + vitamin A
  if (detection.detectsIsotretinoinVitA(ctx)) return "system:isotretinoin-vita";

  // 10. prenatal + fat-soluble stacking
  if (!prenatalInfoOnly && detection.mentionsPrenatalOrMulti(ctx) && detection.mentionsStandaloneFatSoluble(message)) return "system:stacking-risk";

  // 11. hepatotoxic_risk >= 2 → liver-toxicity
  if (scores.hepatotoxic_risk >= 2) return "system:liver-toxicity";

  // 12. absorption_risk >= 2 → charcoal-med
  if (scores.absorption_risk >= 2) return "system:charcoal-med";

  // 13. grapefruit / CYP3A4
  if (detection.detectsGrapefruitInteraction(ctx)) return "system:grapefruit-cyp3a4";

  // 14. Drug-drug interaction gates
  if (detection.detectsTripleWhammy(ctx)) return "system:triple-whammy";
  if (detection.detectsLithiumNSAID(ctx)) return "system:lithium-nsaid";
  if (detection.detectsNSAIDAnticoagulant(ctx)) return "system:nsaid-anticoagulant";
  if (detection.detectsPotassiumACEi(ctx)) return "system:potassium-acei";
  if (detection.detectsIodineThyroid(ctx)) return "system:iodine-thyroid";
  if (detection.detectsNiacinStatin(ctx)) return "system:niacin-statin";

  // 15. renal_clearance >= 2 → renal-magnesium
  if (scores.renal_clearance_risk >= 2) return "system:renal-magnesium";

  // 15b. metformin + alcohol
  if (detection.detectsMetforminAlcohol(ctx)) return "system:metformin-alcohol";

  // 16. medication clarifier
  if (!hasConversation && detection.needsMedicationClarifier(message)) return "system:clarifier";

  // 17. complex stack triage
  if (detection.isComplexStack(ctx)) {
    const riskFamilies = detection.detectRiskFamilies(ctx);
    if (riskFamilies.length > 0) return "system:stack-triage";
  }

  // 18. → LLM
  return "llm";
}

module.exports = { routeByRisk };

const { normalizeText } = require("./normalize");
const detection = require("../gates/detection");

const ROUTE_PRECEDENCE = [
  "system:ssri-discontinuation",
  "system:serotonin-urgent",
  "system:serotonin-risk",
  "system:blood-thinner-risk",
  "system:symptom-triage",
  "system:vitd-palpitations",
  "system:pregnancy-retinol",
  "system:pregnancy-limited",
  "system:isotretinoin-vita",
  "system:stacking-risk",
  "system:liver-toxicity",
  "system:charcoal-med",
  "system:grapefruit-cyp3a4",
  "system:triple-whammy",
  "system:lithium-nsaid",
  "system:nsaid-anticoagulant",
  "system:potassium-acei",
  "system:iodine-thyroid",
  "system:niacin-statin",
  "system:renal-magnesium",
  "system:metformin-alcohol",
  "system:clarifier",
  "system:stack-triage",
  "llm",
];

function routeByRisk(scores, entities, convoContext, message, hasConversation) {
  const normalizedMsg = normalizeText(message);
  const ctx = convoContext;
  
  const prenatalInfoOnly = /\b(prenatal|multivitamin)\s+(has|contains?|includes?|lists?|says?)\b/.test(normalizedMsg) && !/(add|take|start|also|extra|supplement|on top|plus|stack)\b/.test(normalizedMsg);

  // Evaluate each route exactly in the order defined by ROUTE_PRECEDENCE
  for (const route of ROUTE_PRECEDENCE) {
    if (route === "system:ssri-discontinuation" && detection.detectsSSRIDiscontinuation(ctx)) return route;
    if (route === "system:serotonin-urgent" && scores.serotonin_risk >= 3) return route;
    if (route === "system:serotonin-risk" && scores.serotonin_risk >= 2) return route;
    if (route === "system:blood-thinner-risk" && scores.bleeding_risk >= 2) return route;
    
    if (route === "system:symptom-triage") {
      if (detection.mentionsNonEmergencySymptom(message) && detection.mentionsSupplementOrDose(ctx)) {
        if (detection.mentionsHighDoseVitaminD(ctx) && detection.mentionsHeartSymptoms(message)) continue; // Handled by vitd-palpitations
        return route;
      }
    }
    
    if (route === "system:vitd-palpitations" && detection.mentionsHighDoseVitaminD(ctx) && detection.mentionsHeartSymptoms(message)) return route;
    if (route === "system:pregnancy-retinol" && !prenatalInfoOnly && scores.pregnancy_teratogen_risk >= 2) return route;
    if (route === "system:pregnancy-limited" && detection.mentionsPregnancyContext(ctx) && detection.mentionsPregnancyLimitedEvidence(message)) return route;
    if (route === "system:isotretinoin-vita" && detection.detectsIsotretinoinVitA(ctx)) return route;
    if (route === "system:stacking-risk" && !prenatalInfoOnly && detection.mentionsPrenatalOrMulti(ctx) && detection.mentionsStandaloneFatSoluble(message)) return route;
    if (route === "system:liver-toxicity" && scores.hepatotoxic_risk >= 2) return route;
    if (route === "system:charcoal-med" && scores.absorption_risk >= 2) return route;
    if (route === "system:grapefruit-cyp3a4" && detection.detectsGrapefruitInteraction(ctx)) return route;
    if (route === "system:triple-whammy" && detection.detectsTripleWhammy(ctx)) return route;
    if (route === "system:lithium-nsaid" && detection.detectsLithiumNSAID(ctx)) return route;
    if (route === "system:nsaid-anticoagulant" && detection.detectsNSAIDAnticoagulant(ctx)) return route;
    if (route === "system:potassium-acei" && detection.detectsPotassiumACEi(ctx)) return route;
    if (route === "system:iodine-thyroid" && detection.detectsIodineThyroid(ctx)) return route;
    if (route === "system:niacin-statin" && detection.detectsNiacinStatin(ctx)) return route;
    if (route === "system:renal-magnesium" && scores.renal_clearance_risk >= 2) return route;
    if (route === "system:metformin-alcohol" && detection.detectsMetforminAlcohol(ctx)) return route;
    if (route === "system:clarifier" && !hasConversation && detection.needsMedicationClarifier(message)) return route;
    
    if (route === "system:stack-triage" && detection.isComplexStack(ctx)) {
      const riskFamilies = detection.detectRiskFamilies(ctx);
      if (riskFamilies.length > 0) return route;
    }

    if (route === "llm") return route;
  }

  return "llm"; // Fallback
}

module.exports = { routeByRisk, ROUTE_PRECEDENCE };

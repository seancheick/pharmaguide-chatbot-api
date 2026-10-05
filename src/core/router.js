const { normalizeText } = require("./normalize");
const detection = require("../gates/detection");

const ROUTE_PRECEDENCE = [
  // Vasodilator + PDE5/nitrate runs near the top — combining
  // L-arginine/L-citrulline with sildenafil/tadalafil/etc. or any
  // nitrate can cause severe hypotension. Deterministic gate so
  // the user gets the contraindication BEFORE any LLM-generated
  // response that might soften the warning.
  "system:nitrate-vasodilator",
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
  "system:beta-blocker-stimulant",
  "system:ppi-nutrient",
  "system:statin-myopathy",
  "system:benzo-alcohol",
  "system:ginkgo-bleeding",
  "system:ototoxic-tinnitus",
  "system:nsaid-chronic",
  "system:clarifier",
  "system:medical-condition",
  "system:stack-triage",
  // Early-gate routes — these are intercepted by detection in chat.js
  // BEFORE routeByRisk runs (flirty/creator/pet/business/what-is/privacy/
  // depletion). Listed here
  // so the router_precedence test (which asserts every ROUTE_REPLY_MAP
  // key exists in ROUTE_PRECEDENCE) stays green. routeByRisk has no
  // detection branch for them — control never reaches these entries
  // from inside the router; they are valid model identifiers used by
  // the corresponding early gates in chat.js.
  "system:flirty",
  "system:flirty-repeat",
  "system:flirty-final",
  "system:creator",
  "system:pet-question",
  "system:business-inquiry",
  "system:what-is",
  "system:privacy",
  "system:depletion",
  "llm",
];

function routeByRisk(scores, entities, convoContext, message, hasConversation) {
  const normalizedMsg = normalizeText(message);
  const ctx = convoContext;
  
  const prenatalInfoOnly = /\b(prenatal|multivitamin)\s+(has|contains?|includes?|lists?|says?)\b/.test(normalizedMsg) && !/(add|take|start|also|extra|supplement|on top|plus|stack)\b/.test(normalizedMsg);

  // Vasodilator combo detection. Fires when:
  //   • drug-class signal contains "pde5_inhibitor" or "nitrate"
  //     (entity extractor already classified the medication), AND
  //   • the user mentioned a vasodilator supplement (L-arginine,
  //     L-citrulline, citrulline malate, high-dose niacin, yohimbine).
  const drugClasses = (entities && entities.drug_classes) || [];
  const hasPDE5OrNitrate = drugClasses.includes("pde5_inhibitor") || drugClasses.includes("nitrate");
  const vasodilatorSupp = /\b((?:l.?)?arginine|(?:l.?)?citrulline|citrulline\s+malate|niacin|yohimbine)\b/.test(ctx || normalizedMsg);
  const isNitrateVasodilatorCombo = hasPDE5OrNitrate && vasodilatorSupp;

  // Evaluate each route exactly in the order defined by ROUTE_PRECEDENCE
  for (const route of ROUTE_PRECEDENCE) {
    if (route === "system:nitrate-vasodilator" && isNitrateVasodilatorCombo) return route;
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
    if (route === "system:beta-blocker-stimulant" && detection.detectsBetaBlockerStimulant(ctx)) return route;
    if (route === "system:ppi-nutrient" && detection.detectsPPINutrientDepletion(ctx)) return route;
    if (route === "system:statin-myopathy" && detection.detectsStatinMyopathyRisk(ctx)) return route;
    if (route === "system:benzo-alcohol" && detection.detectsBenzoAlcohol(ctx)) return route;
    if (route === "system:ginkgo-bleeding" && detection.detectsGinkgoBleeding(ctx)) return route;
    if (route === "system:ototoxic-tinnitus" && detection.detectsMedInducedTinnitus(ctx)) return route;
    if (route === "system:nsaid-chronic" && detection.detectsChronicNSAIDUse(ctx)) return route;
    if (route === "system:clarifier" && !hasConversation && detection.needsMedicationClarifier(message)) return route;
    if (route === "system:medical-condition" && !hasConversation && detection.isMedicalConditionQuery(message)) return route;
    
    if (route === "system:stack-triage" && detection.isComplexStack(ctx)) {
      const riskFamilies = detection.detectRiskFamilies(ctx);
      if (riskFamilies.length > 0) return route;
    }

    if (route === "llm") return route;
  }

  return "llm"; // Fallback
}

module.exports = { routeByRisk, ROUTE_PRECEDENCE };

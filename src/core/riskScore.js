const { normalizeText } = require("./normalize");
const detection = require("../gates/detection");
const { getKBEntriesForEntities } = require("../config/knowledgeBase");
const { classifyMed, classifySupp } = require("./entityClassifier");

function scoreRisks(entities, normalizedText, convoContext) {
  const ctx = convoContext || normalizedText;

  // Build classified entity sets for robust detection
  const medClasses = new Set((entities.meds || []).map(m => classifyMed(m)));
  const suppClasses = new Set((entities.supplements || []).map(s => classifySupp(s)));

  // Serotonin risk: 0-3
  // Uses both regex detection AND entity classification for robustness
  let serotonin_risk = 0;
  const hasSerotonergicSupp = detection.mentionsHighRiskSerotonergic(ctx) || suppClasses.has("serotonergic");
  const hasAntidepressant = detection.mentionsAntidepressant(ctx) || medClasses.has("SSRI") || medClasses.has("SNRI") || medClasses.has("MAOI");
  if (hasSerotonergicSupp) {
    serotonin_risk = 1;
    if (hasAntidepressant) serotonin_risk = 2;
    if (medClasses.has("MAOI")) serotonin_risk = 3; // MAOIs are always high-risk with serotonergics
    if (serotonin_risk >= 2 && entities.symptoms.includes("serotonergic_symptoms")) serotonin_risk = 3;
  }

  // Bleeding risk: 0-3
  let bleeding_risk = 0;
  if (detection.mentionsAnticoagulantRiskSupplement(ctx)) {
    bleeding_risk = 1;
    if (detection.mentionsBloodThinner(ctx) || medClasses.has("anticoagulant")) bleeding_risk = 2;
    if (bleeding_risk >= 2 && /\bnattokinase\b/.test(normalizeText(ctx))) bleeding_risk = 3;
  }
  // Ginkgo with anticoagulants (via classifier)
  if (suppClasses.has("other_supp") && /\bginkgo\b/.test(normalizeText(ctx)) && medClasses.has("anticoagulant")) {
    bleeding_risk = Math.max(bleeding_risk, 2);
  }

  // Stimulant risk: 0-3
  let stimulant_risk = 0;
  const hasStimMed = detection.mentionsStimulantMed(ctx) || medClasses.has("stimulant");
  const hasStimSupp = detection.mentionsStimulantSupp(ctx);
  if (hasStimMed || hasStimSupp) {
    stimulant_risk = 1;
    if (hasStimMed && hasStimSupp) stimulant_risk = 2;
  }
  // Beta-blocker + stimulant → cardiovascular risk
  if (medClasses.has("beta_blocker") && hasStimMed) {
    stimulant_risk = Math.max(stimulant_risk, 2);
  }

  // Hepatotoxic risk: 0-3
  let hepatotoxic_risk = 0;
  if (detection.detectsLiverToxicityStack(ctx)) hepatotoxic_risk = 2;

  // Absorption risk: 0-3
  let absorption_risk = 0;
  if (detection.detectsCharcoalMed(ctx)) absorption_risk = 2;
  // PPI + mineral nutrient depletion
  if (medClasses.has("PPI") && (suppClasses.has("mineral") || suppClasses.has("vitamin"))) {
    absorption_risk = Math.max(absorption_risk, 1);
  }

  // Pregnancy teratogen risk: 0-3
  let pregnancy_teratogen_risk = 0;
  if (detection.mentionsPregnancyContext(ctx) && detection.mentionsRetinolRisk(normalizedText)) pregnancy_teratogen_risk = 2;
  // Retinoid + pregnancy via classifier
  if (entities.populations?.includes("pregnancy") && medClasses.has("retinoid")) pregnancy_teratogen_risk = 3;

  // Renal clearance risk: 0-3
  let renal_clearance_risk = 0;
  if (/\b(ckd|chronic kidney|kidney disease|dialysis|renal (failure|insufficiency|impairment)|stage [3-5]|gfr.{0,10}(below|under|less|\d{1,2}\b))\b/.test(normalizeText(ctx))) {
    if (/\bmagnesium\b/.test(normalizeText(ctx))) renal_clearance_risk = 2;
  }

  // CNS depression risk (new): benzo + alcohol or opioid + benzo
  let cns_depression_risk = 0;
  if (detection.detectsBenzoAlcohol(ctx)) cns_depression_risk = 2;

  // Myopathy risk (new): statin + fibrate/niacin/red yeast rice
  let myopathy_risk = 0;
  if (detection.detectsStatinMyopathyRisk(ctx)) myopathy_risk = 1;
  if (medClasses.has("statin") && /\b(gemfibrozil|red yeast rice)\b/.test(normalizeText(ctx))) myopathy_risk = 2;

  // Emergency risk
  const emergency_risk = detection.isEmergency(normalizedText);

  return {
    serotonin_risk,
    bleeding_risk,
    stimulant_risk,
    hepatotoxic_risk,
    absorption_risk,
    pregnancy_teratogen_risk,
    renal_clearance_risk,
    cns_depression_risk,
    myopathy_risk,
    emergency_risk,
  };
}

/**
 * Severity resolver — consolidates all signals into a deterministic severity.
 * Returns { severity, reason_codes[], top_domain, escalations[] }
 *
 * Escalation rules:
 * 1. symptoms + serotonergic combo → red (regardless of base)
 * 2. pregnancy + teratogen/limited → red
 * 3. polypharmacy + elderly → bump one tier (cap at red)
 * 4. validator violations → force degraded
 * 5. risk score >= 2 in any dimension → red
 * 6. risk score == 1 → yellow
 * 7. default → green
 */
function resolveSeverity(scores, entities, validationResult) {
  let severity = "green";
  const reasonCodes = [];
  const escalations = [];
  let topDomain = null;

  const populations = (entities && entities.populations) || [];
  const symptoms = (entities && entities.symptoms) || [];
  const meds = (entities && entities.meds) || [];
  const supplements = (entities && entities.supplements) || [];

  // Scan all risk dimensions
  const riskDimensions = [
    { key: "serotonin_risk", domain: "serotonin" },
    { key: "bleeding_risk", domain: "bleeding" },
    { key: "stimulant_risk", domain: "stimulant" },
    { key: "hepatotoxic_risk", domain: "hepatotoxic" },
    { key: "absorption_risk", domain: "absorption" },
    { key: "pregnancy_teratogen_risk", domain: "pregnancy_teratogen" },
    { key: "renal_clearance_risk", domain: "renal_clearance" },
    { key: "cns_depression_risk", domain: "cns_depression" },
    { key: "myopathy_risk", domain: "myopathy" },
  ];

  let highestScore = 0;
  for (const dim of riskDimensions) {
    const score = scores[dim.key] || 0;
    if (score > highestScore) {
      highestScore = score;
      topDomain = dim.domain;
    }
    if (score >= 2) {
      severity = "red";
      reasonCodes.push(`${dim.domain}_score_${score}`);
    } else if (score === 1 && severity !== "red") {
      severity = "yellow";
      reasonCodes.push(`${dim.domain}_score_1`);
    }
  }

  // Escalation 1: symptoms + serotonergic combo → red
  if (symptoms.includes("serotonergic_symptoms") && scores.serotonin_risk >= 1) {
    if (severity !== "red") {
      escalations.push("symptoms_serotonergic_escalation");
    }
    severity = "red";
    if (!reasonCodes.includes("serotonin_symptoms_active")) {
      reasonCodes.push("serotonin_symptoms_active");
    }
  }

  // Escalation 2: pregnancy + teratogen → red
  if (populations.includes("pregnancy") && scores.pregnancy_teratogen_risk >= 1) {
    if (severity !== "red") {
      escalations.push("pregnancy_teratogen_escalation");
    }
    severity = "red";
    if (!reasonCodes.includes("pregnancy_teratogen")) {
      reasonCodes.push("pregnancy_teratogen");
    }
  }

  // Escalation 3: polypharmacy + elderly → bump one tier
  const totalItems = meds.length + supplements.length;
  if (totalItems >= 5 && populations.includes("elderly")) {
    if (severity === "green") {
      severity = "yellow";
      escalations.push("polypharmacy_elderly_bump");
      reasonCodes.push("polypharmacy_elderly");
    } else if (severity === "yellow") {
      severity = "red";
      escalations.push("polypharmacy_elderly_bump");
      reasonCodes.push("polypharmacy_elderly");
    }
  }

  // Escalation 4: KB-aware population adjustments
  const allEntityNames = [...meds, ...supplements];
  if (allEntityNames.length > 0 && populations.length > 0) {
    const kbEntries = getKBEntriesForEntities(allEntityNames);
    for (const entry of kbEntries) {
      if (!entry.populations) continue;

      // Elderly: flag unsafe items, bump stimulant/NSAID thresholds
      if (populations.includes("elderly")) {
        if (entry.populations.elderly && entry.populations.elderly.safe === false) {
          if (severity === "green") severity = "yellow";
          else if (severity === "yellow") severity = "red";
          escalations.push(`elderly_unsafe_${entry.canonical}`);
          if (!reasonCodes.includes("elderly_kb_flag")) reasonCodes.push("elderly_kb_flag");
        }
      }

      // Renal: flag items where KB says unsafe
      if (populations.includes("renal")) {
        if (entry.populations.renal && entry.populations.renal.safe === false) {
          if (severity !== "red") {
            severity = "red";
            escalations.push(`renal_unsafe_${entry.canonical}`);
          }
          if (!reasonCodes.includes("renal_kb_flag")) reasonCodes.push("renal_kb_flag");
        }
      }

      // Pregnancy: flag items where KB says unsafe
      if (populations.includes("pregnancy")) {
        if (entry.populations.pregnancy && entry.populations.pregnancy.safe === false) {
          if (severity !== "red") {
            severity = "red";
            escalations.push(`pregnancy_unsafe_${entry.canonical}`);
          }
          if (!reasonCodes.includes("pregnancy_kb_flag")) reasonCodes.push("pregnancy_kb_flag");
        }
      }
    }
  }

  // Escalation 5: validator violations → degraded
  let forceDegraded = false;
  if (validationResult && !validationResult.safe) {
    forceDegraded = true;
    escalations.push("validator_forced_degraded");
    reasonCodes.push("validator_violations");
  }

  // Emergency override
  if (scores.emergency_risk) {
    severity = "red";
    topDomain = "emergency";
    if (!reasonCodes.includes("emergency")) reasonCodes.push("emergency");
  }

  return {
    severity,
    reason_codes: reasonCodes,
    top_domain: topDomain,
    escalations,
    force_degraded: forceDegraded,
  };
}

module.exports = { scoreRisks, resolveSeverity };

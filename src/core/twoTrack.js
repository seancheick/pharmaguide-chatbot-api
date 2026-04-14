const { ROUTE_REPLY_MAP } = require("../gates/replies");

function determineSeverityColor(scores) {
  // Any score >= 2 or emergency → red
  if (scores.emergency_risk) return "red";
  if (scores.serotonin_risk >= 2) return "red";
  if (scores.bleeding_risk >= 2) return "red";
  if (scores.hepatotoxic_risk >= 2) return "red";
  if (scores.absorption_risk >= 2) return "red";
  if (scores.pregnancy_teratogen_risk >= 2) return "red";
  if (scores.renal_clearance_risk >= 2) return "red";
  if ((scores.cns_depression_risk || 0) >= 2) return "red";
  if ((scores.myopathy_risk || 0) >= 2) return "red";

  // Any score >= 1 → yellow
  if (scores.serotonin_risk >= 1) return "yellow";
  if (scores.bleeding_risk >= 1) return "yellow";
  if (scores.stimulant_risk >= 1) return "yellow";
  if (scores.hepatotoxic_risk >= 1) return "yellow";
  if (scores.absorption_risk >= 1) return "yellow";
  if (scores.pregnancy_teratogen_risk >= 1) return "yellow";
  if (scores.renal_clearance_risk >= 1) return "yellow";
  if ((scores.cns_depression_risk || 0) >= 1) return "yellow";
  if ((scores.myopathy_risk || 0) >= 1) return "yellow";

  return "green";
}

function buildSafetyCore(route, convoContext, message, entities, state) {
  const replyFn = ROUTE_REPLY_MAP[route];
  if (!replyFn) return null;
  return replyFn(convoContext, message, entities);
}

function composeTwoTrackResponse(safetyReply, llmReply, severity) {
  // Current behavior: red/yellow → safety only, green → LLM only
  if (severity === "red") return { reply: safetyReply, source: "safety" };
  if (severity === "yellow") return { reply: safetyReply, source: "safety" };
  // green → LLM only
  return { reply: llmReply, source: "llm" };
}

module.exports = { determineSeverityColor, buildSafetyCore, composeTwoTrackResponse };

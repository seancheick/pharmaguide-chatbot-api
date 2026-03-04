const { getPolicyVersion } = require("../config/safetyPolicy");

function buildAuditEntry(route, scores, entities, state, message, latencyMs) {
  // Derive severity from scores
  const risk_flags = [];
  if (scores.serotonin_risk >= 1) risk_flags.push({ domain: "serotonin", level: scores.serotonin_risk });
  if (scores.bleeding_risk >= 1) risk_flags.push({ domain: "bleeding", level: scores.bleeding_risk });
  if (scores.stimulant_risk >= 1) risk_flags.push({ domain: "stimulant", level: scores.stimulant_risk });
  if (scores.hepatotoxic_risk >= 1) risk_flags.push({ domain: "hepatotoxic", level: scores.hepatotoxic_risk });
  if (scores.absorption_risk >= 1) risk_flags.push({ domain: "absorption", level: scores.absorption_risk });
  if (scores.pregnancy_teratogen_risk >= 1) risk_flags.push({ domain: "pregnancy_teratogen", level: scores.pregnancy_teratogen_risk });
  if (scores.renal_clearance_risk >= 1) risk_flags.push({ domain: "renal_clearance", level: scores.renal_clearance_risk });

  // Determine overall severity
  let severity = "green";
  if (risk_flags.some((f) => f.level >= 2) || scores.emergency_risk) severity = "red";
  else if (risk_flags.some((f) => f.level >= 1)) severity = "yellow";

  return {
    timestamp: new Date().toISOString(),
    route,
    severity,
    risk_flags,
    entity_counts: {
      meds: entities.meds ? entities.meds.length : 0,
      supplements: entities.supplements ? entities.supplements.length : 0,
    },
    turn_count: state ? state.turn_count : 1,
    message_length: message ? message.length : 0,
    latency_ms: latencyMs,
    policy_version: getPolicyVersion(),
    // NO raw message, NO entity names, NO PHI
  };
}

function emitAuditLog(entry) {
  if (process.env.NODE_ENV === "test") return;
  console.log(JSON.stringify(entry));
}

module.exports = { buildAuditEntry, emitAuditLog };

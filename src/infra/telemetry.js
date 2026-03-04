/**
 * Safety telemetry helpers.
 * In-memory counters for safety metrics. Reset on process restart (stateless-safe).
 * Used for dev/monitoring dashboards, not for persistent storage.
 */

const counters = {
  total_requests: 0,
  gate_fires: 0,
  llm_calls: 0,
  validator_catches: 0,
  emergency_routes: 0,
  severity_red: 0,
  severity_yellow: 0,
  severity_green: 0,
  route_counts: {},
  domain_flags: {},
};

function recordRequest(route, severity, validationResult) {
  counters.total_requests++;

  if (route === "llm") {
    counters.llm_calls++;
  } else {
    counters.gate_fires++;
  }

  if (route === "system:emergency") {
    counters.emergency_routes++;
  }

  if (severity === "red") counters.severity_red++;
  else if (severity === "yellow") counters.severity_yellow++;
  else counters.severity_green++;

  counters.route_counts[route] = (counters.route_counts[route] || 0) + 1;

  if (validationResult && !validationResult.safe) {
    counters.validator_catches++;
  }
}

function recordRiskFlags(riskFlags) {
  for (const flag of riskFlags) {
    const key = `${flag.domain}:${flag.level}`;
    counters.domain_flags[key] = (counters.domain_flags[key] || 0) + 1;
  }
}

function getMetrics() {
  return {
    ...counters,
    gate_fire_rate: counters.total_requests > 0
      ? (counters.gate_fires / counters.total_requests * 100).toFixed(1) + "%"
      : "0.0%",
    validator_catch_rate: counters.total_requests > 0
      ? (counters.validator_catches / counters.total_requests * 100).toFixed(1) + "%"
      : "0.0%",
  };
}

function resetMetrics() {
  counters.total_requests = 0;
  counters.gate_fires = 0;
  counters.llm_calls = 0;
  counters.validator_catches = 0;
  counters.emergency_routes = 0;
  counters.severity_red = 0;
  counters.severity_yellow = 0;
  counters.severity_green = 0;
  counters.route_counts = {};
  counters.domain_flags = {};
}

module.exports = { recordRequest, recordRiskFlags, getMetrics, resetMetrics };

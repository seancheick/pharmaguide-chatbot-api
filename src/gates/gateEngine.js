/**
 * Gate DSL engine — compiles and executes data-driven gate definitions.
 *
 * Simple pattern gates are defined in gates.json. Complex gates (serotonin
 * triage, blood thinner tiering, etc.) remain as code gates in replies.js.
 *
 * The engine:
 * 1. Loads gate definitions at require-time
 * 2. Compiles them into executable gate objects
 * 3. Provides a tryDSLGates() function that checks all DSL gates in order
 * 4. Provides a renderDSLReply() function that builds the response
 */

const gateDefinitions = require("./gates.json");
const detection = require("./detection");

// ── Compile gates at load time ──
const compiledGates = [];

for (const def of gateDefinitions.gates) {
  const detectionFn = detection[def.detection_fn];
  if (!detectionFn) {
    throw new Error(`Gate "${def.id}": detection function "${def.detection_fn}" not found in detection module`);
  }

  compiledGates.push({
    id: def.id,
    route: def.route,
    domain: def.domain,
    severity: def.severity,
    confidence: def.confidence || "high",
    reference_ids: def.reference_ids || [],
    detect: detectionFn,
    requiredFieldsRoute: def.required_fields_route,
    response: def.response,
  });
}

/**
 * Render a DSL gate reply from its response template.
 * Format: opening + bullet body + question (one question, always last).
 */
function renderDSLReply(gate) {
  const lines = [];

  lines.push(gate.response.opening);
  lines.push("");

  for (const item of gate.response.body) {
    lines.push("• " + item);
  }

  lines.push("");
  lines.push(gate.response.question);

  return lines.join("\n");
}

/**
 * Try all DSL gates against the given context.
 * Returns { matched: true, route, reply, gate } or { matched: false }.
 *
 * DSL gates are checked AFTER the main router decides the route —
 * this function is used as a reply generator, not as a router replacement.
 */
function tryDSLGate(route) {
  const gate = compiledGates.find(g => g.route === route);
  if (!gate) return { matched: false };

  return {
    matched: true,
    route: gate.route,
    reply: renderDSLReply(gate),
    confidence: gate.confidence,
    reference_ids: gate.reference_ids,
    gate,
  };
}

/**
 * Check if a route is handled by the DSL engine.
 */
function isDSLRoute(route) {
  return compiledGates.some(g => g.route === route);
}

/**
 * Get all compiled DSL gate definitions (for testing/auditing).
 */
function getCompiledGates() {
  return compiledGates.map(g => ({
    id: g.id,
    route: g.route,
    domain: g.domain,
    severity: g.severity,
    confidence: g.confidence,
    reference_ids: g.reference_ids,
  }));
}

/**
 * Validate all gate definitions are well-formed.
 */
function validateGateDefinitions() {
  const issues = [];
  const seenIds = new Set();
  const seenRoutes = new Set();

  for (const def of gateDefinitions.gates) {
    // Duplicate check
    if (seenIds.has(def.id)) issues.push(`Duplicate gate id: "${def.id}"`);
    seenIds.add(def.id);
    if (seenRoutes.has(def.route)) issues.push(`Duplicate gate route: "${def.route}"`);
    seenRoutes.add(def.route);

    // Required fields
    if (!def.id) issues.push("Gate missing id");
    if (!def.route) issues.push(`Gate "${def.id}": missing route`);
    if (!def.domain) issues.push(`Gate "${def.id}": missing domain`);
    if (!def.severity) issues.push(`Gate "${def.id}": missing severity`);
    if (!def.detection_fn) issues.push(`Gate "${def.id}": missing detection_fn`);

    // Detection function exists
    if (def.detection_fn && !detection[def.detection_fn]) {
      issues.push(`Gate "${def.id}": detection_fn "${def.detection_fn}" not found`);
    }

    // Confidence field (v2.0.0)
    if (def.confidence && !["high", "moderate", "low"].includes(def.confidence)) {
      issues.push(`Gate "${def.id}": invalid confidence "${def.confidence}" (must be high|moderate|low)`);
    }

    // Reference IDs (v2.0.0)
    if (def.reference_ids && !Array.isArray(def.reference_ids)) {
      issues.push(`Gate "${def.id}": reference_ids must be an array`);
    }

    // Response structure
    if (!def.response) {
      issues.push(`Gate "${def.id}": missing response`);
    } else {
      if (!def.response.opening) issues.push(`Gate "${def.id}": missing response.opening`);
      if (!def.response.body || !Array.isArray(def.response.body)) issues.push(`Gate "${def.id}": missing/invalid response.body`);
      if (!def.response.question) issues.push(`Gate "${def.id}": missing response.question`);
    }
  }

  return { valid: issues.length === 0, issues, gate_count: gateDefinitions.gates.length };
}

module.exports = {
  tryDSLGate,
  isDSLRoute,
  renderDSLReply,
  getCompiledGates,
  validateGateDefinitions,
  compiledGates,
};

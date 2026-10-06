/**
 * Gate DSL engine — compiles and executes data-driven gate definitions.
 *
 * gates.json holds each simple gate's metadata (route, domain, severity, confidence, detection
 * function, references). Reply text has one owner, replies.js (ROUTE_REPLY_MAP): gates.json used to
 * carry a second copy that had drifted (production served the copy without "contact your prescriber"
 * for tinnitus and without the form note for renal magnesium).
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
  });
}

/**
 * Try all DSL gates against the given context.
 * Returns { matched: true, route, reply, gate } or { matched: false }.
 *
 * DSL gates are checked AFTER the main router decides the route —
 * this function is used as a reply generator, not as a router replacement.
 */
function tryDSLGate(route, convoContext = "", message = "", entities = {}) {
  const gate = compiledGates.find(g => g.route === route);
  if (!gate) return { matched: false };
  const { ROUTE_REPLY_MAP } = require("./replies"); // lazy: replies.js loads detection too

  return {
    matched: true,
    route: gate.route,
    reply: ROUTE_REPLY_MAP[route](convoContext, message, entities),
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

    // Reply text has one owner: replies.js must have this route, and gates.json must not repeat it.
    if (def.response) issues.push(`Gate "${def.id}": reply text belongs in replies.js, not gates.json`);
    if (def.route && typeof require("./replies").ROUTE_REPLY_MAP[def.route] !== "function") {
      issues.push(`Gate "${def.id}": no reply for ${def.route} in replies.js`);
    }
  }

  return { valid: issues.length === 0, issues, gate_count: gateDefinitions.gates.length };
}

module.exports = {
  tryDSLGate,
  isDSLRoute,
  getCompiledGates,
  validateGateDefinitions,
  compiledGates,
};

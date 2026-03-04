/**
 * PHI-free analytics event builder + dashboard helpers.
 * Emits structured events for product decisions without storing any PHI.
 *
 * What is NOT stored: raw messages, entity names, IP addresses, doses, lab values, conversation history.
 */

const crypto = require("crypto");
const { getPolicyVersion } = require("../config/safetyPolicy");
const { classifyEntities } = require("../core/entityClassifier");

// ── Forbidden keys — schema guard ──
const FORBIDDEN_KEYS = new Set([
  "message", "raw_message", "ip", "entity_names",
  "meds", "supplements", "raw_ip", "doses", "lab_values",
]);

// ── Salt for IP hashing ──
const ANALYTICS_SALT = process.env.ANALYTICS_SALT || crypto.randomBytes(16).toString("hex");

// ── In-memory retry detection ──
const retryCooldown = new Map(); // ipHash → timestamp
const RETRY_WINDOW_MS = 15000;

// ── In-memory event accumulator (dashboard) ──
const eventBuffer = [];
const MAX_BUFFER = 2000;

// ── Latency bucketing ──
function bucketLatency(ms) {
  if (ms < 200) return "0-200ms";
  if (ms < 500) return "200-500ms";
  if (ms < 1000) return "500-1s";
  if (ms < 3000) return "1-3s";
  return "3s+";
}

// ── IP hash (HMAC-SHA256, truncated, never stores raw IP) ──
function hashForRetry(ip) {
  return crypto.createHmac("sha256", ANALYTICS_SALT)
    .update(String(ip || ""))
    .digest("hex")
    .slice(0, 12);
}

// ── Message hash for repeat detection ──
function hashMessage(normalizedText) {
  return crypto.createHash("sha256")
    .update(String(normalizedText || ""))
    .digest("hex")
    .slice(0, 12);
}

// ── Schema guard ──
function assertNoForbiddenKeys(event) {
  for (const key of Object.keys(event)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`Analytics event contains forbidden key: "${key}"`);
    }
  }
}

// ── Retry detection ──
function checkRetry(ipHash) {
  const now = Date.now();
  // Cleanup stale entries
  for (const [k, ts] of retryCooldown) {
    if (now - ts > RETRY_WINDOW_MS) retryCooldown.delete(k);
  }
  const lastTs = retryCooldown.get(ipHash);
  retryCooldown.set(ipHash, now);
  return lastTs ? (now - lastTs < RETRY_WINDOW_MS) : false;
}

// ── Repeat detection (stateless — checks against safeHistory) ──
function checkRepeat(currentMsgHash, safeHistory) {
  if (!safeHistory || safeHistory.length === 0) return false;
  for (const msg of safeHistory) {
    if (msg.role === "user" && hashMessage(msg.content) === currentMsgHash) {
      return true;
    }
  }
  return false;
}

/**
 * Build a PHI-free analytics event.
 */
function buildAnalyticsEvent(params) {
  const {
    route, scores, entities, message, safeHistory,
    latencyMs, validationResult, source, llmError,
    clientIP, misspellingCount, brandResolved, clarifierTriggered,
    unknownDosedCount, missingFields,
  } = params;

  const normalizedMsg = String(message || "").toLowerCase().trim();
  const ipHash = hashForRetry(clientIP);
  const msgHash = hashMessage(normalizedMsg);
  const isRetry = checkRetry(ipHash);
  const isRepeat = checkRepeat(msgHash, safeHistory);

  // Extract domains flagged from scores
  const domainsFlagged = [];
  if (scores && scores.risk_flags) {
    for (const flag of scores.risk_flags) {
      if (flag.domain && !domainsFlagged.includes(flag.domain)) {
        domainsFlagged.push(flag.domain);
      }
    }
  }

  // Determine severity
  let severity = "green";
  if (scores && scores.risk_flags) {
    for (const flag of scores.risk_flags) {
      if (flag.level >= 2) { severity = "red"; break; }
      if (flag.level >= 1) severity = "yellow";
    }
  }

  // Classify entities (no names stored)
  const classification = classifyEntities(entities || { meds: [], supplements: [] });

  // Validator violations
  const validatorViolations = [];
  if (validationResult && !validationResult.safe) {
    for (const v of (validationResult.violations || [])) {
      validatorViolations.push(v.rule);
    }
  }

  const event = {
    // Category 1: Domain/topic taxonomy
    ts: new Date().toISOString(),
    route: route || "unknown",
    severity,
    domains_flagged: domainsFlagged,
    intents: (entities && entities.intents) || [],
    populations: (entities && entities.populations) || [],
    validator_violations: validatorViolations,

    // Category 2: Unknown/missing info
    has_unknown_item: (entities && entities.unknowns && entities.unknowns.length > 0) || false,
    unknown_dosed_count: unknownDosedCount || 0,
    misspelling_count: misspellingCount || 0,
    brand_resolved: brandResolved || false,
    clarifier_triggered: clarifierTriggered || false,
    missing_fields: missingFields || [],

    // Category 3: Outcome metrics
    latency_ms: latencyMs || 0,
    latency_bucket: bucketLatency(latencyMs || 0),
    source: source || "gate",
    llm_error: llmError || null,
    is_retry: isRetry,
    is_repeat: isRepeat,

    // Category 4: Aggregate entity hints
    med_classes: classification.med_classes,
    supp_classes: classification.supp_classes,
    med_count: classification.med_count,
    supp_count: classification.supp_count,
    has_polypharmacy: classification.has_polypharmacy,

    // Metadata
    policy_version: getPolicyVersion(),
    message_length: (message || "").length,
    turn_count: (safeHistory || []).filter(m => m.role === "user").length + 1,
    has_conversation: (safeHistory || []).length > 0,
  };

  // Schema guard — throws if PHI leaks
  assertNoForbiddenKeys(event);

  return event;
}

/**
 * Emit analytics event to structured logs (only when ANALYTICS_ENABLED=true).
 */
function emitAnalyticsEvent(event) {
  if (process.env.ANALYTICS_ENABLED !== "true") return;
  if (process.env.NODE_ENV === "test") return;

  console.log(JSON.stringify({ _analytics: true, ...event }));

  // Buffer for dashboard helpers
  eventBuffer.push(event);
  if (eventBuffer.length > MAX_BUFFER) {
    eventBuffer.splice(0, eventBuffer.length - MAX_BUFFER);
  }
}

// ══════════════════════════════════════════════════
// Dashboard query helpers (in-memory, dev diagnostics)
// ══════════════════════════════════════════════════

function getTopDomains(n = 5) {
  const counts = {};
  for (const ev of eventBuffer) {
    for (const d of (ev.domains_flagged || [])) {
      counts[d] = (counts[d] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([domain, count]) => ({ domain, count }));
}

function getTopValidatorRules() {
  const counts = {};
  for (const ev of eventBuffer) {
    for (const rule of (ev.validator_violations || [])) {
      counts[rule] = (counts[rule] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([rule, count]) => ({ rule, count }));
}

function getTopMissingFields() {
  const counts = {};
  for (const ev of eventBuffer) {
    for (const field of (ev.missing_fields || [])) {
      counts[field] = (counts[field] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([field, count]) => ({ field, count }));
}

function getUnknownItemRate() {
  if (eventBuffer.length === 0) return { rate: 0, total: 0 };
  const withUnknown = eventBuffer.filter(ev => ev.has_unknown_item).length;
  return {
    rate: +(withUnknown / eventBuffer.length * 100).toFixed(1),
    total: eventBuffer.length,
  };
}

function getLatencyDistribution() {
  const buckets = { "0-200ms": 0, "200-500ms": 0, "500-1s": 0, "1-3s": 0, "3s+": 0 };
  for (const ev of eventBuffer) {
    const b = ev.latency_bucket;
    if (buckets[b] !== undefined) buckets[b]++;
  }
  return buckets;
}

function getLLMErrorRate() {
  const llmEvents = eventBuffer.filter(ev => ev.source === "llm" || ev.source === "degraded");
  if (llmEvents.length === 0) return { rate: 0, total: 0, errors: {} };
  const errors = {};
  for (const ev of llmEvents) {
    if (ev.llm_error) {
      errors[ev.llm_error] = (errors[ev.llm_error] || 0) + 1;
    }
  }
  const errorCount = Object.values(errors).reduce((s, c) => s + c, 0);
  return {
    rate: +(errorCount / llmEvents.length * 100).toFixed(1),
    total: llmEvents.length,
    errors,
  };
}

function getRetryRate() {
  if (eventBuffer.length === 0) return { rate: 0, total: 0 };
  const retries = eventBuffer.filter(ev => ev.is_retry).length;
  return {
    rate: +(retries / eventBuffer.length * 100).toFixed(1),
    total: eventBuffer.length,
  };
}

function getRepeatRate() {
  if (eventBuffer.length === 0) return { rate: 0, total: 0 };
  const repeats = eventBuffer.filter(ev => ev.is_repeat).length;
  return {
    rate: +(repeats / eventBuffer.length * 100).toFixed(1),
    total: eventBuffer.length,
  };
}

function getTopMedClasses(n = 5) {
  const counts = {};
  for (const ev of eventBuffer) {
    for (const cls of (ev.med_classes || [])) {
      counts[cls] = (counts[cls] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([cls, count]) => ({ class: cls, count }));
}

function getTopSuppClasses(n = 5) {
  const counts = {};
  for (const ev of eventBuffer) {
    for (const cls of (ev.supp_classes || [])) {
      counts[cls] = (counts[cls] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([cls, count]) => ({ class: cls, count }));
}

function getGrowthSignals() {
  if (eventBuffer.length < 2) return { rising: [], declining: [] };

  const mid = Math.floor(eventBuffer.length / 2);
  const firstHalf = eventBuffer.slice(0, mid);
  const secondHalf = eventBuffer.slice(mid);

  function domainCounts(events) {
    const counts = {};
    for (const ev of events) {
      for (const d of (ev.domains_flagged || [])) {
        counts[d] = (counts[d] || 0) + 1;
      }
    }
    return counts;
  }

  const first = domainCounts(firstHalf);
  const second = domainCounts(secondHalf);
  const allDomains = new Set([...Object.keys(first), ...Object.keys(second)]);

  const rising = [];
  const declining = [];
  for (const domain of allDomains) {
    const f = first[domain] || 0;
    const s = second[domain] || 0;
    if (s > f) rising.push(domain);
    else if (s < f) declining.push(domain);
  }

  return { rising, declining };
}

function getSnapshot() {
  return {
    total_events: eventBuffer.length,
    top_domains: getTopDomains(5),
    top_validator_rules: getTopValidatorRules(),
    top_missing_fields: getTopMissingFields(),
    unknown_item_rate: getUnknownItemRate(),
    latency_distribution: getLatencyDistribution(),
    llm_error_rate: getLLMErrorRate(),
    retry_rate: getRetryRate(),
    repeat_rate: getRepeatRate(),
    top_med_classes: getTopMedClasses(5),
    top_supp_classes: getTopSuppClasses(5),
    growth_signals: getGrowthSignals(),
  };
}

// ══════════════════════════════════════════════════
// Safety monitoring — abuse detection + alerting
// ══════════════════════════════════════════════════

// Default thresholds (overridable for testing)
const DEFAULT_THRESHOLDS = {
  emergency_max: 10,         // emergency gates per window
  jailbreak_max: 20,         // adversarial/off-topic attempts per window
  validator_catch_rate_max: 15, // % of responses failing validation
  retry_rate_max: 25,        // % of requests that are retries (quality signal)
};

/**
 * Safety snapshot — post-market surveillance for abuse + quality signals.
 * Returns counts, rates, and threshold alerts.
 */
function getSafetySnapshot(thresholds) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const total = eventBuffer.length;

  // Emergency gate count
  const emergencyCount = eventBuffer.filter(ev => ev.route === "system:emergency").length;

  // Adversarial/jailbreak proxy: off-topic + meta routes
  const jailbreakCount = eventBuffer.filter(ev =>
    ev.route === "system:off-topic" || ev.route === "system:meta"
  ).length;

  // Validator violation rate
  const violationCount = eventBuffer.filter(ev =>
    ev.validator_violations && ev.validator_violations.length > 0
  ).length;
  const violationRate = total > 0 ? +(violationCount / total * 100).toFixed(1) : 0;

  // Violations by rule
  const violationsByRule = {};
  for (const ev of eventBuffer) {
    for (const rule of (ev.validator_violations || [])) {
      violationsByRule[rule] = (violationsByRule[rule] || 0) + 1;
    }
  }

  // Retry rate
  const retryCount = eventBuffer.filter(ev => ev.is_retry).length;
  const retryRate = total > 0 ? +(retryCount / total * 100).toFixed(1) : 0;

  // Severity distribution
  const severityCounts = { red: 0, yellow: 0, green: 0 };
  for (const ev of eventBuffer) {
    if (severityCounts[ev.severity] !== undefined) severityCounts[ev.severity]++;
  }

  // Source distribution
  const sourceCounts = {};
  for (const ev of eventBuffer) {
    sourceCounts[ev.source] = (sourceCounts[ev.source] || 0) + 1;
  }

  // Threshold alerts
  const alerts = [];
  if (emergencyCount > t.emergency_max) {
    alerts.push({ rule: "emergency_spike", value: emergencyCount, threshold: t.emergency_max });
  }
  if (jailbreakCount > t.jailbreak_max) {
    alerts.push({ rule: "jailbreak_spike", value: jailbreakCount, threshold: t.jailbreak_max });
  }
  if (violationRate > t.validator_catch_rate_max) {
    alerts.push({ rule: "validator_catch_rate_high", value: violationRate, threshold: t.validator_catch_rate_max });
  }
  if (retryRate > t.retry_rate_max) {
    alerts.push({ rule: "retry_rate_high", value: retryRate, threshold: t.retry_rate_max });
  }

  return {
    total_events: total,
    emergency_count: emergencyCount,
    jailbreak_count: jailbreakCount,
    violation_count: violationCount,
    violation_rate: violationRate,
    violations_by_rule: violationsByRule,
    retry_count: retryCount,
    retry_rate: retryRate,
    severity_counts: severityCounts,
    source_counts: sourceCounts,
    alerts,
    has_alerts: alerts.length > 0,
  };
}

/**
 * Emit safety alert to logs if thresholds breached.
 */
function emitSafetyAlerts(thresholds) {
  if (process.env.ANALYTICS_ENABLED !== "true") return;
  if (process.env.NODE_ENV === "test") return;

  const snapshot = getSafetySnapshot(thresholds);
  if (snapshot.has_alerts) {
    console.log(JSON.stringify({ _safety_alert: true, ...snapshot }));
  }
}

// ── Test helpers ──
function _resetAnalytics() {
  eventBuffer.length = 0;
  retryCooldown.clear();
}

function _pushEvent(event) {
  eventBuffer.push(event);
}

module.exports = {
  // Core
  buildAnalyticsEvent,
  emitAnalyticsEvent,
  assertNoForbiddenKeys,
  // Hashing
  bucketLatency,
  hashForRetry,
  hashMessage,
  // Detection
  checkRetry,
  checkRepeat,
  // Dashboard
  getTopDomains,
  getTopValidatorRules,
  getTopMissingFields,
  getUnknownItemRate,
  getLatencyDistribution,
  getLLMErrorRate,
  getRetryRate,
  getRepeatRate,
  getTopMedClasses,
  getTopSuppClasses,
  getGrowthSignals,
  getSnapshot,
  // Safety monitoring
  getSafetySnapshot,
  emitSafetyAlerts,
  DEFAULT_THRESHOLDS,
  // Test helpers
  _resetAnalytics,
  _pushEvent,
  FORBIDDEN_KEYS,
};

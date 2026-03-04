const { ROUTE_PRECEDENCE } = require("../src/core/router");
const { ROUTE_REPLY_MAP } = require("../src/gates/replies");

let pass = 0, fail = 0, total = 0;
const failures = [];

function assert(label, condition) {
  total++;
  if (condition) { pass++; }
  else { fail++; console.log(`  FAIL  ${label}`); failures.push(label); }
}

console.log("\n── Router Precedence Tests ──");

// 1. Ensure no duplicates in ROUTE_PRECEDENCE
assert("ROUTE_PRECEDENCE contains no duplicates", (() => {
  const set = new Set(ROUTE_PRECEDENCE);
  return set.size === ROUTE_PRECEDENCE.length;
})());

// 2. Ensure all routes in ROUTE_PRECEDENCE exist in ROUTE_REPLY_MAP (except "llm")
assert("All routes in precedence exist in registry", (() => {
  for (const route of ROUTE_PRECEDENCE) {
    if (route === "llm") continue;
    if (!ROUTE_REPLY_MAP[route]) {
      console.log(`Missing in registry: ${route}`);
      return false;
    }
  }
  return true;
})());

// 3. Ensure all routes in ROUTE_REPLY_MAP exist in ROUTE_PRECEDENCE
assert("All routes in registry mapped in precedence", (() => {
  const precSet = new Set(ROUTE_PRECEDENCE);
  for (const route in ROUTE_REPLY_MAP) {
    if (!precSet.has(route)) {
        console.log(`Missing in precedence: ${route}`);
        return false;
    }
  }
  return true;
})());

console.log(`\n═══════════════════════════════════════════════════════════════`);
if (fail > 0) {
  console.log(`  ${fail} FAILED out of ${total}`);
  for (const f of failures) console.log(`    • ${f}`);
  process.exit(1);
} else {
  console.log(`  ALL TESTS PASSED: ${pass}/${total}`);
}
console.log(`═══════════════════════════════════════════════════════════════\n`);

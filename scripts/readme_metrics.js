#!/usr/bin/env node
/**
 * The numbers the README quotes, computed from the code, so documentation cannot drift.
 *
 *   node scripts/readme_metrics.js           print the table
 *   node scripts/readme_metrics.js --write   rewrite the block between the markers in README.md
 *   node scripts/readme_metrics.js --check   exit 1 if README.md's block is out of date (run by npm test)
 *
 * Only structural counts live here. Anything that changes with every commit
 * (lines of code, test-case totals) is deliberately left out; the CI badge covers tests.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const README = path.join(ROOT, "README.md");
const START = "<!-- metrics:start -->";
const END = "<!-- metrics:end -->";

function compute() {
  const { ROUTE_REPLY_MAP } = require("../src/gates/replies");
  const detection = require("../src/gates/detection");
  const kb = require("../src/config/knowledgeBase");
  const { REFERENCES } = require("../src/config/references");
  const { APPROVED_CLAIMS } = require("../src/config/approvedClaims");
  const policy = require("../src/config/safetyPolicy");
  const gates = require("../src/gates/gates.json");
  const { CANARIES } = require("../test/canaries");

  // The validator's rule names are the `rule: "..."` pushes inside validateResponse().
  const validatorSource = fs.readFileSync(path.join(ROOT, "src/postprocess/safetyValidator.js"), "utf8");
  const body = validatorSource.slice(
    validatorSource.indexOf("function validateResponse"),
    validatorSource.indexOf("function checkDiagnosingLanguage")
  );
  const validatorRules = new Set([...body.matchAll(/rule: "([a-z_]+)"/g)].map((m) => m[1]));

  const testFiles = fs.readdirSync(path.join(ROOT, "test")).filter((f) => f.endsWith(".test.js"));

  return [
    ["Deterministic response routes", Object.keys(ROUTE_REPLY_MAP).length],
    ["Declarative (data-driven) safety gates", gates.gates.length],
    ["Detection functions", Object.values(detection).filter((v) => typeof v === "function").length],
    ["Clinical knowledge entries", kb.getAllEntries().length],
    ["Curated source references", Object.keys(REFERENCES).length],
    ["Approved clinical claims (with review dates)", Object.keys(APPROVED_CLAIMS).length],
    ["Safety-policy domains", Object.keys(policy.SAFETY_POLICY.domains).length],
    ["Post-response validator rules", validatorRules.size],
    ["Pinned production canaries (replayable live)", `${CANARIES.length} (${CANARIES.filter((c) => !c.inProcessOnly).length})`],
    ["Test suites", testFiles.length],
  ];
}

function render(rows) {
  const lines = ["| Measured from the code | Count |", "|---|---:|", ...rows.map(([k, v]) => `| ${k} | ${v} |`)];
  return `${START}\n${lines.join("\n")}\n${END}`;
}

function currentBlock(readme) {
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (a === -1 || b === -1 || b < a) return null;
  return readme.slice(a, b + END.length);
}

function main() {
  const mode = process.argv[2];
  const block = render(compute());
  if (!mode) return console.log(block);

  const readme = fs.readFileSync(README, "utf8");
  const existing = currentBlock(readme);
  if (existing === null) {
    console.error(`README.md has no ${START} … ${END} block.`);
    process.exit(1);
  }
  if (mode === "--write") {
    fs.writeFileSync(README, readme.replace(existing, block));
    console.log("README.md metrics block updated.");
  } else if (mode === "--check") {
    if (existing !== block) {
      console.error("README.md metrics are out of date. Run: node scripts/readme_metrics.js --write\n\nExpected:\n" + block);
      process.exit(1);
    }
    console.log("README.md metrics are up to date.");
  } else {
    console.error(`Unknown option ${mode}`);
    process.exit(2);
  }
}

main();

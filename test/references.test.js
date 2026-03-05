/**
 * Reference database validation tests — ensures evidence chain integrity:
 * approvedClaims → references, gate reply citations → references.
 * Run: node test/references.test.js
 */

const { REFERENCES, getReferenceById, getReferencesForDomain, validateAllReferences } = require("../src/config/references");
const { APPROVED_CLAIMS, validateReferenceCoverage } = require("../src/config/approvedClaims");
const { SAFETY_POLICY } = require("../src/config/safetyPolicy");
const replies = require("../src/gates/replies");

let pass = 0, fail = 0, total = 0;
const failures = [];

function assert(condition, label) {
  total++;
  if (condition) { pass++; }
  else { fail++; failures.push(label); }
}

// === Reference Database Structure ===

(function testReferenceStructure() {
  const result = validateAllReferences();
  assert(result.valid, `validateAllReferences: ${result.issues.join("; ")}`);
})();

(function testReferenceCount() {
  const count = Object.keys(REFERENCES).length;
  assert(count >= 25, `references count >= 25 (got ${count})`);
})();

(function testEveryReferenceHasShort() {
  for (const [id, ref] of Object.entries(REFERENCES)) {
    assert(typeof ref.short === "string" && ref.short.length > 0, `${id} has non-empty short citation`);
  }
})();

(function testEveryReferenceHasYear() {
  for (const [id, ref] of Object.entries(REFERENCES)) {
    assert(typeof ref.year === "number" && ref.year >= 1950 && ref.year <= 2030, `${id} has valid year`);
  }
})();

(function testEveryReferenceHasType() {
  const validTypes = ["review", "meta-analysis", "original_research", "regulatory", "cohort_study",
    "rct", "case_series", "drug_reference", "editorial", "diagnostic_criteria",
    "position_paper", "reference", "systematic_review", "clinical_guideline"];
  for (const [id, ref] of Object.entries(REFERENCES)) {
    assert(validTypes.includes(ref.type), `${id} has valid type (got "${ref.type}")`);
  }
})();

// === Approved Claims → References Link ===

(function testEveryClaimHasReferenceIds() {
  const result = validateReferenceCoverage();
  assert(result.valid, `validateReferenceCoverage: ${result.issues.join("; ")}`);
})();

(function testEveryClaimReferenceResolves() {
  for (const [id, claim] of Object.entries(APPROVED_CLAIMS)) {
    for (const refId of (claim.reference_ids || [])) {
      const ref = getReferenceById(refId);
      assert(ref !== null, `${id} → reference "${refId}" resolves`);
    }
  }
})();

// === Domain Coverage ===

(function testEveryPolicyDomainHasReferences() {
  for (const domainId of Object.keys(SAFETY_POLICY.domains)) {
    const refs = getReferencesForDomain(domainId);
    assert(refs.length > 0, `domain "${domainId}" has ≥1 reference`);
  }
})();

// === Gate Reply Citations ===

const CITATION_PATTERN = /\*\(([^)]+)\)\*/g;

const CITED_REPLIES = {
  serotonergicWarningReply: "boyer-shannon-2005",
  bloodThinnerWarningReply: "sumi-1987",
  grapefruitInteractionReply: "bailey-2013",
  liverToxicityReply: "fda-kava-2002",
  pregnancyRetinolReply: "rothman-1995",
  potassiumACEiReply: "palmer-2004",
  nsaidAnticoagulantReply: "lanas-2006",
  tripleWhammyReply: "lapi-2013",
  chronicNSAIDReply: "lanas-2006",
  medInducedTinnitusReply: "rybak-1995",
};

(function testCitedRepliesContainCitations() {
  for (const [fnName, refId] of Object.entries(CITED_REPLIES)) {
    const fn = replies[fnName];
    assert(typeof fn === "function", `${fnName} exists as a function`);

    // Call with dummy context to get the reply text
    let text;
    if (fnName === "serotonergicWarningReply") {
      text = fn("I take 5-htp with sertraline");
    } else if (fnName === "bloodThinnerWarningReply") {
      text = fn("nattokinase with warfarin");
    } else if (fnName === "grapefruitInteractionReply") {
      text = fn("grapefruit with simvastatin");
    } else if (fnName === "liverToxicityReply") {
      text = fn("kava and acetaminophen");
    } else {
      text = fn();
    }

    // Verify the reply contains a citation
    const hasCitation = /\*\([^)]+\)\*/.test(text);
    assert(hasCitation, `${fnName} contains an inline citation`);

    // Verify the cited reference exists
    const ref = getReferenceById(refId);
    assert(ref !== null, `${fnName} cites valid reference "${refId}"`);

    // Verify the short citation text appears in the reply
    assert(text.includes(ref.short), `${fnName} contains short citation "${ref.short}"`);
  }
})();

// === getReferenceById / getReferencesForDomain ===

(function testGetReferenceById() {
  const ref = getReferenceById("boyer-shannon-2005");
  assert(ref !== null, "getReferenceById returns known reference");
  assert(ref.short === "Boyer & Shannon, NEJM 2005", "getReferenceById returns correct short");

  const missing = getReferenceById("nonexistent-ref");
  assert(missing === null, "getReferenceById returns null for unknown ID");
})();

(function testGetReferencesForDomain() {
  const serotoninRefs = getReferencesForDomain("serotonin");
  assert(serotoninRefs.length >= 2, `serotonin domain has ≥2 references (got ${serotoninRefs.length})`);

  const emptyRefs = getReferencesForDomain("nonexistent_domain");
  assert(emptyRefs.length === 0, "nonexistent domain returns empty array");
})();

// === Summary ===

console.log(`\n${"=".repeat(50)}`);
console.log(`References tests: ${pass} passed, ${fail} failed, ${total} total`);
if (failures.length > 0) {
  console.log("\nFailed:");
  failures.forEach(f => console.log(`  ✗ ${f}`));
}
console.log(`${"=".repeat(50)}\n`);
process.exit(fail > 0 ? 1 : 0);

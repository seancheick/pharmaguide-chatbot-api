/**
 * Drug classes have one owner (src/config/drugGroups.js); each gate names the groups it means.
 *
 * Found by diffing the gates' own lists (2026-10-06): the lists had drifted, so the same drug counted
 * for one gate and not another. A differential run of the old and new detectors over every test message
 * plus every group member paired with each gate's partner changed only the cases below.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const d = require("../src/gates/detection");
const { GROUPS, drugsRe } = require("../src/config/drugGroups");

test("drugs a gate's own list had missed are recognised", () => {
  const caught = [
    ["detectsLithiumNSAID", "I take lithium and piroxicam"],
    ["detectsTripleWhammy", "I take indomethacin, lisinopril and hydrochlorothiazide"],
    ["detectsTripleWhammy", "ketorolac with losartan and furosemide"],
    ["detectsChronicNSAIDUse", "I take piroxicam every day for my back"],
    ["detectsNSAIDAnticoagulant", "can I take ibuprofen with plavix?"],
    ["detectsNSAIDAnticoagulant", "ibuprofen while on fondaparinux"],
    ["detectsGinkgoBleeding", "I take heparin and ginkgo"],
    ["detectsGinkgoBleeding", "ginkgo with ticagrelor"],
    ["detectsBenzoAlcohol", "I take oxazepam and drink alcohol"],
    ["detectsBenzoAlcohol", "librium and a few beers"],
    ["detectsStatinMyopathyRisk", "I take fluvastatin and have muscle pain"],
    ["detectsStatinMyopathyRisk", "I take statins and gemfibrozil"],
  ];
  for (const [fn, m] of caught) assert.equal(d[fn](m), true, `${fn}: ${m}`);
});

test("deliberate differences between gates hold", () => {
  assert.equal(d.detectsLithiumNSAID("I take lithium and a baby aspirin"), false, "aspirin barely changes lithium levels");
  assert.equal(d.detectsTripleWhammy("aspirin with lisinopril and hydrochlorothiazide"), false);
  assert.equal(d.detectsNSAIDAnticoagulant("aspirin with warfarin"), true, "aspirin counts for bleeding");
  assert.equal(d.detectsGrapefruitInteraction("grapefruit juice with rosuvastatin"), false, "rosuvastatin is not a CYP3A4 statin");
  assert.equal(d.detectsGrapefruitInteraction("grapefruit juice with simvastatin"), true);
  assert.equal(d.detectsStatinMyopathyRisk("I started red yeast rice, is that safe long term?"), false, "red yeast rice alone is not a statin plus a risk factor");
  assert.equal(d.detectsNiacinStatin("niacin with red yeast rice"), true, "for the niacin gate it is a statin");
});

test("groups are well formed: every name compiles, appears in one group (a declared subset sits inside its parent), unknown groups are errors", () => {
  const SUBSETS = { CYP3A4_STATINS: "STATINS" }; // declared on purpose: a subset must sit wholly inside its parent
  for (const [sub, parent] of Object.entries(SUBSETS)) {
    for (const t of GROUPS[sub]) assert.ok(GROUPS[parent].includes(t), `${sub}: ${t} is not in ${parent}`);
  }
  const seen = new Map();
  for (const [g, terms] of Object.entries(GROUPS)) {
    if (SUBSETS[g]) continue;
    for (const t of terms) {
      assert.doesNotThrow(() => new RegExp(t), `${g}: ${t}`);
      assert.ok(!seen.has(t), `${t} is in both ${seen.get(t)} and ${g}`);
      seen.set(t, g);
    }
  }
  assert.throws(() => drugsRe("NOT_A_GROUP"));
});

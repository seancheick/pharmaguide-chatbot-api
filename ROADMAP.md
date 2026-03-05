# PharmaGuide Authority & Competitive Edge Roadmap

## Phase 0: Inline Citations + Reference Database ✅

**Goal:** Transform perceived credibility by adding verifiable clinical citations to gate replies.

- **`src/config/references.js`** — 30 curated clinical references covering all 21 safety domains (Boyer & Shannon NEJM 2005, Lanas et al. Am J Gastro 2006, Palmer NEJM 2004, etc.)
- **`src/gates/replies.js`** — Inline citations added to 10 highest-traffic gate replies (`*(Author, Journal Year)*` format)
- **`src/config/systemPrompt.js`** — LLM instructed to cite sources when naming specific risks/mechanisms
- **`src/config/approvedClaims.js`** — Every approved claim linked to references via `reference_ids[]`; `validateReferenceCoverage()` ensures integrity
- **`test/references.test.js`** — 190 tests validating reference structure, claim→reference links, domain coverage, citation correctness

---

## Phase 1: Knowledge Depth ✅

**Goal:** Move beyond regex-only detection to structured, verified clinical data for LLM augmentation.

- **`src/config/knowledgeBase.js`** — 35 structured entries (supplements + medications) with: aliases, forms (elemental %, absorption, GI tolerance), dose ranges, upper limits, timing, population safety (pregnancy/renal/elderly), interactions, common goals, reference links
- **`src/core/kbLookup.js`** — Builds compact KB context (~300 tokens) injected into LLM system messages; caps at 4 entities; includes population flags + interaction warnings with ⚠ markers
- **`src/core/doseExtractor.js`** — Parses doses from user messages (3 regex patterns: "500 mg magnesium", "magnesium 400mg", "50,000 IU/week of vitamin D"); compares against KB upper limits for risk flagging
- **`src/core/confidence.js`** — Confidence signal in every API response: gate/cache → "high", LLM+KB hits → "moderate", LLM-only → "low"
- **`src/infra/sessionMemory.js`** — Expanded to track `med_list` + `supp_list` (canonical names only, no PHI) with `buildMemoryContext()` for multi-turn awareness
- **`api/chat.js`** — Wired: KB-augmented LLM messages, dose extraction, confidence field in all response payloads
- **`test/knowledge.test.js`** — 380 tests covering KB structure, lookups, interactions, dose extraction, confidence, session memory

---

## Phase 2: Structural Upgrades ✅

**Goal:** Deepen clinical reasoning with population-aware risk scoring, temporal data, expanded DSL, and form-specific guidance.

### 2A: Population-Adjusted Risk Scoring
- `resolveSeverity()` now queries Knowledge Base for population safety flags
- Elderly: items with `populations.elderly.safe === false` → severity bump (e.g., ibuprofen for elderly)
- Renal: items with `populations.renal.safe === false` → force red (e.g., magnesium with CKD)
- Pregnancy: items with `populations.pregnancy.safe === false` → force red (e.g., kava in pregnancy)
- Escalation codes: `elderly_unsafe_*`, `renal_kb_flag`, `pregnancy_kb_flag`

### 2B: Temporal Context Engine
- **`src/core/temporalContext.js`** — Structured washout, onset, and half-life data for ~30 medications
- Covers: SSRIs (6), SNRIs (3), MAOIs (3), other antidepressants (3), mood stabilizers, stimulants (2), benzodiazepines (4), anticoagulants, NSAIDs (2), thyroid, supplements (2)
- Brand name alias map (Zoloft→sertraline, Xanax→alprazolam, Advil→ibuprofen, etc.)
- `getWashoutGuidance()` — Drug-specific washout with comparative context ("fluoxetine has a 5-week washout — longer than most SSRIs")
- `buildTemporalContext()` — Compact temporal block injected into LLM system messages

### 2C: DSL Gate Expansion
- `gates.json` upgraded from v1.0.0 to v2.0.0 — expanded from 6 to 12 DSL gates
- New gates: metformin-alcohol, renal-magnesium, isotretinoin-vita, ototoxic-tinnitus, nsaid-chronic, medical-condition
- New schema fields: `confidence` ("high"|"moderate"|"low"), `reference_ids[]`
- `gateEngine.js` updated: compiles, validates, and returns new fields; `tryDSLGate()` returns confidence + reference_ids
- `detectsRenalMagnesium()` added to detection.js (42 detection functions total)

### 2D: Persistent Session State ⏭️ (Deferred)
- Requires Vercel KV infrastructure setup — deferred to infrastructure sprint

### 2E: Form-Specific Gate Branching
- **`src/core/formAdvisor.js`** — Form detection and guidance engine
- `detectMentionedForm()` — Identifies specific supplement forms (glycinate, citrate, oxide, bisglycinate, etc.)
- `getSafeItemClarification()` — In serotonergic warnings, clarifies which items are NOT the concern ("Magnesium is not serotonergic — it's fine with your antidepressant. The concern is the 5-HTP.")
- `getRenalFormNote()` — Adds elemental % context for renal warnings ("glycinate is ~14% elemental magnesium")
- Integrated into `serotonergicWarningReply()` and `renalMagnesiumReply()`

### Phase 2 Tests
- **`test/phase2.test.js`** — 140 tests covering all Phase 2 components
- **Total test count: 1,870 across 12 suites — all passing**

---

## Phase 3: Long-Term Differentiation (Planned)

**Goal:** Build the moat — features no general health chatbot can match.

### 3A: Interaction Matrix — `src/config/interactionMatrix.js`
~100+ curated interaction pairs with: severity, mechanism, dose_dependent flag, dose_threshold, onset timing, alternatives, population_modifiers, references. Enables dose-aware, population-adjusted interaction detection for the supplement space — the killer feature.

### 3B: Alternative Suggestion Engine — `src/core/alternatives.js`
When flagging an unsafe combo, proactively suggest a safer alternative for the same goal. Example: "Instead of 5-HTP for sleep with Zoloft, try magnesium glycinate — here's why it's safer." This is the pharmacist-friend experience.

### 3C: Empathetic Tone Adaptation — `src/core/toneAdapter.js`
Detect anxiety level from message patterns (catastrophizing, multiple questions, "am I going to be okay"). Adjust response: reassurance first, simplify bullets, action step at top.

### 3D: Structured Output Schema
Evolve API response to include `structured` object: severity, confidence, mechanism_summary, items_flagged, references, alternative_suggestion, dose_assessment. Enables rich frontend cards instead of plain text.

### 3E: Clinical Governance Dashboard — `/api/governance`
Expose: all claims with review status, reference coverage stats, gate hit rates, claims due for review. Makes PharmaGuide auditable — "how do you know this?" has a real answer.

---

## Competitive Advantage Summary

| Capability | Claude Health / ChatGPT | PharmaGuide (current) |
|---|---|---|
| Interaction detection | LLM-dependent, may miss | Deterministic gates + LLM |
| Dose awareness | General knowledge | Structured KB with upper limits |
| Citations | Sometimes, often fabricated | Curated, validated, linked to claims |
| Form-specific guidance | Vague | KB-backed (glycinate vs oxide vs citrate) |
| Population adjustment | Sometimes mentions elderly | Programmatic severity bumps |
| Temporal data | Generic | Drug-specific washout/onset/half-life |
| Speed | 2-5s LLM | <50ms for gate replies |
| Auditability | None | Evidence chain with governance |
| Alternative suggestions | Generic | *Planned: goal-matched, interaction-checked* |

---

## Developer Guide: How to Expand PharmaGuide

This section is the playbook for growing every layer of PharmaGuide. Follow the patterns exactly — the system is designed so you can add clinical data without touching core logic.

---

### 1. Adding a New Entry to the Knowledge Base

**File:** `src/config/knowledgeBase.js`

Every supplement or medication PharmaGuide "deeply knows" lives here. To add a new one, copy this template and fill it in:

```js
ashwagandha: {
  canonical: "ashwagandha",                      // lowercase, matches entity extraction
  aliases: ["ksm-66", "sensoril", "withania"],   // brand names, abbreviations, common misspellings
  category: "supplement",                         // "supplement" | "medication" | "mineral" | "vitamin"
  forms: {
    "ksm-66": { elemental_pct: null, absorption: "high", gi_tolerance: "good", best_for: ["anxiety", "stress"] },
    sensoril: { elemental_pct: null, absorption: "high", gi_tolerance: "good", best_for: ["sleep", "cortisol"] },
  },
  adult_dose_range: { min: 300, max: 600, unit: "mg" },
  upper_limit: { value: 600, unit: "mg/day", source: "Clinical trials" },
  timing: { best_time: "morning or evening", with_food: true, separate_from: [] },
  populations: {
    pregnancy: { safe: false, notes: "Insufficient safety data. May have abortifacient properties." },
    renal: { safe: true, notes: "No known renal concerns at typical doses." },
    elderly: { safe: true, notes: "Generally well tolerated. Start at 300 mg." },
  },
  interactions: [
    { with: "thyroid medications", severity: "moderate", mechanism: "May increase thyroid hormone levels.", timing_fix: null },
    { with: "immunosuppressants", severity: "moderate", mechanism: "May stimulate immune system.", timing_fix: null },
  ],
  common_goals: ["anxiety", "stress", "sleep", "cortisol"],
  reference_ids: [],  // link to references.js IDs if you have them
},
```

**Checklist after adding:**
1. Add the canonical name to `src/core/entities.js` so entity extraction picks it up (in the `supplements` regex or the `SUPPLEMENT_NAMES` list)
2. Run `node test/knowledge.test.js` — it auto-validates structure
3. If you added aliases, test that `getKBEntry("ksm-66")` returns the entry

**What this unlocks automatically (zero extra code):**
- `kbLookup.js` injects this data into LLM context when user mentions it
- `doseExtractor.js` compares user doses against the `upper_limit`
- `resolveSeverity()` uses the `populations` flags for risk bumps
- `formAdvisor.js` can differentiate forms if the user mentions one

---

### 2. Adding a New Detection Function

**File:** `src/gates/detection.js`

Detection functions are simple boolean matchers: "does this message contain X pattern?" They power gates and risk scoring.

```js
function detectsNewInteraction(text) {
  const t = normalizeText(text);
  const hasItemA = /\b(drug_a|brand_name_a)\b/.test(t);
  const hasItemB = /\b(drug_b|brand_name_b)\b/.test(t);
  return hasItemA && hasItemB;
}
```

**Checklist:**
1. Add the function to `module.exports` at the bottom of `detection.js`
2. Write test cases in `test/full-suite.test.js` (positive match, negative match, edge cases)
3. Keep regexes simple — use `\b` word boundaries, lowercase matching via `normalizeText()`
4. Never use the `/g` flag on module-level regexes (lastIndex bug). Create fresh `RegExp` instances inside the function or use regex literals without `/g`

---

### 3. Adding a New Gate (DSL — Preferred)

**File:** `src/gates/gates.json`

DSL gates are the fastest way to add new safety gates. No code changes needed beyond the detection function.

```json
{
  "id": "new-interaction-id",
  "route": "system:new-interaction",
  "domain": "new_domain_name",
  "severity": "red",
  "confidence": "high",
  "detection_fn": "detectsNewInteraction",
  "required_fields_route": "system:new-interaction",
  "reference_ids": ["reference-id-from-references-js"],
  "response": {
    "opening": "**🔴 Opening statement about the risk.** *(Author, Journal Year)*",
    "body": [
      "First bullet explaining the mechanism.",
      "Second bullet with practical advice.",
      "**Bold action item** the user should take."
    ],
    "question": "**Follow-up question** to gather context from the user?"
  }
}
```

**Checklist:**
1. Create the detection function in `detection.js` (see section 2 above)
2. Add the gate definition to the `gates` array in `gates.json`
3. Add the route to `src/core/router.js` in `routeByRisk()` so the risk triage pipeline knows when to activate it
4. Run `node test/scaling.test.js` — it auto-validates all DSL gates (structure, detection function exists, reply renders)
5. Update the DSL gate count assertion in `test/scaling.test.js` (currently expects 12)
6. Add the route to the `dslRoutes` array in `test/scaling.test.js` for reply rendering tests

**When to use DSL vs code gates:**
- **DSL** (gates.json): Simple pattern gates — "if A and B are present, show this response." No branching logic needed.
- **Code** (replies.js): Complex gates that need context-dependent branching — serotonin triage (different reply based on which supplement + which antidepressant), blood thinner tiering (nattokinase vs fish oil vs ginkgo), complex stack triage.

---

### 4. Adding a New Code Gate (Complex)

**Files:** `src/gates/replies.js` + `src/core/router.js`

For gates that need branching logic:

```js
// In replies.js
function newComplexReply(convoContext, message, entities) {
  const t = normalizeText(convoContext);
  const lines = [];

  // Branch based on what's detected
  if (/specific_pattern/.test(t)) {
    lines.push("**🔴 Specific warning...**");
  } else {
    lines.push("**🟡 General warning...**");
  }

  lines.push("", "• Bullet point.", "", "**Follow-up question?**");
  return lines.join("\n");
}
```

**Checklist:**
1. Add the reply function to `replies.js`
2. Add it to the `ROUTE_REPLY_MAP` object: `"system:new-route": function(ctx, msg, ent) { return newComplexReply(ctx, msg, ent); }`
3. Add it to `module.exports`
4. Wire the route in `router.js` — add the detection check in the right priority position
5. Write tests in `test/full-suite.test.js` covering each branch

---

### 5. Expanding Severity & Risk Scoring

**File:** `src/core/riskScore.js`

Risk scoring has two parts: `scoreRisks()` (calculates 0-3 scores per dimension) and `resolveSeverity()` (consolidates into final severity).

**Adding a new risk dimension:**

```js
// In scoreRisks():
let new_dimension_risk = 0;
if (detection.detectsNewRiskA(ctx)) {
  new_dimension_risk = 1;
  if (detection.detectsNewRiskB(ctx)) new_dimension_risk = 2;
}

// Add to the return object:
return { ...existing, new_dimension_risk };
```

Then add it to the `riskDimensions` array in `resolveSeverity()`:

```js
const riskDimensions = [
  // ...existing dimensions
  { key: "new_dimension_risk", domain: "new_domain" },
];
```

**Score meanings:**
- `0` = not present → green (no impact)
- `1` = signal present → yellow
- `2` = confirmed risk → red
- `3` = urgent/active symptoms → red with escalation

**Adding a new escalation rule:**

Escalation rules override the base severity. Add them after the existing ones in `resolveSeverity()`:

```js
// Escalation N: your new rule
if (someCondition) {
  if (severity !== "red") {
    escalations.push("your_escalation_name");
  }
  severity = "red";
  if (!reasonCodes.includes("your_reason")) reasonCodes.push("your_reason");
}
```

**Current escalation order (maintain this priority):**
1. Symptoms + serotonergic combo → red
2. Pregnancy + teratogen → red
3. Polypharmacy + elderly → bump one tier
4. KB population flags (elderly/renal/pregnancy unsafe) → bump or force red
5. Validator violations → force degraded

---

### 6. Adding References

**File:** `src/config/references.js`

```js
"new-reference-id": {
  short: "Author et al., Journal Year",
  title: "Full title of the paper",
  source: "Journal Name, Volume(Issue), Pages",
  year: 2023,
  type: "meta-analysis",    // "review" | "meta-analysis" | "rct" | "guideline" | "case-report" | "fda"
  domains: ["domain_name"], // which safety domains this covers
},
```

**After adding:**
1. Link it to approved claims: add the ID to `reference_ids[]` in `src/config/approvedClaims.js`
2. Link it to DSL gates: add the ID to `reference_ids[]` in `src/gates/gates.json`
3. If adding a citation to a gate reply, use the format: `*(Short Citation)*`
4. Run `node test/references.test.js` — validates all links resolve

---

### 7. Adding Temporal Data (Washout/Onset/Half-Life)

**File:** `src/core/temporalContext.js`

```js
newmedication: {
  canonical: "newmedication",
  half_life_hours: 12,
  washout_days: 3,          // ~5 half-lives, rounded
  onset_days: { min: 14, max: 42 },
  notes: "Clinical notes about this medication.",
  category: "ssri",         // ssri | snri | maoi | ndri | benzodiazepine | anticoagulant | nsaid | stimulant | supplement | etc.
},
```

**If the medication has a common brand name**, add it to the `ALIAS_MAP`:

```js
const ALIAS_MAP = {
  // ...existing
  brandname: "newmedication",
};
```

**What this unlocks:** When the user mentions this medication and the query goes to the LLM, the temporal context is automatically injected as a system message with half-life, washout, and onset data.

---

### 8. Expanding Entity Extraction

**File:** `src/core/entities.js`

Entities are how the system understands what the user is talking about. There are four categories:

- **`meds`** — Prescription medications (sertraline, lisinopril, metformin, etc.)
- **`supplements`** — OTC supplements (magnesium, 5-HTP, ashwagandha, etc.)
- **`symptoms`** — Clinical symptoms (serotonergic_symptoms, palpitations, etc.)
- **`populations`** — Risk populations (pregnancy, elderly, renal)

**To add a new supplement/medication to entity extraction:**

Find the relevant regex pattern and add the name:

```js
// For supplements — find the supplement extraction regex
/\b(existing|names|new_supplement_name)\b/

// For medications — find the medication extraction regex
/\b(existing|names|new_medication_name)\b/
```

**Also update `intentScore()`** if the new entity should count toward supplement/medication intent scoring (helps the off-topic filter let relevant queries through).

---

### 9. Expanding Form-Specific Guidance

**File:** `src/core/formAdvisor.js`

**Adding form detection for a new supplement:**

1. Add forms to the KB entry in `knowledgeBase.js` (see section 1)
2. If the supplement has brand-name aliases that imply a form, add them to the `aliasFormMap` in `formAdvisor.js`:

```js
const aliasFormMap = {
  // ...existing
  newsupp: {
    "brand name form a": "form_a",
    "brand name form b": "form_b",
  },
};
```

**Adding safe item clarifications:**

To mark a supplement as "not serotonergic" for the serotonin warning clarification, add it to the `safeSupplements` array in `getSafeItemClarification()`:

```js
{ pattern: /\bnew_supp\b/, name: "New Supplement", note: "is not serotonergic and is safe with antidepressants" },
```

---

### 10. Adding a New Safety Domain

A "safety domain" is a clinical risk category (e.g., serotonin, bleeding, hepatotoxic). To add a new one:

1. **`src/config/safetyPolicy.js`** — Add the domain with evidence_refs linking to approved claims
2. **`src/config/approvedClaims.js`** — Add approved claims for the domain with governance metadata (review_date, review_cycle_months, status, tags, reference_ids)
3. **`src/config/references.js`** — Add clinical references backing the claims
4. **`src/gates/detection.js`** — Add detection function(s)
5. **`src/core/riskScore.js`** — Add risk dimension to `scoreRisks()` and `resolveSeverity()`
6. **`src/gates/gates.json`** or **`src/gates/replies.js`** — Add the gate reply
7. **`src/core/router.js`** — Wire the route
8. **Tests** — Add to `test/full-suite.test.js` (routing + reply content) and `test/safety-harness.test.js` (clinical ID validation)

---

### 11. Testing Checklist

Every change should pass **all 1,870 tests**. Run them with:

```bash
# Run all suites (fast — no API key needed)
for f in test/full-suite.test.js test/edge-cases.test.js test/safety-harness.test.js \
  test/validator.test.js test/adversarial.test.js test/analytics.test.js \
  test/operational.test.js test/scaling.test.js test/references.test.js \
  test/knowledge.test.js test/load.test.js test/phase2.test.js; do
  echo "=== $(basename $f) ===" && node "$f" 2>&1 | grep -E "(PASSED|passed|FAIL|failed)" | head -2
done
```

**Key test files to update when expanding:**

| What you changed | Update these tests |
|---|---|
| Knowledge base entry | `test/knowledge.test.js` (auto-validates structure) |
| Detection function | `test/full-suite.test.js` (positive + negative cases) |
| DSL gate | `test/scaling.test.js` (gate count + route list) |
| Code gate reply | `test/full-suite.test.js` + `test/golden-traces.test.js` |
| Risk scoring | `test/full-suite.test.js` + `test/phase2.test.js` |
| Reference | `test/references.test.js` (auto-validates links) |
| Approved claim | `test/operational.test.js` (governance checks) |
| Temporal data | `test/phase2.test.js` |

---

### 12. Architecture Rules (Do Not Break)

1. **No new npm dependencies** — everything is vanilla Node.js
2. **No persistent state** — Vercel serverless, no filesystem writes at runtime
3. **No PHI in logs/analytics** — entity names, messages, and doses are NEVER stored. Only coarse classes (e.g., "ssri", "mineral") and counts
4. **Fresh RegExp per call** — never use `/g` flag on module-level regex (lastIndex bug)
5. **Gate replies have no disclaimers** — the frontend UI handles disclaimers globally
6. **Dev-only debug fields** — `_scores`, `_entities`, `_validation`, `_kb_hits`, `_dose_summary`, `_confidence_label` are gated behind `NODE_ENV=development`
7. **Evidence chain** — every clinical claim must trace back: `safetyPolicy.js` → `approvedClaims.js` → `references.js`. No orphan claims.
8. **DSL gates for simple patterns, code gates for complex branching** — don't put branching logic in JSON
9. **Test before merge** — all 1,870 tests must pass. No exceptions.

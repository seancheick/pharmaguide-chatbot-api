# PharmaGuide AI — Roadmap, Architecture & Expansion Guide

> **Last updated:** March 5, 2026
> **Purpose:** This file is the single source of truth for what PharmaGuide has built, what's in progress, what's next, and how to expand every system. Any AI agent or developer working on this codebase should read this file first.

---

## Mission

PharmaGuide AI is a **free, clinician-grade supplement and medication safety tool**. The goal: make interaction checks, dosing guidance, and safety awareness accessible to everyone — not just people who can afford a pharmacist consult. We aim to be the most trusted, fastest, and most accurate AI for supplement-medication interactions.

**Website:** pharmaguide.io | **Email:** info@pharmaguide.io

---

## Architecture Overview

PharmaGuide uses a **dual-path architecture**: deterministic safety gates (instant, <50ms) handle known high-risk patterns with verified clinical data, while a **multi-provider LLM chain** handles general queries augmented with our knowledge base. The chain is **Gemini 2.5 Flash (primary)** → **Groq Llama 3.3 70B (fallback)** → deterministic degraded reply if both fail. Every response passes through a post-response safety validator.

```
User Message
  │
  ├── Emergency? ──→ Emergency reply (911, Poison Control, 988)
  ├── Greeting? ──→ Welcome reply (first message only)
  ├── Thanks/Goodbye? ──→ Social reply
  ├── Flirty? ──→ 3-stage escalating deflection
  ├── Creator question? ──→ Sean Cheick / PharmaGuide team credit
  ├── Pet question? ──→ Vet redirect + ASPCA Poison Control
  ├── Business/Features? ──→ pharmaguide.io links (features, careers, email)
  ├── Creative request? ──→ Off-topic redirect
  ├── Off-topic (low intent)? ──→ Redirect to supplements/meds
  ├── Medical condition (no supp context)? ──→ Redirect to provider
  │
  ├── Risk Triage Pipeline ──→ 45+ detection functions
  │     ├── Serotonin risk (SSRI + 5-HTP/St. John's/etc.)
  │     ├── Bleeding risk (blood thinner + turmeric/nattokinase/etc.)
  │     ├── Liver toxicity (kava + alcohol + acetaminophen)
  │     ├── Drug-drug gates (NSAID+anticoagulant, triple whammy, lithium+NSAID, metformin+alcohol)
  │     ├── Population gates (pregnancy+retinol, renal+magnesium, chronic NSAID)
  │     ├── Supplement stacking (prenatal + standalone fat-soluble)
  │     ├── 12 DSL gates (gates.json) + complex code gates (replies.js)
  │     └── Each gate → deterministic reply with citations + confidence score
  │
  └── LLM Path (everything else)
        ├── Knowledge Base injection (~300 tokens of verified data)
        ├── Temporal context injection (washout/onset/half-life)
        ├── Dose extraction + upper limit comparison
        ├── Response cache (LRU, 200 entries, 1hr TTL)
        ├── Circuit breaker (graceful degradation if LLM fails)
        └── Post-response safety validator (8 rules)
              ├── No diagnosing language
              ├── No stop-medication instructions
              ├── No prohibited dosing (pregnancy/children)
              ├── Single question constraint
              ├── No prescribing language
              ├── Response length limit
              ├── No empty safety replies
              └── No fabricated URLs/emails/phones (Rule 8 — NEW)
```

---

## What's Built (Completed Phases)

### Phase 0: Inline Citations + Reference Database

**Status: COMPLETE**

Transformed perceived credibility by adding verifiable clinical citations to gate replies.

- **`src/config/references.js`** — 30 curated clinical references covering all 21 safety domains
- **`src/gates/replies.js`** — Inline citations on 10 highest-traffic gate replies (e.g., `*(Boyer & Shannon, NEJM 2005)*`)
- **`src/config/systemPrompt.js`** — LLM instructed to cite sources when naming risks
- **`src/config/approvedClaims.js`** — Every claim linked to references via `reference_ids[]`
- **`test/references.test.js`** — 190 tests

### Phase 1: Knowledge Depth

**Status: COMPLETE**

Moved beyond regex-only detection to structured, verified clinical data for LLM augmentation.

- **`src/config/knowledgeBase.js`** — 35 structured entries with: aliases, forms, dose ranges, upper limits, timing, population safety, interactions, goals, references
- **`src/core/kbLookup.js`** — KB context injected into LLM system messages (~300 tokens, caps at 4 entities)
- **`src/core/doseExtractor.js`** — Parses doses from messages, compares against KB upper limits
- **`src/core/confidence.js`** — Confidence signal in every response: gate → "high", LLM+KB → "moderate", LLM-only → "low"
- **`test/knowledge.test.js`** — 380 tests

### Phase 2: Structural Upgrades

**Status: COMPLETE** (2D deferred — needs Vercel KV)

- **2A: Population-Adjusted Risk Scoring** — KB-aware severity bumps for elderly, renal, pregnancy
- **2B: Temporal Context Engine** — `src/core/temporalContext.js` with washout/onset/half-life for ~30 medications, injected into LLM context
- **2C: DSL Gate Expansion** — `gates.json` v2.0.0 with 12 DSL gates, confidence + reference_ids fields
- **2D: Persistent Session State** — Deferred (requires Vercel KV infrastructure)
- **2E: Form-Specific Gate Branching** — `src/core/formAdvisor.js` with form detection, safe item clarification, renal form notes
- **`test/phase2.test.js`** — 140 tests

### Phase 2.5: Personality, Detection Hardening & Safety Boundaries

**Status: COMPLETE**

This phase closed critical gaps found during comprehensive auditing of all 45+ detection functions.

#### Personality Gates
- **Flirty deflection** — 3-stage escalation (playful → firm → final cutoff) using conversation history signature detection
- **Creator credit** — "Who made you?" → Sean Cheick & PharmaGuide team
- **Pet questions** — Redirects animal health to vet + ASPCA Animal Poison Control (1-888-426-4435)
- **Business/Features inquiry** — Two response modes:
  - Features questions ("What does PharmaGuide do?") → brief capability overview + link to pharmaguide.io/features
  - Business questions (partnerships, careers, contact) → pharmaguide.io, pharmaguide.io/careers, info@pharmaguide.io

#### Detection Hardening (comprehensive audit of all 45 functions)
Dozens of natural language gaps closed across every detection function:

| Category | Examples Added |
|---|---|
| Emergency | "throat swelling", "vomiting blood", "choking", "end it all", "wanna die" |
| Serotonergic symptoms | bare "sweats", "dilated pupils", "jaw clench", "clonus", "overheated" |
| Heart symptoms | "heartbeat", "tachycardia", "chest tight", "pulse racing", "heart skipped" |
| Blood thinners | edoxaban, ticagrelor, prasugrel, fondaparinux |
| Antidepressants | vortioxetine, vilazodone, doxepin, clomipramine, imipramine |
| Stimulants | guarana, ephedra, DMAA, energy drink, coffee, matcha |
| Pregnancy | "trying for a baby", "postpartum", "lactating", "due in" |
| Renal | "kidney failure", "eGFR", "one kidney", "nephrotic" |
| Chronic NSAID | "every other day", "nonstop", "times a week" |
| Tinnitus | flexible word gap "ears...ringing", "whooshing", "high pitched" |
| Greetings/social | "hi there", "hey there", "hiya", "tysm", "peace out", "ttyl" |
| Liver toxicity | bourbon, whiskey, vodka, liquor, beers |
| SSRI discontinuation | "dropped", "done with", "ditched", "stopped abruptly" |

#### Synonym Map Expansion (`src/config/synonymMap.js`)
- **20+ brand→generic mappings:** Luvox→fluvoxamine, Provigil→modafinil, Voltaren→diclofenac, Trintellix→vortioxetine, Brilinta→ticagrelor, etc.
- **Alcohol normalization:** tequila, rum, gin, brandy, champagne, sake, hard seltzer, shots → "alcohol"
- **Colloquial references:** "my happy pills"→antidepressant, "water pills"→diuretic, "pain killers"→nsaid, "my sugar pills"→metformin
- **Emergency:** "i m od ing"→overdose, "cold turkey"→"stopped abruptly"
- **New misspellings:** aderall, sertralina, tendonitis

#### LLM Safety Boundaries (prevents the LLM from going off-script)

**New validator rule (Rule 8):** Blocks LLM responses containing fabricated URLs, email addresses, or phone numbers. Allows: emergency hotlines (911, 988, Poison Control), pharmaguide.io domains, info@pharmaguide.io.

**System prompt hardening — 6 strict boundaries added:**
1. Never provide URLs/links/emails/phone numbers (except emergency hotlines)
2. Never recommend specific supplement brands or retailers (Amazon, iHerb, Thorne, etc.) — discuss forms and what to look for on labels instead
3. Never advise doubling a prescribed dose, splitting adult meds for children, or taking expired medications
4. Never act as therapist, nutritionist, dietitian, or fitness coach
5. Never give veterinary advice
6. Redirect "where to buy" questions to form/dose/third-party testing guidance

---

## Current Stats

| Metric | Count |
|---|---|
| Detection functions | 45+ |
| Safety domains | 21 |
| DSL gates | 12 |
| Code gates (complex branching) | 15+ |
| Gate reply functions | 30+ |
| Knowledge base entries | 35 |
| Clinical references | 30 |
| Approved claims | 21+ |
| Temporal data entries | ~30 medications |
| Synonym mappings | 100+ |
| Validator rules | 8 |
| Total tests | 1,336+ across 12 suites |
| Lint rules | 4 (non-blocking quality checks) |

---

## What's Next

### Phase 3: Long-Term Differentiation (The Moat)

These are the features that will make PharmaGuide impossible to replicate with a general health chatbot. Prioritized by impact.

#### 3A: Interaction Matrix — `src/config/interactionMatrix.js` (HIGH PRIORITY)

**The killer feature.** A curated database of 100+ supplement-medication interaction pairs with:

```js
{
  items: ["5-htp", "sertraline"],
  severity: "red",
  mechanism: "Both increase serotonin. 5-HTP is a direct serotonin precursor; SSRIs block reuptake. Combined effect can cause serotonin syndrome.",
  dose_dependent: true,
  dose_threshold: { item: "5-htp", above: 100, unit: "mg" },
  onset: "hours",
  alternatives: [
    { for_goal: "sleep", suggestion: "magnesium glycinate", reason: "Non-serotonergic, safe with SSRIs" },
    { for_goal: "mood", suggestion: "exercise + light therapy", reason: "Evidence-based, no interaction risk" },
  ],
  population_modifiers: {
    elderly: { severity_bump: true, note: "Lower serotonin clearance" },
  },
  reference_ids: ["serotonin-syndrome-mechanism"],
}
```

**Why this matters:** No general chatbot has dose-aware, population-adjusted, alternative-suggesting interaction data for the supplement space. This is our defensible moat.

**How to build it:**
1. Start with the ~25 interactions already hardcoded in detection functions
2. Add dose thresholds from clinical literature
3. Add alternative suggestions matched to user goals (sleep, anxiety, energy, etc.)
4. Wire into risk scoring: if the matrix says dose-dependent and user's dose is below threshold, downgrade from red to yellow
5. Wire alternatives into gate replies: "Instead of X, try Y for the same goal"

#### 3B: Alternative Suggestion Engine — `src/core/alternatives.js` (HIGH PRIORITY)

**The pharmacist-friend experience.** When flagging an unsafe combo, proactively suggest a safer alternative for the same goal:

- "Instead of 5-HTP for sleep with Zoloft, try **magnesium glycinate** — it's not serotonergic and has good evidence for sleep quality."
- "Instead of high-dose vitamin E with your blood thinner, consider **CoQ10** — it supports heart health without antiplatelet effects."

**How to build it:**
1. Build a goal→supplement mapping: `{ sleep: ["magnesium glycinate", "melatonin", "valerian"], anxiety: ["l-theanine", "magnesium", "ashwagandha"], ... }`
2. Filter out suggestions that conflict with the user's current meds (cross-reference the interaction matrix)
3. Inject into gate replies where a risk is flagged
4. Add a `suggested_alternative` field to the API response payload for frontend cards

#### 3C: Empathetic Tone Adaptation — `src/core/toneAdapter.js` (MEDIUM PRIORITY)

Detect anxiety level from message patterns and adjust response tone:

**Detection signals:**
- Catastrophizing: "am I going to be okay?", "is this going to kill me?", "I'm freaking out"
- Multiple exclamation marks, ALL CAPS
- Rapid-fire questions in one message
- "I'm scared", "I'm worried", "please help"

**Tone adjustment:**
- Lead with reassurance: "You're going to be okay. Let's work through this."
- Simplify bullets (fewer, clearer)
- Put the action step first, explanation second
- Avoid clinical jargon entirely

**How to build it:**
1. Add `detectAnxietyLevel(text)` to detection.js → returns "calm", "moderate", "high"
2. Create `adaptTone(reply, anxietyLevel)` that restructures the response
3. Wire into gate replies and post-process LLM responses

#### 3D: Structured Output Schema (MEDIUM PRIORITY)

Evolve the API response to include a `structured` object alongside the text reply:

```json
{
  "reply": "...",
  "model": "system:serotonin-risk",
  "confidence": "high",
  "structured": {
    "severity": "red",
    "mechanism_summary": "Serotonin accumulation from dual pathway activation",
    "items_flagged": ["5-htp", "sertraline"],
    "references": [{ "short": "Boyer & Shannon, NEJM 2005", "type": "review" }],
    "alternative_suggestion": { "item": "magnesium glycinate", "for_goal": "sleep", "safe_with": ["sertraline"] },
    "dose_assessment": { "item": "5-htp", "user_dose": "200mg", "upper_limit": "100mg", "status": "exceeds" },
    "action_items": ["Stop 5-HTP", "Contact prescriber"],
    "follow_up_question": "Which antidepressant are you taking?"
  }
}
```

**Why this matters:** Enables the frontend to render rich cards, severity badges, collapsible sections, and action checklists instead of plain text. Also enables future integrations (API consumers, Slack bots, etc.).

#### 3E: Clinical Governance Dashboard — `/api/governance` (MEDIUM PRIORITY)

An internal API endpoint exposing:
- All approved claims with review status (up-to-date, due for review, expired)
- Reference coverage: which domains have strong evidence, which need more
- Gate hit rates: which gates fire most often (tells you where to invest)
- Claims due for review based on `review_cycle_months`
- Safety snapshot: emergency/jailbreak counts, violation rates

**How to build it:**
1. `getClaimsGovernanceReport()` already exists in `scripts/claims_report.js` — extract to a module
2. Create `/api/governance` endpoint (password-protected or admin-only)
3. Build a simple HTML dashboard or return JSON for a frontend to render

#### 3F: Persistent Session State (INFRASTRUCTURE)

**Status:** Deferred from Phase 2D — needs Vercel KV setup.

Use Vercel KV REST API (no npm dependency — raw `fetch`) for 30-day session persistence. Returning users don't re-specify their medication list.

**How to build it:**
1. Set up Vercel KV store
2. Store: `{ session_id, med_list, supp_list, populations, last_active }` — no free text, no PHI
3. On first message, check for existing session; inject med/supp context
4. Prune sessions older than 30 days

---

## Expansion Playbooks

These are step-by-step guides for expanding every layer of PharmaGuide. Follow the patterns exactly — the system is designed so you can add clinical data without touching core logic.

### 1. Adding a New Knowledge Base Entry

**File:** `src/config/knowledgeBase.js`

```js
newentry: {
  canonical: "newentry",
  aliases: ["brand-name", "abbreviation"],
  category: "supplement",  // "supplement" | "medication" | "mineral" | "vitamin"
  forms: {
    "form_a": { elemental_pct: 0.14, absorption: "high", gi_tolerance: "good", best_for: ["sleep"] },
  },
  adult_dose_range: { min: 200, max: 400, unit: "mg" },
  upper_limit: { value: 500, unit: "mg/day", source: "Clinical trials" },
  timing: { best_time: "evening", with_food: true, separate_from: ["iron"] },
  populations: {
    pregnancy: { safe: false, notes: "Insufficient data." },
    renal: { safe: true, notes: "No known concerns." },
    elderly: { safe: true, notes: "Start low." },
  },
  interactions: [
    { with: "medication_name", severity: "moderate", mechanism: "Describe why.", timing_fix: null },
  ],
  common_goals: ["sleep", "anxiety"],
  reference_ids: [],
},
```

**What this automatically unlocks (zero extra code):**
- `kbLookup.js` injects this data into LLM context
- `doseExtractor.js` compares user doses against `upper_limit`
- `resolveSeverity()` uses `populations` flags for risk bumps
- `formAdvisor.js` differentiates forms if user mentions one

**Checklist after adding:**
1. Add canonical name to `src/core/entities.js` (supplements or meds regex)
2. Run `node test/knowledge.test.js` — auto-validates structure
3. Test alias lookup: `getKBEntry("brand-name")` should return the entry

**Priority entries to add next:** glucosamine, saw palmetto, milk thistle, spirulina, kratom, CBD, quercetin, elderberry, probiotics, collagen, biotin (currently in KB but could be deeper), DHEA, pregnenolone, lion's mane, cordyceps.

### 2. Adding a New Detection Function

**File:** `src/gates/detection.js`

```js
function detectsNewPattern(text) {
  const t = normalizeText(text);
  const hasA = /\b(item_a|alias_a)\b/.test(t);
  const hasB = /\b(item_b|alias_b)\b/.test(t);
  return hasA && hasB;
}
```

**Rules:**
- Always normalize with `normalizeText(text)` first
- Use `\b` word boundaries
- Never use `/g` flag on module-level regexes (lastIndex bug)
- Export from `module.exports` at the bottom

**Testing:** Add to `test/full-suite.test.js` — minimum 3 cases: positive match, negative match, edge case.

**Detection functions we still need:**
- `detectsCBDDrugInteraction()` — CBD inhibits CYP2C19 and CYP3A4, affects many meds
- `detectsKratomOpioidRisk()` — kratom has opioid activity, dangerous with opioid meds
- `detectsMagnesiumAntibioticSpacing()` — magnesium/calcium/iron chelate fluoroquinolones/tetracyclines
- `detectsGinsengBloodSugar()` — ginseng can lower blood sugar, risky with diabetes meds
- `detectsValerianSedativeStack()` — valerian + benzos/sleep meds = excessive sedation

### 3. Adding a New Gate

#### Simple gate (DSL — preferred)

**File:** `src/gates/gates.json`

```json
{
  "id": "new-gate-id",
  "route": "system:new-gate",
  "domain": "domain_name",
  "severity": "red",
  "confidence": "high",
  "detection_fn": "detectsNewPattern",
  "required_fields_route": "system:new-gate",
  "reference_ids": ["reference-id"],
  "response": {
    "opening": "**Risk statement.** *(Citation)*",
    "body": ["Bullet 1.", "Bullet 2.", "**Action item.**"],
    "question": "**Follow-up question?**"
  }
}
```

**Checklist:**
1. Create detection function in `detection.js`
2. Add gate to `gates.json`
3. Wire route in `router.js`
4. Update gate count in `test/scaling.test.js` (currently 12)
5. Add route to `dslRoutes` array in `test/scaling.test.js`

#### Complex gate (code — for branching logic)

**File:** `src/gates/replies.js`

Use code gates when the reply branches based on which specific items are present (e.g., serotonergic warning varies by supplement + antidepressant combo). See `serotonergicWarningReply()` as the model.

### 4. Adding References

**File:** `src/config/references.js`

```js
"reference-id": {
  short: "Author et al., Journal Year",
  title: "Full paper title",
  source: "Journal, Volume(Issue), Pages",
  year: 2023,
  type: "meta-analysis",  // "review" | "meta-analysis" | "rct" | "guideline" | "case-report" | "fda"
  domains: ["domain_name"],
},
```

**After adding:** Link to claims in `approvedClaims.js` and/or gates in `gates.json` via `reference_ids[]`. Run `node test/references.test.js`.

### 5. Adding Temporal Data

**File:** `src/core/temporalContext.js`

```js
newdrug: {
  canonical: "newdrug",
  half_life_hours: 24,
  washout_days: 7,
  onset_days: { min: 14, max: 28 },
  notes: "Clinical notes.",
  category: "ssri",
},
```

Add brand name aliases to `ALIAS_MAP` if needed. This automatically injects temporal context when the user mentions this drug and the query goes to the LLM.

### 6. Adding Synonym Mappings

**File:** `src/config/synonymMap.js`

```js
[/\bbrand name\b/g, "generic_name"],
[/\bmisspelling\b/g, "correct_spelling"],
[/\bcolloquial term\b/g, "canonical_name"],
```

**Priority synonyms to add:** More brand→generic for common OTC drugs, more colloquial terms ("blood pills", "heart pills"), more misspellings discovered from user analytics.

### 7. Expanding Risk Scoring

**File:** `src/core/riskScore.js`

Add new risk dimensions to `scoreRisks()` and `resolveSeverity()`. Score meanings: 0=absent, 1=signal, 2=confirmed risk, 3=urgent/symptoms.

### 8. Expanding Entity Extraction

**File:** `src/core/entities.js`

Add new supplement/medication names to the relevant regex patterns. Also update `intentScore()` in `detection.js` so the off-topic filter lets relevant queries through.

**Entities we're currently missing:** glucosamine, saw palmetto, milk thistle, spirulina, kratom, DHEA, pregnenolone, lion's mane, cordyceps, boswellia, tongkat ali, shilajit, black seed oil, oregano oil.

### 9. Expanding the Safety Validator

**File:** `src/postprocess/safetyValidator.js`

Current rules (8 total):
1. No diagnosing language
2. No stop-medication instructions
3. No prohibited dosing (pregnancy/children)
4. Single question constraint
5. No prescribing language
6. Response length limit (5000 chars)
7. No empty safety replies
8. No fabricated URLs/emails/phones (LLM only)

**Validator rules to consider adding:**
- **Brand name detection** — flag LLM responses that name specific supplement brands (Thorne, Nature Made, Nordic Naturals, etc.)
- **Dose-doubling detection** — flag responses suggesting doubling a prescribed dose
- **Role confusion** — flag responses where the LLM acts as therapist/dietitian ("let's talk about your feelings", "here's a meal plan")

### 10. Expanding the System Prompt

**File:** `src/config/systemPrompt.js`

The system prompt has sections: identity, safety, assessment framework, style, format, clinical knowledge, meta questions, rules, and strict boundaries. When adding clinical knowledge, put it in the CLINICAL KNOWLEDGE section. When adding behavioral rules, put them in STRICT BOUNDARIES.

**Note:** The system prompt affects the cache — changing it invalidates all cached responses (cache key includes a hash of the system prompt).

---

## Testing

**Total test count: 1,336+ across 12 suites — all passing.**

```bash
# Run all suites
for f in test/full-suite.test.js test/edge-cases.test.js test/safety-harness.test.js \
  test/validator.test.js test/adversarial.test.js test/analytics.test.js \
  test/operational.test.js test/scaling.test.js test/load.test.js \
  test/phase2.test.js test/ux-scenarios.test.js; do
  echo "=== $(basename $f) ===" && node "$f" 2>&1 | grep -E "(PASSED|passed|FAIL|failed)" | head -2
done
```

| Suite | Tests | What it covers |
|---|---|---|
| `full-suite.test.js` | 505 | Gate logic, routing, detection functions |
| `edge-cases.test.js` | 171 | Regex edge cases, boundary conditions |
| `safety-harness.test.js` | 50 | Clinical IDs with route + reply validation |
| `validator.test.js` | 39 | Post-response safety validator rules |
| `adversarial.test.js` | 65 | Prompt injection, jailbreak, safety bypass |
| `analytics.test.js` | 109 | Entity classifier, analytics events, cache |
| `operational.test.js` | 67 | Release guard, circuit breaker, claims governance |
| `scaling.test.js` | 109 | DSL gates, severity resolver, session memory |
| `load.test.js` | 45 | Synthetic load, chaos testing |
| `phase2.test.js` | 140 | Population risk, temporal context, DSL, forms |
| `ux-scenarios.test.js` | 36 | UX flow routing |
| `references.test.js` | 190 | Reference structure, claim→reference links |
| `knowledge.test.js` | 380 | KB structure, lookups, dose extraction |

**Rule: Every change must pass ALL tests. No exceptions.**

---

## Architecture Rules (Do Not Break)

1. **No new npm dependencies** — everything is vanilla Node.js
2. **No persistent state at runtime** — Vercel serverless, no filesystem writes
3. **No PHI in logs/analytics** — entity names, messages, doses are NEVER stored. Only coarse classes ("ssri", "mineral") and counts
4. **Fresh RegExp per call** — never use `/g` flag on module-level regex (lastIndex bug)
5. **Gate replies have no disclaimers** — frontend UI handles disclaimers globally
6. **Dev-only debug fields** — `_scores`, `_entities`, `_validation`, `_kb_hits`, `_dose_summary`, `_confidence_label` are gated behind `NODE_ENV=development`
7. **Evidence chain** — every clinical claim must trace: `safetyPolicy.js` → `approvedClaims.js` → `references.js`. No orphan claims
8. **DSL gates for simple patterns, code gates for complex branching** — don't put branching logic in JSON
9. **All tests pass before merge** — no exceptions
10. **No fabricated info** — the LLM must never invent URLs, emails, phone numbers, brand names, or doctor recommendations. The validator catches this, but the system prompt prevents it first

---

## Competitive Advantage

| Capability | Claude Health / ChatGPT Health | PharmaGuide |
|---|---|---|
| Interaction detection | LLM-dependent, may miss | 45+ deterministic gates + LLM |
| Response speed | 2-5s (LLM only) | <50ms for gate replies |
| Dose awareness | General knowledge | Structured KB with upper limits |
| Citations | Sometimes fabricated | 30 curated, validated, linked to claims |
| Form-specific guidance | Vague | KB-backed (glycinate vs oxide vs citrate) |
| Population adjustment | Sometimes mentions elderly | Programmatic severity bumps (elderly/renal/pregnancy) |
| Temporal data | Generic "1-5 weeks" | Drug-specific washout/onset/half-life |
| Fabrication prevention | None | Validator blocks fake URLs/emails/phones |
| Brand neutrality | Recommends brands freely | Never names brands (by design) |
| Auditability | None | Full evidence chain + governance tooling |
| Pet safety | Gives human advice to animals | Deterministic vet redirect |
| Off-topic containment | Drifts into any topic | 7 personality gates + intent scoring |
| Price | Paid subscription | **Free** |
| Alternative suggestions | Generic | *Coming: goal-matched, interaction-checked* |
| Interaction matrix | *None — LLM memory only* | *Coming: 100+ curated pairs with dose thresholds* |

---

## Deployment

**PharmaGuide is LIVE in production.** Every `git push origin main` triggers an automatic Vercel deployment.

- **Hosting:** Vercel (serverless functions)
- **Endpoint:** `POST /api/chat` — the single API endpoint
- **LLM chain:** Gemini 2.5 Flash (primary) → Groq Llama 3.3 70B Versatile (fallback) → deterministic degraded reply. Per-provider circuit breakers + transparent failover in `src/infra/providerRouter.js`.
- **Environment variables:** `GEMINI_API_KEY` (required, primary), `GROQ_API_KEY` (required, fallback), `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (rate-limit storage), `ANALYTICS_ENABLED`, `ANALYTICS_SALT`, `NODE_ENV`
- **Free-tier ceilings:** Gemini 2.5 Flash 250 RPD / 10 RPM; Groq 1,000 RPD / 30 RPM. Plan paid Gemini billing before launch (also opts out of training-data use).
- **Model lifecycle:** `gemini-2.5-flash` shutdown 2026-10-16 — migrate before then. `gemini-2.0-flash` shutdown 2026-06-01 — do not use.
- **Build:** No build step — vanilla Node.js, `require()` imports
- **Config:** `vercel.json` handles routing and output directory

**Before pushing:** Run all tests locally. Every push goes to production immediately. There is no staging environment. Be careful.

```bash
# Run all tests before pushing
for f in test/*.test.js; do node "$f" 2>&1 | tail -3; done

# Push to production
git push origin main
```

---

## Project Structure & File Map

### Folder Structure

```
pharmaguide-chatbot-api/
├── api/                     — Vercel serverless functions (entry points)
├── src/                     — All application logic (imported by api/)
│   ├── config/              — Static data: prompts, policies, knowledge, references
│   ├── core/                — Business logic: entities, risk scoring, routing, KB lookup
│   ├── gates/               — Safety gates: detection patterns, replies, DSL engine
│   ├── infra/               — Infrastructure: API client, rate limiting, caching, analytics
│   └── postprocess/         — Response post-processing: validation, linting, formatting
├── test/                    — 12 test suites (all runnable with `node test/filename.js`)
├── scripts/                 — CLI tools: release guard, governance reports
├── docs/safety-case/        — Safety documentation: architecture, risk domains, threat model
├── ROADMAP.md               — This file (single source of truth)
└── vercel.json              — Vercel deployment config
```

### What Each Folder Does

**`api/`** — Contains exactly one file: `chat.js`. This is the Vercel serverless function entry point. It's a thin handler that imports everything from `/src`, runs messages through the gate pipeline, and returns JSON responses. All logic lives in `/src`, not here.

**`src/config/`** — Static configuration data. No runtime logic, just data structures:
- `systemPrompt.js` — The full LLM system prompt (identity, rules, clinical knowledge, safety boundaries). Changing this invalidates the response cache.
- `knowledgeBase.js` — 35 structured entries with forms, doses, interactions, population safety. This is PharmaGuide's "brain" for verified clinical data.
- `references.js` — 30 clinical references (NEJM, BMJ, FDA, etc.) linked to approved claims.
- `approvedClaims.js` — Governed clinical claims with review dates, expiry, and reference links. Every claim traces to a reference.
- `safetyPolicy.js` — 21 clinical risk domains with evidence refs.
- `synonymMap.js` — 100+ regex mappings: brand names → generics, misspellings → correct, colloquial → canonical.
- `cors.js` — CORS headers.

**`src/core/`** — Core business logic. This is where messages get understood and routed:
- `entities.js` — Extracts what the user is talking about (medications, supplements, symptoms, populations) from the message text.
- `riskScore.js` — Scores risk across multiple dimensions (serotonin, bleeding, liver, etc.) and resolves final severity (green/yellow/red).
- `router.js` — Routes messages to the right gate or to the LLM based on risk scores and entity detection.
- `kbLookup.js` — Looks up entities in the knowledge base and builds compact context for LLM injection.
- `doseExtractor.js` — Parses dose mentions ("500mg magnesium") and compares against KB upper limits.
- `temporalContext.js` — Washout/onset/half-life data for ~30 medications, injected into LLM context.
- `formAdvisor.js` — Form-specific guidance (magnesium glycinate vs oxide vs citrate).
- `normalize.js` — Text normalization (lowercase, strip special chars).
- `history.js` — Sanitizes conversation history for safe injection into LLM context.
- `confidence.js` — Assigns confidence level to each response (high/moderate/low).
- `entityClassifier.js` — Maps entity names to privacy-safe coarse classes for analytics.
- `unknownResolver.js` — Misspelling correction, brand name resolution, unknown item detection.
- `requiredFields.js` — Detects missing info needed for a gate to give a complete answer.

**`src/gates/`** — The safety gate system. This is PharmaGuide's competitive advantage:
- `detection.js` — 45+ boolean detection functions. Each one answers: "Does this message match pattern X?" (e.g., `mentionsBloodThinner()`, `detectsSerotonergicRisk()`, `isFlirty()`).
- `replies.js` — 30+ gate reply functions with context-dependent branching. Each returns a complete response string. Also contains `ROUTE_REPLY_MAP` mapping route names to reply functions.
- `gateEngine.js` — Compiles and executes DSL gates from `gates.json`. Handles pattern matching, reply rendering, and validation.
- `gates.json` — 12 declarative gate definitions (v2.0.0). Simple pattern gates that don't need branching logic live here instead of in code.

**`src/infra/`** — Infrastructure and operational tooling:
- `groqClient.js` — Groq API client (LLM calls).
- `rateLimit.js` — Per-IP rate limiting.
- `responseCache.js` — LRU response cache (200 entries, 1hr TTL) with 9 exclusion rules (no caching of pregnancy/symptoms/multi-turn/high-risk queries).
- `circuitBreaker.js` — Protects against LLM outages (CLOSED→OPEN→HALF_OPEN states).
- `gracefulDegradation.js` — Returns safe degraded responses when the circuit is open.
- `analytics.js` — PHI-free event builder, HMAC-SHA256 IP hashing, dashboard query helpers.
- `logger.js` — Gate-level logging (route, message length, has-conversation flag — never message content).
- `releaseGuard.js` — CI release gate: checks policy version, claims governance, forbidden keys.

**`src/postprocess/`** — Runs after every response (gate and LLM):
- `safetyValidator.js` — 8-rule validator that blocks unsafe responses. If any rule fails, the response is replaced with a safe fallback. Also includes a non-blocking linter for quality monitoring.
- `index.js` — Mineral spacing notes, disclaimer stripping, single question enforcement.

**`test/`** — 12 test suites, all runnable with `node test/filename.js` (no test framework needed). See the Testing section for details.

**`scripts/`** — CLI tools for governance and release management:
- `check_release.js` — Run before releases to validate policy/claims integrity.
- `claims_report.js` — Generates governance reports (expiring claims, coverage gaps).

### Detailed File Map

```
api/
  chat.js                    — Vercel serverless handler (thin, imports everything from /src)

src/
  config/
    cors.js                  — CORS configuration
    systemPrompt.js          — LLM system prompt (identity, rules, clinical knowledge, boundaries)
    synonymMap.js            — 100+ regex→canonical mappings (brands, misspellings, colloquial)
    safetyPolicy.js          — 21 clinical domains with evidence refs
    approvedClaims.js        — Governed claims with review dates, reference links
    references.js            — 30 clinical references (NEJM, CMAJ, BMJ, FDA, etc.)
    knowledgeBase.js         — 35 structured supplement/medication entries

  core/
    normalize.js             — Text normalization (lowercase, strip punctuation)
    history.js               — Conversation history sanitization + context building
    entities.js              — Entity extraction (meds, supplements, symptoms, populations)
    entityClassifier.js      — Maps entity names → coarse privacy-safe classes
    riskScore.js             — Multi-dimension risk scoring + severity resolution
    router.js                — Risk-based routing to gates or LLM
    requiredFields.js        — Missing field detection for gate routes
    unknownResolver.js       — Misspelling correction, brand resolution, unknown item detection
    kbLookup.js              — Knowledge base lookup + LLM context builder
    doseExtractor.js         — Dose parsing + upper limit comparison
    confidence.js            — Confidence scoring (high/moderate/low)
    temporalContext.js       — Washout/onset/half-life data + LLM injection
    formAdvisor.js           — Form detection, safe item clarification, renal form notes

  gates/
    detection.js             — 45+ boolean detection functions (pattern matching)
    replies.js               — 30+ gate reply functions + ROUTE_REPLY_MAP
    gateEngine.js            — DSL gate compiler + executor
    gates.json               — 12 DSL gate definitions (v2.0.0)

  infra/
    groqClient.js            — Groq API client
    rateLimit.js             — Per-IP rate limiting
    logger.js                — Gate logging
    analytics.js             — PHI-free analytics events + dashboard queries
    responseCache.js         — LRU response cache (200 entries, 1hr TTL, 9 exclusion rules)
    circuitBreaker.js        — Circuit breaker (CLOSED→OPEN→HALF_OPEN)
    gracefulDegradation.js   — Degraded responses when LLM is down
    releaseGuard.js          — CI release gate (policy version, claims governance)

  postprocess/
    index.js                 — Mineral spacing notes, disclaimer stripping, single question enforcement
    safetyValidator.js       — 8-rule post-response validator + 4-rule linter

scripts/
  check_release.js           — CLI release gate
  claims_report.js           — Governance report

test/                        — 12 test suites, 1,336+ tests total

docs/safety-case/            — Safety architecture, risk domains, threat model, test coverage
```

---

## Vision: What "Best of the Best" Looks Like

PharmaGuide's endgame is to be the **most trusted, most accurate, and most accessible** supplement-medication safety tool in the world. Here's what that looks like:

1. **Every known supplement-medication interaction is in the matrix** — not just the 25 we detect now, but 500+, each with dose thresholds, mechanisms, alternatives, and population modifiers. No general chatbot will ever match this because it requires human curation, not just LLM knowledge.

2. **Every response is verifiable** — the full evidence chain (claim → reference → journal) is exposed, not hidden. Users and clinicians can audit any answer. This is how you earn trust.

3. **The system gets smarter from usage** — analytics tell us which gates fire most, which queries fall through to the LLM, which interactions users ask about that we don't cover yet. This feedback loop drives expansion priorities.

4. **Real pharmacists review the data** — governance tooling ensures claims are reviewed on schedule, references are current, and no claim goes stale. This is what separates a real health tool from a chatbot.

5. **The frontend is as good as the backend** — rich interaction cards, severity badges, alternative suggestions, confidence indicators, and clear action items. The structured output schema (Phase 3D) enables all of this.

6. **Multi-language support** — the gate architecture is language-agnostic at the response layer. Detection needs per-language regexes, but the knowledge base, interaction matrix, and references are universal.

7. **API for developers** — other health apps can use PharmaGuide's interaction checking via API. The structured output schema makes this clean.

Build it right, build it safe, build it for everyone.

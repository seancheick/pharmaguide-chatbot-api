<div align="center">

# PharmaGuide AI

**Evidence-grounded health intelligence for supplement and medication safety.**

A production decision-and-explanation system for high-stakes supplement–medication questions: deterministic clinical safety routing, structured knowledge retrieval, contextual entity and dose analysis, multi-provider language-model orchestration, and post-generation validation.

<sub>One surface of the **[pharmaguide.io](https://pharmaguide.io)** supplement-intelligence platform</sub>

<br />

[![CI](https://github.com/seancheick/pharmaguide-chatbot-api/actions/workflows/ci.yml/badge.svg)](https://github.com/seancheick/pharmaguide-chatbot-api/actions/workflows/ci.yml)
[![Production smoke](https://github.com/seancheick/pharmaguide-chatbot-api/actions/workflows/smoke.yml/badge.svg)](https://github.com/seancheick/pharmaguide-chatbot-api/actions/workflows/smoke.yml)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Vercel](https://img.shields.io/badge/Vercel-serverless-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com)
[![License](https://img.shields.io/badge/license-proprietary-CB2030?style=flat-square)](#license)

</div>

---

> **Not an LLM wrapper.** Known high-risk scenarios (a PDE5 inhibitor with a nitrate, an SSRI with 5-HTP, warfarin with ginkgo) are resolved by deterministic rules and never wait on a model. Generative models are used for language understanding and grounded explanation, after PharmaGuide has established the clinical context. Every reply, deterministic or generated, is checked by a validator before it leaves.

```text
 Deterministic safety   +   Clinical retrieval   +   Context engine
 +   Multi-LLM orchestration   +   Post-response validation   +   Production monitoring
```

*PharmaGuide AI is an educational tool. It does not diagnose, prescribe, or replace a clinician or pharmacist.*

**Contents:** [Engineering highlights](#engineering-highlights) · [How a request flows](#how-a-request-flows) · [LLMs do not own safety decisions](#llms-do-not-own-safety-decisions) · [Decision provenance](#decision-provenance) · [Designed for failure](#designed-for-failure) · [Context-aware conversations](#context-aware-conversations) · [Clinical retrieval and governance](#clinical-context-retrieval-and-governance) · [Model strategy](#model-strategy) · [Testing](#testing-and-production-canaries) · [Security and privacy](#security-and-privacy-architecture) · [Observability](#observability) · [Principles](#safety-philosophy-and-engineering-principles) · [Examples](#see-it-work) · [Explore the code](#explore-the-engineering) · [Roadmap](#toward-a-unified-pharmaguide-intelligence-layer) · [Platform](#the-pharmaguide-platform) · [API](#api) · [Configuration](#configuration) · [Limitations](#responsible-use-and-known-limits)

---

## Engineering highlights

- **Deterministic safety before generation.** Emergency detection and known high-risk interactions are answered by reviewed rules, in milliseconds, with a fixed precedence order.
- **A validator on every reply.** Gate replies and model replies pass the same post-response checks (no diagnosing, no stop-your-medication instructions, no prescribing, no unsafe dosing for pregnancy or children, no fabricated contact details, one question at a time).
- **Multi-provider orchestration with failure handling.** Primary model, second model tier, cross-vendor fallback, per-provider circuit breakers, a shared time budget, and a deterministic safe reply when everything fails. A cut-off, blocked or empty answer is treated as a failed attempt, never shown to a user.
- **Query-aware clinical retrieval.** Structured entries (forms, dose ranges, upper limits, timing, populations, interactions, source references) are retrieved per question instead of relying on model memory.
- **Stateful safety context.** Pregnancy, age group, kidney and liver status and key conditions are derived from the conversation, carried between turns, and allow-listed so a client cannot inject free text.
- **Dose and entity understanding.** Doses are parsed from messages and compared with known upper limits; medications, supplements, forms and wellness goals are extracted and classified.
- **Privacy by construction.** No message text in logs, hashed rate-limit identifiers, website-only API access, no server-side chat storage, PHI-free analytics.
- **Regression-driven.** Every reproduced production defect becomes a permanent test; a pinned set of production canaries runs after every deploy and daily.
- **Governed clinical claims.** Claims carry review dates and source references. An enforced release gate (CI and every deploy) blocks a release when a claim is overdue, and a weekly job warns 30 days ahead.
- **Honest roadmap.** Planned work (measured model selection, prompt minimisation, a shared clinical export) is labelled as planned, below.

<!-- metrics:start -->
| Measured from the code | Count |
|---|---:|
| Deterministic response routes | 41 |
| Declarative (data-driven) safety gates | 12 |
| Detection functions | 58 |
| Clinical knowledge entries | 102 |
| Curated source references | 31 |
| Approved clinical claims (with review dates) | 21 |
| Safety-policy domains | 21 |
| Post-response validator rules | 8 |
| Pinned production canaries (replayable live) | 9 (8) |
| Test suites | 28 |
<!-- metrics:end -->

*That table is generated from the code by `scripts/readme_metrics.js`; `npm test` fails if it drifts.*

---

## How a request flows

```text
 POST /api/chat
      │
      ▼
 Edge ─ proxy secret (when enforced) · input validation · size limits
      │
      ▼
 1  Emergency detection ........ deterministic · answered BEFORE the rate limiter
      │                          so an infrastructure outage can never delay it
      ▼
 2  Rate limit ................. hashed visitor key · in-memory fallback if Redis is down
      │
      ▼
 3  Conversation gates ......... greeting · scope · privacy · "what is PharmaGuide" · off-topic
      │
      ▼
 4  Context engine ............. entities · doses · populations · conversation state
      │
      ▼
 5  Deterministic safety engine  depletion lookup → risk scoring → rule-precedence router
      │
      ├── known high risk / known fact ──► verified reply  (provenance: system:<route>)
      │
      └── general question
              │
              ▼
          6  Clinical context assembly ... knowledge entries · timing/washout · patient profile
              │
              ▼
          7  LLM orchestration ........... cache → primary → second tier → fallback → safe reply
              │
              ▼
          8  Post-processing ............. strip disclaimers/links · mineral spacing · dose flags
              │
              ▼
 9  Safety validator (every reply) ........ sanitise in place, or replace with a safe fallback
      │
      ▼
 Response  { reply, model (provenance), confidence, _state }
```

The ordering is the design: steps 1–5 are rules, so the questions that matter most never depend on sampling, latency, quota or a vendor outage.

## LLMs do not own safety decisions

```text
 Known fact or rule              Unknown / general question
        │                                  │
        ▼                                  ▼
 Deterministic PharmaGuide        Retrieve verified context
 logic decides                            │
        │                                  ▼
        ▼                          LLM writes the answer
 A model may explain it                    │
 (it cannot override it)                   ▼
                                    Validator checks the answer
```

A model can help with language. It cannot override a deterministic emergency or contraindication route, and nothing it writes reaches a user without passing the validator.

## Decision provenance

Every response says where it came from, in the `model` field:

| Value | Meaning |
|---|---|
| `system:<route>` | A deterministic PharmaGuide route answered (e.g. `system:emergency`, `system:nitrate-vasodilator`, `system:pregnancy-retinol`, `system:depletion`) |
| a model id | A generative answer, produced by that model after retrieval, then validated |
| `cache` | A previously validated answer for a context-free question |
| `system:degraded` | Every provider failed; the deterministic safe reply was returned |

`confidence` (`high` / `moderate` / `low`) is derived from provenance, not from the model: deterministic and cached answers are `high`; a model answer grounded in two or more knowledge entries from the primary model is `high`; any other grounded answer is `moderate`; an ungrounded answer is `moderate` from the primary model and `low` from a lighter one.

Which *rules* produced an answer is reported too: every response carries an `X-PG-Ruleset` header (policy version, gates version, system-prompt hash, knowledge-base and approved-claims content hashes, deployed commit), so two answers can be compared by header and any edit to the knowledge, claims or prompt changes the tag. The JSON contract is unchanged.

Provenance supports debugging, audits, QA, analytics and model evaluation. (The website proxy strips `model` before it reaches browsers.)

## Designed for failure

| What goes wrong | What happens | Proven by |
|---|---|---|
| Primary model errors, rate-limits or times out | The next tier is tried; circuit breakers stop hammering a failing provider | `test/canaries.test.js`, `test/load.test.js` |
| A model answer is cut off, blocked or empty | Treated as a failed attempt (not an outage): the next provider answers, and the partial text is never shown | `test/canaries.test.js` |
| Every provider fails | A deterministic reply with pharmacist, prescriber and 911/Poison Control guidance | `test/golden-traces.test.js` |
| The provider chain is slow | A shared 12 s time budget keeps the whole chain inside the website proxy's 15 s limit | `test/wave-c.test.js` |
| The rate-limit backend (Redis) is down | Falls back to an in-memory limiter within 1.5 s; emergencies are answered before the limiter, so they never wait on it | `test/canaries.test.js` |
| A generated answer breaks policy | The validator sanitises it in place or replaces it with a safe fallback | `test/validator.test.js` |
| An optional post-processing step throws | Logged; the finished answer is still returned | `test/canaries.test.js` |
| Analytics rejects an event | The event is dropped; the request is unaffected | `test/wave-b.test.js` |
| Malformed JSON, oversized message, hostile client state | Clean `400`, or the bad fields are dropped by an allow-list | `test/canaries.test.js`, `test/wave-b.test.js` |
| Clinical context is unclear | A clarifier route asks which medication is meant instead of guessing | `test/full-suite.test.js` |
| Enforcement is requested but its secret is missing | Fails open with a logged error, because locking out every visitor is the worse failure | `test/wave-c.test.js` |

## Context-aware conversations

PharmaGuide derives structured facts from the conversation and carries them forward, rather than replaying raw history into every rule:

- **Populations:** pregnancy, older adult, kidney disease, liver disease, pediatric.
- **Conditions:** diabetes, thyroid disease, seizure history, bariatric surgery.
- **Care in the details:** ages are parsed as numbers (so "I'm 35" is not "elderly" and "I'm 10 weeks pregnant" is not a child); "kidney" alone is a general question, "kidney disease" is a patient fact; a child must be the *subject* of the question.
- **Bounded and untrusted:** the client may send `_state` back, but only known enum values survive; free text never reaches a prompt.

```text
 Turn 1   "I'm pregnant, can I take vitamin A?"   → system:pregnancy-retinol     state: [pregnancy]
 Turn 2   "What about ashwagandha?"                → system:pregnancy-limited    state: [pregnancy]
```

The second question inherits the first turn's context, which a stateless chatbot would lose. This exact flow is a pinned production canary.

## Clinical context retrieval and governance

When entities are recognised, matching structured entries are retrieved and injected as context (capped, so the prompt stays focused). Each entry can carry: aliases and forms, adult dose range, upper limit, timing and separation rules, population restrictions, interactions with mechanism and severity, common goals, and source references.

- **Goal-only questions** ("what can I take to sleep better") are mapped to candidate entries, so the model never answers from memory alone.
- **Temporal context** (washout, onset, half-life) and **form-specific guidance** (for example oxide versus glycinate) are added when relevant.
- **Dose awareness:** a stated dose is compared with the known upper limit and flagged in the reply.
- **Source-backed:** entries link to curated references; approved claims carry a domain, confidence, review date, review cycle and references, and `scripts/check_release.js` (the release gate, run in CI and as the Vercel build command) checks policy version, claim review dates and forbidden analytics fields, then runs the whole test suite without any provider secrets.
- **Coverage telemetry, not auto-learning:** `GET /api/gaps` shows which topics users ask about that the knowledge layer does not cover. It identifies topics for human review. It never adds clinical facts by itself.

Design write-ups live in [`docs/safety-case/`](./docs/safety-case): safety architecture, risk domains, validation rules, threat model, failure modes and test coverage.

## Model strategy

Models are replaceable infrastructure, not part of the safety argument.

- The provider chain, per-model generation settings and failure semantics live in one place (`src/infra/providerRouter.js`, `geminiClient.js`, `groqClient.js`), so changing a model is a small, tested change.
- Quirks are encoded where they belong: for example, a model's hidden "thinking" tokens count against the output limit, so thinking is configured per model and any non-natural stop is a soft failure.
- Generation parameters adapt to query complexity (more careful settings for multi-medication and population-specific questions).
- `GET /api/health` reports each provider's configuration and circuit state.

**Model evaluation harness.** [`eval/`](./eval) runs a golden set through the real production handler with only the model call swapped, so each candidate is judged on what a user would actually have received (routing, retrieval, prompt, post-processing and the safety validator are the production code). The set reuses the pinned canaries, adds behaviour probes (overclaiming, capitulating to "my friend says it's fine", inventing figures), and is generated from the pipeline's verified interaction records, which serve as both the answer key and the supplied context. Answers are scored in a fixed order: critical safety failures, accuracy against the record, fidelity to supplied facts (no invented dose figures), evidence overstatement, then latency and cost; truncation and availability are measured too. The checks are transparent heuristics, so every flagged answer is printed in full for a person to read. A live run refuses to start without `--yes`.

**Planned:** the measured comparison itself (the candidates need their own API keys), after which the model is chosen on that table and on data-use terms rather than vendor preference.

## Testing and production canaries

Suites live in [`test/`](./test) and run with `npm test` on every push and pull request.

| Area | Suites |
|---|---|
| End-to-end behaviour | `golden-traces`, `ux-scenarios`, `wellness-queries` |
| Clinical safety cases | `safety-harness` (clinical IDs: route and reply content), `full-suite`, `edge-cases`, `router_precedence` |
| Adversarial | `adversarial` (prompt injection, jailbreaks, safety bypass), hostile client state and forged headers (`wave-b`, `wave-c`) |
| Failure paths | provider failure, truncation, Redis outage, malformed input, time-budget exhaustion (`canaries`, `wave-c`, `load`) |
| Model evaluation | adapters, scoring and ranking order, the real handler with a stubbed model, no network (`eval-harness`) |
| Output safety | `validator` (every rule, positive and negative controls), emergency paraphrases with educational negatives (`wave-b`) |
| Knowledge | `knowledge`, `references` (claim to citation integrity), `phase2` |
| Operations | `operational` (release guard, circuit breaker), `scaling`, `load` (synthetic load and chaos), `analytics` |
| Privacy | hashed limiter keys verified against a fake Redis, no message text in logs (`limiter-privacy`, `wave-c`) |
| Docs | `readme-metrics` (README numbers match the code) |
| Live providers | `llm-behavior`, opt-in with `RUN_LLM_TESTS=1` |

**Production canaries** (`test/canaries.js`) are known catastrophic regressions, run in `npm test` against the handler and by `scripts/smoke_prod.js` against the deployed service (after every production deploy and daily, by `.github/workflows/smoke.yml`):

```text
Viagra + nitroglycerin          → deterministic contraindication route
"I took too many pills"         → emergency route
Double warfarin + bleeding      → emergency route
Toddler + iron ingestion        → emergency route (Poison Control)
Passive suicidal ideation       → crisis route with 988
Pregnancy, then a follow-up     → context carried, answer not served from a shared cache
Kidney wording (negative case)  → general question is not tagged as a renal patient
Turmeric                        → a complete answer (a data bug once returned HTTP 500)
```

Every reproduced production defect becomes a permanent regression case, and the same list runs in CI and against production, so a regression cannot hide in only one of them.

## Security and privacy architecture

- **Website-only access.** The website's server-side proxy sends a shared secret (compared in constant time); enforcement is opt-in and staged so a roll-out cannot lock users out. Only a request carrying the secret is allowed to name the visitor's address.
- **Hashed identifiers.** Rate limits use a keyed one-way hash of the visitor address. The address itself is never sent to the limiter backend.
- **No message text in logs.** Validator rejections log rule names and message length only.
- **No server-side chat storage.** The service keeps no conversation history; the website holds the conversation in memory for the visit only.
- **Bounded inputs.** Message length, history length and per-message size are capped; client `_state` is an allow-list.
- **No raw provider errors to browsers.** Provider names and upstream error text are returned only in development.
- **PHI-free analytics.** Events contain coarse classes, hashed values and counts, never names, doses or messages, and a forbidden-key guard rejects anything else (behind `ANALYTICS_ENABLED`).
- **CORS allow-list** limited to the production origins; credentials live only in environment variables.
- **Third parties.** Message text is processed by the language-model providers to generate replies; see the [privacy policy](https://pharmaguide.io/privacy).

## Observability

- `GET /api/health`: provider configuration, circuit-breaker state, the provider that would serve the next request, and a `ruleset` block (the versions and content hashes of the policy, gates, prompt, knowledge base and claims, plus the deployed commit).
- `GET /api/gaps`: coverage-gap telemetry from real traffic (keyword clusters only, 30-day retention, never raw messages).
- Structured log lines for provider failover (`[PROVIDER]`), validator decisions (`[VALIDATOR]`) and degraded modes.
- Optional PHI-free analytics: route distribution, validator rejections, degraded and cache rates, latency buckets, retry and repeat rates, medication and supplement classes.
- The production smoke workflow doubles as an alarm: a failing canary fails the run.

## Safety philosophy and engineering principles

**Deterministic before generative.** Known high-risk cases bypass model reasoning.
**Specific before generic.** Guidance follows the exact ingredient, form and population wherever the data allows.
**Uncertainty before invention.** Missing evidence is reported as missing, never filled in.
**Fail safely.** Provider, infrastructure, validation and state failures must not turn into unsafe answers.

How the code is kept honest:

- One owner for each decision (one population detector, one model-id owner, one canary list); two names for one meaning is treated as a defect.
- Fix the defect class, not only the example: each fix ships with the test that fails without it.
- No new clinical facts in this service. The clinical source of truth belongs to the PharmaGuide pipeline (see the roadmap).
- Documentation numbers are generated, not typed.
- Provider-agnostic by construction; no model is part of the safety argument.

## See it work

Real routes from the current code (deterministic routes answer in milliseconds in-process; model-backed answers typically take 1.5–3 s):

| Question | Provenance |
|---|---|
| Can I take Viagra with nitroglycerin? | `system:nitrate-vasodilator` |
| I took too many pills | `system:emergency` |
| Can I take 5-HTP with sertraline? | `system:serotonin-risk` |
| Is it safe to take ginkgo with warfarin? | `system:blood-thinner-risk` |
| Can I take ibuprofen with warfarin? | `system:nsaid-anticoagulant` |
| I'm pregnant, can I take vitamin A? | `system:pregnancy-retinol` |
| Can I take magnesium with kidney disease? | `system:renal-magnesium` |
| What's the best form of magnesium for sleep? | a model, grounded in retrieved knowledge entries |
| Is turmeric good for joint pain? | a model, grounded in retrieved knowledge entries |
| Is my data private? | `system:privacy` |

**Try it locally** (deterministic routes need no API keys):

```bash
npm ci
npm test
vercel dev        # then, in another terminal:
curl -s localhost:3000/api/chat -H 'Content-Type: application/json' \
  -d '{"message":"Can I take Viagra with nitroglycerin?"}'
```

## Explore the engineering

| Concern | Where |
|---|---|
| Request orchestration | [`api/chat.js`](./api/chat.js) |
| Deterministic routing and precedence | [`src/core/router.js`](./src/core/router.js), [`src/gates/gates.json`](./src/gates/gates.json) |
| Emergency and safety detection | [`src/gates/detection.js`](./src/gates/detection.js) |
| Verified replies | [`src/gates/replies.js`](./src/gates/replies.js) |
| Entities, doses, populations | [`src/core/entities.js`](./src/core/entities.js), [`src/core/doseExtractor.js`](./src/core/doseExtractor.js), [`src/core/history.js`](./src/core/history.js) |
| Risk scoring and severity | [`src/core/riskScore.js`](./src/core/riskScore.js) |
| Knowledge retrieval | [`src/core/kbLookup.js`](./src/core/kbLookup.js), [`src/config/knowledgeBase.js`](./src/config/knowledgeBase.js) |
| Claims, references, policy | [`src/config/approvedClaims.js`](./src/config/approvedClaims.js), [`src/config/references.js`](./src/config/references.js), [`src/config/safetyPolicy.js`](./src/config/safetyPolicy.js) |
| LLM orchestration and failover | [`src/infra/providerRouter.js`](./src/infra/providerRouter.js) |
| Final safety validation | [`src/postprocess/safetyValidator.js`](./src/postprocess/safetyValidator.js) |
| Access control and rate limiting | [`src/infra/proxyAuth.js`](./src/infra/proxyAuth.js), [`src/infra/rateLimit.js`](./src/infra/rateLimit.js) |
| Production canaries | [`test/canaries.js`](./test/canaries.js), [`scripts/smoke_prod.js`](./scripts/smoke_prod.js) |
| Model evaluation | [`eval/`](./eval) (runner, adapters, golden set, scoring), [`test/eval-harness.test.js`](./test/eval-harness.test.js) |
| Safety regression suite | [`test/safety-harness.test.js`](./test/safety-harness.test.js) |
| Design write-ups | [`docs/safety-case/`](./docs/safety-case) |

## Toward a unified PharmaGuide intelligence layer

This service currently carries its own bounded knowledge layer. The planned architecture moves overlapping clinical facts (interactions, contraindications, doses, pregnancy guidance, ingredient forms) to a versioned export from PharmaGuide's canonical pipeline, so every product surface consumes the same reviewed source of truth and the assistant explains pipeline truth rather than maintaining a second copy.

```text
                  Canonical PharmaGuide pipeline
              identity · evidence · dose · interactions · safety
                               │
                     versioned clinical export
                               │
          ┌────────────────────┼─────────────────────┐
          ▼                    ▼                     ▼
      Mobile app            Website              Assistant
```

| Status | Item |
|---|---|
| Done | Deterministic routing, validator, multi-provider failover with soft-failure handling, privacy hardening, CI, production canaries and smoke workflow, generated README metrics, an enforced release gate (CI and deploy) with a 30-day claim-expiry warning, ruleset and knowledge versions reported by `/api/health` and an `X-PG-Ruleset` response header, a model-evaluation harness (`eval/`) |
| Planned | Measured model selection: run the evaluation across the candidate models and choose on the results |
| In progress | Dynamic clinical context assembly: a small invariant policy prompt plus retrieved context, instead of a large always-on prompt. Done: the prompt is stored as core (always-on rules) and topic (domain guidance) sections, pinned byte-identical to the production prompt, and topic sections can be selected per question behind `PG_PROMPT_MODE` (off by default; about a quarter of the tokens on realistic questions, because the large topic sections are split into per-item sections). Not done: the measured comparison against the full prompt, which decides whether it becomes the default |
| Planned | Consume the pipeline's versioned clinical export; retire overlapping facts from this repository |

See [`ROADMAP.md`](./ROADMAP.md) for the longer plan.

## The PharmaGuide platform

This API answers questions. **[PharmaGuide](https://pharmaguide.io)** is the larger system: a data pipeline that ingests NIH's Dietary Supplement Label Database (200,000+ labels), resolves ingredient identity, and evaluates each product before it ships to the mobile app and website as a versioned, validated release.

- **Quality and safety are separate judgements.** Product quality is a deterministic six-pillar score out of 100: Formulation (20), Dose (20), Evidence (20), Transparency (15), Verification (15), Safety/Hygiene (10). Safety is decided separately: a banned substance always blocks a product, whatever its quality score, and a quality tier never changes safety.
- **Evidence is matched to the specific preparation.** Matching an ingredient name does not transfer a lozenge trial to a capsule, or a combination trial to one constituent, and a null or negative outcome never creates a positive evidence bonus.
- **Evidence and dose are different questions.** Evidence asks whether research supports the intervention; dose asks whether the product supplies a comparable amount.
- **Uncertainty is a result.** Products can be `not_scored` or `suppressed_safety` rather than given a number the data cannot support.
- **Personal safety** (interactions, conditions, medications, populations) is evaluated against the person, separately from product quality.
- **Health profile, conditions and medications stay on the device** in the mobile app; see the [privacy policy](https://pharmaguide.io/privacy).

This assistant is built on the same safety philosophy, with migration to the shared clinical layer on the roadmap above. Join the beta at [pharmaguide.io](https://pharmaguide.io).

---

## API

### `POST /api/chat`

```json
{
  "message": "Can I take magnesium with metformin?",
  "history": [{ "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }],
  "_state": { "populations": ["pregnancy"], "conditions": [] }
}
```

- `message`: required, at most 2,000 characters. `history`: optional, the last 10 messages are used (1,000 characters each). `_state`: optional, send back what the previous response returned.
- `confidence` and `_state` appear on triage and model responses. Early conversational and emergency routes return only `reply` and `model`.

```json
{ "reply": "...", "model": "gemini-2.5-flash", "confidence": "moderate",
  "_state": { "populations": [], "known_meds": [], "known_supps": [], "conditions": [] } }
```

| Status | Meaning |
|---|---|
| `200` | Answered (including the deterministic degraded reply, `model: "system:degraded"`) |
| `400` | Missing, malformed or oversized message |
| `401` | Proxy secret required and missing or wrong (only when enforcement is on) |
| `405` | Not `POST`/`OPTIONS` |
| `429` | Rate limited; `retryAfter` in seconds |
| `500` | Unexpected error (no internals returned) |

Rate limit: 10 requests per minute per visitor at this API (the website proxy adds its own limit). In development (`NODE_ENV=development`) responses also include `_scores`, `_entities`, `_validation` and provider detail.

### `GET /api/health`

```json
{
  "status": "ok",
  "providers": {
    "gemini":          { "configured": true, "circuit": "CLOSED", "model": "gemini-2.5-flash" },
    "gemini_fallback": { "configured": true, "model": "gemini-3.5-flash-lite" },
    "groq":            { "configured": true, "circuit": "CLOSED", "model": "openai/gpt-oss-120b" }
  },
  "active_provider": "gemini"
}
```

### `GET /api/gaps`

Coverage-gap telemetry: topics that real queries touched but the knowledge layer does not cover, ranked by frequency, to prioritise human review.

## Configuration

Runtime: Node.js ≥ 18 on Vercel serverless functions (no build step). Dependencies: `@google/generative-ai`, `groq-sdk`, `@upstash/redis`, `@upstash/ratelimit`.

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY`, `GROQ_API_KEY` | LLM providers; a missing key removes that provider from the chain |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Shared rate limiting and coverage-gap telemetry; without them each instance uses memory |
| `RATE_LIMIT_SALT` (optional) | Key for the one-way hash of visitor addresses; falls back to `ANALYTICS_SALT`, then the Upstash token |
| `PG_PROXY_SECRET` | Shared secret the website proxy sends as `x-pg-proxy-secret` (with the visitor address as `x-pg-client-ip`) |
| `PG_REQUIRE_PROXY_SECRET` | `true` rejects every caller without the secret (401). Set only after the proxy sends it. Ignored, with a logged error, if `PG_PROXY_SECRET` is missing |
| `PG_PROMPT_MODE` | `full` (default): the whole system prompt for every provider. `selective`: the always-on rules plus only the topic sections a question touches, for every provider. `fallback`: full prompt for Gemini, the slim one only for the Groq fallback (whose free-tier token limit the full prompt exceeds). An unknown value means `full` |
| `ANALYTICS_ENABLED`, `ANALYTICS_SALT` | Optional PHI-free analytics |

Useful commands:

```bash
npm test                              # all suites, including the canaries and the README drift check
node scripts/smoke_prod.js [baseUrl]  # replay the production canaries against a deployment
node scripts/check_release.js         # release gate: policy version, claim review dates, forbidden analytics keys
node scripts/readme_metrics.js --write  # refresh the generated numbers in this README
RUN_LLM_TESTS=1 node test/llm-behavior.test.js   # opt-in live-provider behaviour tests
```

**Operational notes** (observed 2026-10-05; provider limits change, so check the provider's own pages):

- Gemini quota is per Google Cloud project and per model, and Google's [terms](https://ai.google.dev/gemini-api/terms) treat unpaid usage differently from paid usage; use a billing-enabled project for production. A new key in the same project does not change the quota.
- Groq's per-minute token limit on its free tier is lower than this service's system prompt, so Groq needs a higher tier (or the planned prompt minimisation) to serve as a fallback. See the [Groq](https://console.groq.com/docs/deprecations) and [Gemini](https://ai.google.dev/gemini-api/docs/deprecations) model-lifecycle pages for retirement dates.

## Responsible use and known limits

- **Educational, not medical advice.** The service does not diagnose, prescribe, or give dosing guidance for pregnancy or children; the validator enforces this on every reply.
- **Pattern-based detection has recall limits.** Emergency and interaction detection is tested against paraphrases and negative controls, but tested is not proven complete; new gaps become permanent regression cases.
- **The knowledge layer is bounded.** For topics it does not cover, the service answers more generally with lower confidence, and coverage telemetry flags the topic for review.
- **Tested in English.**
- **Language-model providers process message text.** See the privacy policy.

---

## Acknowledgements

Clinical accuracy review by **Laurie Pham, PharmD** (Doctor of Pharmacy · 15+ years clinical pharmacy).
Patient-education review by **Miriam Farez, NP** (Nurse Practitioner · integrative health practice).

Built and maintained by **Sean Cheick Baradji** · founder, PharmaGuide · B&Br Technology, Boston, MA.

## License

Proprietary © 2026 PharmaGuide. All rights reserved.

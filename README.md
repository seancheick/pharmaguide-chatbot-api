<div align="center">

# PharmaGuide AI

**A clinician-reviewed conversational AI for supplement &amp; medication safety.**
Built as a four-layer defense-in-depth pipeline — gates, retrieval, LLM, validator — so the high-stakes questions never reach an LLM and the safe ones come back grounded.

<sub>Part of the **[pharmaguide.io](https://pharmaguide.io)** supplement-intelligence platform · this chatbot is one surface of the product</sub>

<br />

[![Status](https://img.shields.io/badge/Status-Production-12B886?style=for-the-badge)](#)
[![Primary LLM](https://img.shields.io/badge/Primary-Gemini%202.5%20Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/gemini-api/docs)
[![Fallback LLM](https://img.shields.io/badge/Fallback-Llama%203.3%2070B-1A1A1A?style=for-the-badge&logo=meta&logoColor=white)](https://groq.com)
[![Hosting](https://img.shields.io/badge/Vercel-Serverless-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)

[![Tests](https://img.shields.io/badge/tests-1%2C223%20passing-2EA043?style=flat-square&logo=node.js&logoColor=white)](./test)
[![KB entries](https://img.shields.io/badge/KB-80%20entries-6E40C9?style=flat-square)](./src/config/knowledgeBase.js)
[![Safety gates](https://img.shields.io/badge/safety%20gates-39%20deterministic-1F6FEB?style=flat-square)](./src/core/router.js)
[![Wellness goals](https://img.shields.io/badge/wellness%20goals-11%20categories-DB2777?style=flat-square)](./src/core/wellnessGoalMap.js)
[![Validator](https://img.shields.io/badge/post--response%20validator-8%20rules-EAB308?style=flat-square)](./src/postprocess/safetyValidator.js)
[![Node](https://img.shields.io/badge/node-%E2%89%A518.0-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Code](https://img.shields.io/badge/code-10.7k%20LOC-555555?style=flat-square)](./src)
[![License](https://img.shields.io/badge/license-Proprietary-CB2030?style=flat-square)](#license)

</div>

---

## Beyond the chatbot — the full PharmaGuide platform

This API answers questions. **[PharmaGuide](https://pharmaguide.io)** answers the harder question: *what does my entire supplement &amp; medication stack actually do together?*

The full mobile + web product extends the same safety pipeline into a catalog-grade intelligence layer:

- **Cross-reference your full stack** — every supplement and medication you take, continuously checked against each other for interactions, medication-nutrient depletions (statins → CoQ10, metformin → B12, PPIs → magnesium), dose accumulation across products, and timing conflicts that don't show up on any single label.
- **180,000+ product catalog** with a 4-pillar PG Score (ingredient quality, safety &amp; purity, evidence, brand trust) — including the proprietary blends most apps can't decompose.
- **Live FDA recall monitoring** on the products you've actually scanned — Adverse Event Reporting System (FAERS) signals surface alongside the warning before most users hear about it.
- **Personal Fit** — every recommendation profile-gated against your conditions, medications, populations (pregnancy / renal / elderly), and goals.
- **Privacy by architecture** — your stack and conditions stay encrypted on-device. AES-256 locally, nothing about your body is uploaded to a server we control, nothing to subpoena, nothing to leak.
- **Clinician-reviewed** — every interaction and depletion mapping is signed off by a licensed PharmD before it ships.

This chatbot is one surface. The mobile app does the heavier lifting — opening in waves through 2026. **Join the beta at [pharmaguide.io](https://pharmaguide.io)**, or just ask the assistant any supplement / medication / interaction question right there. Same engine, same safety pipeline.

---

## Why this exists

Most consumer-health chatbots fail one of two ways:

1. **Refuse everything** — even legitimate questions about supplements, dosing, or interactions get a "consult a professional" wall.
2. **Answer recklessly** — confident replies on YMYL topics with no clinical review, no source grounding, and no awareness of dangerous drug-drug-supplement combinations.

PharmaGuide does neither. It's an architecture, not a wrapper:

- High-stakes interactions (statin + red yeast rice, SSRI + 5-HTP, PDE5 inhibitor + L-arginine, warfarin + ginkgo) are intercepted by **deterministic gates** with canned clinician-reviewed replies — they **never reach an LLM**.
- Wellness questions (sleep, stress, cholesterol, energy) flow to the LLM with a **grounded knowledge-base context** injected per-query so answers cite real dose ranges and contraindications instead of guessing.
- Every response — gate, LLM, or fallback — is then re-checked by a **post-response safety validator** before reaching the user.

The result is a chatbot that is *useful* on common wellness questions and *structurally unable* to invent dangerous advice on high-risk ones.

---

## Architecture — four independent safety layers

```
                ┌──────────────────────────────────────────────┐
                │  USER MESSAGE                                │
                └────────────────────┬─────────────────────────┘
                                     ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  LAYER 1 — Detection gates           (<5ms · deterministic)  │
   │  emergency · greeting · thanks · goodbye · flirty · creator  │
   │  pet · business · off-topic · medical-condition · wellness   │
   └────────────────────┬─────────────────────────────────────────┘
                        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  LAYER 2 — Risk triage router        (<10ms · deterministic) │
   │  39 routes — high-risk interactions get canned replies,      │
   │  NEVER reach an LLM. Examples: nitrate-vasodilator,          │
   │  serotonin-urgent, ssri-discontinuation, blood-thinner-risk, │
   │  grapefruit-CYP3A4, lithium-NSAID, statin-myopathy.          │
   └────────────────────┬─────────────────────────────────────────┘
                        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  LAYER 3 — KB-grounded LLM chain     (~1.5–2.5s)             │
   │  Gemini 2.5 Flash → Groq Llama 3.3 70B → degraded reply      │
   │  80-entry clinical KB injected as context;                   │
   │  per-provider circuit breakers + transparent failover.       │
   │  Wellness goals fan out to candidate KB entries even when    │
   │  the user named no specific supplement.                      │
   └────────────────────┬─────────────────────────────────────────┘
                        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  LAYER 4 — Post-response validator    (<2ms · deterministic) │
   │  no diagnosing · no stop-med advice · no prescribing         │
   │  no dosing for pregnancy/children without education          │
   │  no fabricated URLs/emails/phone numbers                     │
   │  single-question constraint · length sanity                  │
   │  → Strip-in-place when possible; SAFE_FALLBACK_REPLY when not│
   └────────────────────┬─────────────────────────────────────────┘
                        ▼
                  RESPONSE TO USER
```

| Layer | Purpose | Latency | Failure mode |
|---|---|---|---|
| 1. Detection | Trivial intent triage | < 5 ms | Falls through to Layer 2 |
| 2. Risk triage | High-stakes interception | < 10 ms | Falls through to Layer 3 |
| 3. LLM chain | Knowledge-grounded reasoning | 1.5–2.5 s | Fails over Gemini → Groq → graceful degradation |
| 4. Validator | Final safety check | < 2 ms | Sanitises in place or returns deterministic fallback |

---

## LLM provider chain

| Provider | Role | Model | Typical latency | Known limit |
|---|---|---|---|---|
| **Gemini** | Primary | `gemini-2.5-flash` (thinking off) | ~1.5–3 s | Free tier: 20 requests/day/model (observed 2026-10-05) |
| **Gemini Lite** | Interim second tier | `gemini-3.5-flash-lite` | ~1.5–2 s | Own quota per model; to be replaced by the eval-driven model choice |
| **Groq** | Cross-vendor fallback | `openai/gpt-oss-120b` | — | Free tier: 8,000 tokens/min, below the ~10.4k-token system prompt, so every request is rejected (HTTP 413) until the prompt is slimmed or the account is on Dev Tier |
| Degraded reply | Last resort | — | < 5 ms | always available |

Each provider has its own circuit breaker (`src/infra/circuitBreaker.js`, `src/infra/geminiCircuitBreaker.js`; the lite tier has a short one inside `providerRouter.js`). When a provider fails, rate-limits, or returns an answer that is cut off, blocked or empty, the chain moves on. The whole chain shares a 12 s time budget so it finishes inside the website proxy's 15 s limit. When every provider fails, the user receives a deterministic graceful-degradation reply with provider/911/Poison-Control guidance rather than an error.

Live `/api/health` exposes per-provider `configured`, `circuit`, and `model` so operators can monitor failover state.

---

## Knowledge-base grounding

When entities are extracted from the user's message, matching KB entries are injected into the LLM prompt with structured fields:

- **Dose range** (`adult_dose_range.min / .max / .unit`)
- **Upper limit** (with source)
- **Timing** (best time, with-food, separation from other ingredients)
- **Population safety** (pregnancy / renal / elderly with notes)
- **Interactions** (with mechanism + severity + timing-fix)
- **Common goals** (informational tags)

When the user asks a *goal-only* question ("what can I take to sleep better") with no named supplement, the wellness-goal router maps the goal to candidate KB entries (sleep → melatonin / magnesium / glycine / l-theanine) and injects those as candidates — the LLM never has to answer from parametric memory alone.

**80 entries covering** vitamins (A, C, D, E, K2), minerals (Mg, Fe, Zn, Ca, K, Se, I, folate), adaptogens (ashwagandha, rhodiola), sleep (melatonin, glycine, valerian, L-theanine), cardiovascular (CoQ10, omega-3, red yeast rice, plant sterols), fiber (psyllium, glucomannan), nitric-oxide donors (L-arginine, L-citrulline), nootropics (alpha-GPC, creatine, L-theanine), prescription medications (warfarin, statins, SSRIs, metformin, levothyroxine, NSAIDs, PPIs, PDE5 inhibitors, nitrates), and more.

---

## API

### `POST /api/chat`

```json
{
  "message": "Can I take magnesium with metformin?",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Response (LLM path)**

```json
{
  "reply": "Magnesium and metformin have a documented interaction...",
  "model": "gemini-2.5-flash",
  "confidence": "moderate"
}
```

**Response (gate path)** — the `model` field reflects which deterministic route answered:

```json
{
  "reply": "🔴 This combination can cause severe low blood pressure...",
  "model": "system:nitrate-vasodilator"
}
```

**Response (degraded)** — both LLM providers failed; user gets a safe redirect, operators get a diagnostic surface:

```json
{
  "reply": "I wasn't able to fully process your question right now...",
  "model": "system:degraded",
  "_provider_failures": [{ "provider": "gemini", "status": 429, "message": "..." }]
}
```

### `GET /api/health`

```json
{
  "status": "ok",
  "version": "2.0.0",
  "providers": {
    "gemini": { "configured": true, "circuit": "CLOSED", "model": "gemini-2.5-flash" },
    "groq":   { "configured": true, "circuit": "CLOSED", "model": "llama-3.3-70b-versatile" }
  },
  "active_provider": "gemini"
}
```

### `GET /api/gaps`

Operational dashboard — topic-coverage gaps detected over time from real queries. Drives KB expansion priorities.

---

## Tech stack

[![Node 18+](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Vercel](https://img.shields.io/badge/Vercel-Serverless%20Functions-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com)
[![Gemini](https://img.shields.io/badge/Google-Gemini%202.5%20Flash-4285F4?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)
[![Groq](https://img.shields.io/badge/Groq-Llama%203.3%2070B-F55036?style=flat-square)](https://groq.com)
[![Upstash](https://img.shields.io/badge/Upstash-Redis-DC2626?style=flat-square)](https://upstash.com)

- **Runtime** · Node.js ≥ 18 on Vercel serverless functions (no build step)
- **LLM SDKs** · `@google/generative-ai` + `groq-sdk`
- **Rate limiting + conversation state + topic-gap tracker** · Upstash Redis (sliding-window per IP, with in-memory fallback for dev)
- **Cache** · in-memory response cache (1-hour TTL, max 200 entries, LRU eviction, per-provider keying)
- **Testing** · Node native `--test` runner, 1,223 cases across 17 suites; release gate via `scripts/check_release.js`
- **CI/CD** · Vercel auto-deploys on push to `main`; `npm run check:release` enforces release-gate before deploy

---

## Model lifecycle

| Model | Status | Shutdown |
|---|---|---|
| `gemini-2.5-flash` | Active — primary | No shutdown date announced; Google limits access to projects that already use it |
| `gemini-3.5-flash-lite` | Active — interim second tier | None announced |
| `gemini-2.5-flash-lite` | Unavailable to new projects (HTTP 404) | — |
| `gemini-2.0-flash` | **Do not use** — shut down | 2026-06-01 |
| `openai/gpt-oss-120b` | Configured Groq model (see tier limit above) | None announced |
| `llama-3.3-70b-versatile` | **Shut down** | 2026-08-16 |

Sources (checked 2026-10-05): [Gemini deprecations](https://ai.google.dev/gemini-api/docs/deprecations), [Groq deprecations](https://console.groq.com/docs/deprecations).

---

## Production notes

- **Use a billing-enabled Google project for Gemini.** Free-tier quota is per project and per model (20 requests/day for `gemini-2.5-flash`), and Google's terms say unpaid usage may be used to improve its products and read by human reviewers. A new key in the same project does not change either.
- **Groq needs Dev Tier or a slimmer prompt** before it can act as a fallback (see the provider table).
- **Watch `/api/health`** + Vercel function logs for `[PROVIDER]` warnings. Each failover and each provider failure is logged with the provider name, HTTP status, and truncated error message. Provider detail is returned in the response only when `NODE_ENV=development`.
- **Smoke test** — `node scripts/smoke_prod.js [baseUrl]` replays the pinned canaries (`test/canaries.js`) against a deployed URL. The `Production smoke` workflow runs it after every production deploy and daily.
- **Release gate** — `npm test` (includes the canaries) and `scripts/check_release.js` (policy version, claim review dates, forbidden analytics keys).

### Environment variables

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY`, `GROQ_API_KEY` | LLM providers (a missing key just removes that provider from the chain) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Shared rate limiting and topic-gap tracking; without them each instance falls back to in-memory |
| `RATE_LIMIT_SALT` (optional) | Key for the one-way hash of the visitor address used by the limiter. Falls back to `ANALYTICS_SALT`, then to the Upstash token. Visitor addresses are never stored or sent to Redis |
| `PG_PROXY_SECRET` | Shared secret the website proxy sends as `x-pg-proxy-secret`, together with the visitor address as `x-pg-client-ip` |
| `PG_REQUIRE_PROXY_SECRET` | Set to `true` (only after the proxy sends the secret) to reject every other caller with 401. Ignored, with a logged error, if `PG_PROXY_SECRET` is missing |
| `ANALYTICS_ENABLED`, `ANALYTICS_SALT` | Optional PHI-free analytics events |

---

## Acknowledgements

Clinical accuracy review by **Laurie Pham, PharmD** (Doctor of Pharmacy · 15+ years clinical pharmacy)
Patient-education review by **Miriam Farez, NP** (Nurse Practitioner · integrative health practice)

Built and maintained by **Sean Cheick Baradji** · founder, PharmaGuide · B&Br Technology, Boston, MA.

## License

Proprietary © 2026 PharmaGuide. All rights reserved.

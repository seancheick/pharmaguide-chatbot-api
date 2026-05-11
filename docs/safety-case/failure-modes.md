# Failure Mode Playbook

## Overview

This document catalogs known failure modes, their impact, and PharmaGuide's response strategy for each.

## Failure Modes

### FM-1: LLM Provider Timeout

| Field | Value |
|-------|-------|
| Trigger | Active provider (Gemini, then Groq) does not respond within timeout (Gemini 12 s, Groq 8 s) |
| Impact | User gets no answer to their question — provided BOTH chain members time out |
| Severity | Low — safety gates already handled high-risk scenarios before LLM call; chain falls back to next provider transparently |
| Response | Return `DEGRADED_RESPONSES.llm_timeout` with pharmacist/prescriber referral once all providers fail |
| Detection | Per-provider timeout via AbortController; `callWithFallback` walks the chain until success or exhaustion |
| Recovery | User retries; no state corruption. Circuit breaker opens after threshold to bypass the failing provider on subsequent requests. |

### FM-2: LLM Provider Error (500, 503)

| Field | Value |
|-------|-------|
| Trigger | Primary provider (Gemini) returns server error |
| Impact | None to user — chain falls through to Groq fallback transparently |
| Severity | Low — only escalates if BOTH providers error simultaneously |
| Response | Try next provider; only return `DEGRADED_RESPONSES.llm_error` if all chain members fail |
| Detection | Per-provider try/catch in `callWithFallback`; failure increments that provider's circuit breaker |
| Recovery | Automatic — Groq fallback typically succeeds; circuit breaker opens Gemini after threshold failures to avoid retry cost |

### FM-3: LLM Provider Rate Limit (429)

| Field | Value |
|-------|-------|
| Trigger | Gemini 2.5 Flash daily quota exceeded (free tier: 250 RPD per project) OR Groq daily quota exceeded (free tier: 1,000 RPD) |
| Impact | If Gemini 429s: no user impact — chain falls back to Groq. If BOTH 429: users see degraded reply until quota resets. |
| Severity | Low under normal traffic with both providers healthy; Medium if both hit ceiling simultaneously. |
| Response | Try next provider; return `DEGRADED_RESPONSES.llm_error` only if both providers 429 |
| Detection | `error.status === 429` in per-provider catch; failure recorded against that provider's circuit |
| Recovery | Quota reset (24h for free tier) OR enable paid billing on the rate-limited provider to lift ceiling |

### FM-4: LLM Generates Unsafe Content

| Field | Value |
|-------|-------|
| Trigger | LLM output violates safety rules despite system prompt |
| Impact | Without validator: user receives unsafe health information |
| Severity | High — but mitigated by Layer 4 |
| Response | Post-response validator replaces with `SAFE_FALLBACK_REPLY` |
| Detection | `validateResponse()` returns `safe: false` |
| Recovery | Automatic — user can rephrase |

### FM-5: Gate Reply Empty or Malformed

| Field | Value |
|-------|-------|
| Trigger | Reply function returns empty string or undefined |
| Impact | User sees blank response for high-risk scenario |
| Severity | High |
| Response | Validator rule `no_empty_safety` catches empty safety responses → fallback |
| Detection | `validateResponse()` checks `route.startsWith("system:")` + empty reply |
| Recovery | Fix reply function; add test case |

### FM-6: Entity Extraction Miss

| Field | Value |
|-------|-------|
| Trigger | User mentions a medication/supplement not in ENTITY_PATTERNS |
| Impact | Risk scoring misses the interaction; LLM handles without gate protection |
| Severity | Medium — LLM system prompt still provides guidance |
| Response | `unknownResolver.js` resolves common brand names and misspellings |
| Detection | `unknowns` array in entities; `needsMedicationClarifier()` for ambiguous inputs |
| Recovery | Add to ENTITY_PATTERNS and synonym map |

### FM-7: Rate Limit Redis Unavailable

| Field | Value |
|-------|-------|
| Trigger | Upstash Redis connection fails |
| Impact | Rate limiting falls back to in-memory (per-instance, resets on cold start) |
| Severity | Low — in-memory rate limiting still provides protection |
| Response | Transparent fallback; no user-visible impact |
| Detection | Redis client error handling in `rateLimit.js` |
| Recovery | Automatic when Redis reconnects |

### FM-8: Prompt Injection Succeeds

| Field | Value |
|-------|-------|
| Trigger | Novel injection bypasses meta-question regex |
| Impact | LLM may reveal system prompt or generate off-topic content |
| Severity | Medium — system prompt is not secret; safety gates are deterministic |
| Response | Post-response validator catches diagnosing/prescribing even if injection succeeds |
| Detection | Adversarial test suite; manual review |
| Recovery | Update meta-question regex; add test case |

### FM-9: Context Window Overflow

| Field | Value |
|-------|-------|
| Trigger | Long conversation history exceeds model context window |
| Impact | LLM may lose earlier context or truncate |
| Severity | Low — history capped at 10 messages, 1000 chars each |
| Response | `sanitizeHistory()` enforces limits before LLM call |
| Detection | Token estimation logging in dev mode |
| Recovery | Automatic — oldest messages dropped |

### FM-10: Deployment Configuration Error

| Field | Value |
|-------|-------|
| Trigger | `GEMINI_API_KEY` AND/OR `GROQ_API_KEY` missing or invalid |
| Impact | If one is missing: chain still works with the other. If BOTH missing: all LLM calls fail; gate routes still work. |
| Severity | High only when both providers misconfigured; gate routes (emergency, serotonin-risk, etc.) remain functional regardless. |
| Response | Degraded reply with pharmacist/prescriber/911 guidance when no provider available |
| Detection | `isAvailable()` check per provider in `buildProviderChain()`; `error.status === 401` from upstream surfaces an invalid-key state |
| Recovery | Fix the relevant environment variable in Vercel and redeploy (env-var changes require redeploy to take effect) |

## Degradation Priority

When multiple failures occur simultaneously:

1. **Emergency gate always works** — no external dependencies
2. **All safety gates work** — regex-based, no API calls
3. **LLM is the only external dependency** — its failure is gracefully handled
4. **Rate limiting degrades to in-memory** — still functional
5. **Audit logging is fire-and-forget** — failure doesn't block response

## Testing Failure Modes

| Mode | Tested By |
|------|-----------|
| FM-4 | `test/validator.test.js`, `test/adversarial.test.js` |
| FM-5 | `test/validator.test.js` (gate reply integrity) |
| FM-6 | `test/edge-cases.test.js` (synonym tests) |
| FM-8 | `test/adversarial.test.js` |
| FM-9 | `test/adversarial.test.js` (history sanitization) |

# Failure Mode Playbook

## Overview

This document catalogs known failure modes, their impact, and PharmaGuide's response strategy for each.

## Failure Modes

### FM-1: LLM Provider Timeout

| Field | Value |
|-------|-------|
| Trigger | Groq API does not respond within 8 seconds |
| Impact | User gets no answer to their question |
| Severity | Low — safety gates already handled high-risk scenarios before LLM call |
| Response | Return `DEGRADED_RESPONSES.llm_timeout` with pharmacist/prescriber referral |
| Detection | `withGracefulFallback()` timeout race |
| Recovery | User retries; no state corruption |

### FM-2: LLM Provider Error (500, 503)

| Field | Value |
|-------|-------|
| Trigger | Groq API returns server error |
| Impact | User gets no answer |
| Severity | Low — same as FM-1 |
| Response | Return `DEGRADED_RESPONSES.llm_error` |
| Detection | Catch block in handler |
| Recovery | Automatic — next request may succeed |

### FM-3: LLM Provider Rate Limit (429)

| Field | Value |
|-------|-------|
| Trigger | Groq API quota exceeded |
| Impact | All users affected until quota resets |
| Severity | Medium — extended outage possible |
| Response | Return 429 with `retryAfter: 30` and message about AI service being busy |
| Detection | `error.status === 429` check in handler |
| Recovery | Wait for quota reset; consider provider fallback |

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
| Trigger | GROQ_API_KEY missing or invalid |
| Impact | All LLM calls fail; gate routes still work |
| Severity | High for LLM route; no impact on gate routes |
| Response | 500 error with "Service configuration error" message |
| Detection | `error.status === 401` check |
| Recovery | Fix environment variable |

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

# Safety Architecture

## Overview

PharmaGuide uses a **defense-in-depth** architecture with 4 safety layers. Every user message passes through all applicable layers before a response is returned.

## Layer 1: Input Gates (Deterministic, Pre-LLM)

**Location**: `api/chat.js` lines 52-88, `src/gates/detection.js`

Messages are evaluated against pattern-based gates in priority order:

1. **Emergency** — overdose, suicidal ideation, acute cardiac/anaphylaxis → instant 911/988 reply
2. **Greeting** — first-message-only hello/hi → welcome reply
3. **Thanks / Goodbye** — social closers → polite reply
4. **Creative writing** — poems, songs, stories → off-topic reply
5. **Off-topic** — intent score < 2 on first message → off-topic reply

These gates fire before any entity extraction or risk scoring. Emergency is always first.

## Layer 2: Risk Triage Pipeline (Deterministic, Pre-LLM)

**Location**: `src/core/entities.js`, `src/core/riskScore.js`, `src/core/router.js`

For messages that pass input gates:

1. **Entity extraction** — regex-based extraction of medications, supplements, populations, symptoms, intents
2. **Risk scoring** — 7 independent risk dimensions scored 0-3 each
3. **Route decision** — 18 priority-ordered route checks; if any matches, a deterministic reply is returned

Risk domains: serotonin, bleeding, hepatotoxic, absorption, pregnancy/teratogen, renal clearance, stimulant

If no risk route matches → message goes to LLM (Layer 3).

## Layer 3: LLM Generation (Non-Deterministic)

**Location**: `api/chat.js` lines 118-158

- Model: Llama 3.3 70B via Groq
- System prompt enforces: no diagnosing, no prescribing, single question, educational framing
- Temperature: 0.45, max tokens: 650
- Post-processing: disclaimer stripping, mineral spacing injection, single question enforcement

## Layer 4: Post-Response Validator (Deterministic, Post-LLM)

**Location**: `src/postprocess/safetyValidator.js`

Every response (both gate replies and LLM outputs) is validated against 7 rules:

1. No diagnosing language
2. No stop-medication instructions
3. No prohibited dosing (pregnancy/children)
4. No excessive questions (>3)
5. No prescribing language
6. Length limit (5000 chars)
7. No empty safety-route responses

If any rule is violated, the response is replaced with `SAFE_FALLBACK_REPLY`.

## Data Flow

```
User Message
    │
    ├─► Layer 1: Input Gates
    │   ├─ Emergency? → 911/988 reply
    │   ├─ Greeting?  → welcome reply
    │   ├─ Social?    → thanks/goodbye reply
    │   ├─ Creative?  → off-topic reply
    │   └─ Off-topic? → off-topic reply
    │
    ├─► Layer 2: Risk Triage
    │   ├─ Extract entities
    │   ├─ Score 7 risk dimensions
    │   ├─ Route by risk priority
    │   └─ Match? → deterministic gate reply
    │
    ├─► Layer 3: LLM Generation
    │   ├─ System prompt + history + message
    │   ├─ Groq API call
    │   └─ Post-processing (disclaimers, spacing, question limit)
    │
    └─► Layer 4: Post-Response Validator
        ├─ 7 safety rules checked
        ├─ Pass → return response
        └─ Fail → return SAFE_FALLBACK_REPLY
```

## Key Design Decisions

1. **Gates before LLM** — High-risk scenarios never reach the LLM, eliminating generation risk entirely
2. **Deterministic replies** — Gate responses are hardcoded strings, not generated; they can be audited and version-controlled
3. **Validator as last defense** — Even if a gate reply or LLM output somehow contains unsafe content, the validator catches it
4. **No persistent state** — Stateless serverless function; conversation context is derived from history each request
5. **PHI-free logging** — Audit logs contain entity counts and risk flags but never raw messages or entity names

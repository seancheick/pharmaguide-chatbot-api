# Post-Response Safety Validation Rules

## Overview

The post-response safety validator (`src/postprocess/safetyValidator.js`) runs on **every response** — both deterministic gate replies and LLM-generated outputs. It is the last line of defense before a response reaches the user.

If any rule is violated, the entire response is replaced with `SAFE_FALLBACK_REPLY`.

## Rules

### Rule 1: No Diagnosing Language

**ID**: `no_diagnosing`

Detects phrases where the system appears to diagnose a medical condition.

**Blocked patterns**:
- "you have [condition]" (diabetes, disorder, syndrome, deficiency, infection, etc.)
- "you are suffering from / diagnosed with / experiencing"
- "my diagnosis is"
- "I'm diagnosing you"
- "this confirms you have / a diagnosis of"
- "your diagnosis"

**Allowed**:
- "could be", "may be", "might be" — hedged language is acceptable
- "talk to your prescriber about" — referral language

---

### Rule 2: No Stop-Medication Instructions

**ID**: `no_stop_med`

Detects instructions to stop taking prescribed medications.

**Blocked patterns**:
- "stop taking your prescribed [medication]"
- "discontinue your [medication]"
- "quit taking your [medication]"
- "do not take your prescribed [medication]"

**Exceptions**:
- Route `system:serotonin-urgent` — allowed to say "stop the serotonergic supplement" (this is a supplement, not a prescribed medication, and the context is urgent safety)
- "do not start or stop" phrasing — allowed (advises caution, not action)

---

### Rule 3: No Prohibited Dosing

**ID**: `no_prohibited_dosing`

Detects specific dosing recommendations for pregnancy or pediatric populations.

**Triggers**: Message or entities indicate pregnancy or child/infant/pediatric context.

**Blocked**: Any pattern like "take/give/dose/recommend [number] mg/IU/mcg" directed at these populations.

**Exceptions**:
- Upper limit references ("the upper limit is", "not exceed", "no more than") — informational, not prescriptive

---

### Rule 4: No Excessive Questions

**ID**: `single_question`

Detects responses with too many questions (>3 real questions).

**Counting logic**:
- Extracts all sentences ending with `?`
- Filters out: quoted questions (starting with `"` or `*`), very short fragments (<10 chars)
- Threshold: 4+ real questions triggers violation

**Rationale**: The system prompt instructs "ask one focused question." The validator allows some flexibility (up to 3) but catches egregious cases.

---

### Rule 5: No Prescribing Language

**ID**: `no_prescribing`

Detects language that implies the system is prescribing medication.

**Blocked patterns**:
- "I am prescribing / ordering / writing a prescription"
- "take this prescription"
- "I recommend you take [dose] [frequency] for [duration]" — the full prescribing pattern

**Allowed**:
- "consider asking your provider about" — referral language
- "typical dose is" — informational (general knowledge)

---

### Rule 6: Response Length Limit

**ID**: `length_limit`

Responses exceeding 5,000 characters are flagged.

**Rationale**: Extremely long responses may indicate runaway generation or prompt injection that caused the model to dump information.

---

### Rule 7: No Empty Safety Response

**ID**: `no_empty_safety`

Safety-route responses (routes starting with `system:`) must not be empty.

**Rationale**: An empty safety response means a gate function returned nothing, which is a bug. Users would see a blank response for a high-risk scenario.

**Note**: Empty LLM responses are allowed (they indicate a generation failure, handled elsewhere).

---

## Fallback Response

When any rule is violated, the response is replaced with:

```
I want to make sure I give you accurate, safe information.

- Could you **rephrase your question** with the specific supplement or medication name?
- If you're experiencing symptoms, please contact your prescriber or pharmacist.

I'm here to help with supplements, medications, and interactions.
```

This fallback is safe, non-diagnostic, non-prescriptive, and guides the user to rephrase or seek professional help.

## Testing

- **Unit tests**: `test/validator.test.js` (39 tests) — covers all 7 rules with positive/negative cases
- **Integration**: `test/adversarial.test.js` (65 tests) — validates gate replies pass the validator and adversarial outputs are caught
- **Gate reply integrity**: All 15 deterministic gate replies are validated against the validator in both test files

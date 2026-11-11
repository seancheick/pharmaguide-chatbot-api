# Post-Response Safety Validation Rules

## Overview

The post-response safety validator (`src/postprocess/safetyValidator.js`) runs on **every response** — both deterministic gate replies and LLM-generated outputs. It is the last line of defense before a response reaches the user. Rules 1–7 apply to both; the two report-don't-prescribe rules apply to model answers only.

What happens on a violation depends on the source:
- **Gate reply:** the reply is replaced with `SAFE_FALLBACK_REPLY`.
- **Model answer:** the draft is rewritten once with the broken rule named, inside what is left of the one provider time budget. If the rewrite also breaks a rule, or too little time is left to try, the reply is replaced with `SAFE_FALLBACK_REPLY`.

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

### Report, don't prescribe (model answers only)

**IDs**: `no_directive_dosing`, `no_medication_substitution` (2026-11-10 regulatory review)

PharmaGuide reports what sources found; the user and their prescriber decide. Curated gate replies are not checked by these two rules.

**Blocked**:
- An instruction to take a dose: "For your allergies, take quercetin 500 mg daily", "You should be taking 500 mg", "Aim for 2,000 IU", "I'd go with 300 mg", "500 mg daily is a good choice"
- Replacing a prescription, worded any way that reaches a medicine: "replace metformin with berberine", "an alternative to your statin", "come off your statin", "you may not need your statin"

**Allowed**:
- Attributed amounts: "trials used 500–1000 mg/day", "NIH sets the upper limit at 350 mg/day"
- Warnings about an amount: "Taking 10 g of niacin can damage the liver", "400 mg or more increases diarrhea risk" (a gerund at the start of a sentence is a subject, not an order)
- Ceilings and timing: "keep caffeine under 400 mg", "take levothyroxine 4 hours apart from 500 mg calcium", "take calcium 500 mg at least 4 hours after levothyroxine". Timing written after the amount counts only when it states an interval or "apart from" before a medicine: "take 300 mg magnesium 1 hour before bed" and "take 500 mg quercetin daily, separate from iron" are still directives.
- Protective or refuting wording: "do not use berberine instead of your metformin", "some sites claim you can replace your metformin; that is not supported"

A model draft that breaks any blocking rule is rewritten once with the reason, and the served reply's provider and model are the retry's. The rewrite shares the first draft's 12 s chain budget (`CHAIN_DEADLINE_MS`), so the answer still returns inside the website proxy's 15 s limit; if less than `MIN_ATTEMPT_MS` remains, the rewrite is skipped. A second failure gets the safe fallback, which keeps the deterministic dose flag and carries no `basis`. The rewrite costs one more provider call, so a rejected draft roughly doubles that answer's latency.

The rules are a backstop for the prompt, not a complete parser: a dose written in words or an unusual phrasing can still pass, so the prompt's report-don't-prescribe section stays the primary control.

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

When a gate reply breaks a rule, or a model answer still breaks one after its rewrite, the response is replaced with:

```
I want to make sure I give you accurate, safe information.

- Could you **rephrase your question** with the specific supplement or medication name?
- If you're experiencing symptoms, please contact your prescriber or pharmacist.

I'm here to help with supplements, medications, and interactions.
```

This fallback is safe, non-diagnostic, non-prescriptive, and guides the user to rephrase or seek professional help.

## Testing

- **Unit tests**: `test/validator.test.js` — positive and negative cases for rules 1–7
- **Report, don't prescribe**: `test/report-not-prescribe.test.js` — the two model-only rules, the single rewrite, its time budget and the fallback
- **Integration**: `test/adversarial.test.js` — gate replies pass the validator and adversarial outputs are caught
- **Gate reply integrity**: `adversarial.test.js` section 15 runs a named set of deterministic gate replies (emergency, welcome, the main safety gates) through the validator; it does not cover every route in `ROUTE_REPLY_MAP`

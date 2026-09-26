# Step 72 — Advanced Error Intelligence Engine (consolidated design)

**Status:** Reconstructed, precise architectural record of the Step 72 discussion. **Not** the original verbatim transcript and **not** a completed, benchmarked AI feature. It follows the corrected v2 baseline and feeds the Steps 73–82 continuation.

## Purpose and strict academic boundaries

Analyze a student's **verified original Bangla or English writing**, not unverified/raw OCR, to identify evidence-grounded mistakes and opportunities for correction. The engine must never award or deduct marks, reinterpret a published rubric or override a finalized assessment. Grammar, spelling, punctuation, word choice and sentence construction are distinct review categories. A recommendation to use a different style is not automatically a grammatical mistake.

`VerifiedWritingText` identity, immutable content hash and exact linguistic context are prerequisites. The detector can use approved language, student learning level, writing type, topic and task instructions. It must not take factor score as a cue to invent corresponding mistakes; scoring and error detection are independent processing concerns.

## Typed processing architecture

1. Create immutable `ErrorDetectionRun` with submission, exact verified-text ID/hash, language, schema/model/prompt configuration, task input fingerprint and processing state.
2. Generate **candidates** from a provider-abstracted Bangla/English detector. Never grant untrusted writing or detected prompt-like phrases instructional authority.
3. Validate each candidate against the original text using exact Unicode code-point offsets, expected quote, content hash and sensible grapheme boundaries for UI highlighting. An apparent error with fabricated or mismatched evidence must not reach student reports.
4. Apply language-appropriate academic/rule validation. Recognize valid alternative corrections, intended meaning, regional expression and context; English grammatical rules do not automatically apply to Bangla. Distinguish real mistakes from stylistic preferences.
5. Return structured findings with category, severity **of the observed writing issue**, rule code, original exact text, candidate correction(s), intelligible explanation, linked skill, evidence references and supported uncertainty. Avoid multiple duplicate findings for one underlying issue while preserving genuinely distinct overlapping findings.
6. Use `CONFIRMED`, `POSSIBLE`, `DISMISSED` and independently labeled `AI_VALIDATED` or `HUMAN_REVIEWED` provenance. AI confidence is not a calibrated academic truth claim. Only validated confirmed findings count toward recurring-mistake analytics. Possible observations are presented as reviewable uncertainty, not proven errors. Dismissed observations disappear from active learning recommendations.
7. Record append-only `ErrorReviewAction` for authorized teachers. When adjudication changes, do not silently mutate an old student report; invalidate or regenerate dependent feedback and progress projections with source-version awareness.

## Domain records and dependencies

- `ErrorDetectionRun`: immutable source/provenance and lifecycle.
- `WritingError`: type, status, rule and teaching explanation.
- `ErrorEvidence`: verified-text reference, Unicode source offsets and exact quote.
- `ErrorReviewAction`: append-only teacher decisions and audit history.
- `ErrorPatternOccurrence` and `ErrorPattern`: recurring validated, comparable observations with explicit observation period and appropriate linguistic denominators.

Execution can proceed independently of the Examiner pipeline after verified text exists. **Step 73 Feedback** joins compatible findings only with the **finalized, effective score revision** when explaining assessed performance. A later score revision does not automatically require the unchanged writing to undergo redetection; regenerate only score-dependent feedback.

## Protected interfaces

Examples: own submission's validated error list, own supported error-pattern progress, assigned-teacher review queue and audited review action. Every read/write requires the same scoped student/program/teacher/guardian policy as the source academic record; an error ID is not sufficient authorization. Provider calls receive only minimum permitted data, and ordinary logs must not include raw original children's writing.

## Benchmarks and release criteria

Build separate expert-reviewed Bangla and English benchmarks across writing types and relevant learning levels. Track category-specific precision, recall, false-positive rates, correction validity, meaning preservation, Unicode evidence exactness and alternative-valid-answer handling. Do not claim universal or perfect mistake detection. Mandatory negative tests include unverified OCR rejection, invalid offsets, copied/fabricated source quotes, dismissed findings contaminating mastery, duplicate async delivery, invalid teacher scope and any attempt by the Error Engine to change scores.

**PFCR handoff:** Confirmed error rule → targeted skill → clear learning explanation → short correction activity → independent new linked rewrite. The original verified writing remains immutable. This document is a **future implementation contract**; current GitHub Step 86 synthetic integration tests intentionally do not simulate production error detection.
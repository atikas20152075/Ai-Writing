# AI Writing Assessment Platform — Resume Context

**As of 26 September 2026. Next step: STEP 72.**

We are building a premium, responsive Bangla/English writing assessment platform, initially aligned with Ideal Cadet Academy's guided/freehand writing teaching, reusable for other writing types. Pedagogical signature: PFCR = Practice + Feedback + Correction + Rewrite.

**Status:** Architecture up to Step 71 is described; no completed app, migrations or verified AI benchmark should be inferred. Early Steps 1–60 are known from a project summary, while Steps 61–71 are described in detail. Canonical corrections are in the accompanying `AI_Writing_Platform_Master_Blueprint_v2_Audit.md`.

Core pipeline: secure student typed/image submission -> OCR for image -> student/teacher verified text -> grounded understanding without scoring -> AI examiner using immutable published rubric -> deterministic backend score/evidence checks -> independently prompted AI verifier -> approved transactional finalization or scoped human review -> independent Error Intelligence -> feedback -> PFCR exercise and rewrite -> progress/report to authorized actors.

Hard principles: Published rubric versions immutable and human-configured. Original submission/handwriting immutable. AI never invents marking scheme. Exact decimal criterion scores; zero is not processing failure. OCR never grammar-corrects. Scoring, errors, feedback and coaching separated. Parent only verified linked children; teacher only assigned students; object-level auth. All consequential changes audited; all async consumers idempotent; report/effective score revision consistent. Child data processing requires legally reviewed authority, data minimization, retention/deletion and vendor due diligence.

V2 corrections adopted as target design: Program-scoped enrollment supports simultaneous coaching+writing classes; verified guardian linking and purpose consent distinct; explicit unique applicable default rubric; complete topic and rubric snapshots; canonical Unicode evidence offset and semantic support checks; blinded independent verifier option; immutable accepted runs; append-only score revisions with single effective resolver; outbox at-least-once design; benchmarked bilingual OCR/scoring; measured vertical slice over speculative module expansion. Data privacy review must consider Bangladesh Personal Data Protection Act 2026.

**MVP build order:** (0) pin spec/version/risk and benchmark; (1) authorization+guardian+program+rubric; (2) full typed grading pipeline; (3) multi-page image/OCR; (4) errors/feedback/PFCR; (5) parent/teacher/report; (6) academy pilot.

**Step 72 request:** Fully specify Error Intelligence for Bangla/English with factor-independent mistake detection, line/span grounding, categories grammar/spelling/punctuation/word choice/sentence construction, possible/confirmed/dismissed states, confidence uncertainty, reviewer override, versioned AI model/prompt, DB/API/queue design, PFCR feedback/practice mapping, benchmark and release tests. No automatic score deduction and no analysis of unverified raw OCR.

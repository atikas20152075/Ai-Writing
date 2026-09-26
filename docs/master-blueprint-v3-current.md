# AI Writing Assessment Platform — Master Blueprint v2 & Architecture Audit

**Baseline:** Steps 1–71 (available project summary and full accessible Steps 61–71)  
**Prepared:** 26 September 2026  
**Checkpoint:** Step 71 reviewed; **next design step is Step 72 — Error Intelligence**  
**Status:** Architecture specification, not a working application. No production migrations, deployed services, AI benchmarks, or end-to-end tests are represented as completed.

> **Scope limitation:** The original verbatim texts for Steps 1–60 were not recoverable in this session. Their known decisions were reviewed from the retained project summary; Steps 61–71 were available in greater detail. This document is a consolidated and corrected baseline, not a claim to have line-reviewed unavailable original transcripts. A prior ChatGPT share link was too large to retrieve through the available web reader. No earlier canonical technical specification was found in the searched Library documents.

## 1. Project charter and preserved decisions

**Product:** An attractive, responsive, accessible AI writing assessment web application, initially suited to Ideal Cadet Academy's Bangla/English guided/freehand writing students, but with a generalizable writing-type/rubric engine. It accepts typed writing and multi-page handwriting images, produces factor-wise rubric-grounded marking, explains mistakes, teaches corrections, recommends practice, and shows authorized progress to students, parents and teachers.

**Education principle:** PFCR — Practice → Feedback → Correction → Rewrite — remains the distinctive learning loop. An assessment is not the entire product; students need a transparent route from feedback to measurable practice and a new writing attempt.

**Nonnegotiable constraints**
1. Rubrics and performance criteria are configured by authorized humans in the database; AI does not invent marks, factors, criteria, or a new rubric.
2. Published rubric versions are immutable; each assessment takes an immutable rubric/topic/verified-text snapshot or references immutable versioned records with hashes.
3. OCR extracts, never grammatically corrects; original image, raw OCR, corrections and authoritative verified text stay distinct.
4. Understanding does not score. Error detection does not automatically deduct marks. Feedback/AI Coach does not change scores.
5. AI Examiner proposes factor scores; deterministic backend validation checks structural and numerical rules; independent verification challenges semantic decisions; only an authorized finalizer makes results authoritative.
6. Finalized score revision is append-only and attributable; the original AI result remains traceable.
7. Parent can view only verified linked children, teacher only authorized assigned cohorts, student only own records; checks are server-side and at object/query level.
8. Student writing, images, OCR and prompts are sensitive/untrusted content. No user-generated instruction gets privileged tool access.
9. Bangla and English require separate real-world handwriting, evidence-grounding and scoring benchmarks.
10. The product is multi-module, but delivery starts as a tested vertical slice, not all 60+ modules at once.

## 2. Current status — distinguish blueprint from actual implementation

| Layer or module | Design status as known | Actual implementation status in provided history |
|---|---|---|
| Product positioning, personas and core workflow | Described | Not verified |
| Identity, roles, permissions and scoped relationships | Steps 61–65 designed | No tests or running API shown |
| Database, migrations, transaction/outbox hardening | Designed | No executed migration evidence |
| Writing category/type/topic/skills/published rubrics | Step 66 designed | No seed, schema or publish-test evidence |
| Submission typed/handwritten, private uploads and queues | Step 67 designed | No running workflow demonstrated |
| OCR and student text verification | Step 68 designed | No Bangla/English benchmark demonstrated |
| Understanding and grounded evidence | Step 69 designed | No model validation demonstrated |
| Examiner and deterministic score validation | Step 70 designed | No rubric scoring regression demonstrated |
| Verifier, finalizer, human review and revisions | Step 71 designed | No independent reviewer benchmark demonstrated |
| Error detection, feedback, PFCR, practice, dashboards | Earlier conceptual design; Step 72+ detailed implementation pending | Not verified |
| Commerce, reports, admin, observability, deployment | Earlier conceptual architecture | Not verified |

**Never interpret `[✓]` appearing in earlier architecture explanations as passing automated tests or shipped functionality.**

## 3. Corrected target architecture

```text
Next.js web (student / parent / teacher / admin)
      |
      v
NestJS API (JWT + status + permission + relationship/resource policy)
      |
      +-- PostgreSQL / Prisma: authoritative domain state, versioned snapshots, outbox, audit
      +-- S3-compatible private original/derived storage
      +-- Redis / BullMQ: at-least-once asynchronous job transport
      +-- Strict AI gateway with budget / provider policy / task routing
      |
      v
Versioned FastAPI AI services
      OCR -> VERIFIED TEXT -> UNDERSTANDING -> EXAMINER -> VALIDATOR
                                                   |
                                              INDEPENDENT VERIFIER
                                                   |
                                    PASS / MINOR FIX / MAJOR REVIEW / FAILED
                                                   |
                                    FINALIZER or AUTHORIZED HUMAN REVIEW
                                                   |
                          FINALIZED SCORING VERSION -> ERRORS -> FEEDBACK
                                                   |
                          PFCR PRACTICE -> REWRITE -> PROGRESS / REPORTS
```

NestJS (not Python AI) owns transitions, authentication, scope, persisted authoritative results, finalization and payment. Workers receive minimal identifiers, not entire student writing in queue payloads. Outbox delivery and BullMQ jobs must be idempotent, as delivery can occur more than once. The product must work without exposing an AI provider's internal reasoning or raw diagnostic prompts to users.

### 3.1 Versioned evaluation identity — new explicit contract

Define `AssessmentAttempt` or equivalent unique run identity. Its locked context contains:

- `submissionId` and `submissionSnapshotHash`;
- `verifiedTextId`, `verifiedTextVersion`, `contentHash`;
- `topicSnapshotId` or immutable topic snapshot/hash, including ordered clues/instructions;
- `rubricId`, `rubricVersionId`, `rubricSnapshotHash`;
- `understandingRunId`, `understandingSchemaVersion`;
- accepted `examinerRunId`, accepted `verificationAttemptId`, optional `humanReviewDecisionId`;
- accepted factor results and an append-only `effectiveScoreRevisionId`;
- source model/prompt/provider versions and audit/provenance.

Create one canonical read service `EffectiveAssessmentResultResolver`, so dashboards, feedback, exports and progress use the same effective revision. Avoid reconstructing historical scores from today's rubric or today's latest verified text.

## 4. Critical cross-step defects and approved corrections (P0)

### P0-01: Enrollment uniqueness is not the actual business constraint (Steps 65 and academic architecture)

**Problem:** `UNIQUE(studentId,batchId)` prevents a student from rejoining the same batch historically but does not prevent two active primary enrollments in the same academic scope. Also a student may legitimately join a main coaching course and the standalone freehand-writing program concurrently.

**Decision:** Add explicit `Program`/`CourseOffering` scope to the academic domain and attach a batch to that scope. Store `academicSessionId`, `programId`, enrollment role/type (`PRIMARY` where appropriate), lifecycle timestamps and transfer provenance on enrollment. Preserve historical enrollment attempts. Enforce no simultaneous active primary enrollment **within a defined (student, session, program)** scope using a PostgreSQL partial unique index (or a transactional equivalent and regression tests). Multiple active programs are allowed; don't globally forbid multiple batches without product context. A migration must add the indexed columns and foreign keys before applying the index.

**Required tests:** Re-enroll after exit, concurrent enroll requests, transfer rollback, dual-program participation, teacher historical scope, and assignment eligibility.

### P0-02: Parent linking and consent are distinct (Steps 64–65, privacy)

**Problem:** A parent–child link proves relationship access only if verified. It is not automatically valid consent for every kind of data use; removing a link and legal data deletion are also distinct workflows.

**Decision:** Introduce verified link status, verifier/verification mechanism, timestamps, relationship evidence reference (restricted), consent purpose/version, guardian authority proof where necessary, and link revocation history. Parent cannot self-attach by arbitrary `studentId`. A school/admin-created student profile must have lawful collection/guardian onboarding controls before routine image/AI processing. Access revocation must be reflected in sessions, query scope, download URLs and caches promptly.

**Legal checkpoint:** Bangladesh's **Personal Data Protection Act, 2026**, section 9 addresses consent by a parent/legal guardian/authorized decision maker for children's personal data; consult local counsel and operative regulations for the onboarding and processing mechanism. Some statutory provisions have staged commencement. Do not assume a click-through checkbox alone satisfies every legal requirement.

### P0-03: Data deletion and immutable audit are in tension

**Problem:** Prior steps emphasized immutable assessment history and no hard deletion without a documented privacy-request flow. Children’s images, OCR, writing, analytics and report copies may exist in many stores.

**Decision:** Implement a `DataInventory`, `ConsentRecord`, `PrivacyRequest`, `DeletionWorkflow`, legal-hold/retention rules, object-store deletion, derived text and report deletion, cache invalidation, provider processing controls, backup lifecycle procedures and auditable request handling. Distinguish operational processing registers from content retention. If legal duties require preserving minimal records, counsel must validate the policy; immutable-by-default technical design does **not** nullify statutory erasure or consent-withdrawal rights.

### P0-04: Rubric resolution can be ambiguous (Step 66)

**Problem:** Several published rubric versions may satisfy a topic or writing type; a priority rule alone does not say which generic published rubric is the sole default. `currentVersionId` and duplicated language fields also permit inconsistent state unless constrained.

**Decision:** Maintain an explicit `RubricApplicability`/`RubricBinding` configuration: scope (`TOPIC`/`WRITING_TYPE`), target ID, rubric/version, enabled interval, default indicator, language and precedence. Enforce at most one active default within each applicable scope with DB-backed uniqueness. Validate that topic belongs to writing type, languages agree, rubric factors/criteria and step fit marks, and snapshots include actual prompt + ordered clues. Explicit assignment rubric override is allowed only when authorized and compatible. `PUBLISHED` means frozen; `ARCHIVED` blocks new assignment but not historical reads.

### P0-05: Clarify criterion/score-step semantics (Steps 66, 70)

**Problem:** A global score step plus individually enumerated criterion score levels is potentially inconsistent; the previous example also included an optional factor weight although maxScore was said to be authoritative.

**Decision for MVP:** Each factor has explicit, unique allowed **criterion score points**. All selected criterion points conform to the immutable rubric-wide score step; factor max and total are exact decimals. `weight` is not used in authoritative scoring until a separately versioned, fully tested weighted rubric mode exists. Invalid AI proposals are rejected, not rounded. A score of zero is a legitimate marking outcome; it must never signal OCR/AI failure.

### P0-06: Snapshot/topic boundaries must be complete (Steps 66–70)

**Problem:** The earlier topic snapshot examples did not always include all clues, language, input instructions, time-limit and assignment override values. A changed topic can otherwise silently change re-evaluation.

**Decision:** On submit, lock submission content and student-facing topic/instructions/clues snapshot. On assessment creation, lock applicable rubric and verified-text version. Reassessment creates a **new attempt/version**, rather than editing a finalized historical attempt. Use stable content hashes and store applied rules and run identity.

### P0-07: OCR verification needs tamper-aware pedagogy (Step 68)

**Problem:** Student OCR correction is necessary, but large rewrites might change submitted content. OCR errors and actual writing mistakes must remain distinguishable.

**Decision:** Original images immutable; every OCR attempt stored separately; correction revisions linked to exact OCR/result/source image and actor. Corrections are limited in purpose to extraction mistakes and retain a complete edit diff. Large/structural rewrites can trigger scoped teacher review according to assessment policy. Do not silently auto-correct grammar/spelling. If handwriting recognition is not yet benchmarked for a writing type/language, support teacher-verified transcription or transparently indicate the limitation instead of claiming accuracy.

### P0-08: Evidence contracts must be consistent across Understanding, Examiner, Verifier (Steps 69–71)

**Problem:** Merely matching a quote does not prove it supports the analytical/scoring claim. Unicode indexing also differs between Python code points and browser UTF-16 indices.

**Decision:** Define a shared `EvidenceSpan` contract (immutable `verifiedTextId`, start/end offsets with documented code-point convention, exact quote, optional paragraph/structure links, semantic finding ID, evidence validity). Validate exact spans deterministically and important claim support via calibrated semantic verification/human review. Include conversion tests for Bangla combining characters, grapheme highlighting and mixed scripts. Unsupported observations must not be promoted into score evidence.

### P0-09: Verifier independence and finalization policy (Step 71)

**Problem:** The verifier may merely approve Examiner claims, or both models may inherit the same flawed Understanding Snapshot. `MINOR_CORRECTION` is unsafe if allowed to change a score.

**Decision:** Verifier is shown original verified writing and published rubric independently; structured examiner proposal is introduced for comparison, ideally after independent initial evaluation. Benchmark whether a different prompt/model improves error detection; never claim model agreement equals truth. `PASS` can proceed; `MINOR_CORRECTION` permits only controlled non-score corrections followed by validation; `MAJOR_REVIEW` blocks automatic finalization pending bounded re-evaluation and/or human review; `FAILED` retries with bounded policy then escalates. Finalizer is deterministic and transactional.

### P0-10: Effective score revisions and downstream consistency (Step 71 and progress/reports)

**Problem:** Appending `AssessmentScoreRevision` is not enough: existing feedback, mastery snapshots, parent reports and exports could still display stale values.

**Decision:** Store immutable original AI result plus append-only authorized revisions. All consumers read `effectiveScoreRevisionId` through a canonical resolver. Emit `AssessmentScoreRevised` once transactionally; recompute or invalidate dependent materialized projections with revision-aware, idempotent consumers. Prior report snapshots remain historically labeled, and a new revisioned report is generated on request. Correction must be factor-wise, authorized, reasoned and audited.

### P0-11: Delivery is at-least-once, so exactly-once business effects need DB constraints

**Problem:** Prior architecture sometimes describes one logical processing event as if the queue alone guarantees it. BullMQ may retry/stall/redeliver. External AI calls are not transactional with PostgreSQL.

**Decision:** DB is source of truth. State change + outbox in one short DB transaction. Publisher is retryable; workers use unique logical job/attempt keys and atomic claims/leases; result writes have uniqueness guards. Vendor API calls occur outside DB transactions. On ambiguous provider timeout, record attempt state and deduplicate **persisted effects**, without assuming the model service never executed. Test deliberate duplicate deliveries and process crashes.

### P0-12: Child privacy and AI vendor contracts require a release gate

**Problem:** The architecture lists security controls without an operational data-flow and vendor contract check. Children’s manuscripts may go to third-party OCR and LLM services outside Bangladesh.

**Decision:** Before processing real child data, create a data-flow map, purpose register, consent/withdrawal path, privacy notice, provider retention/training/cross-border due-diligence checklist, access logs, deletion protocol, incident response and guardian verification. Restrict benchmarking/training to appropriately authorized, minimized/de-identified data. Obtain local legal review for applicable 2026 Bangladesh law/regulations and any relevant foreign-market rules before public deployment.

## 5. Further improvements (P1; design now, implement in phases)

1. **Database implementation contract:** Pick and pin actual PostgreSQL/Prisma/NestJS/BullMQ versions; adapt transaction syntax to the installed Prisma version instead of copying version-mixed internet snippets. Plan expand → migrate/backfill → contract, and automated restore drills.
2. **RLS deployment correctness:** App DB role must not own protected tables or have `BYPASSRLS`; use scoped repository queries plus RLS as defense in depth. Establish per-request DB actor context safely in pooled connections/transactions. Explicitly design worker/service identity and admin access policies, test count/search leakage.
3. **Authorization boundaries:** Parent, teacher, student and admin permissions are insufficient without organization/program/assignment/time scope, safe serializers, signed-URL revocation strategy and negative IDOR test coverage.
4. **Payment and entitlement isolation:** A product entitlement affects whether a new assessment may start; a billing fault must not expose data or retroactively change already finalized assessments. Third-party payment callbacks require signature, dedupe and recorded lifecycle.
5. **Mastery reliability:** Track skill observations, evidence sources, confidence and revision invalidation. Do not claim a causal improvement from one assessment; distinguish actual scores from descriptive growth indicators.
6. **PFCR product flow:** `PracticeSession` → specific feedback correction → submitted rewrite linked to previous attempt → measured comparison under compatible rubric context. Do not make the coach alter original student work.
7. **UX and accessibility:** WCAG 2.2 AA target, dual-language font and typing UX, mobile image capture/reorder, keyboard verification, clear uncertainty labels, real rather than fabricated progress percentages, and graceful upload recovery.
8. **FinOps and operational limits:** Per-submission OCR/page/model budgets; rate limits and quotas; provider fallback with distinct version provenance; circuit breakers, queue depth alarms, cost anomaly notifications and per-provider benchmark gates.
9. **Benchmark ownership:** Expert annotator instructions, anonymization, adjudicated disagreements, stable train/dev/test holdouts, Bangla/English writing-type strata, versioned golden datasets and change-control for rubrics.
10. **Minors' learning analytics:** Explanations should focus on observed work. Avoid mental-state, intelligence or personality inferences from handwriting or writing, and avoid unfair comparisons with unrelated writing types or student populations.
11. **Incident and abuse:** Threat model prompt injection via handwritten and typed content, output injection into reports, unsafe file types, SSRF through provider URL processing, report URL leaks, compromised teacher accounts and recovery procedures.
12. **Product telemetry:** Track verification edits per page, OCR recognition failures, reviewer interventions, student rewrite completion and teacher feedback burden. Do not track unnecessary sensitive behavior or use children's data for unrelated targeted advertising.

## 6. Canonical domain model amendment register

| Domain | Existing concepts | Amendment |
|---|---|---|
| Identity | User, roles, student/teacher/parent profiles | Verified consent and link authority; clear status/revocation |
| Academic | Session, Class, Batch, TeacherBatch, Enrollment | Add Program/CourseOffering, lifecycle timestamps and active-scope rule |
| Writing | Language, Category, Type, Topic, TopicClue, Skill | Derive or enforce duplicated language, topic snapshot completeness |
| Rubric | Rubric, Version, Factor, Criterion, Skill mapping | Explicit applicability/default bindings; permitted discrete criterion points |
| Submission | Draft, Pages, IdempotencyKey, Outbox | Immutable submission snapshot and verified pages before queueing |
| OCR | Raw OCR, segments, corrections, verified text | Stable code-point evidence offset contract and large-correction escalation |
| Understanding | Ideas, structure, coherence, clues, evidence | Evidence claim-support checks and versioned context |
| Scoring | Assessment, ExaminerRun, factor proposals | Locked attempt identity; semantic versus deterministic validation separation |
| Verification | Verification/Attempt, HumanReview | Blinded initial review option; bounded retries; fail-closed transitions |
| Results | AssessmentFactorResult, ScoreRevision | Canonical effective revision and downstream recomputation |
| Privacy | ConsentRecord, PrivacyRequest, AuditLog | Purpose-aware child consent, request handling, data lineage and deletion |
| Learning | Errors, feedback, coach, practice, mastery | PFCR rewrite linkage and evidence-backed comparisons |

## 7. Canonical state invariants

### Submission
`DRAFT -> READY_TO_SUBMIT -> SUBMITTED -> PROCESSING`  
Typed: `PROCESSING -> EVALUATING`; handwritten: `PROCESSING -> NEEDS_OCR_REVIEW -> EVALUATING` after authoritative text confirmation. Terminal/exception states use approved state-transition services. Original content and submitted image set locked after `SUBMITTED`. An explicit reassessment is **not** an edit of the original submission.

### OCR
Raw extraction immutable; student correction versioned; confirmation creates one authoritative `VerifiedWritingText` version for that operation. Unreliable recognition flags review rather than silently editing spelling.

### Rubric
`DRAFT -> TESTING -> PUBLISHED -> ARCHIVED` (where allowed); no edit of published version; new version for changes; exactly one applicable default per scope; all factor scores match allowed criteria and sum to configured total maximum.

### Examiner and finalizer
No numeric proposal with invalid/missing factor; no score when evidence is insufficient (distinct review outcome); verifier major disagreement blocks auto-finalization; finalizer owns accepted factor sum; teacher correction is append-only and revision-aware.

### Event system
Outbox is transactionally created with state change; workers expect at-least-once delivery. DB uniqueness, attempt IDs and state preconditions guarantee at-most-once **business effect** where required.

### Authorization
Every direct read, list, count, page download, report export, AI context build, worker side effect and score correction enforces relevant owner/link/batch/program/resource scope. No client-supplied actor IDs for `/me` flows.

## 8. Minimal database migration amendments before coding the vertical slice

**Proposed migration sequence beyond the conceptual earlier 001–017:**

- `018_program_scope_and_enrollment_history`: Program/CourseOffering and batch program scope; enrollment state timestamps; backfill; DB partial active-scope index after verifying data.
- `019_guardian_verification_and_consent`: Parent/Student link lifecycle; purpose/version-scoped consent records; restricted proof references.
- `020_rubric_binding_and_criteria_integrity`: Explicit rubric applicability/default binding, compatibility validation, check constraints where expressible.
- `021_submission_topic_snapshot`: Full topic/clue/instruction snapshot fields; immutable content hash; upload-page safe states.
- `022_assessment_attempt_provenance`: Typed/versioned refs connecting text, rubric, understanding, examiner, verifier and snapshots.
- `023_score_revision_projection`: Append-only revision, effective revision pointer and event consumer checkpoints.
- `024_privacy_lineage_and_deletion`: PrivacyRequests, processing lineage, retention/deletion job states and audit access.

These names are planning conventions, **not migrations that have been created or run**. Schema design should occur before blindly adding all tables. Apply in an environment with forward/reverse compatibility, backups, integration fixtures and a tested restore path.

**Example PostgreSQL design concept (not executable against the old schema without the new columns):**

```sql
CREATE UNIQUE INDEX enrollment_one_active_primary_per_program
ON "ClassEnrollment" ("studentId", "academicSessionId", "programId")
WHERE "status" = 'ACTIVE' AND "enrollmentType" = 'PRIMARY';
```

Only create this after columns, case-sensitive enum values, historical deduplication and multiple-program acceptance tests are settled.

## 9. MVP scope and delivery plan

**MVP release:** One academy/organization initially; both Bangla and English as supported product languages, but each handwriting pathway only opens to pilot users once the specific model reaches its own benchmark gate. Start with selected guided paragraph / বাংলা অনুচ্ছেদ types and manually authored expert rubrics, not a huge uncontrolled catalog. Support typed and handwritten multi-page input with fallbacks; student OCR verification; factor-wise examiner/verifier/human escalation; useful error guidance; linked parent read-only view; teacher review; single PFCR correction/rewrite loop. Basic monitoring, consent and privacy workflows are **part of MVP safety**, not optional growth features.

**Defer from MVP:** Broad commerce plans, sophisticated marketing automation, a large prompt/model marketplace, predictive intelligence, advanced rankings, dozens of writing types, large-scale cross-tenant SaaS, elaborate admin AI experiments, nonessential animation and unnecessary infrastructure complexity. Retain the architectural extension points.

### Build phases and acceptance gates

| Phase | Deliverable | Go/no-go gate |
|---|---|---|
| 0 | Freeze spec, version choices, risk model, user journeys and benchmark plan | Unambiguous domain invariants and reviewed priorities |
| 1 | Auth, program/enrollment, consent, parent/teacher scoping, curated rubric publisher | All cross-account and IDOR negative tests pass |
| 2 | Typed submission -> published rubric -> validated Examiner -> verifier -> finalizer -> report | Golden typed E2E and exact-scoring tests pass |
| 3 | Secure multi-page upload -> OCR -> student verification -> same scoring pipeline | Language-specific OCR and image-handling gates pass |
| 4 | Error Intelligence -> feedback -> correction -> rewrite -> starter progress | Error evidence and score independence tests pass |
| 5 | Parent dashboard, teacher review, exports, operational controls | Scoped retrieval, deletion, monitoring and recovery drills pass |
| 6 | Controlled academy beta, expert adjudication and operational measurement | Predeclared performance/safety/cost release criteria met |

**Why typed first in Phase 2?** It exercises the full scoring, rubric, feedback and privacy architecture without waiting for difficult Bangla handwriting OCR to reach acceptable accuracy. Handwritten input still remains a core committed capability, implemented in Phase 3 rather than abandoned.

### Mandatory release gates

1. Every released rubric version tested with expert-graded writing and factor-level disagreement analysis; acceptance thresholds defined **before** model evaluation, separately by language/writing type.
2. Every invalid factor/criterion/score increment rejected deterministically; numerical sums exact across all test cases.
3. Zero unauthorized cross-student/parent/teacher access in controlled security/IDOR test suite; repeat in staging with realistic data and signed URLs.
4. OCR release only after measurement on representative handwriting with per-language CER/WER, layout error and correction burden; thresholds chosen with academic stakeholders, not invented success claims.
5. No fabricated evidence in the controlled regression suite; unsupported semantic findings trigger fail-closed review policy.
6. Parent/guardian consent and privacy workflow, data deletion/correction path, privacy notice and vendor assessment legally reviewed before real child data processing.
7. Crash/retry/outbox, backup restore, timeout, and effective-score-revision consistency tests pass.
8. Accessibility audit targeting WCAG 2.2 AA for core student, parent and teacher flows.
9. Explicit provider cost/latency quotas, rate limits and back-pressure for upload and AI traffic.
10. Beta release evidence recorded in QA reports; no model claimed universally accurate.

## 10. Architecture Decision Records (approved baseline proposals)

- **ADR-001:** PostgreSQL is authoritative; Redis/BullMQ are transport, never the source of truth.
- **ADR-002:** NestJS owns business rules/authorization/finalization; FastAPI AI service only returns constrained task outputs.
- **ADR-003:** Store immutable original writing/source image and versioned derived processing artifacts.
- **ADR-004:** Published rubric and original topic context snapshots always bind every assessment attempt.
- **ADR-005:** Specific factor criterion score points are the sole MVP numerical scoring mode.
- **ADR-006:** Understanding/Errors/Feedback/Coach do not mutate scoring results.
- **ADR-007:** Verifier independently rechecks original text/rubric; disagreement cannot silently modify marks.
- **ADR-008:** Current score is a reference to an append-only effective revision, not an overwrite of historical AI score.
- **ADR-009:** Guardian authority/consent is separate from read-access linking; child data flows must be purpose-limited.
- **ADR-010:** Program-scoped enrollment supports simultaneous main coaching and standalone writing courses.
- **ADR-011:** Build a tested vertical slice and measured Bangla/English benchmark gates before expansive product features.
- **ADR-012:** WCAG 2.2 AA, child-data privacy and secure data handling are build requirements, not final polish.

These are canonical **design decisions** for the next implementation planning round. They have not been materialized as source-code commits.

## 11. Step 72 handoff (resume here, no need to re-discuss Step 1–71)

**Next design task:** `STEP 72 — Error Intelligence + Grammar, Spelling, Punctuation, Word Choice and Sentence Construction Detection Engine`.

**Input:** Accepted authoritative verified text/version, original language and writing context, accepted assessment factor results, relevant understanding/evidence (never a license to change finalized score).

**Output:** Versioned `Error` and `ErrorPattern` observations with category, severity, confidence/uncertainty, exact evidence spans, student-facing explanation, suggested correction, teaching rule and practice-skill mapping. Keep `CONFIRMED`/`POSSIBLE`/`DISMISSED` separate. For Bangla language and mixed-script text, evaluate category-specific extraction benchmarks. A feedback mistake and a scoring deduction must never be conflated. Human corrections and teacher dismissals should improve quality-control datasets only when permitted by consent and purpose controls.

**Extra requirements discovered by audit:**
- Error records must reference `verifiedTextId`, immutable content hash and span-offset convention.
- Avoid claiming one unique correction when several grammatical rewrites are valid.
- Separate orthography from OCR uncertainty; no grammar flags on raw unverified OCR.
- Ensure no `Error` workflow updates `AssessmentFactorResult`, `AssessmentScoreRevision`, or published rubrics.
- Explain to students at class-appropriate language level; integrate PFCR: identify -> explain -> learner corrects -> learner rewrites -> measure subsequent attempt.
- Feedback/progress consumers must choose the effective assessment score revision consistently.

## 12. External references checked for this audit

- Bangladesh government legal text: **Personal Data Protection Act, 2026** (effective-date exceptions, child consent, security and retention provisions): https://bdlaws.minlaw.gov.bd/act-print-1692.html  
  This is not legal advice; obtain qualified local legal review of operative sections/regulations and vendor/cross-border obligations.
- PostgreSQL documentation, partial indexes/unique conditional constraints: https://www.postgresql.org/docs/17/indexes-partial.html
- PostgreSQL row-level security documentation: https://www.postgresql.org/docs/17/ddl-rowsecurity.html
- BullMQ guidance, idempotent jobs: https://docs.bullmq.io/patterns/idempotent-jobs
- Prisma ORM transaction docs (verify against the **pinned installed major version**): https://www.prisma.io/docs/orm/prisma-client/queries/transactions
- OWASP GenAI LLM security risks: https://genai.owasp.org/llm-top-10/
- NIST AI Risk Management Framework and Generative AI profile: https://www.nist.gov/itl/ai-risk-management-framework
- W3C WCAG 2.2 standard: https://www.w3.org/TR/WCAG22/

---

**Baseline conclusion:** The product vision and modular decomposition remain useful. The safety of this implementation now depends on resolving the explicit P0 domain invariants, guarding child-data processing, and validating the first full assessment loop before expanding modules. Resume specification work at **Step 72** and carry these v2 amendments into every subsequent step.

---

## V3 continuation — detailed later-stage architecture and code status

This V3 index intentionally preserves V2's original audit unchanged for traceability. For actual architectural design decisions spanning **Steps 73–82**, see [`architecture-steps-73-82.md`](architecture-steps-73-82.md). For Steps **83–86** source/test provenance and what is still *not* built, see [`implementation-status.md`](implementation-status.md). Historic early originals from Steps 1–60 were not available and are never claimed to have been recovered. The first paragraph's 2026-09-26 Step 72 checkpoint is the original **historical baseline**, not the current engineering status.

Current hard release blocks remain: no real AI Examiner+independent Verifier, no approved held-out bilingual academic benchmarks, no complete multipage handwriting/OCR workflow, no full production guardian verification and no production monitoring or deployment.

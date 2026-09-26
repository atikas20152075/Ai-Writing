# AI Writing Assessment Platform — Recorded architecture progression, Steps 73–82

**Status:** Consolidation of the actual Step 73–82 architecture discussion, not a verbatim transcript or proof of implementation. The canonical early baseline remains `master-blueprint-v2.md`. Decisions explicitly marked as *target* below are not yet implemented; `implementation-status.md` is the source of truth for verified code and tests.

## Cross-step non-negotiables

1. PostgreSQL/NestJS own authoritative academic and payment state; AI services produce validated, source-grounded suggestions, never mutate marks or entitlement state.
2. Published topic and rubric versions plus verified student writing remain immutable. Assessments pin topic/rubric/text hashes and model/prompt versions. Only canonical effective score revisions feed reports and feedback.
3. Parent access requires an actively verified student relationship; teacher access requires applicable assigned academic scope. Child-data processing authority is a separate, legally reviewed question. No public reports, unmanaged sharing links or original writing in ordinary logs.
4. Typed submission is the first vertical slice; handwriting remains gated on student verification and separate Bangla/English OCR benchmark results.
5. Queue delivery is at-least-once with database outbox, idempotent consumers and repeatable business operations; async retries must not duplicate scores or credits.
6. For each step, distinguish blueprint, source-code implementation, CI evidence and production readiness.

## Step 73: Advanced Personalized Feedback

**Inputs:** immutable verified-writing ID/hash; applicable topic/rubric; finalized assessment ID and *effective score revision*; compatible UnderstandingRun; confirmed ErrorDetectionRun and teacher-approved observations; consent/scope; student language and teaching level.

- Build a deterministic, evidence-filtered FeedbackFactPack in NestJS. The AI generator receives only approved facts and source IDs. It may explain but cannot create scores, fake evidence, invent a new rubric or treat `POSSIBLE`/`DISMISSED` errors as confirmed mistakes.
- Provide the student with a concise summary, grounded strengths, normally up to three prioritized improvements, applicable error explanations, self-correction prompts, targeted practice and a PFCR rewrite mission. Prioritize evidence, educational impact and repeated validated patterns, not raw error count alone.
- Separate student, parent and teacher presentation through explicit field allowlists; no accidental release of teacher-only notes to parent or student. Bangladesh and English feedback need language-specific academic review.
- Use versioned FeedbackGenerationRun and immutable report versions. Distinguish WAITING_FOR_ERRORS/QUEUED/GENERATING/VALIDATING/READY/NEEDS_REVIEW/STALE/FAILED. Partial feedback must be labeled. Changes to effective scores or error adjudications invalidate only impacted derived outputs.
- Tests: evidence ID and exact quote validation, score consistency, alternate-valid corrections, unsafe/invented advice rejection, idempotency, independent authorization and stale-revision protection.

## Step 74: Adaptive Practice + Intelligent Question Generation

- Source every practice recommendation from a validated mistake, error pattern, comparable assessment observation, diagnostic task or assigned teacher objective. Do not equate a low factor score to failure in every underlying skill.
- Six initial activities: MCQ, fill-in-the-blank, error correction, sentence construction, rewrite, mini-writing; idea sequencing can be a special structured rewrite. Source question content from a curated bank first; generated drafts require schema, independent answer validation, difficulty checks, deduplication and risk-appropriate teacher approval.
- Published question versions, answer keys and evaluation rules are immutable. Protect answer keys at the server and avoid shipping them in student API payloads. Open responses may have multiple valid answers; uncertain evaluations escalate rather than invent exact correctness.
- Store versioned PracticeSession/Attempt/Answer/Evaluation, typed evidence and source references. Deterministic question selection and interpretable mastery indicators account for independent vs hinted attempts, difficulty, question diversity and later writing evidence. Invalidate/recompute mastery if a question or source error is discredited.
- A PFCR rewrite is a **new linked submission**. Do not modify the original. Compare only compatible rubric/task contexts; do not claim causation from practice and a later higher score.

## Step 75: Student Progress Intelligence and Learning Analytics

- Six separate views: comparable assessment performance, rubric factor observations, writing-skill evidence, confirmed-error patterns, practice results and linked PFCR rewrite progress. Do not synthesize one opaque intelligence rating.
- Use a single EffectiveAssessmentResultResolver. Do not combine scores merely by converting distinct rubrics to percentages. Trends with insufficient comparable observations must explicitly say `INSUFFICIENT_DATA` or `VARIABLE` as appropriate.
- Error rates use suitable denominators: word-normalized spelling counts may be informative, grammar opportunities require context rather than raw word count. `POSSIBLE` and `DISMISSED` errors do not contribute to confirmed pattern measures.
- Versioned source-lineage ProgressEvent, ProgressSnapshot and StudentLearningProfile preserve calculation versions and program scope. Revised scores or invalidated exercises trigger idempotent recomputation; late queue events may not overwrite newer projections.
- Student UI highlights next practice; verified guardian view simplifies the explanation; assigned teacher view supports teaching interventions and suitably protected group aggregates.

## Step 76: Teacher Intelligence and Academic Interventions

- Scope all queries through currently authorized teacher assignment, academic program, active/valid enrollment and requested resource. Historical teacher assignment does not imply unlimited continued access.
- Display evidence-backed batch assignment completion, review backlog, recurring error summaries and permitted individual progress. Small-group privacy suppression avoids unintended disclosure.
- A generated TeacherInsight is a proposal, not a diagnosis of intelligence, laziness or permanent ability. Provide evidence IDs, observation dates and uncertainty. Teacher reviews and approves interventions.
- Intervention lifecycle: PROPOSED → TEACHER_REVIEW → APPROVED → ACTIVE → FOLLOW_UP → COMPLETED → CLOSED, with DISMISSED/CANCELLED exceptions. Preserve baseline per student, plan version, assigned activities and follow-up evidence; later changes to score revisions invalidate affected comparisons.
- Keep authoritative assignment publishing in the Academic/Assignment domain, not a duplicate Teacher Intelligence write path.

## Step 77: Parent Intelligence and Academic Communication

- Existing ParentStudentLink requires a controlled PENDING → VERIFICATION_REQUIRED → VERIFIED → ACTIVE lifecycle; revocation and suspended states restrict all access including queued notifications and old private report URLs. Knowing child identifiers, names or birthdays never verifies guardianship.
- Guardian resource access and data-processing legal authority are **separate domains**; maintain purpose/version/status, optional consent where legally required and protected retention/withdrawal policy. Multiple guardians should not learn each other's confidential information by default.
- Aggregate only the verified child's authorized program records. Use effective score revisions, source-grounded parent-friendly summaries, course assignments and PFCR observations. Avoid speculative labels and impossible progress claims.
- In-app notifications and student+program-scoped academic message threads are the MVP; SMS/WhatsApp/email may be added later using provider-specific privacy and authorization reviews. Revalidate authorization *at delivery and download*, not only at event creation.

## Step 78: Admin Intelligence and AI Governance

- Governance encompasses academic program/rubric publishing, AI model and prompt registries, benchmarking, review operations, secure operations, cost monitoring and incident recovery. Admin does not equal unrestricted access to original children's writing.
- Critical changes require granular permissions, version-checked requests, documented approval and audit; published rubrics/topics and scoring prompts are versioned and not silently edited.
- AI deployments are approved by task and language using protected expert-annotated held-out benchmarks, then controlled rollout/rollback. Examiner and Verifier disagreements fail closed, never change finalized assessments without an authorized append-only revision.
- Operational dashboards show actual metric sources and `UNKNOWN` if telemetry is missing. Record provider usage and billed vs estimated cost separately. Feature flags cannot override academic/security authorization.

## Step 79: Secure Reports, Bilingual PDF and Exports

- Report generation revalidates current authorization at request, snapshot creation and download. Role-specific field allowlists protect parent/teacher/student views and avoid revealing other guardians' details.
- Immutable ReportSnapshot pins the canonical score revision, compatible error/feedback versions, template version, source fingerprint and as-of time. Rendering consumes the approved snapshot, not mutable live joins; newer score revisions mark older current reports superseded.
- Start with branded Bangla/English individual assessment PDFs, then comparable progress and PFCR reports; add batch reports and scoped CSV/XLSX later. Test Bengali ligatures, mixed scripts, pagination, chart labels and meaningful PDF text extraction.
- Private object storage, digest, expiry/retention and authenticated streaming; guard CSV/XLSX against formula injection; no permanent public URLs to minor students' reports.

## Step 80: Products, Payments, Entitlements and Assessment Credits

- Separate immutable product versions/order snapshots, independently verified payment status, academic enrollment, entitlement grants and append-only credit ledger. A paying parent may be distinct from the student beneficiary.
- Do not trust frontend prices, redirect success or unsigned/unverified callbacks; provider verification must match transaction identity, amount, currency and merchant. Fulfillment is idempotent across duplicate notifications and reconciliation.
- Atomic reservation precedes accepted paid assessment. Consume **once** only at the policy-defined successful finalization milestone; internal AI retries never charge a second credit. Qualifying system failures release held units. Model grants and expirations separately.
- Refund and chargeback handling retains historical academic truth. Prepaid packages before complex automatic renewal and multi-currency logic.

## Step 81: Deployment, Observability and Recovery

- Isolated development, staging and production; managed PostgreSQL, managed Redis/BullMQ, private object storage, distinct API/AI/worker containers and HTTPS-only edge protections. Avoid early Kubernetes over-engineering.
- CI/CD pins image digests, runs static, database, authorization and relevant AI benchmarks. Expand/backfill/contract migrations need compatibility and recovery tests. Persist outbox and authoritative processing state in PostgreSQL, not Redis.
- Test PostgreSQL PITR, private-object recoverability, job replay, payment reconciliation and permission revocation after restore. Pilot **planning targets**, not measured capabilities: RPO ≤15 minutes and RTO ≤4 hours; adjust to actually measured recovery exercises.
- Structured metrics/logs/traces, rate limits, credentials management, scoped production secrets and data minimization; AI fallback requires pre-approved task/language benchmark results.

## Step 82: QA, AI Quality and Release Gates

- Gates: static/unit → integration → expert-annotated bilingual AI benchmarks → security/privacy → synthetic E2E/load/recovery → documented release approval → controlled academy pilot.
- Golden datasets pin immutable original samples, language/writing type, topic/rubric and expert adjudications. Keep tuning and held-out release sets apart. Assess factor-wise agreement, semantic grounding, verifier missed errors, error false positives, correction meaning preservation and feedback teaching quality separately.
- Secure testing includes injection inside untrusted student writing, object-level parent/teacher scope, payment replay, credit races, Unicode evidence offsets, guardian revocation during queued delivery, signed report permissions and privacy deletion lineage.
- A `PASSED` gate requires real test evidence linked to exact source commit, schema, AI configuration, input dataset and release candidate. Missing/untestable critical evidence results in BLOCKED, not success.

## Steps 83–86: Actual execution checkpoint

- Step 83: framework-independent score/evidence validators and a fail-closed AI provider boundary; these are *not* real AI grading.
- Step 84: NestJS API/Prisma baseline for identities, academic program/guardian scope and typed submissions, with PostgreSQL migration source and synthetic-only tests.
- Step 85: GitHub CI on disposable PostgreSQL validated baseline migration, backend startup, ten DB tests, 26 synthetic HTTP assertions, 44 offline JavaScript/TypeScript tests and six Python tests. See GitHub run `36235612532`; no production service or live AI model.
- Step 86: Auth abuse protection via shared PostgreSQL HMAC buckets and stricter CI reproducibility; implementation under active evaluation. Check `docs/implementation-status.md` for *actual* verified CI result.

**Scope caveat:** Earlier Steps 1–60 are represented through the corrected Step 61–71 baseline audit and known architecture decisions. Their verbatim original transcript was not recoverable and is not represented here as restored.

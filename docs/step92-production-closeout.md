# Step 92 production-closeout gates (not yet approved)

The merged Step92 milestone is **synthetic-tested development-only**. This checklist deliberately prevents treating a passed integration suite as permission to process real children's work or issue production reports.

## Verified development baseline
- [x] Currently assigned teacher / explicitly scoped academic administrator read endpoint; no SUPER_ADMIN academic-data bypass.
- [x] On-demand revision-pinned printable PDF from approved immutable factor results; Step103 adds English/Bangla v2 formats while preserving legacy v1 snapshots.
- [x] Current-authorization check inside the report transaction and SQL-guarded immutable snapshot/hash.
- [x] Existing disposable-PostgreSQL synthetic CI for permissions, revocation, revision supersession and PDF integrity.
- [x] PR #10 merged: pseudonymous actor-wide cross-replica PDF export rate limit and pure/synthetic HTTP tests; CI [run 36255284609](https://github.com/atikas20152075/Ai-Writing/actions/runs/36255284609) passed. Production stress/security review remains pending.

## Remaining production gates — BLOCK RELEASE until independently evidenced
- [x] Select Noto Sans Bengali 0.4.4 (font files under OFL-1.1; package also MIT), bundle Regular/Bold, and generate multilingual PDFs with embedded subset fonts. Synthetic Bangla mixed-script extraction, multi-page rendering and visual QA are recorded in Step103.
- [ ] Independently review Bangla shaping, line wrapping and evidence quotes with expert-adjudicated fixtures; this code change does not establish reading comprehension or scoring quality.
- [x] Add document language, selectable copy and bounded in-memory output for multilingual layouts.
- [ ] Add a correctly validated PDF structure tree and complete screen-reader/accessibility review; output currently sets a marked-content flag but is not a tagged PDF or PDF/UA conformance claim.
- [ ] Measure production performance/memory limits.
- [ ] Provide private report artifact storage (encrypted at rest, key rotation, region/vendor approval), owner-scoped metadata, malware/content-type controls and short-lived delivery only after *fresh* educational authority verification.
- [ ] Define immutable revision-linked report artifact versioning, supersession, revocation limitations for already downloaded reports, and lifecycle retention/deletion/reconciliation that do not erase mandated immutable academic audit evidence.
- [ ] Run penetration testing, authorization IDOR/revocation races, high-concurrency load testing and disaster-recovery exercises with published acceptance thresholds.
- [ ] Obtain child-data/legal/privacy review, vendor/cross-border approvals and expert-adjudicated Bangla/English scoring and OCR benchmark evidence before AI release gate activation.
- [ ] Build and test parent/teacher/student UIs; offer accessible download state, refusal and review pathways without exposing private data.
- [ ] Independently validate a production-like staging deploy with secret management, redaction-safe logs, metrics, alerting, worker retries, RPO/RTO and rollback evidence.

**No real student data in CI, synthetic tests, examples or unapproved AI prompts.**
Avoid presenting this document or Step92 PRs as full production sign-off.

# Step 92 production-closeout gates (not yet approved)

The merged Step92 milestone is **synthetic-tested development-only**. This checklist deliberately prevents treating a passed integration suite as permission to process real children's work or issue production reports.

## Verified development baseline
- [x] Currently assigned teacher / explicitly scoped academic administrator read endpoint; no SUPER_ADMIN academic-data bypass.
- [x] On-demand English ASCII-only, revision-pinned printable PDF from approved immutable factor results.
- [x] Current-authorization check inside the report transaction and SQL-guarded immutable snapshot/hash.
- [x] Existing disposable-PostgreSQL synthetic CI for permissions, revocation, revision supersession and PDF integrity.
- [x] PR #10 merged: pseudonymous actor-wide cross-replica PDF export rate limit and pure/synthetic HTTP tests; CI [run 36255284609](https://github.com/atikas20152075/Ai-Writing/actions/runs/36255284609) passed. Production stress/security review remains pending.

## Remaining production gates — BLOCK RELEASE until independently evidenced
- [ ] Select legally redistributable Bangla-capable fonts, establish font source/version/license, embed/subset and render mixed Bangla-English scripts; visually QA shaping, line wrapping and evidence quotes with expert-reviewed fixtures.
- [ ] Replace minimal PDF with accessible document structure (tagged PDF, reading order, selectable copy, screen-reader review), multilingual layouts and measured performance/memory limits.
- [ ] Provide private report artifact storage (encrypted at rest, key rotation, region/vendor approval), owner-scoped metadata, malware/content-type controls and short-lived delivery only after *fresh* educational authority verification.
- [ ] Define immutable revision-linked report artifact versioning, supersession, revocation limitations for already downloaded reports, and lifecycle retention/deletion/reconciliation that do not erase mandated immutable academic audit evidence.
- [ ] Run penetration testing, authorization IDOR/revocation races, high-concurrency load testing and disaster-recovery exercises with published acceptance thresholds.
- [ ] Obtain child-data/legal/privacy review, vendor/cross-border approvals and expert-adjudicated Bangla/English scoring and OCR benchmark evidence before AI release gate activation.
- [ ] Build and test parent/teacher/student UIs; offer accessible download state, refusal and review pathways without exposing private data.
- [ ] Independently validate a production-like staging deploy with secret management, redaction-safe logs, metrics, alerting, worker retries, RPO/RTO and rollback evidence.

**No real student data in CI, synthetic tests, examples or unapproved AI prompts.**
Avoid presenting this document or Step92 PRs as full production sign-off.

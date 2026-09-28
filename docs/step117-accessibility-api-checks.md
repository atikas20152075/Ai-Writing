# Step 117 — Browser accessibility API checks (merged and CI verified)

Added synthetic full-stack checks that inspect Chromium's exposed accessibility tree for both English and Bangla report flows. The checks assert the report's `main`, `article`, and navigation landmarks; a heading outline; named back and print controls; and exposed evidence list/list-item roles. The report container's language is checked as `en` or `bn`.

Local web TypeScript typecheck and `git diff --check` passed. Exact-head CI [run 36388265717](https://github.com/atikas20152075/Ai-Writing/actions/runs/36388265717) passed all three jobs, including the desktop/mobile Chromium full-stack report flows and the backend's fresh PDF/UA-1 validation. PR #42 merged to `main` as `b063560f66f1ea35c797473443d541e93c17ca12`. The browser check is an accessibility-API smoke test, not a WCAG audit or screen-reader usability review.

## Still required to close accessibility

- Independent screen-reader review of English and Bangla HTML and repaired PDFs, including loading/error announcements, reading order, controls, zoom/reflow, and printed long reports.
- Expert Bangla review of shaping, line wrapping, evidence quotes, and whether the PDF's empty mappings for shaping-only headline glyphs preserve spoken order.
- Record tools and versions, representative report cases, findings, fixes, retest results, and reviewer sign-off.
- Decide whether PDF/UA-2 is a release requirement; Step 116 establishes PDF/UA-1 only.

## Release status

Production and real learner data remain **NO-GO**. All open Step 92 gates remain blocking, including performance/memory limits, private artifact storage and lifecycle, penetration and high-concurrency testing, disaster recovery, legal/privacy and vendor review, adjudicated Bangla/English AI benchmarks, production UI/refusal paths, and staging operations/rollback evidence. No real learner content was used.

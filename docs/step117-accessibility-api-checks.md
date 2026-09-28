# Step 117 — Browser accessibility API checks (in progress)

Added synthetic full-stack checks that inspect Chromium's exposed accessibility tree for both English and Bangla report flows. The checks assert the report's `main`, `article`, and navigation landmarks; a heading outline; named back and print controls; and exposed evidence list/list-item roles. The report container's language is checked as `en` or `bn`.

Local web TypeScript typecheck and `git diff --check` pass. This workspace does not have Chromium installed, so the CDP tree assertions have not run locally; exact-head CI must execute them before this change is accepted. The current check is a browser accessibility-API smoke test, not a WCAG audit or screen-reader usability review.

## Still required to close accessibility

- Independent screen-reader review of English and Bangla HTML and repaired PDFs, including loading/error announcements, reading order, controls, zoom/reflow, and printed long reports.
- Expert Bangla review of shaping, line wrapping, evidence quotes, and whether the PDF's empty mappings for shaping-only headline glyphs preserve spoken order.
- Record tools and versions, representative report cases, findings, fixes, retest results, and reviewer sign-off.
- Decide whether PDF/UA-2 is a release requirement; Step 116 establishes PDF/UA-1 only.

## Release status

Production and real learner data remain **NO-GO**. All open Step 92 gates remain blocking, including performance/memory limits, private artifact storage and lifecycle, penetration and high-concurrency testing, disaster recovery, legal/privacy and vendor review, adjudicated Bangla/English AI benchmarks, production UI/refusal paths, and staging operations/rollback evidence. No real learner content was used.

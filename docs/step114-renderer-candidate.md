# Step 114 — Chromium tagged-PDF renderer candidate

**Status: development candidate passed exact-head CI; accessibility and production gates remain open.** This change replaces the ReportLab fallback with Playwright Chromium printing semantic, escaped HTML. It embeds the licensed Noto Sans Bengali regular/bold files as data fonts, sets the document language, requests tagged output explicitly, blocks external requests, caps the report input/output, and applies an eight-second render deadline.

## Acceptance checks

Exact-head CI [36375277043](https://github.com/atikas20152075/Ai-Writing/actions/runs/36375277043) passed all three jobs, including these candidate checks:

- English and Bangla output contain a structure tree, marked status, embedded fonts, Unicode maps, and the expected document language.
- Poppler `pdftotext -raw` contains every approved Bengali report line in Unicode sequence after removing only layout whitespace. The default spatial extractor inserts gaps inside some Bengali words, so its visual-order presentation still needs human review.
- A large synthetic bilingual report paginates to more than one page.
- Existing PostgreSQL-backed report authorization, revocation, revision pinning, and desktop/mobile portal checks continue to pass.

These checks do not establish PDF/UA conformance or screen-reader quality; no veraPDF or screen-reader review has been completed. Run veraPDF against representative bilingual outputs and obtain independent Bangla/screen-reader review before closing accessibility gates. Production and real learner data remain **NO-GO**; the Chromium runtime also needs deployment packaging, load, memory, and process-isolation evidence.

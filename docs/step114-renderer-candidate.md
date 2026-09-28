# Step 114 — Chromium tagged-PDF renderer candidate

**Status: candidate under exact-head CI validation; not accepted yet.** This change replaces the ReportLab fallback with Playwright Chromium printing semantic, escaped HTML. It embeds the licensed Noto Sans Bengali regular/bold files as data fonts, sets the document language, requests tagged output explicitly, blocks external requests, caps the report input/output, and applies an eight-second render deadline.

## Acceptance checks

The candidate is accepted for development only if exact-head CI passes all of these:

- English and Bangla output contain a structure tree, marked status, embedded fonts, Unicode maps, and the expected document language.
- Poppler extracts every approved report line in order for a synthetic Bangla mixed-script report.
- A large synthetic bilingual report paginates to more than one page.
- Existing PostgreSQL-backed report authorization, revocation, revision pinning, and desktop/mobile portal checks continue to pass.

These checks do not establish PDF/UA conformance or screen-reader quality. Run veraPDF against representative bilingual outputs and obtain independent Bangla/screen-reader review before closing accessibility gates. Production and real learner data remain **NO-GO**; the Chromium runtime also needs deployment packaging, load, memory, and process-isolation evidence.

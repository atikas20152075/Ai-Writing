# Step 103 — Versioned bilingual PDF reports (development)

Step103 adds a language-aware report schema and versioned formats (`rubric-report-v2-en`, `rubric-report-v2-bn`) while preserving immutable v1 snapshots. Both languages use the same authorization, finalized-score provenance, exact revision receipt, audit and no-store HTTP boundary. PDFs are generated in memory, not archived.

## Font and rendering evidence

- Bundles Noto Sans Bengali 0.4.4 Regular/Bold from `@expo-google-fonts/noto-sans-bengali`; font license is SIL OFL 1.1 and package license is MIT. Font files are subset-embedded in output.
- Uses ReportLab 4.4.x with uharfbuzz 0.52+ to shape Bengali clusters. The API passes only bounded approved printable report lines to a Python subprocess, with 2 MiB input, 8 MiB PDF, 10 second timeout and no inherited application secrets.
- Synthetic Bangla/Latin fixtures were checked by `pdftotext` exact-line extraction, `pdffonts` embedded/subset flags, and rendered-page visual inspection. Multi-page and unsafe Unicode controls are covered by tests. These checks establish typography/extraction mechanics, not Bangla scoring quality or expert-approved language semantics.
- PDF metadata declares `bn-BD` or `en`; copy/select text and embedded fonts are supported. The renderer's marked-content flag is not a structure tree. This output is **not tagged PDF/PDF-UA certified** and screen-reader review remains required.

## Release status

Development only. Private artifact storage, retention/deletion and download revocation, independently adjudicated bilingual fixtures, actual PDF structure tree, accessibility review, load/performance thresholds, penetration review, UI workflows and production approvals remain open. No real learner text is used in fixtures. See [Step92 closeout](step92-production-closeout.md) and [Step100 NO-GO decision](step100-production-readiness.md).

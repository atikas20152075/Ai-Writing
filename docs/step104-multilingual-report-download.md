# Step 104 — Language-aware report downloads (development)

Step 103 made the report API choose a versioned Bangla or English PDF from the verified writing language. The portal still called every file an English PDF and the server-side gateway dropped the API's language header. Step104 carries the approved API language through the fixed-upstream gateway and the download flow.

## Delivered

- The BFF accepts only `en` and `bn-BD` as PDF response languages, emits `Content-Language`, and creates a matching language-specific attachment filename. A missing/unsupported language or non-PDF body fails closed.
- Student, family and academic report controls use language-neutral “Download report” text. The portal verifies that response language and attachment filename agree before saving the file.
- A report-conflict message no longer describes only English reports. Synthetic gateway and desktop/mobile end-to-end checks cover current English output; gateway unit checks exercise both English and Bangla metadata.

This does not add PDF structure tags or screen-reader conformance. Accessibility, expert language review, private artifact storage/lifecycle, and production authorization remain blocked; see [Step 92 closeout](step92-production-closeout.md), [Step 103](step103-bilingual-reports.md), and [Step 100 NO-GO](step100-production-readiness.md).

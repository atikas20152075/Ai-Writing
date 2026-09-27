# Step 105 — Bangla report end-to-end verification (development)

Step104 verified that the BFF maps both supported language headers and rejects missing/unsupported values. Its browser flow exercised the English report against the integrated stack. Step105 adds a separate synthetic Bangla fixture that runs a Bangla submission through human review, report generation, the authenticated portal BFF, and the browser download.

## Coverage

- The disposable PostgreSQL fixture can publish a Bangla topic and matching rubric without enabling external AI or using real learner data.
- Synthetic Bangla evidence is anchored to the exact verified text using Unicode code-point offsets.
- The full-stack test checks `Content-Language: bn-BD`, a matching `writing-report-bn-<id>.pdf` disposition, a PDF signature, and the browser's actual suggested filename.

This verifies language propagation and export authorization in the synthetic development stack. It does not validate Bangla scoring quality, PDF/UA accessibility, real-user language review, or production release. See [Step 103](step103-bilingual-reports.md), [Step 104](step104-multilingual-report-download.md), and [Step 100 NO-GO](step100-production-readiness.md).

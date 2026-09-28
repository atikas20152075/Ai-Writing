# Step 113 — Bilingual PDF renderer validation (development)

## Result

The Step 112 LibreOffice Writer candidate is rejected for bilingual PDF use. The candidate used LibreOfficeDev 26.8.0.0.alpha0 with `PDFUACompliance=true`, converted a semantic ODT to PDF, and appeared visually correct in the generated Bangla sample. veraPDF CLI 1.30.2 produced these results:

| Sample | PDF/UA-1 | PDF/UA-2 | Finding |
|---|---|---|---|
| English | Pass | Not run | No failure in the selected UA-1 profile |
| Bangla | Fail | Fail | Missing glyph-to-Unicode mappings; UA-1 reported 148 failed checks under ISO 14289-1:2014 clause 7.21.7 |

Poppler text extraction also reordered and split some Bengali glyphs in the footer. Visual appearance does not establish usable text mappings. The passing Step 112 unit and CI checks did not exercise veraPDF and do not override this result.

## Current implementation

The source was restored to the Step 111 open-source ReportLab/HarfBuzz implementation. Its synthetic regressions check selectable/extracted English and Bangla text, language metadata, embedded fonts, and the absence of `/MarkInfo` and `/StructTreeRoot`. This output is intentionally **untagged** and is not PDF/UA conformant. Keep the semantic HTML report available as the accessible alternative while its own independent assistive-technology review remains outstanding.

Apache FOP 2.11 was considered but not selected: its documentation lists Bengali complex-script support as “none.” ReportLab Plus documents tagged PDF support commercially; no license or procurement decision has been made. Do not represent either as an adopted solution.

## Acceptance gates

1. Select or build a renderer that preserves Bengali Unicode mappings and produces a correctly tagged structure tree for both locales; resolve licensing and deployment support.
2. Validate representative English, Bangla, and mixed-script PDFs with current veraPDF PDF/UA-1 and PDF/UA-2 profiles. Require passing results, correct metadata, full extraction/order checks, and visual inspection across short and multi-page reports.
3. Obtain independent human review of PDF and HTML output with keyboard and screen readers, including a Bangla-capable reviewer. Record environment, findings, fixes, retest, and sign-off.
4. Keep Step 92 accessibility open and production NO-GO until these and the broader release gates are evidenced.

Sources: [veraPDF validation profiles](https://docs.verapdf.org/validation/), [Apache FOP accessibility](https://xmlgraphics.apache.org/fop/2.11/accessibility.html) and [complex scripts](https://xmlgraphics.apache.org/fop/2.11/complexscripts.html), [ReportLab PDF accessibility](https://docs.reportlab.com/pdf-accessibility/).

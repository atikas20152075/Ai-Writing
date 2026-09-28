# Step 116 — Repair Chromium bilingual PDF/UA-1 output (CI verified)

## Finding and repair

Step115's generated Chromium output failed veraPDF 1.30.2 because Chromium left Noto Sans Bengali shaping glyphs with zero-valued `ToUnicode` entries and omitted XMP title metadata. A local experiment using the actual English and Bangla PDFs from CI run [36377478337](https://github.com/atikas20152075/Ai-Writing/actions/runs/36377478337) confirmed that the embedded Bengali glyph IDs map back to contextual glyph names in the licensed source Noto fonts.

The API renderer now post-processes Chromium's tagged PDF with `pdf-lib`: it fills missing mappings from those font glyph names, maps decorative Bengali headline fragments to an empty Unicode string, adds PDF/UA-1 XMP identification/title metadata, exposes the document title to assistive technology, and serializes as PDF 1.7. The mapping is deliberately fail-closed for unknown glyph-name patterns. The renderer continues to set document language and preserve semantic tags.

On the two downloaded Step115 synthetic samples, this repair produced readable tagged PDF 1.7 files and veraPDF 1.30.2 reported `PASS` for PDF/UA-1 on both English and Bangla. Exact-head CI for PR #41 [run 36380181213](https://github.com/atikas20152075/Ai-Writing/actions/runs/36380181213) then generated fresh samples and passed the pinned veraPDF UA-1 check plus all backend/PostgreSQL, web-portal and full-stack browser jobs. The successful head is `b8d6004e1b3117b6b507a7bb8d6883604d865696`; CI retained the fresh PDFs as `step115-bilingual-pdf-samples` for 14 days.

## Remaining checks

- PDF/UA-2 is a separate target. The unmodified Chromium output failed it due to the PDF 2.0 structure namespace, PDF/UA-2 metadata identifier, and outline structure-destination requirements. This step does not claim PDF/UA-2 conformance.
- Independent screen-reader/accessibility-API review and expert Bangla review remain outstanding, including confirmation that empty mappings for shaping-only headline fragments preserve a correct spoken/extracted reading order.
- Chromium production packaging, process isolation, load/memory limits, and every other Step92 release gate remain open. Production and real learner data remain **NO-GO**.

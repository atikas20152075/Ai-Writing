# Step 112 — Tagged bilingual report PDF (development)

## Renderer and output

Replaced the untagged ReportLab renderer with LibreOffice Writer's command-line PDF/UA export, backed by an intermediate semantic ODT. LibreOffice documents the `PDFUACompliance` export option and says selecting it also enables tagged PDF. The report renderer uses no network access and creates a private temporary office profile for each conversion.

Report title and section headings are emitted as heading elements, approved evidence is emitted as a list, and other content is emitted as paragraphs. The HTML-to-ODT import path treated the first HTML `h1` as a paragraph, so the bounded conversion step promotes that exact first title paragraph to ODT Heading 1 before PDF export. The ODT language and text styles are set to `en-US` or `bn-BD`; licensed bundled Noto Sans Bengali Regular/Bold fonts are made available through a temporary font directory. The output is refused if it lacks a PDF structure tree, marked-content flag, or expected document language.

Local generated-PDF checks verify `/StructTreeRoot`, `/H1`, `/H2`, list/list-item tags, language metadata, embedded font data, text extraction, and multi-page output. The real viewer output is tagged structurally. That is not an assertion of PDF/UA conformance or user accessibility: a standards validator and independent reviewer still need to inspect the complete output.

## Observed limitation and required review

Local visual rendering shows the Bangla report content and footer correctly. However, Poppler's `pdftotext` spatial extractor reorders/splits some Bengali glyphs in the final footer sentence. The regression currently checks extracted source text for every preceding report line but intentionally does not treat that footer extraction as passed. This needs investigation with an independent screen reader/accessibility API and a reviewer who can read Bangla; do not claim reliable Bangla PDF access until that review confirms the spoken text and order. Fix the renderer/output if the reviewer finds a barrier, and retest the complete report including both footer sentences.

The desktop/mobile HTML report still needs independent assistive-technology review described in [Step 111](step111-report-accessibility-plan.md). The current repository does not contain reviewer sign-off or external validator results. Production remains NO-GO.

## Runtime and CI dependency

The API PDF path now requires LibreOffice Writer (`soffice`) at runtime, configured on `PATH` or by `REPORT_SOFFICE`. If unavailable, PDF rendering fails closed; HTML reports remain the alternative. CI installs `libreoffice-writer` and Poppler tools. Any deployment image must explicitly include a supported LibreOffice Writer build and the current licensed font package, and must test memory/time limits under expected report volume before launch.

Sources: [LibreOffice PDF CLI export options](https://help.libreoffice.org/latest/en-US/text/shared/guide/pdf_params.html) and [LibreOffice PDF/UA export](https://help.libreoffice.org/latest/en-US/text/shared/01/ref_pdf_export_universal_accessibility.html). The export option produces tagged structure, but external semantic, reading-order, bilingual and assistive-technology review remain required.

Verification: local `npm run test:assessment` passes 35 tests using the available LibreOffice Writer binary, and API typecheck passes. PR #36 exact-head synthetic CI [36364932880](https://github.com/atikas20152075/Ai-Writing/actions/runs/36364932880) and post-merge main CI [36365206897](https://github.com/atikas20152075/Ai-Writing/actions/runs/36365206897) both passed all three jobs (backend integration, web portal, and database-backed desktop/mobile browser tests). These checks do not close the independent accessibility or production gates.

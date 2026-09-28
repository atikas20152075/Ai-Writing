# Step 111 — Report semantics and independent accessibility review

## Step 111 result (superseded by Step 112)

The PDF generator no longer writes `/MarkInfo /Marked true` without a PDF logical structure tree. That flag could imply tagging that the output does not contain. English and Bangla PDFs continue to declare `/Lang`, embed the licensed Noto fonts and retain selectable text. A regression test verifies the language and fonts while asserting that the output contains neither `/MarkInfo` nor `/StructTreeRoot`; this is an explicit check that the current PDF is **not tagged**. No PDF/UA claim is made.

The HTML report remains the semantic alternative: it uses a language-tagged `<main>`, a report `<article>`, headings, `<dl>` metadata, sections, and evidence lists. Step 110's synthetic desktop/mobile browser coverage checks report content and authorization. Neither that coverage nor this code review substitutes for testing with assistive technology or users.

## Tagged PDF implementation route

The repository uses the open-source ReportLab API. ReportLab's own accessibility documentation says tagged-PDF generation is available in its commercial ReportLab Plus product, not the open-source framework. Its documented route is to emit a real structure tree, map semantic content such as headings and paragraphs, and validate the resulting tags. We will not hand-write PDF structure objects into the current generator: parent-tree mappings, marked-content references, reading order, and role mappings must stay mutually consistent. The renderer choice, licensing and deployment support must be resolved before replacing the current PDF path.

For a selected renderer, acceptance requires all of the following before calling the PDF tagged:

1. Generate a structure tree with a document root and correctly ordered standard structure elements; map report title and section headings to heading tags, prose to paragraphs, and evidence to list/list-item/label/body tags where appropriate. Mark decorative content as artifacts.
2. Preserve `Lang` (`en` or `bn-BD`), document title, Unicode text mappings and embedded fonts. Verify selectable and extracted English, Bangla and mixed-script text.
3. Inspect the structure tree, document language, title, reading order and any automated PDF/UA checks with a current validator such as PAC. Treat automated results as one check, not proof of usability.
4. Have an independent accessibility reviewer inspect representative short and multi-page reports with keyboard navigation and screen readers. Record tool, OS/browser/reader versions, report cases, issues, retest results and reviewer sign-off.

W3C PDF techniques say logical reading order is based on the PDF tag order and recommend verifying the reading order with a screen reader or accessibility API. They also require heading tags in the structure tree for navigable PDF headings. Sources: [ReportLab PDF accessibility](https://docs.reportlab.com/pdf-accessibility/), [W3C PDF3](https://www.w3.org/WAI/WCAG21/Techniques/pdf/PDF3), and [W3C PDF9](https://www.w3.org/WAI/WCAG22/Techniques/pdf/PDF9).

## Independent HTML assistive-technology review plan

An independent reviewer should test the English and Bangla report on desktop and mobile using keyboard-only interaction plus at least one mainstream screen reader on each platform. Include a short report, a long report spanning multiple pages when printed, and a report with long evidence quotes. Check:

- the initial loading and error status is announced, and report content appears without unexpected focus movement;
- the document language is exposed correctly for English and Bangla;
- heading levels and navigation labels form a usable outline;
- score, metadata, rationale and evidence are read in the intended order and with their labels;
- back navigation and print/save controls have clear names and keyboard operation;
- browser zoom, reflow, contrast, text selection and print output remain usable.

Log findings with reproducible steps and severity. Fix critical and serious barriers, retest affected flows with the reviewer, and retain their report as release evidence. Automated checks may supplement this review but cannot replace it. No independent review has yet occurred; this section is a plan, not a completed validation.

## Release boundary

Step 111 removed a misleading PDF tagging flag and recorded implementable validation criteria. Step 112 below records the renderer integration that followed. Independent assistive-technology review remains open. Keep the Step 92 accessibility checkbox open and production status NO-GO until PDF structure is independently validated, HTML/PDF review findings are resolved and recorded, and all other release gates pass. Use synthetic reports only until all release gates pass.

Verification: `npm run test:assessment` passes all 35 tests, including the PDF metadata regression; `npm run typecheck:api` and `git diff --check` pass. Exact-head CI evidence must still be recorded; local success alone does not close external review gates.

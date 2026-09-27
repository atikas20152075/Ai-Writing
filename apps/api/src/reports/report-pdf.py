"""ReportLab + HarfBuzz renderer. Input/output are capped JSON/base64 on stdin/stdout."""
import base64
import io
import json
import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph
from reportlab.pdfbase.pdfdoc import PDFDictionary, PDFtrue
from xml.sax.saxutils import escape

MAX_BYTES=8*1024*1024
payload=json.load(sys.stdin)
if len(json.dumps(payload,ensure_ascii=False).encode())>MAX_BYTES:
    raise ValueError('REPORT_TOO_LARGE')
regular=os.environ['REPORT_FONT_REGULAR']; bold=os.environ['REPORT_FONT_BOLD']
pdfmetrics.registerFont(TTFont('Noto',regular))
pdfmetrics.registerFont(TTFont('Noto-Bold',bold))
pdfmetrics.registerFontFamily('Noto',normal='Noto',bold='Noto-Bold',italic='Noto',boldItalic='Noto-Bold')
lines=payload['lines']; lang=payload['lang']
buf=io.BytesIO()
doc=SimpleDocTemplate(buf,pagesize=letter,rightMargin=50,leftMargin=50,topMargin=50,bottomMargin=50,
    title=payload['title'],author='AI Writing Assessment Platform',subject='Approved rubric score extract')
styles={
 'title':ParagraphStyle('title',fontName='Noto-Bold',fontSize=18,leading=24,spaceAfter=9),
 'subtitle':ParagraphStyle('subtitle',fontName='Noto-Bold',fontSize=12,leading=17,spaceAfter=6),
 'section':ParagraphStyle('section',fontName='Noto-Bold',fontSize=11,leading=15,spaceBefore=3,spaceAfter=5),
 'field':ParagraphStyle('field',fontName='Noto',fontSize=10,leading=14,spaceAfter=3),
 'body':ParagraphStyle('body',fontName='Noto',fontSize=10,leading=14,spaceAfter=6),
 'quote':ParagraphStyle('quote',fontName='Noto',fontSize=10,leading=14,leftIndent=10,spaceAfter=6),
}
story=[]
for item in lines:
    text=escape(item['text']).replace(' ', '&#160;').replace('\n','<br/>')
    story.append(Paragraph(text,styles[item['kind']]))
def tag_pdf(canvas, document):
    # Explicit language and marked-content flag; this does not create a structure tree.
    canvas.setCatalogEntry('Lang', lang)
    canvas.setCatalogEntry('MarkInfo',PDFDictionary({'Marked':PDFtrue}))
doc.build(story,onFirstPage=tag_pdf,onLaterPages=tag_pdf)
data=buf.getvalue()
if len(data)>MAX_BYTES: raise ValueError('REPORT_TOO_LARGE')
sys.stdout.write(base64.b64encode(data).decode('ascii'))

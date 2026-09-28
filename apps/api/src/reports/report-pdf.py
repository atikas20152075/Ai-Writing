"""Build a tagged PDF/UA report through isolated LibreOffice Writer conversions."""
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from xml.sax.saxutils import escape

MAX_BYTES = 8 * 1024 * 1024
MAX_INPUT_BYTES = 2 * 1024 * 1024
OFFICE = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0'
STYLE = 'urn:oasis:names:tc:opendocument:xmlns:style:1.0'
FO = 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0'
DC = 'http://purl.org/dc/elements/1.1/'
META = 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0'

for prefix, uri in (
    ('office', OFFICE), ('style', STYLE), ('fo', FO), ('dc', DC), ('meta', META),
    ('text', 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'),
    ('xlink', 'http://www.w3.org/1999/xlink'), ('svg', 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0'),
    ('ooo', 'http://openoffice.org/2004/office'),
    ('loext', 'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0'),
):
    ET.register_namespace(prefix, uri)


def set_document_language(path: Path, lang: str):
    """Set language on every style/text run and document properties in imported ODT."""
    with ZipFile(path, 'r') as source:
        entries = [(entry, source.read(entry.filename)) for entry in source.infolist()]
    with ZipFile(path.with_suffix('.localized.odt'), 'w', ZIP_DEFLATED) as target:
        for entry, data in entries:
            if entry.filename in ('styles.xml', 'content.xml'):
                root = ET.fromstring(data)
                if entry.filename == 'content.xml':
                    text_body = root.find(f'.//{{{OFFICE}}}body/{{{OFFICE}}}text')
                    text_ns = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
                    paragraph_tag, heading_tag = f'{{{text_ns}}}p', f'{{{text_ns}}}h'
                    title = None
                    if text_body is not None:
                        title = next((node for node in text_body
                                      if node.tag == paragraph_tag and ''.join(node.itertext()).strip()), None)
                    if title is None:
                        raise ValueError('REPORT_TITLE_STRUCTURE_MISSING')
                    heading = ET.Element(heading_tag, {
                        '{urn:oasis:names:tc:opendocument:xmlns:text:1.0}style-name': 'Heading_20_1',
                        '{urn:oasis:names:tc:opendocument:xmlns:text:1.0}outline-level': '1',
                    })
                    heading.text = title.text
                    for child in list(title):
                        heading.append(child)
                    text_body.insert(list(text_body).index(title), heading)
                    text_body.remove(title)
                for props in root.iter(f'{{{STYLE}}}text-properties'):
                    props.set(f'{{{FO}}}language', lang.split('-')[0])
                    props.set(f'{{{FO}}}country', lang.split('-')[1] if '-' in lang else 'US')
                    props.set(f'{{{STYLE}}}font-name', 'Noto Sans Bengali')
                    props.set(f'{{{STYLE}}}font-name-asian', 'Noto Sans Bengali')
                    props.set(f'{{{STYLE}}}font-name-complex', 'Noto Sans Bengali')
                data = ET.tostring(root, encoding='utf-8', xml_declaration=True)
            elif entry.filename == 'meta.xml':
                root = ET.fromstring(data)
                meta = root.find(f'{{{OFFICE}}}meta')
                if meta is None:
                    raise ValueError('REPORT_ODT_METADATA_MISSING')
                language = meta.find(f'{{{DC}}}language')
                if language is None:
                    language = ET.SubElement(meta, f'{{{DC}}}language')
                language.text = lang
                data = ET.tostring(root, encoding='utf-8', xml_declaration=True)
            target.writestr(entry, data)
    path.with_suffix('.localized.odt').replace(path)


def run_office(office: str, profile: Path, work: Path, args: list[str]):
    command = [office, f'-env:UserInstallation={profile.as_uri()}', '--headless',
               '--nodefault', '--nologo', '--nofirststartwizard', '--nolockcheck', *args]
    result = subprocess.run(command, cwd=work, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=9, check=False, env=os.environ.copy())
    if result.returncode != 0:
        raise ValueError('REPORT_RENDER_FAILED')


payload = json.load(sys.stdin)
if len(json.dumps(payload, ensure_ascii=False).encode()) > MAX_INPUT_BYTES:
    raise ValueError('REPORT_TOO_LARGE')

language = payload['lang']
if language not in ('en', 'bn-BD'):
    raise ValueError('REPORT_LANGUAGE_UNSUPPORTED')
office = os.environ.get('REPORT_SOFFICE') or shutil.which('soffice')
if not office:
    raise ValueError('REPORT_RENDER_UNAVAILABLE')
regular = Path(os.environ['REPORT_FONT_REGULAR'])
bold = Path(os.environ['REPORT_FONT_BOLD'])
if not regular.is_file() or not bold.is_file():
    raise ValueError('REPORT_FONT_UNAVAILABLE')

body = []
in_evidence_list = False
for item in payload['lines']:
    kind, text = item['kind'], escape(item['text'])
    if kind != 'quote' and in_evidence_list:
        body.append('</ul>')
        in_evidence_list = False
    if kind == 'quote':
        if not in_evidence_list:
            body.append('<ul>')
            in_evidence_list = True
        body.append(f'<li><p>{text}</p></li>')
    elif kind == 'title':
        body.append(f'<h1>{text}</h1>')
    elif kind in ('subtitle', 'section'):
        body.append(f'<h2>{text}</h2>')
    else:
        body.append(f'<p>{text}</p>')
if in_evidence_list:
    body.append('</ul>')

html = f'''<!doctype html>
<html lang="{language}"><head><meta charset="utf-8"><title>{escape(payload['title'])}</title>
<meta name="author" content="AI Writing Assessment Platform"><meta name="subject" content="Approved rubric score extract">
<style>
@page {{ size: letter; margin: 0.7in; }}
body {{ color: #111; font-family: "Noto Sans Bengali"; font-size: 10pt; line-height: 1.4; }}
h1 {{ font-size: 18pt; margin: 0 0 0.16in; }}
h2 {{ font-size: 12pt; margin: 0.14in 0 0.08in; }}
p {{ margin: 0 0 0.08in; }}
ul {{ margin: 0.03in 0 0.12in; padding-left: 0.28in; }}
li {{ margin: 0 0 0.05in; }}
</style></head><body>{''.join(body)}</body></html>'''

with tempfile.TemporaryDirectory(prefix='writing-report-') as temp:
    work = Path(temp)
    font_dir = work / 'home' / '.local' / 'share' / 'fonts'
    font_dir.mkdir(parents=True)
    shutil.copyfile(regular, font_dir / regular.name)
    shutil.copyfile(bold, font_dir / bold.name)
    os.environ['HOME'] = str(work / 'home')
    os.environ['XDG_DATA_HOME'] = str(work / 'home' / '.local' / 'share')
    os.environ['XDG_CACHE_HOME'] = str(work / 'home' / '.cache')
    (work / 'home' / '.cache').mkdir(parents=True)
    source = work / 'report.html'
    source.write_text(html, encoding='utf-8')
    profile = work / 'office-profile'
    run_office(office, profile, work, ['--convert-to', 'odt', '--outdir', str(work), str(source)])
    odt = work / 'report.odt'
    if not odt.is_file():
        raise ValueError('REPORT_RENDER_FAILED')
    set_document_language(odt, language)
    out = work / 'report.pdf'
    options = json.dumps({'PDFUACompliance': {'type': 'boolean', 'value': 'true'}}, separators=(',', ':'))
    run_office(office, profile, work,
               ['--convert-to', f'pdf:writer_pdf_Export:{options}', '--outdir', str(work), str(odt)])
    data = out.read_bytes() if out.is_file() else b''
    if len(data) > MAX_BYTES:
        raise ValueError('REPORT_TOO_LARGE')
    if not data.startswith(b'%PDF-') or b'/StructTreeRoot' not in data or b'/Marked true' not in data:
        raise ValueError('REPORT_TAGGING_MISSING')
    pdf_language = 'en-US' if language == 'en' else 'bn-BD'
    if not re.search(rb'/Lang\s*\(' + re.escape(pdf_language.encode('ascii')) + rb'\)', data):
        raise ValueError('REPORT_LANGUAGE_MISSING')
    sys.stdout.write(base64.b64encode(data).decode('ascii'))

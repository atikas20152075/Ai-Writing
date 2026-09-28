import {chromium,type Browser} from 'playwright';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {reportLines,ReportPolicyError,type PrintableReport} from './report-policy.ts';

const require=createRequire(import.meta.url);
const {PDFDocument,PDFName,PDFNumber,PDFDict,PDFRawStream,decodePDFRawStream}=require('pdf-lib') as any;
const fontkit=require('fontkit') as any;
const regular=require.resolve('@expo-google-fonts/noto-sans-bengali/400Regular/NotoSansBengali_400Regular.ttf');
const bold=require.resolve('@expo-google-fonts/noto-sans-bengali/700Bold/NotoSansBengali_700Bold.ttf');
const MAX_BYTES=8*1024*1024,MAX_INPUT=2*1024*1024,TIMEOUT_MS=8_000;

function escapeHtml(value:string):string{
 return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function markup(report:PrintableReport,regularBase64:string,boldBase64:string):string{
 const lang=report.language==='BANGLA'?'bn-BD':'en-US';
 const body=reportLines(report).map(({text,kind})=>{
  const safe=escapeHtml(text);
  if(kind==='title')return `<h1>${safe}</h1>`;
  if(kind==='subtitle'||kind==='section')return `<h2>${safe}</h2>`;
  if(kind==='quote')return `<blockquote><p>${safe}</p></blockquote>`;
  return `<p class="${kind}">${safe}</p>`;
 }).join('\n');
 return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:">
  <title>${lang==='bn-BD'?'লিখিত মূল্যায়ন প্রতিবেদন':'Writing assessment report'}</title>
  <style>
   @font-face{font-family:ReportNoto;src:url(data:font/ttf;base64,${regularBase64}) format('truetype');font-weight:400}
   @font-face{font-family:ReportNoto;src:url(data:font/ttf;base64,${boldBase64}) format('truetype');font-weight:700}
   @page{size:letter;margin:0.65in}
   html{font-family:ReportNoto,sans-serif;font-size:10pt;color:#111;line-height:1.45}
   body{margin:0}
   h1{font-size:18pt;line-height:1.25;margin:0 0 10pt}
   h2{font-size:12pt;line-height:1.35;margin:10pt 0 5pt;break-after:avoid}
   p{margin:0 0 5pt;overflow-wrap:break-word;word-break:normal}
   .field{margin-bottom:3pt}
   blockquote{margin:0 0 7pt 12pt;padding-left:8pt;border-left:2pt solid #777;break-inside:avoid}
   blockquote p{margin:0}
  </style></head><body>${body}</body></html>`;
}

function unicodeForNotoGlyph(name:string):string{
 const encoded=name.match(/^uni((?:[0-9a-f]{4})+)/i)?.[1];
 if(encoded&&encoded.length%4===0)return encoded.toUpperCase();
 if(name.startsWith('raphalabeng'))return '09B009CD';
 if(name.startsWith('baphalabeng'))return '09AC09CD';
 // Bengali headline fragments are shaping-only glyphs with no source character.
 if(name.startsWith('headlinebeng'))return '';
 throw new ReportPolicyError('REPORT_UNICODE_MAPPING_MISSING');
}

export async function repairTaggedPdf(pdf:Buffer,report:PrintableReport):Promise<Buffer>{
 const language=report.language==='BANGLA'?'bn-BD':'en-US';
 const title=report.language==='BANGLA'?'লিখিত মূল্যায়ন প্রতিবেদন':'Writing assessment report';
 const doc=await PDFDocument.load(pdf,{updateMetadata:false});
 doc.setTitle(title);doc.setLanguage(language);
 const noto={
  Bold:fontkit.create(await readFile(bold)),
  Regular:fontkit.create(await readFile(regular)),
 };
 let taggedFonts=0;
 for(const page of doc.getPages()){
  const resources=doc.context.lookup(page.node.Resources());
  const fonts=doc.context.lookup(resources.get(PDFName.of('Font')));
  for(const [,fontRef] of fonts.entries()){
   taggedFonts++;
   const font=doc.context.lookup(fontRef);
   const baseName=font.get(PDFName.of('BaseFont')).decodeText();
   const style=baseName.endsWith('Bold')?'Bold':'Regular';
   const descendants=doc.context.lookup(font.get(PDFName.of('DescendantFonts')));
   const descendant=doc.context.lookup(descendants.get(0));
   const cidMap=descendant.get(PDFName.of('CIDToGIDMap'));
   if(cidMap&&cidMap.decodeText()!=='Identity')throw new ReportPolicyError('REPORT_UNICODE_MAPPING_MISSING');
   const cmap=doc.context.lookup(font.get(PDFName.of('ToUnicode')));
   const source=Buffer.from(decodePDFRawStream(cmap).decode()).toString('latin1');
   const mapped=source.replace(/<([0-9a-f]{4})>\s*<0000>/gi,(_match:string,cidHex:string)=>{
    const glyph=noto[style].getGlyph(Number.parseInt(cidHex,16));
    const unicode=unicodeForNotoGlyph(glyph.name);
    return `<${cidHex.toUpperCase()}> <${unicode}>`;
   });
   const encoded=Buffer.from(mapped,'latin1');
   cmap.dict.delete(PDFName.of('Filter'));cmap.dict.delete(PDFName.of('DecodeParms'));
   cmap.dict.set(PDFName.of('Length'),PDFNumber.of(encoded.length));cmap.contents=encoded;
  }
 }
 if(taggedFonts===0)throw new ReportPolicyError('REPORT_TAGGING_MISSING');
 const escapedTitle=title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 const xmp=`<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/"><pdfuaid:part>1</pdfuaid:part><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapedTitle}</rdf:li><rdf:li xml:lang="${language}">${escapedTitle}</rdf:li></rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
 const metadata=PDFDict.withContext(doc.context);
 metadata.set(PDFName.of('Type'),PDFName.of('Metadata'));metadata.set(PDFName.of('Subtype'),PDFName.of('XML'));
 doc.catalog.set(PDFName.of('Metadata'),doc.context.register(PDFRawStream.of(metadata,new TextEncoder().encode(xmp))));
 const viewerPreferences=doc.context.lookup(doc.catalog.get(PDFName.of('ViewerPreferences')));
 viewerPreferences.set(PDFName.of('DisplayDocTitle'),doc.context.obj(true));
 return Buffer.from(await doc.save({useObjectStreams:false}));
}

/** Print approved content through Chromium with semantic HTML and explicit tagged output. */
export async function renderReportPdf(report:PrintableReport):Promise<Buffer>{
 if(report.schemaVersion!=='rubric-report-v2'||!['BANGLA','ENGLISH'].includes(report.language))
  throw new ReportPolicyError('REPORT_FORMAT_UNSUPPORTED');
 const lines=reportLines(report);
 if(lines.length>1000)throw new ReportPolicyError('REPORT_TOO_LARGE');
 const lang=report.language==='BANGLA'?'bn-BD':'en-US';
 if(Buffer.byteLength(JSON.stringify({lang,lines}))>MAX_INPUT)
  throw new ReportPolicyError('REPORT_TOO_LARGE');
 let browser:Browser|undefined,timeout:ReturnType<typeof setTimeout>|undefined,timedOut=false;
 try{
  const rendering=(async()=>{
   const launched=await chromium.launch({headless:true,timeout:TIMEOUT_MS,
    args:process.getuid?.()===0?['--no-sandbox','--disable-setuid-sandbox']:[]});
   if(timedOut){await launched.close();throw new ReportPolicyError('REPORT_RENDER_TIMEOUT');}
   browser=launched;
   const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block'});
   try{
    const page=await context.newPage();
    await page.route('**/*',route=>route.request().url()==='about:blank'?route.continue():route.abort());
    const html=markup(report,(await readFile(regular)).toString('base64'),(await readFile(bold)).toString('base64'));
    await page.setContent(html,{waitUntil:'load',timeout:TIMEOUT_MS});
    await page.evaluate(()=>document.fonts.ready.then(()=>true));
    const bytes=await page.pdf({format:'Letter',preferCSSPageSize:true,printBackground:true,tagged:true,outline:true});
    return repairTaggedPdf(bytes,report);
   }finally{await context.close().catch(()=>undefined);}
  })();
  const pdf=await Promise.race([
   rendering,
   new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{timedOut=true;void browser?.close();reject(new ReportPolicyError('REPORT_RENDER_TIMEOUT'));},TIMEOUT_MS);}),
  ]);
  if(pdf.length>MAX_BYTES)throw new ReportPolicyError('REPORT_TOO_LARGE');
  const bytes=pdf.toString('latin1');
  if(!pdf.subarray(0,8).toString('ascii').startsWith('%PDF-')||
   !bytes.includes('/StructTreeRoot')||!bytes.includes('/MarkInfo')||!bytes.includes(`/Lang (${lang})`))
   throw new ReportPolicyError('REPORT_TAGGING_MISSING');
  return pdf;
 }catch(error){
  if(error instanceof ReportPolicyError)throw error;
  throw new ReportPolicyError('REPORT_RENDER_FAILED');
 }finally{
  if(timeout)clearTimeout(timeout);
  if(browser)await browser.close().catch(()=>undefined);
 }
}

import {chromium} from 'playwright';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {reportLines,ReportPolicyError,type PrintableReport} from './report-policy.ts';

const require=createRequire(import.meta.url);
const regular=require.resolve('@expo-google-fonts/noto-sans-bengali/400Regular/NotoSansBengali_400Regular.ttf');
const bold=require.resolve('@expo-google-fonts/noto-sans-bengali/700Bold/NotoSansBengali_700Bold.ttf');
const MAX_BYTES=8*1024*1024,MAX_INPUT=2*1024*1024,TIMEOUT_MS=15_000;

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

/** Print the approved report through Chromium with semantic HTML and explicit tagged output. */
export async function renderReportPdf(report:PrintableReport):Promise<Buffer>{
 if(report.schemaVersion!=='rubric-report-v2'||!['BANGLA','ENGLISH'].includes(report.language))
  throw new ReportPolicyError('REPORT_FORMAT_UNSUPPORTED');
 const lines=reportLines(report);
 if(lines.length>1000)throw new ReportPolicyError('REPORT_TOO_LARGE');
 const lang=report.language==='BANGLA'?'bn-BD':'en-US';
 const inputBytes=Buffer.byteLength(JSON.stringify({lang,lines}));
 if(inputBytes>MAX_INPUT)throw new ReportPolicyError('REPORT_TOO_LARGE');
 let browser;
 let timeout:ReturnType<typeof setTimeout>|undefined;
 try{
  browser=await chromium.launch({headless:true,timeout:TIMEOUT_MS,
   args:process.getuid?.()===0?['--no-sandbox','--disable-setuid-sandbox']:[]});
  const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block'});
  const page=await context.newPage();
  await page.route('**/*',route=>route.request().url()==='about:blank'?route.continue():route.abort());
  const html=markup(report,(await readFile(regular)).toString('base64'),(await readFile(bold)).toString('base64'));
  await page.setContent(html,{waitUntil:'load',timeout:TIMEOUT_MS});
  await page.evaluate(()=>document.fonts.ready);
  const pdf=await Promise.race([
   page.pdf({format:'Letter',preferCSSPageSize:true,printBackground:true,tagged:true,outline:true}),
   new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new ReportPolicyError('REPORT_RENDER_TIMEOUT')),TIMEOUT_MS);}),
  ]);
  if(pdf.length>MAX_BYTES)throw new ReportPolicyError('REPORT_TOO_LARGE');
  const signature=pdf.subarray(0,8).toString('ascii');
  const bytes=pdf.toString('latin1');
  if(!signature.startsWith('%PDF-')||!bytes.includes('/StructTreeRoot')||!bytes.includes('/MarkInfo')||
   !bytes.includes(`/Lang (${lang})`))throw new ReportPolicyError('REPORT_TAGGING_MISSING');
  return pdf;
 }catch(error){
  if(error instanceof ReportPolicyError)throw error;
  throw new ReportPolicyError('REPORT_RENDER_FAILED');
 }finally{
  if(timeout)clearTimeout(timeout);
  if(browser)await browser.close().catch(()=>undefined);
 }
}

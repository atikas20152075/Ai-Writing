import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {reportLines,ReportPolicyError,type PrintableReport} from './report-policy.ts';
const require=createRequire(import.meta.url);
const regular=require.resolve('@expo-google-fonts/noto-sans-bengali/400Regular/NotoSansBengali_400Regular.ttf');
const bold=require.resolve('@expo-google-fonts/noto-sans-bengali/700Bold/NotoSansBengali_700Bold.ttf');
const renderer=new URL('./report-pdf.py',import.meta.url);
const MAX_BYTES=8*1024*1024,MAX_INPUT=2*1024*1024,TIMEOUT_MS=25_000;

/** Render approved report text through an isolated bounded PDF/UA LibreOffice worker. */
export async function renderReportPdf(report:PrintableReport):Promise<Buffer>{
 if(report.schemaVersion!=='rubric-report-v2'||!['BANGLA','ENGLISH'].includes(report.language))
  throw new ReportPolicyError('REPORT_FORMAT_UNSUPPORTED');
 const lines=reportLines(report);
 if(lines.length>1000)throw new ReportPolicyError('REPORT_TOO_LARGE');
 const lang=report.language==='BANGLA'?'bn-BD':'en';
 const input=Buffer.from(JSON.stringify({lang,title:report.language==='BANGLA'?'লিখিত মূল্যায়ন প্রতিবেদন':'Writing assessment report',lines}));
 if(input.length>MAX_INPUT)throw new ReportPolicyError('REPORT_TOO_LARGE');
 return new Promise((resolve,reject)=>{
  const child=spawn(process.env.REPORT_PYTHON||'python3',['-I',renderer.pathname],{
   stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH||'/usr/bin:/bin',
    REPORT_FONT_REGULAR:regular,REPORT_FONT_BOLD:bold}});
  const out:Buffer[]=[],err:Buffer[]=[];let outLength=0,errLength=0,settled=false;
  const finish=(error?:Error,result?:Buffer)=>{if(settled)return;settled=true;clearTimeout(timer);
   if(error){child.kill('SIGKILL');reject(error);}else resolve(result!);};
  const timer=setTimeout(()=>finish(new ReportPolicyError('REPORT_RENDER_TIMEOUT')),TIMEOUT_MS);
  child.stdout.on('data',(chunk:Buffer)=>{outLength+=chunk.length;
   if(outLength>MAX_BYTES*2){finish(new ReportPolicyError('REPORT_TOO_LARGE'));return;}out.push(chunk);});
  child.stderr.on('data',(chunk:Buffer)=>{errLength+=chunk.length;if(errLength<=4096)err.push(chunk);});
  child.once('error',()=>finish(new ReportPolicyError('REPORT_RENDER_UNAVAILABLE')));
  child.once('close',(code)=>{if(settled)return;
   if(code!==0){finish(new ReportPolicyError('REPORT_RENDER_FAILED'));return;}
   try{const pdf=Buffer.from(Buffer.concat(out).toString('ascii'),'base64');
    if(pdf.length>MAX_BYTES||!pdf.subarray(0,8).toString('ascii').startsWith('%PDF-'))
     throw new ReportPolicyError('REPORT_RENDER_FAILED');
    finish(undefined,pdf);
   }catch(error){finish(error instanceof Error?error:new ReportPolicyError('REPORT_RENDER_FAILED'));}
  });
  child.stdin.end(input);
 });
}

/** Deliberately small ASCII-only one-font multi-page PDF v1.4 renderer.
 * Do NOT send Bengali or other non-Latin input here. Embed and benchmark approved
 * bilingual Unicode fonts in the later dedicated PDF renderer milestone. */
import {type PrintableReport,reportLines,ReportPolicyError} from './report-policy.ts';
function escapePdf(s:string):string{return s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function wrap(line:string,max=82):string[]{
 if(!/^[\x20-\x7e]*$/.test(line))throw new ReportPolicyError('ENGLISH_ASCII_PDF_ONLY');
 if(!line)return [''];
 const chunks:string[]=[];
 let remainder=line;
 while(remainder.length>max){
  let cut=remainder.lastIndexOf(' ',max);
  if(cut<max/2)cut=max;
  chunks.push(remainder.slice(0,cut));remainder=remainder.slice(cut).trimStart();
 }
 chunks.push(remainder);
 return chunks;
}
/** Produces real printable bytes; does not store a file, presign a URL or send email. */
export function renderEnglishPdf(snapshot:PrintableReport):Buffer{
 if(snapshot.language!=='ENGLISH'||snapshot.schemaVersion!=='english-rubric-report-v1')
  throw new ReportPolicyError('ENGLISH_PDF_ONLY');
 const all=reportLines(snapshot).flatMap(l=>wrap(l.text));
 if(all.length>1000)throw new ReportPolicyError('REPORT_TOO_LONG');
 const pages:string[][]=[];
 for(let offset=0;offset<all.length;offset+=46)pages.push(all.slice(offset,offset+46));
 if(!pages.length)pages.push([]);
 const objects=new Map<number,string>();
 objects.set(1,'<< /Type /Catalog /Pages 2 0 R >>');
 objects.set(3,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
 const refs:string[]=[];
 for(let index=0;index<pages.length;index++){
  const pageId=4+index*2,streamId=pageId+1;
  refs.push(pageId+' 0 R');
  const stream='BT\n/F1 10 Tf\n50 753 Td\n'+pages[index].map(s=>'('+escapePdf(s)+') Tj\n0 -15 Td').join('\n')+'\nET\n';
  objects.set(pageId,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '+
    '/Resources << /Font << /F1 3 0 R >> >> /Contents '+streamId+' 0 R >>');
  objects.set(streamId,'<< /Length '+Buffer.byteLength(stream,'ascii')+' >>\nstream\n'+stream+'endstream');
 }
 objects.set(2,'<< /Type /Pages /Kids ['+refs.join(' ')+'] /Count '+pages.length+' >>');
 let content='%PDF-1.4\n%ASCII\n';
 const maxId=3+pages.length*2,offsets=[0];
 for(let id=1;id<=maxId;id++){
  offsets.push(Buffer.byteLength(content,'ascii'));
  content+=id+' 0 obj\n'+objects.get(id)+'\nendobj\n';
 }
 const startXref=Buffer.byteLength(content,'ascii');
 content+='xref\n0 '+(maxId+1)+'\n0000000000 65535 f \n';
 for(let id=1;id<=maxId;id++)content+=String(offsets[id]).padStart(10,'0')+' 00000 n \n';
 content+='trailer\n<< /Size '+(maxId+1)+' /Root 1 0 R >>\nstartxref\n'+startXref+'\n%%EOF\n';
 return Buffer.from(content,'ascii');
}

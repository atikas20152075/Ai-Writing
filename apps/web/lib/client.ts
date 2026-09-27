export class Superseded extends Error {}
export class APIError extends Error {status:number;constructor(status:number,message:string){super(message);this.status=status;}}
export class PortalClient {
 private epoch=0;
 private channels=new Map<string,number>();
 clear(){this.epoch++;this.channels.clear();}
 capture(channel?:string){
  const epoch=this.epoch,version=channel?(this.channels.get(channel)??0)+1:0;
  if(channel)this.channels.set(channel,version);
  return ()=>{if(epoch!==this.epoch||(channel&&this.channels.get(channel)!==version))throw new Superseded();};
 }
 async request<T>(path:string,options:{body?:unknown;channel?:string;pdf?:boolean}={}):Promise<T>{
  const current=this.capture(options.channel);let response:Response;
  try{response=await fetch('/api/portal/'+path,{method:options.body===undefined?'GET':'POST',
   credentials:'same-origin',cache:'no-store',headers:{'X-Writing-Client':'portal',...(options.body===undefined?{}:{'Content-Type':'application/json'})},
   body:options.body===undefined?undefined:JSON.stringify(options.body),signal:AbortSignal.timeout(20000)});
  }catch{current();throw new APIError(503,'We could not connect. Please try again.');}
  current();
  if(!response.ok)throw new APIError(response.status,response.status===401?'Your session has ended. Please sign in again.':
   response.status===403||response.status===404?'This record is no longer available to your account.':
   response.status===409&&options.pdf?'This report is not available as an English PDF yet. You can still view the approved result.':
   response.status===409?'Your writing context may have changed. Refresh the assessment, then try again.':
   response.status===429?'Please wait a moment before trying again.':'We could not complete this request. Please try again.');
  let data:unknown;try{data=options.pdf?await response.blob():await response.json();}catch{current();throw new APIError(502,'We could not read the response. Please refresh.');}
  current();return data as T;
 }
}
// Web Locks serialize refresh across same-origin tabs; the server first tries the
// current access cookie, so a queued tab does not rotate an already rotated token.
export async function authLock<T>(fn:()=>Promise<T>):Promise<T>{
 if(typeof navigator!=='undefined'&&navigator.locks)return navigator.locks.request('writing-portal-auth',fn);
 return fn();
}
export type Me={userId:string;role:string};
export type Option={programId:string;batchId:string;topicVersionId:string;title:string;language:string;programName:string;batchName:string;instructions:string;clues:string[]};
export type Row={assessmentId:string;studentId?:string;topicTitle?:string;topicVersionId?:string;programId?:string;batchId?:string;
 rewriteOfAssessmentId?:string|null;rewriteOfRevisionId?:string|null;status:string;effectiveRevisionId?:string|null;
 totalScore?:string|null;totalMarks?:string|null;reviewPending?:boolean};
export type Result={assessmentId:string;status:string;result:null|{revisionId:string;revisionNo:number;source:string;totalScore:string;totalMarks:string;factorResults:{factorId:string;criterionId:string;proposedScore:string;rationale?:string;evidence?:{exactQuote:string;claim:string}[]}[]}};
export type Learning={assessmentId:string;assessmentStatus:string;effectiveRevisionId:string|null;
 projections:{target:string;availability:'CURRENT'|'STALE'|'UNAVAILABLE'}[];
 learning:{feedback:null|{schemaVersion:string;revisionId:string;disclaimer:string;factors:{factorId:string;name:string;score:string;maxScore:string;criterionDescription:string;rationale:string;evidence:{exactQuote:string;claim:string}[]}[]};
  practice:null|{schemaVersion:string;revisionId:string;disclaimer:string;targets:{factorId:string;factorName:string;missedPoints:string;objective:string;selectedCriterion:string;originalEvidence:{exactQuote:string;claim:string}[]}[]};
  progress:null|{schemaVersion:string;revisionId:string;status:string;comparableCount:number;scoreDelta:string|null;disclaimer:string;displayedPoints:{assessmentId:string;score:string;totalMarks:string;createdAt:string}[]}}};
export type Cohort={id:string;name:string;programName:string};
export type ReviewCase={caseId:string;assessmentId:string;batchId:string;topicTitle:string;status:string;kind:string;createdAt:string};
export type ReviewCaseDetail={caseId:string;assessmentId:string;kind:string;status:string;openedAt:string;reason?:string;
 priorRevisionId:string|null;effectiveRevisionId:string|null;topic:{title:string;instructions:string;clues:string[]};
 rubric:{factors:{id:string;criteria:{id:string;score:string;description:string}[]}[]};
 verifiedText:{language:string;content:string;contentHash:string};
 effectiveScore:null|{totalScore:string;totalMarks:string;factorResults:{factorId:string;criterionId:string;proposedScore:string;rationale:string;evidence:{startOffset:number;endOffset:number;exactQuote:string;claim:string}[]}[]};
 proposal?:null|{id:string;proposedById:string;createdAt:string;reason:string;factorResults:{factorId:string;criterionId:string;proposedScore:string;rationale:string;evidence:{startOffset:number;endOffset:number;exactQuote:string;claim:string}[]}[];totalScore:string;totalMarks:string}};

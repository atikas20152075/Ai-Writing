/** Presentation-only filter. The submission service rechecks all permissions transactionally. */
export interface WritingOptionRow {
 programId:string; programName:string; batchId:string; batchName:string;
 topicVersionId:string; title:string; writingType:string; language:string;
 instructions:string; clues:unknown;
}
export function publicWritingOptions(rows:WritingOptionRow[]):WritingOptionRow[]{
 return rows.filter(x=>x.programId&&x.batchId&&x.topicVersionId&&
  ['BANGLA','ENGLISH'].includes(x.language)&&typeof x.title==='string'&&x.title.trim().length>0&&
  typeof x.instructions==='string'&&x.instructions.trim().length>0).slice(0,100).map(x=>({
   programId:x.programId,programName:x.programName,batchId:x.batchId,batchName:x.batchName,
   topicVersionId:x.topicVersionId,title:x.title,writingType:x.writingType,
   language:x.language,instructions:x.instructions,clues:x.clues
 }));
}

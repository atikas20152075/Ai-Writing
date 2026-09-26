/** Revision-aware truth: CURRENT requires a real stored and still-current version. */
export const projectionTargets=['FEEDBACK','PRACTICE','PROGRESS','TEACHER','PARENT','REPORT'] as const;
export type ProjectionTarget=typeof projectionTargets[number];
export type ProjectionAvailability='CURRENT'|'STALE'|'UNAVAILABLE';
export type ProjectionJobStatus='PENDING'|'PROCESSING'|'REBUILT'|'FAILED'|'BLOCKED'|'SUPERSEDED';
export interface ProjectionReceipt {target:string;scoreRevisionId:string;status:string}
export interface ProjectionStatus {target:ProjectionTarget;availability:ProjectionAvailability;jobStatus:string|null}
export type MaterializedVersions=Partial<Record<'FEEDBACK'|'PRACTICE'|'PROGRESS'|'TEACHER'|'REPORT',string|null>>;
export function decideProjectionWork(target:string,jobRevision:string,effectiveRevision:string|null,
  isFinalized:boolean):
  'SUPERSEDED'|'PUBLISH_PARENT'|'PUBLISH_FEEDBACK'|'PUBLISH_PRACTICE'|'PUBLISH_PROGRESS'|'PUBLISH_TEACHER'|'PUBLISH_REPORT'|'BLOCKED' {
  if(!isFinalized || effectiveRevision!==jobRevision)return 'SUPERSEDED';
  switch(target){
    case 'PARENT':return 'PUBLISH_PARENT';
    case 'FEEDBACK':return 'PUBLISH_FEEDBACK';
    case 'PRACTICE':return 'PUBLISH_PRACTICE';
    case 'PROGRESS':return 'PUBLISH_PROGRESS';
    case 'TEACHER':return 'PUBLISH_TEACHER';
    case 'REPORT':return 'PUBLISH_REPORT';
    default:return 'BLOCKED';
  }
}
/** Missing rows, blocked modules or superseded cohort versions never look CURRENT. */
export function projectionAvailability(effectiveRevision:string|null,
  receipts:ProjectionReceipt[],materializedParentRevision:string|null,
  materialized:MaterializedVersions={}):ProjectionStatus[]{
  return projectionTargets.map(target=>{
    const receipt=receipts.find(r=>r.target===target&&r.scoreRevisionId===effectiveRevision);
    if(!effectiveRevision)return {target,availability:'UNAVAILABLE',jobStatus:null};
    if(!receipt)return {target,availability:'STALE',jobStatus:null};
    if(target==='PARENT'&&receipt.status==='REBUILT'&&materializedParentRevision===effectiveRevision)
      return {target,availability:'CURRENT',jobStatus:'REBUILT'};
    if(target in materialized&&receipt.status==='REBUILT'&&
      materialized[target as keyof MaterializedVersions]===effectiveRevision)
      return {target,availability:'CURRENT',jobStatus:'REBUILT'};
    return {target,availability:receipt.status==='BLOCKED'?'UNAVAILABLE':'STALE',jobStatus:receipt.status};
  });
}

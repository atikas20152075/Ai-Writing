/** Deterministic Step90 availability. Only a genuinely materialized, current PARENT summary can be CURRENT. */
export const projectionTargets=['FEEDBACK','PRACTICE','PROGRESS','TEACHER','PARENT','REPORT'] as const;
export type ProjectionTarget=typeof projectionTargets[number];
export type ProjectionAvailability='CURRENT'|'STALE'|'UNAVAILABLE';
export type ProjectionJobStatus='PENDING'|'PROCESSING'|'REBUILT'|'FAILED'|'BLOCKED'|'SUPERSEDED';
export interface ProjectionReceipt {target:string;scoreRevisionId:string;status:string}
export interface ProjectionStatus {target:ProjectionTarget;availability:ProjectionAvailability;jobStatus:string|null}
export function decideProjectionWork(target:string,jobRevision:string,effectiveRevision:string|null,
  isFinalized:boolean):'SUPERSEDED'|'PUBLISH_PARENT'|'BLOCKED' {
  if(!isFinalized || effectiveRevision!==jobRevision)return 'SUPERSEDED';
  return target==='PARENT'?'PUBLISH_PARENT':'BLOCKED';
}
export function projectionAvailability(effectiveRevision:string|null,
  receipts:ProjectionReceipt[],materializedParentRevision:string|null):ProjectionStatus[]{
  return projectionTargets.map(target=>{
    const receipt=receipts.find(r=>r.target===target&&r.scoreRevisionId===effectiveRevision);
    if(!effectiveRevision)return {target,availability:'UNAVAILABLE',jobStatus:null};
    if(!receipt)return {target,availability:'STALE',jobStatus:null};
    if(target==='PARENT'&&receipt.status==='REBUILT'&&materializedParentRevision===effectiveRevision)
      return {target,availability:'CURRENT',jobStatus:'REBUILT'};
    return {target,availability:receipt.status==='BLOCKED'?'UNAVAILABLE':'STALE',jobStatus:receipt.status};
  });
}

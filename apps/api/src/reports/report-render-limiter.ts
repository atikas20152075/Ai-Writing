/** A single Chromium render at a time per API process. Render requests are
 * rejected immediately instead of waiting while holding a database transaction. */
export class ReportRenderBusyError extends Error {
 constructor(){super('REPORT_RENDER_BUSY');this.name='ReportRenderBusyError';}
}

export function createSingleFlightRunner<TArgs extends unknown[],TResult>(
 work:(...args:TArgs)=>Promise<TResult>,
){
 let active=false;
 return async(...args:TArgs):Promise<TResult>=>{
  if(active)throw new ReportRenderBusyError();
  active=true;
  try{return await work(...args);}
  finally{active=false;}
 };
}

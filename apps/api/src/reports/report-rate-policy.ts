/** Pseudonymous, per-actor report-export budget; never stores a raw child or account ID. */
import {createHmac} from 'node:crypto';
export const REPORT_EXPORT_BUDGET=12;
export const REPORT_EXPORT_WINDOW_SECONDS=600;
export function reportExportBucket(actorId:string,secret:string):string{
 if(!/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(actorId)||secret.length<48)
  throw new Error('Invalid report limiter identity or key');
 return createHmac('sha256',secret).update('report-export:v1:').update(actorId.toLowerCase()).digest('hex');
}

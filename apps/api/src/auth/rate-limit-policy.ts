/** Authentication abuse budgets shared by all API replicas via PostgreSQL.
 * Keys are HMAC pseudonyms: never store or log source IPs, credentials or emails.
 * Infrastructure edge protection is an additional requirement for DDoS and malformed traffic.
 */
import {createHmac} from 'node:crypto';

export type AuthAction = 'register' | 'login' | 'refresh';
export interface AuthRateTarget { bucketKey:string; limit:number; windowSeconds:number; }
export const AUTH_RATE_RULES = Object.freeze({
  register: Object.freeze({ip: Object.freeze({limit:8,windowSeconds:3600}),identity: Object.freeze({limit:3,windowSeconds:3600})}),
  login: Object.freeze({ip: Object.freeze({limit:60,windowSeconds:600}),identity: Object.freeze({limit:12,windowSeconds:600})}),
  refresh: Object.freeze({ip: Object.freeze({limit:120,windowSeconds:600})})
});

function hmac(key:string, value:string):string {
  if(key.length<48) throw new Error('AUTH_ABUSE_KEY must be >= 48 characters');
  return createHmac('sha256',key).update(value).digest('hex');
}
export function buildAuthRateTargets(action:AuthAction, ip:string, secret:string, email?:string):AuthRateTarget[] {
  // Use req.ip supplied by the *server* (never a client-provided X-Forwarded-For header).
  const address=ip.trim();
  if(!address || address.length>128) throw new Error('A valid server-observed request IP is required');
  const rule=AUTH_RATE_RULES[action];
  const targets:AuthRateTarget[]=[{bucketKey:hmac(secret,`auth-v1:${action}:ip:${address}`),...rule.ip}];
  if(action!=='refresh') {
    if(!email || !email.trim()) throw new Error('Validated email required for auth limit');
    const id=email.trim().toLowerCase();
    targets.push({bucketKey:hmac(secret,`auth-v1:${action}:identity:${id}`),...AUTH_RATE_RULES[action].identity});
  }
  return targets;
}

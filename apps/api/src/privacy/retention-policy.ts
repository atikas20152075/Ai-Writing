/** Six calendar years from acceptance, preserving UTC time and clamping leap day. */
export function submissionExpiry(acceptedAt:Date):Date {
  if(!Number.isFinite(acceptedAt.getTime())) throw new RangeError('Valid acceptance date required');
  const expires=new Date(acceptedAt);
  const month=expires.getUTCMonth();
  const day=expires.getUTCDate();
  expires.setUTCFullYear(expires.getUTCFullYear()+6);
  if(expires.getUTCMonth()!==month) expires.setUTCDate(0);
  return expires;
}

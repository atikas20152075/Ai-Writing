import {gateway} from '../../../../lib/gateway';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=(request:Request)=>gateway(request);
export const POST=(request:Request)=>gateway(request);

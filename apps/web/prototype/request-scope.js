/** In-memory fences: a late response must not outlive its account or newer view. */
export class StaleRequestError extends Error {
 constructor(){super('Request superseded.');this.name='StaleRequestError';}
}
export class RequestScope {
 #epoch=0;
 #channels=new Map();
 invalidate(){this.#epoch++;this.#channels.clear();}
 capture(channel){
  const version=channel?(this.#channels.get(channel)??0)+1:0;
  if(channel)this.#channels.set(channel,version);
  const epoch=this.#epoch;
  return ()=>{
   if(epoch!==this.#epoch||(channel&&this.#channels.get(channel)!==version))throw new StaleRequestError();
  };
 }
}

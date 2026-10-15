export class BoundedRequestError extends Error {
  constructor(readonly code: 'invalid_body'|'body_too_large'|'body_timeout', readonly status: number) { super(code); }
}
export async function readBoundedJson(req: Request,maxBytes=131072,timeoutMs=5000): Promise<unknown> {
  return await readBoundedJsonBody(req.body,maxBytes,timeoutMs);
}
export async function readBoundedJsonBody(body:ReadableStream<Uint8Array>|null,maxBytes=131072,timeoutMs=5000):Promise<unknown> {
  if (!body) throw new BoundedRequestError('invalid_body',400);
  const reader=body.getReader(),chunks: Uint8Array[]=[];
  let length=0,timedOut=false;
  const timer=setTimeout(()=>{ timedOut=true;void reader.cancel().catch(()=>{}); },timeoutMs);
  try {
    while(true){
      const part=await reader.read();
      if(part.done)break;
      length+=part.value.byteLength;
      if(length>maxBytes){ await reader.cancel();throw new BoundedRequestError('body_too_large',413); }
      chunks.push(part.value);
    }
    if(timedOut)throw new BoundedRequestError('body_timeout',408);
  } finally { clearTimeout(timer);reader.releaseLock(); }
  const bytes=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){ bytes.set(chunk,offset);offset+=chunk.length; }
  try { const value: unknown=JSON.parse(new TextDecoder().decode(bytes));return value; }
  catch(_error: unknown){ throw new BoundedRequestError('invalid_body',400); }
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { handleLoyaltyCouponNotice } from '../functions/_shared/loyalty-coupon-notice.ts';

const id='27000000-0000-4000-8000-000000000001';
const config={url:'https://project.invalid',apiKey:'qa-provider',sender:'+522201465989'};
const saved={telefono:'0000000080',nombre:'QA',codigo:'CANJE-EST-QA',expires_at:'2026-10-19T12:00:00Z'};
function fixture(claim:unknown=saved,receipt=true) {
 const outcomes:unknown[]=[];
 const client=createClient(config.url,'qa-service',{auth:{persistSession:false,autoRefreshToken:false,storageKey:crypto.randomUUID()},global:{fetch:async(input,init) => {
  const request=new Request(input,init);
  if(request.url.endsWith('/rpc/claim_loyalty_redemption_notice'))return Response.json(claim);
  if(request.url.endsWith('/rpc/finish_loyalty_redemption_notice')) {outcomes.push(await request.json());return Response.json(receipt);}
  throw new Error('Unexpected route');
 }}});
 return {client,outcomes};
}
Deno.test('coupon notice uses the durable recipient and stores accepted without declaring delivery',async () => {
 const {client,outcomes}=fixture();let sends=0;
 const result=await handleLoyaltyCouponNotice({cliente_id:id,redemption_key:id,cliente_tel:'0000000081'},client,config,{},async(_input,init) => {
  sends++;const payload=JSON.parse(String(init?.body));assertEquals(payload.to,'+520000000080');assertEquals(payload.from,config.sender);
  return Response.json({id:'qa-provider-id',status:'accepted'});
 });
 assertEquals(sends,1);assertEquals(result.status,200);assertEquals((await result.json()).delivered,false);
 assertEquals(outcomes,[{p_customer:id,p_key:id,p_status:'accepted',p_provider_id:'qa-provider-id'}]);
});
Deno.test('a duplicated webhook cannot send the coupon again',async () => {
 const {client,outcomes}=fixture(null);
 const result=await handleLoyaltyCouponNotice({cliente_id:id,redemption_key:id},client,config,{},async () => {throw new Error('No provider send');});
 assertEquals((await result.json()).duplicate,true);assertEquals(outcomes,[]);
});
Deno.test('rejected and ambiguous provider outcomes remain distinct durable failures',async () => {
 for(const [response,status] of [[Response.json({error:{code:'TEMPLATE_REJECTED'}},{status:400}),'failed'],[Response.json({error:'unavailable'},{status:503}),'unknown'],[Response.json({status:'accepted'}),'unknown']] as const) {
  const {client,outcomes}=fixture();
  const result=await handleLoyaltyCouponNotice({cliente_id:id,redemption_key:id},client,config,{},async () => response.clone());
  assertEquals(result.status,502);assertEquals(outcomes,[{p_customer:id,p_key:id,p_status:status,p_provider_id:null}]);
 }
});
Deno.test('a lost provider response is never automatically retried',async () => {
 const {client,outcomes}=fixture();let sends=0;
 const result=await handleLoyaltyCouponNotice({cliente_id:id,redemption_key:id},client,config,{},async () => {sends++;throw new DOMException('timeout','TimeoutError');});
 assertEquals(result.status,503);assertEquals(sends,1);assertEquals(outcomes,[{p_customer:id,p_key:id,p_status:'unknown',p_provider_id:null}]);
});
Deno.test('receipt failure after provider acceptance does not trigger a second send',async () => {
 const {client,outcomes}=fixture(saved,false);let sends=0;
 const result=await handleLoyaltyCouponNotice({cliente_id:id,redemption_key:id},client,config,{},async () => {sends++;return Response.json({id:'qa-provider-id',status:'sent'});});
 assertEquals(result.status,503);assertEquals(sends,1);assertEquals(outcomes.length,1);
});

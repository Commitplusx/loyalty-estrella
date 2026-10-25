import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.45.6';
import {SupabaseDispatchGateway} from '../functions/_shared/driver-dispatch-gateway.ts';
import {object,type DispatchOrder} from '../functions/_shared/driver-dispatch.ts';
const id='00000000-0000-4000-8000-000000000001',driver='00000000-0000-4000-8000-000000000002';
const order:DispatchOrder={id,state:'buscando_repartidor',owner:null,token:null,expiresAt:null,rejected:[driver],restaurantId:null,pickupLat:16.24,pickupLng:-92.13,deliveryLat:16.25,deliveryLng:-92.12};
function equal(a:unknown,b:unknown):void {if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('Dispatch gateway contract mismatch');}
function gateway(transport:typeof fetch):SupabaseDispatchGateway {
 return new SupabaseDispatchGateway(createClient('https://fixture.invalid','fixture-key',{global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false}}));
}
Deno.test('server ranking receives the exact durable rejection list before limiting candidates',async()=>{
 const requests:Record<string,unknown>[]=[];
 const g=gateway(async(url,init)=>{equal(new URL(String(url)).pathname,'/rest/v1/rpc/buscar_repartidores_cercanos');
  const raw:unknown=JSON.parse(String(init?.body));requests.push(object(raw));return Response.json([{user_id:id,score:12}]);});
 equal(await g.candidates(order),[{id,score:12}]);
 equal(requests,[{p_lat:16.24,p_lng:-92.13,p_radio_metros:5000,p_cliente_lat:16.25,p_cliente_lng:-92.12,p_excluidos:[driver]}]);
});
Deno.test('no-origin fallback uses the same atomic eligibility query rather than a second driver list',async()=>{
 for(const pickup of [{pickupLat:null,pickupLng:null},{pickupLat:16,pickupLng:null}]) {
  let calls=0;
  const g=gateway(async(url,init)=>{calls++;equal(new URL(String(url)).pathname,'/rest/v1/rpc/buscar_repartidores_cercanos');
   const raw=object(JSON.parse(String(init?.body)));equal(raw.p_lat,null);equal(raw.p_lng,null);equal(raw.p_excluidos,[driver]);return Response.json([]);});
  equal(await g.candidates({...order,...pickup}),[]);equal(calls,1);
 }
});
Deno.test('a missing origin is looked up by the order restaurant ID before the same scoped ranking',async()=>{
 const requests:string[]=[];
 const g=gateway(async(url,init)=>{const request=new URL(String(url));requests.push(request.pathname);
  if(request.pathname.endsWith('/restaurantes')){equal(request.searchParams.get('id'),'eq.'+id);return Response.json({lat:16.26,lng:-92.14});}
  const raw=object(JSON.parse(String(init?.body)));equal(raw.p_lat,16.26);equal(raw.p_lng,-92.14);equal(raw.p_excluidos,[driver]);return Response.json([]);});
 await g.candidates({...order,pickupLat:null,pickupLng:null,restaurantId:id});
 equal(requests,['/rest/v1/restaurantes','/rest/v1/rpc/buscar_repartidores_cercanos']);
});
Deno.test('malformed scores and storage failures never turn into a fabricated candidate list',async()=>{
 for(const response of [()=>Response.json([{user_id:id,score:'0'}]),()=>Response.json({error:'bad'}),()=>Response.json({message:'unavailable'},{status:503})]) {
  let rejected=false;
  try {await gateway(async()=>response()).candidates(order);}catch(error:unknown){if(!(error instanceof Error))throw error;rejected=true;}
  equal(rejected,true);
 }
});

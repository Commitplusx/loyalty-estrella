import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {OrderNotificationGateway,handleOrderProviderEvent} from '../functions/_shared/eats-order-notification-gateway.ts';
import {EATS_SENDER,EATS_WABA,RESTAURANT_TIMED_TEMPLATE,object} from '../functions/_shared/eats-order-notifications.ts';
import type {OrderNotificationDatabase} from '../functions/_shared/eats-notification-database.ts';
const orderId='00000000-0000-4000-8000-000000000004',restaurantId='00000000-0000-4000-8000-000000000003';
function equal(actual:unknown,expected:unknown):void{if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Gateway contract mismatch');}
const database=(transport:typeof fetch)=>createClient<OrderNotificationDatabase>('https://fixture.invalid','fixture-not-a-secret',{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport},
});
const approved=():Record<string,unknown>=>({name:RESTAURANT_TIMED_TEMPLATE,language:'es_MX',category:'UTILITY',status:'APPROVED',
 components:[{type:'BODY',text:'Pedido {{1}}, detalle {{2}}, total {{3}}, pago {{4}}.'},{type:'BUTTONS',buttons:[15,30,45].map(n=>({type:'QUICK_REPLY',text:n+' minutos'}))}]});
const persisted={items:[{cantidad:1,item:{precio:125}}],total:165,precio_entrega:40,descuento_plataforma:0,tipo_pedido:'domicilio',metodo_pago:'efectivo',estado_pago:'pendiente'};
Deno.test('billing query is bounded to the exact web order and restaurant, not a phone-wide customer read',async()=>{
 const urls:URL[]=[];
 const transport:typeof fetch=(input)=>{urls.push(new URL(String(input)));return Promise.resolve(new Response(JSON.stringify(persisted),{headers:{'Content-Type':'application/json'}}));};
 const gateway=new OrderNotificationGateway(database(transport),'test','relay');
 const result=await gateway.restaurantBilling({id:orderId,leaseToken:orderId,kind:'restaurant_new',recipient:'+529630000001',snapshot:{id:orderId,restaurant_id:restaurantId}});
 equal(result.amount,'$125.00 MXN');equal(urls.length,1);equal(urls[0].searchParams.get('id'),'eq.'+orderId);
 equal(urls[0].searchParams.get('restaurante_id'),'eq.'+restaurantId);equal(urls[0].searchParams.get('origen'),'eq.web');
 equal(urls[0].searchParams.get('select')?.includes('cliente'),false);
});
Deno.test('missing restaurant identity and missing DB row fail before an amount is emitted',async()=>{
 for (const snapshot of [{id:orderId},{id:'invalid',restaurant_id:restaurantId},{id:orderId,restaurant_id:restaurantId}]) {
  const transport:typeof fetch=()=>Promise.resolve(new Response('null',{headers:{'Content-Type':'application/json'}}));
  const gateway=new OrderNotificationGateway(database(transport),'test','relay');let failed=false;
  try{await gateway.restaurantBilling({id:orderId,leaseToken:orderId,kind:'restaurant_new',recipient:'+529630000001',snapshot});}catch{failed=true;}equal(failed,true);
 }
});
Deno.test('v2 approval requires correct WABA endpoint, utility, language, body order and all three buttons',async()=>{
 const urls:string[]=[];const transport:typeof fetch=input=>{urls.push(String(input));return Promise.resolve(new Response(JSON.stringify(approved())));};
 const gateway=new OrderNotificationGateway(database(transport),'test','relay',transport);
 equal(await gateway.template(RESTAURANT_TIMED_TEMPLATE),'APPROVED');equal(urls,['https://api.ycloud.com/v2/whatsapp/templates/'+EATS_WABA+'/'+RESTAURANT_TIMED_TEMPLATE+'/es_MX']);
 for (const change of [
  {category:'MARKETING'},{language:'es'},{name:'other'},{components:[{type:'BODY',text:'{{1}} {{2}} {{4}} {{3}}'}]},
  {components:[{type:'BODY',text:'{{1}} {{2}} {{3}} {{4}}'},{type:'BUTTONS',buttons:[{type:'QUICK_REPLY',text:'Aceptar'}]}]},
 ]) {
  const invalid:typeof fetch=()=>Promise.resolve(new Response(JSON.stringify({...approved(),...change})));
  equal(await new OrderNotificationGateway(database(invalid),'test','relay',invalid).template(RESTAURANT_TIMED_TEMPLATE),'FAILED');
 }
});
Deno.test('pending or absent template remains distinguishable; provider errors never turn into approval',async()=>{
 for (const [status,payload,expected] of [[200,{...approved(),status:'PENDING'},'PENDING'],[404,{},'FAILED'],[200,{...approved(),status:'REJECTED'},'FAILED']] as const) {
  const transport:typeof fetch=()=>Promise.resolve(new Response(JSON.stringify(payload),{status}));
  equal(await new OrderNotificationGateway(database(transport),'test','relay',transport).template(RESTAURANT_TIMED_TEMPLATE),expected);
 }
 const failed:typeof fetch=()=>Promise.resolve(new Response('{}',{status:503}));let rejected=false;
 try{await new OrderNotificationGateway(database(failed),'test','relay',failed).template(RESTAURANT_TIMED_TEMPLATE);}catch{rejected=true;}equal(rejected,true);
});
Deno.test('all three time payloads reach the existing atomic kitchen RPC with exact order, sender and event',async()=>{
 for(const minutes of [15,30,45]) {
  const calls:Record<string,unknown>[]=[];
  const transport:typeof fetch=(url,options)=>{equal(String(url),'https://fixture.invalid/rest/v1/rpc/eats_kitchen_action');const raw:unknown=JSON.parse(String(options?.body));calls.push(object(raw));
   return Promise.resolve(new Response(JSON.stringify({handled:true}),{headers:{'Content-Type':'application/json'}}));};
  const gateway=new OrderNotificationGateway(database(transport),'test','relay');
  equal(await handleOrderProviderEvent({event:'kitchen',message:{to:EATS_SENDER,from:'+529630000001',id:'event-'+minutes,buttonId:'REST_TIME_'+minutes+'_'+orderId}},gateway),{handled:true});
  equal(calls,[{p_order_key:orderId,p_phone:'+529630000001',p_message_id:'event-'+minutes,p_action:'prepare',p_minutes:minutes}]);
 }
});
Deno.test('a wrong channel or unsupported time never touches a kitchen RPC',async()=>{
 let calls=0;const transport:typeof fetch=()=>{calls++;return Promise.resolve(new Response('{}'));};
 const gateway=new OrderNotificationGateway(database(transport),'test','relay');
 for(const message of [{to:'+529630000099',buttonId:'REST_TIME_15_'+orderId},{to:EATS_SENDER,buttonId:'REST_TIME_60_'+orderId}]) {
  let failed=false;try{await handleOrderProviderEvent({event:'kitchen',message:{from:'+529630000001',id:'event',...message}},gateway);}catch{failed=true;}equal(failed,true);
 } equal(calls,0);
});

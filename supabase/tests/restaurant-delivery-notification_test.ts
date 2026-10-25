import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {OrderNotificationGateway,usesOrderOutbox} from '../functions/_shared/eats-order-notification-gateway.ts';
import type {OrderNotificationDatabase} from '../functions/_shared/eats-notification-database.ts';
const order='00000000-0000-4000-8000-000000000004',restaurant='00000000-0000-4000-8000-000000000003';
function equal(a:unknown,b:unknown){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('Notification scope mismatch');}
function fixture(origin:string,receipt:boolean,status=200){
 const urls:URL[]=[];
 const transport:typeof fetch=input=>{
  const url=new URL(String(input));urls.push(url);
  const table=url.pathname.split('/').at(-1);
  let body:unknown=null;let code=200;
  if(table==='eats_notification_settings')body={enabled:true};
  else if(table==='pedidos')body={id:order,origen:origin,restaurante_id:restaurant};
  else if(table==='restaurantes')body={es_socio:true};
  else if(table==='eats_restaurant_delivery_requests'){body=receipt?{id:order}:null;code=status;}
  else throw new Error('Unexpected request');
  return Promise.resolve(new Response(JSON.stringify(body),{status:code,headers:{'Content-Type':'application/json'}}));
 };
 const client=createClient<OrderNotificationDatabase>('https://fixture.invalid','fixture-not-a-secret',{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport},
 });
 return {urls,gateway:new OrderNotificationGateway(client,'fixture','fixture')};
}
Deno.test('a genuine portal request suppresses duplicate manual notifications through the existing outbox',async()=>{
 const {urls,gateway}=fixture('portal_restaurante',true);
 equal(await usesOrderOutbox({tipo:'asignado',pedido_id:order},gateway),true);
 const receipt=urls.find(url=>url.pathname.endsWith('/eats_restaurant_delivery_requests'));
 equal(receipt?.searchParams.get('pedido_id'),'eq.'+order);
 equal(receipt?.searchParams.get('restaurante_id'),'eq.'+restaurant);
 equal(receipt?.searchParams.get('select'),'id');
});
Deno.test('a forged portal origin or another origin is not treated as a portal receipt',async()=>{
 for(const origin of['portal_restaurante','other']){
  const {gateway}=fixture(origin,false);
  equal(await usesOrderOutbox({tipo:'en_camino',pedido_id:order},gateway),false);
 }
});
Deno.test('scope lookup failure is explicit rather than falling through to a duplicate legacy send',async()=>{
 const {gateway}=fixture('portal_restaurante',false,503);let failed=false;
 try{await usesOrderOutbox({tipo:'asignado',pedido_id:order},gateway);}catch{failed=true;}
 equal(failed,true);
});
Deno.test('existing web notices and the durable outbox runner keep their current route',async()=>{
 const {gateway,urls}=fixture('web',false);
 equal(await usesOrderOutbox({tipo:'asignado',pedido_id:order},gateway),true);
 equal(urls.some(url=>url.pathname.endsWith('/eats_restaurant_delivery_requests')),false);
 equal(await usesOrderOutbox({tipo:'process_order_outbox'},gateway),true);
});

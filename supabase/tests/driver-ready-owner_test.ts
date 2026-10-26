import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {OrderNotificationGateway} from '../functions/_shared/eats-order-notification-gateway.ts';
import {processOrderOutbox} from '../functions/_shared/eats-order-notifications.ts';
import type {OrderNotificationDatabase} from '../functions/_shared/eats-notification-database.ts';
import type {Notice,NotificationJobs} from '../functions/_shared/eats-order-notifications.ts';
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const notice:Notice={id:id(4),leaseToken:id(5),kind:'driver_ready',recipient:'+525550000000',
 snapshot:{id:id(1),driver_id:id(2),folio:'QA',customer:'Repartidor sintético',restaurant:'Sucursal sintética'}};
Deno.test('ready notices require the current assigned owner, valid kitchen stage and driver identity',async()=>{
 for(const [owner,driver,state,kitchen,expected] of [
  [id(2),id(2),'asignado','listo_para_recoger',true],
  [id(2),id(2),'recibido','listo_para_recoger',true],
  [id(3),id(2),'asignado','listo_para_recoger',false],
  [null,id(2),'buscando_repartidor','listo_para_recoger',false],
  [id(2),undefined,'asignado','listo_para_recoger',false],
  [id(2),id(2),'en_camino','listo_para_recoger',false],
  [id(2),id(2),'asignado','en_cocina',false],
 ] as const){
  const transport:typeof fetch=input=>{
   if(new URL(String(input)).pathname!=='/rest/v1/pedidos')throw new Error('Unexpected provider request');
   return Promise.resolve(Response.json({estado:state,estado_cocina:kitchen,repartidor_id:owner}));
  };
  const client=createClient<OrderNotificationDatabase>('https://fixture.invalid','fixture-not-a-secret',{
   auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport},
  });
  const actual=await new OrderNotificationGateway(client,'fixture','fixture',transport).current({...notice,snapshot:{...notice.snapshot,driver_id:driver}});
  if(actual!==expected)throw new Error('Ready notice owner/stage contract mismatch');
 }
});
Deno.test('reassignment during window lookup prevents starting or sending the old ready notice',async()=>{
 let reads=0,claims=0,starts=0,sends=0;const finished:string[]=[];
 const jobs:NotificationJobs={
  claim:()=>Promise.resolve(claims++===0?{id:notice.id,lease_token:notice.leaseToken,kind:notice.kind,recipient:notice.recipient,snapshot:notice.snapshot}:null),
  current:()=>Promise.resolve(++reads===1),
  window:()=>Promise.resolve(true),
  start:()=>{starts++;return Promise.resolve(true);},
  finish:(_notice,state)=>{finished.push(state);return Promise.resolve();},
  driver:()=>Promise.reject(new Error('Unexpected driver-name read')),
  trackingToken:()=>Promise.reject(new Error('Unexpected customer access read')),
  restaurantBilling:()=>Promise.reject(new Error('Unexpected restaurant bill')),
  template:()=>Promise.reject(new Error('Unexpected template read')),
 };
 const transport:typeof fetch=()=>{sends++;return Promise.resolve(Response.json({id:'provider-fixture',status:'accepted'}));};
 await processOrderOutbox(jobs,'fixture',transport);
 if(reads!==2||starts!==0||sends!==0||finished.join(',')!=='superseded')throw new Error('A stale ready recipient reached provider transmission');
});

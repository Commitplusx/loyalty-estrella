import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {OrderNotificationGateway} from '../functions/_shared/eats-order-notification-gateway.ts';
import type {OrderNotificationDatabase} from '../functions/_shared/eats-notification-database.ts';
import type {Notice} from '../functions/_shared/eats-order-notifications.ts';
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
Deno.test('only persisted web checkout allows customer notices; manual requests retain driver-ready notices',async()=>{
 for(const origin of ['web','portal_restaurante',null]){
  for(const kind of ['asignado','preparing','en_camino','entregado','cancelado','pickup_ready','driver_ready']){
   const state=kind==='preparing'?'buscando_repartidor':kind==='driver_ready'||kind==='pickup_ready'?'asignado':kind;
   const kitchen=kind==='preparing'?'en_cocina':'listo_para_recoger';
   const transport:typeof fetch=()=>Promise.resolve(Response.json({estado:state,estado_cocina:kitchen,repartidor_id:id(2),origen:origin}));
   const client=createClient<OrderNotificationDatabase>('https://fixture.invalid','fixture',{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport},
   });
   const notice:Notice={id:id(3),leaseToken:id(4),kind,recipient:'+525550000000',snapshot:{id:id(1),driver_id:id(2)}};
   const actual=await new OrderNotificationGateway(client,'fixture','fixture',transport).current(notice);
   if(actual!==(kind==='driver_ready'||origin==='web'))throw new Error('Customer origin policy mismatch: '+kind);
  }
 }
});

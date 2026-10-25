import {planMessage,notice,sendNotice,processOrderOutbox,RESTAURANT_TIMED_TEMPLATE,object} from '../functions/_shared/eats-order-notifications.ts';
import type {Notice,NotificationJobs} from '../functions/_shared/eats-order-notifications.ts';
import {RestaurantBillingError,type RestaurantFoodBilling} from '../functions/_shared/restaurant-food-billing.ts';
function equal(actual:unknown,expected:unknown):void{if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Notification contract mismatch');}
const id='00000000-0000-4000-8000-000000000004';
const billing:RestaurantFoodBilling={amount:'$125.00 MXN',payment:'Efectivo · sólo comida, sin envío'};
const row=(kind='asignado',recipient='9630000002'):Record<string,unknown>=>({id,lease_token:id,kind,recipient,
 snapshot:{id,folio:'TEST',customer:'Cliente de prueba',restaurant:"Pollo Robin's",driver_id:id,description:'Pollo + alitas',payment:'efectivo',minutes:15,last_part:true}});
class Jobs implements NotificationJobs {
 rows:unknown[]=[];results:{state:string;code:string|null}[]=[];open=false;active=true;starts=0;
 approvals:Record<string,'APPROVED'|'PENDING'|'FAILED'>={eats_repartidor_asignado_v1:'APPROVED',eats_estado_pedido_v1:'APPROVED',pedido_nuevo_restaurante:'APPROVED',eats_pedido_restaurante_v2:'APPROVED'};
 claim():Promise<unknown>{return Promise.resolve(this.rows.shift()??null);}
 start(_n:Notice):Promise<boolean>{this.starts++;return Promise.resolve(true);}
 finish(_n:Notice,state:string,_id:string|null,code:string|null):Promise<void>{this.results.push({state,code});return Promise.resolve();}
 current(_n:Notice):Promise<boolean>{return Promise.resolve(this.active);}
 driver(_id:string):Promise<string>{return Promise.resolve('Repartidor de prueba');}
 trackingToken(_id:string):Promise<string>{return Promise.resolve(id);}
 window(_recipient:string):Promise<boolean>{return Promise.resolve(this.open);}
 restaurantBilling(_notice:Notice):Promise<RestaurantFoodBilling>{return Promise.resolve(billing);}
 template(name:string):Promise<'APPROVED'|'PENDING'|'FAILED'>{return Promise.resolve(this.approvals[name]??'FAILED');}
}
Deno.test('outside-window client message is informative, with exact roles and direct tracking URL',()=>{
 const plan=planMessage(notice(row()),false,'Repartidor de prueba',id);const wire=JSON.stringify(plan);
 equal(wire.includes('eats_repartidor_asignado_v1'),true);equal(wire.includes('Cliente de prueba'),true);equal(wire.includes('Repartidor de prueba'),true);
 equal(wire.includes('quick_reply'),false);equal(wire.includes('es_MX'),true);equal(wire.includes('Aceptar'),false);
});
Deno.test('restaurant outside-window template uses approved language and order-specific buttons',()=>{
 const wire=JSON.stringify(planMessage(notice(row('restaurant_new')),false,'Repartidor',null,{billing,timed:false}));
 equal(wire.includes('pedido_nuevo_restaurante'),true);equal(wire.includes('"code":"es_MX"'),true);
 equal(wire.includes('REST_ORDER_PREPARE_'+id),true);equal(wire.includes('REST_ORDER_REJECT_'+id),true);
});
Deno.test('inside-window assigned message uses one direct tracker button, without another acceptance',()=>{
 const wire=JSON.stringify(planMessage(notice(row()),true,'Repartidor de prueba',id));
 equal(wire.includes('cta_url'),true);equal(wire.includes('tracker?pedido='+id),true);equal(wire.includes('quick_reply'),false);
});
Deno.test('receipt keeps the recipe and ready button together; expired window fails explicitly',()=>{
 const wire=JSON.stringify(planMessage(notice(row('restaurant_receipt')),true));equal(wire.includes('Pollo + alitas'),true);equal(wire.includes('REST_ORDER_READY_'+id),true);
 let threw=false;try{planMessage(notice(row('restaurant_receipt')),false);}catch{threw=true;}equal(threw,true);
});
Deno.test('timeout or HTTP 500 never falls back to a second send or claims delivered',async()=>{
 for(const failure of ['timeout','http500','invalidSuccess']){
  let calls=0;const transport:typeof fetch=()=>{calls++;if(failure==='timeout')return Promise.reject(new DOMException('Timeout','TimeoutError'));
   return Promise.resolve(new Response(JSON.stringify(failure==='http500'?{error:{code:'error'}}:{status:'accepted'}),{status:failure==='http500'?500:200}));};
  const result=await sendNotice(notice(row()),planMessage(notice(row()),true,'Prueba',id),'test',transport);
  equal(result.state,'uncertain');equal(calls,1);
 }
});
Deno.test('provider rejection is observable; only rate-limit rejection is eligible for a bounded retry',async()=>{
 for(const status of [400,401,404,429]){
  const transport:typeof fetch=()=>Promise.resolve(new Response('{}',{status}));
  equal((await sendNotice(notice(row()),planMessage(notice(row()),true,'Prueba',id),'test',transport)).state,status===429?'queued':'failed');
 }
});
Deno.test('pending or rejected template never sends; approval holds without spending an attempt',async()=>{
 for(const approval of ['PENDING','FAILED'] as const){const jobs=new Jobs();jobs.approvals.eats_repartidor_asignado_v1=approval;jobs.rows=[row()];let calls=0;
  const transport:typeof fetch=()=>{calls++;return Promise.resolve(new Response('{}'));};
  await processOrderOutbox(jobs,'test',transport);equal(calls,0);equal(jobs.starts,0);equal(jobs.results[0].state,approval==='PENDING'?'template_pending':'failed');
 }
});
Deno.test('stale status is superseded and invalid recipients fail without contacting anyone',async()=>{
 let calls=0;const transport:typeof fetch=()=>{calls++;return Promise.resolve(new Response('{}'));};
 const jobs=new Jobs();jobs.active=false;jobs.rows=[row()];await processOrderOutbox(jobs,'test',transport);equal(jobs.results[0].state,'superseded');
 const invalid=new Jobs();invalid.rows=[row('asignado','not-a-phone')];await processOrderOutbox(invalid,'test',transport);equal(invalid.results[0].state,'failed');equal(calls,0);
});
Deno.test('batch sends at most two messages and accepted is distinct from delivered',async()=>{
 const jobs=new Jobs();jobs.rows=[row(),row(),row()];let calls=0;
 const transport:typeof fetch=()=>{calls++;return Promise.resolve(new Response(JSON.stringify({id:'provider-'+calls,status:'accepted'})));};
 equal(await processOrderOutbox(jobs,'test',transport),2);equal(calls,2);equal(jobs.rows.length,1);equal(jobs.results.map(r=>r.state),['accepted','accepted']);
});
Deno.test('customer links use a separate capability in fragment for both template and open-window CTA',()=>{
 const token='00000000-0000-4000-8000-000000000099';
 for(const kind of ['asignado','preparing','en_camino','entregado','cancelado','pickup_ready']){
  for(const open of [true,false]){
   const wire=JSON.stringify(planMessage(notice(row(kind)),open,'Repartidor',token));
   equal(wire.includes(id+'#clave='+token),true);equal(wire.includes('?clave='),false);
  }
 }
});
Deno.test('driver ready notices never disclose the customer capability',()=>{
 const token='00000000-0000-4000-8000-000000000099';
 for(const open of [true,false]){
  const plan=planMessage(notice(row('driver_ready')),open,'Repartidor',token),wire=JSON.stringify(plan);
  equal(wire.includes(token),false);equal(wire.includes('#clave='),false);equal(plan.type,open?'text':'template');
 }
});
Deno.test('missing customer access prevents provider send without claiming a false successful receipt',async()=>{
 const jobs=new Jobs();jobs.rows=[row()];jobs.trackingToken=()=>Promise.reject(new Error('unavailable'));let calls=0;
 await processOrderOutbox(jobs,'test',()=>{calls++;return Promise.resolve(new Response('{}'));});
 equal(calls,0);equal(jobs.starts,0);equal(jobs.results.length,0);
 let rejected=false;try{planMessage(notice(row()),true);}catch{rejected=true;}equal(rejected,true);
});
Deno.test('v2 binds four body parameters and three times to the exact order without exposing tracking access',()=>{
 const plan=planMessage(notice(row('restaurant_new')),false,'Repartidor',null,{billing,timed:true});
 const contract=object(plan.template);
 equal(contract.name,RESTAURANT_TIMED_TEMPLATE);equal(object(contract.language).code,'es_MX');
 if (!Array.isArray(contract.components)) throw new Error('Missing components');
 const components=contract.components.map(object);
 const parameters=(component:Record<string,unknown>):Record<string,unknown>[]=>{
   if (!Array.isArray(component.parameters)) throw new Error('Missing parameters');return component.parameters.map(object);
 };
 equal(parameters(components[0]).map(p=>p.text),['TEST',"Pollo Robin's. Pollo + alitas",'$125.00 MXN',billing.payment]);
 equal(components.slice(1).map(c=>[c.index,parameters(c)[0].payload]),[
  ['0','REST_TIME_15_'+id],['1','REST_TIME_30_'+id],['2','REST_TIME_45_'+id]]);
 equal(JSON.stringify(plan).includes('#clave='),false);
});
Deno.test('long restaurant recipes are explicitly redirected to full detail instead of exceeding a template',()=>{
 const value=row('restaurant_new'); value.snapshot={id,folio:'TEST',customer:'Cliente',restaurant:'Restaurante',description:'x'.repeat(1600)};
 const wire=JSON.stringify(planMessage(notice(value),false,'Repartidor',null,{billing,timed:true}));
 equal(wire.includes('detalle completo'),true);equal(wire.includes('x'.repeat(501)),false);equal(wire.includes('REST_TIME_15_'+id),true);
});
Deno.test('pending, unavailable and rejected v2 use the approved legacy message exactly once',async()=>{
 for (const approval of ['PENDING','FAILED'] as const) {
  const jobs=new Jobs();jobs.rows=[row('restaurant_new')];jobs.approvals[RESTAURANT_TIMED_TEMPLATE]=approval;
  const sent:Record<string,unknown>[]=[];
  const transport:typeof fetch=(_url,options)=>{const parsed:unknown=JSON.parse(String(options?.body));sent.push(object(parsed));return Promise.resolve(new Response(JSON.stringify({id:'one',status:'accepted'})));};
  await processOrderOutbox(jobs,'test',transport);
  equal(sent.length,1);equal(JSON.stringify(sent[0]).includes('pedido_nuevo_restaurante'),true);equal(JSON.stringify(sent[0]).includes('REST_TIME_15_'),false);
 }
});
Deno.test('approval switches the next eligible order to v2 without replaying any previous message',async()=>{
 const jobs=new Jobs();jobs.rows=[row('restaurant_new')];const sent:string[]=[];
 const transport:typeof fetch=(_url,options)=>{sent.push(String(options?.body));return Promise.resolve(new Response(JSON.stringify({id:'one',status:'accepted'})));};
 await processOrderOutbox(jobs,'test',transport);equal(sent.length,1);equal(sent[0].includes(RESTAURANT_TIMED_TEMPLATE),true);equal(jobs.results[0].state,'accepted');
});
Deno.test('when neither template is approved the outbox waits without consuming a send attempt',async()=>{
 const jobs=new Jobs();jobs.rows=[row('restaurant_new')];jobs.approvals[RESTAURANT_TIMED_TEMPLATE]='PENDING';jobs.approvals.pedido_nuevo_restaurante='PENDING';let sends=0;
 await processOrderOutbox(jobs,'test',()=>{sends++;return Promise.resolve(new Response('{}'));});
 equal(sends,0);equal(jobs.starts,0);equal(jobs.results[0].state,'template_pending');
});
Deno.test('an approval lookup failure never guesses approval or emits another provider request',async()=>{
 const jobs=new Jobs();jobs.rows=[row('restaurant_new')];jobs.template=()=>Promise.reject(new Error('provider unavailable'));let sends=0;
 await processOrderOutbox(jobs,'test',()=>{sends++;return Promise.resolve(new Response('{}'));});
 equal(sends,0);equal(jobs.starts,0);equal(jobs.results.length,0);
});
Deno.test('an accepted order during template preflight is superseded before sending',async()=>{
 const jobs=new Jobs();jobs.rows=[row('restaurant_new')];let checks=0,sends=0;jobs.current=()=>Promise.resolve(++checks===1);
 await processOrderOutbox(jobs,'test',()=>{sends++;return Promise.resolve(new Response('{}'));});
 equal(sends,0);equal(jobs.starts,0);equal(jobs.results[0].state,'superseded');
});
Deno.test('open restaurant window retains acceptance and rejection without querying a paid template',async()=>{
 const jobs=new Jobs();jobs.rows=[row('restaurant_new')];jobs.open=true;jobs.template=()=>Promise.reject(new Error('must not query'));const sent:string[]=[];
 await processOrderOutbox(jobs,'test',(_url,options)=>{sent.push(String(options?.body));return Promise.resolve(new Response(JSON.stringify({id:'one',status:'accepted'})));});
 equal(sent.length,1);equal(sent[0].includes('REST_ORDER_PREPARE_'+id),true);equal(sent[0].includes('REST_ORDER_REJECT_'+id),true);equal(sent[0].includes('$125.00 MXN'),true);
});
Deno.test('inconsistent billing is recorded explicitly without spending provider attempts or retrying bad amounts',async()=>{
 const jobs=new Jobs();jobs.rows=[row('restaurant_new')];jobs.restaurantBilling=()=>Promise.reject(new RestaurantBillingError('restaurant_amounts_inconsistent'));let sends=0;
 await processOrderOutbox(jobs,'test',()=>{sends++;return Promise.resolve(new Response('{}'));});
 equal(sends,0);equal(jobs.starts,0);equal(jobs.results,[{state:'failed',code:'restaurant_amounts_inconsistent'}]);
});

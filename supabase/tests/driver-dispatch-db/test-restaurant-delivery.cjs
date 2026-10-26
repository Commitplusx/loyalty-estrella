const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'../../..');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const matrix=id(1),branch=id(2),other=id(3),owner=id(11),operator=id(12),foreign=id(13),request=id(200),quote=id(100);
const destination={lat:16.25,lng:-92.13,address:'Calle de prueba, número 12'};
const input={quoteId:quote,name:'Cliente de prueba',phone:'0000000000',description:'PRUEBA AISLADA — NO PREPARAR',references:'Puerta de prueba',preparationMinutes:15};
let isolatedDb;
(async()=>{
 const db=new PGlite();isolatedDb=db;let passed=0;
 await db.exec(fs.readFileSync(path.join(root,'supabase/tests/fixtures/eats-restaurant-delivery-schema.sql'),'utf8'));
 const baseline=fs.readFileSync(path.join(root,'supabase/migrations/20261006000001_driver_dispatch_reliability.sql'),'utf8');
 const admission=baseline.match(/CREATE OR REPLACE FUNCTION public\.pedido_admite_repartidor[\s\S]*?\$\$;/);
 if(!admission)throw new Error('Reviewed admission missing');await db.exec(admission[0]);
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261025202620_eats_restaurant_delivery_requests.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261026144246_eats_restaurant_delivery_location_modes.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261026165038_eats_portal_pickup_notice_policy.sql'),'utf8'));
 const role=async(actor='',name='service_role')=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('test.uid',$1,false),set_config('test.role',$2,false)",[actor,name]);};
 const reset=async()=>{
  await role();await db.exec('TRUNCATE eats_restaurant_delivery_requests,eats_restaurant_delivery_quotes,eats_restaurant_delivery_access,h3_zonas,test_notices,dispatch_wakes,repartidores,pedidos,restaurantes CASCADE');
  await db.query("INSERT INTO restaurantes(id,nombre,nombre_sucursal,matriz_id,admin_id,activo,lat,lng,direccion) VALUES($1,'Robin sintético','Matriz',NULL,$4,true,16,-92,'Origen matriz'),($2,'Robin sintético','Sucursal',$1,$5,true,16.1,-92.1,'Origen sucursal'),($3,'Otro sintético','',NULL,$6,true,16,-92,'Otro origen')",[matrix,branch,other,owner,operator,foreign]);
  await db.query('INSERT INTO eats_restaurant_delivery_access(matriz_id,enabled) VALUES($1,true)',[matrix]);
 };
 const prepare=async({key=quote,actor=operator,rest=branch,point=destination,fee=50,food=200,contribution=null}={})=>{
  await role();return(await db.query('SELECT eats_restaurant_delivery_prepare($1,$2,$3,$4,$5,$6,$7,$8) result',[actor,key,rest,point,fee,food,String(fee)+' pesos',contribution])).rows[0].result;
 };
 const create=async({key=request,actor=operator,body=input}={})=>{
  await role(actor,'authenticated');await db.exec('SET ROLE authenticated');
  return(await db.query('SELECT eats_restaurant_delivery_create($1,$2) result',[key,body])).rows[0].result;
 };
 const location=async({key=quote,source='address',point=destination,fee=source==='pin'?null:50,cell=source==='pin'?'8a6d2e884807fff':null}={})=>{
  await role();return(await db.query('SELECT eats_restaurant_delivery_prepare_location($1,$2,$3,$4,$5,$6,200,$7,null,$8) result',[operator,key,branch,point,source,fee,'50 pesos',cell])).rows[0].result;
 };
 const test=async(name,run)=>{await reset();await run();passed++;console.log('PASS '+name);};
 await test('brand entitlement and actual branch ownership are both required',async()=>{
  for(const[actor,rest,expected]of[[owner,matrix,true],[owner,branch,true],[operator,branch,true],[operator,matrix,false],[foreign,branch,false],[foreign,other,false]]){
   await role(actor,'authenticated');assert.equal((await db.query('SELECT eats_restaurant_delivery_capability($1) result',[rest])).rows[0].result.enabled,expected);
  }
  await assert.rejects(prepare({rest:other,actor:foreign}),/No tienes acceso/);
 });
 await test('50 shipping = 15 restaurant + 35 customer; food remains separate and settlement reconciles',async()=>{
  const q=await prepare();assert.equal(q.fee,50);assert.equal(q.restaurantContribution,15);assert.equal(q.customerShipping,35);assert.equal(q.food,200);assert.equal(q.customerToCollect,235);assert.equal(q.restaurantSettlement,185);
  const result=await create();assert.equal(result.total,235);assert.equal(result.restaurantSettlement,185);assert.equal(result.total-result.restaurantSettlement,50);
  await role();const stored=(await db.query('SELECT * FROM pedidos')).rows[0];assert.equal(stored.total,'235');assert.equal(stored.precio_entrega,'50');assert.equal(stored.tipo_pedido,'restaurante_delivery');assert.equal(stored.restaurante,'Robin sintético · Sucursal');
  assert.equal(stored.restaurante_lat,16.1);assert.equal(stored.lat,16.25);assert.equal(stored.estado,'buscando_repartidor');assert.equal(stored.origen,'portal_restaurante');assert.match(stored.pickup_pin,/^[0-9]{4}$/);assert.equal(stored.pin_seguridad,null);assert.match(stored.descripcion,/Cobrar al cliente: \$235\.00/);assert.match(stored.descripcion,/Entregar a la sucursal: \$185\.00/);
  assert.equal(result.pickupPin,stored.pickup_pin);
  assert.equal((await db.query('SELECT count(*) n FROM dispatch_wakes')).rows[0].n,1);
 });
 await test('pickup receipt retains leading zeros, replays the same PIN and hides it after collection',async()=>{
  await prepare();const receipt=await create();await role();await db.query("UPDATE pedidos SET pickup_pin='0042' WHERE id=$1",[receipt.orderId]);
  const replay=await create();assert.equal(replay.pickupPin,'0042');
  const recent=(await db.query('SELECT eats_restaurant_delivery_recent($1) result',[branch])).rows[0].result;assert.equal(recent[0].pickupPin,'0042');
  await role();await db.query("UPDATE pedidos SET estado='en_camino' WHERE id=$1",[receipt.orderId]);
  const collected=await create();assert.equal(collected.pickupPin,null);
 });
 await test('manual services suppress customer lifecycle notices while preserving the driver ready notice and web checkout',async()=>{
  await prepare();const receipt=await create();await role();
  const driver=id(500);await db.query("INSERT INTO repartidores(user_id,telefono,nombre) VALUES($1,'0000000000','Conductor sintético')",[driver]);
  for(const origin of ['portal_restaurante','web']){
   await db.exec('TRUNCATE test_notices');
   await db.query("SELECT eats_capture_order_event(next,previous,'UPDATE') FROM (SELECT (jsonb_populate_record(p,jsonb_build_object('origen',$2::text,'estado','asignado','estado_cocina','listo_para_recoger','repartidor_id',$3::uuid))) next,jsonb_populate_record(p,jsonb_build_object('estado_cocina','listo_para_recoger')) previous FROM pedidos p WHERE id=$1) rows",[receipt.orderId,origin,driver]);
   const notices=(await db.query('SELECT kind FROM test_notices ORDER BY kind')).rows.map(row=>row.kind);
   assert.deepEqual(notices,origin==='web'?['asignado','driver_ready']:['driver_ready']);
   for(const state of ['en_camino','entregado','cancelado']){
    await db.exec('TRUNCATE test_notices');
    await db.query("SELECT eats_capture_order_event(next,previous,'UPDATE') FROM (SELECT (jsonb_populate_record(p,jsonb_build_object('origen',$2::text,'estado',$3::text))) next,p previous FROM pedidos p WHERE id=$1) rows",[receipt.orderId,origin,state]);
    assert.equal((await db.query('SELECT count(*) n FROM test_notices')).rows[0].n,origin==='web'?1:0);
   }
  }
 });
 await test('180 food plus 45 shipping and 15 restaurant contribution persist 210 customer and 165 settlement',async()=>{
  const q=await prepare({food:180,fee:45});
  assert.equal(q.restaurantContribution,15);assert.equal(q.customerShipping,30);assert.equal(q.customerToCollect,210);assert.equal(q.restaurantSettlement,165);
  const result=await create();assert.equal(result.total,210);assert.equal(result.fee,45);assert.equal(result.restaurantSettlement,165);
  await role();const stored=(await db.query('SELECT * FROM pedidos')).rows[0];
  assert.equal(stored.total,'210');assert.equal(stored.precio_entrega,'45');
  assert.match(stored.descripcion,/Cobrar al cliente: \$210\.00/);assert.match(stored.descripcion,/Entregar a la sucursal: \$165\.00/);
 });
 await test('paid food records receiving the restaurant contribution, without a negative customer charge',async()=>{
  await prepare({food:0});const result=await create();assert.equal(result.total,35);assert.equal(result.restaurantSettlement,-15);assert.equal(result.total-result.restaurantSettlement,50);
  await role();assert.match((await db.query('SELECT descripcion FROM pedidos')).rows[0].descripcion,/Recibir de la sucursal: \$15\.00/);
 });
 await test('an explicit per-service rule can cover the whole fee or set another contribution',async()=>{
  for(const contribution of[0,10,50]){
   const q=await prepare({key:id(100+contribution),contribution});assert.equal(q.restaurantContribution,contribution);assert.equal(q.customerShipping+q.restaurantContribution,q.fee);
  }
 });
 await test('a fee below the normal contribution is fully covered, never negative',async()=>{
  const q=await prepare({fee:10});assert.equal(q.restaurantContribution,10);assert.equal(q.customerShipping,0);assert.equal((await create()).total,200);
 });
 await test('zero, negative, excessive and fractional-cent inputs are rejected',async()=>{
  for(const args of[{fee:0},{fee:-1},{fee:10001},{food:-1},{food:100001},{fee:50.001},{contribution:51},{contribution:-1},{food:NaN}])await assert.rejects(prepare(args));
 });
 await test('quote retry reuses the same snapshot; changed inputs cannot reuse its key',async()=>{
  const a=await prepare(),b=await prepare();assert.deepEqual(a,b);
  await assert.rejects(prepare({fee:60}),/corresponde a otros datos/);
  await assert.rejects(prepare({point:{...destination,lat:17}}),/corresponde a otros datos/);
 });
 await test('a timed-out response can replay the same request exactly once',async()=>{
  await prepare();const a=await create(),b=await create();assert.deepEqual(a,b);
  await role();assert.equal((await db.query('SELECT count(*) n FROM pedidos')).rows[0].n,1);assert.equal((await db.query('SELECT count(*) n FROM dispatch_wakes')).rows[0].n,1);
 });
 await test('a consumed quote cannot create another service with a new request key',async()=>{
  await prepare();await create();await assert.rejects(create({key:id(201)}),/ya se usó/);
 });
 await test('changing customer or amounts under an existing idempotency key is a conflict',async()=>{
  await prepare();await create();await assert.rejects(create({body:{...input,name:'Otro cliente'}}),/otro envío/);
 });
 await test('expired quote blocks new service but never hides a committed receipt',async()=>{
  await prepare();await role();await db.exec("UPDATE eats_restaurant_delivery_quotes SET expires_at=now()-interval '1 second'");
  await assert.rejects(create(),/resumen venció/);await role();await db.exec("UPDATE eats_restaurant_delivery_quotes SET expires_at=now()+interval '1 minute'");
  const a=await create();await role();await db.exec("UPDATE eats_restaurant_delivery_quotes SET expires_at=now()-interval '1 second'");assert.deepEqual(await create(),a);
 });
 await test('foreign operator cannot spend a quote or read another branch receipt',async()=>{
  await prepare();await assert.rejects(create({actor:foreign}),/No tienes una cotización/);const receipt=await create();
  await role(foreign,'authenticated');assert.equal((await db.query('SELECT eats_restaurant_delivery_result($1) result',[request])).rows[0].result,null);
  await assert.rejects(db.query('SELECT eats_restaurant_delivery_recent($1)',[branch]),/No tienes acceso/);
  await role(owner,'authenticated');assert.equal((await db.query('SELECT eats_restaurant_delivery_result($1) result',[request])).rows[0].result.orderId,receipt.orderId);
 });
 await test('disabling branch or entitlement invalidates an unused quote',async()=>{
  await prepare();await role();await db.query('UPDATE restaurantes SET activo=false WHERE id=$1',[branch]);await assert.rejects(create(),/No tienes una cotización/);
  await role();await db.query('UPDATE restaurantes SET activo=true WHERE id=$1',[branch]);await db.exec('UPDATE eats_restaurant_delivery_access SET enabled=false');await assert.rejects(create(),/No tienes una cotización/);
 });
 await test('origin changes require a fresh review rather than routing to old coordinates',async()=>{
  await prepare();await role();await db.query('UPDATE restaurantes SET lat=17 WHERE id=$1',[branch]);await assert.rejects(create(),/sucursal cambió/);
 });
 await test('readiness is explicit; ready now keeps normal dispatch admission',async()=>{
  await prepare();await create({body:{...input,preparationMinutes:0}});await role();assert.equal((await db.query('SELECT estado_cocina FROM pedidos')).rows[0].estado_cocina,'listo_para_recoger');
 });
 await test('missing, malformed and extra input fields cannot bypass the server contract',async()=>{
  await prepare();for(const body of[{},[],{...input,phone:'123'},{...input,name:''},{...input,preparationMinutes:1.5},{...input,preparationMinutes:121},{...input,foodToCollect:1},{...input,restaurante_id:other},{...input,estado:'entregado'}])await assert.rejects(create({body}));
 });
 await test('failure after request insertion rolls back order, receipt and wake; retry can succeed',async()=>{
  await prepare();await role();await db.exec("CREATE FUNCTION test_crash() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic commit failure';END;$$;CREATE TRIGGER zzz_test_crash AFTER INSERT ON pedidos FOR EACH ROW EXECUTE FUNCTION test_crash()");
  await assert.rejects(create(),/synthetic commit failure/);await role();assert.equal((await db.query('SELECT count(*) n FROM eats_restaurant_delivery_requests')).rows[0].n,0);assert.equal((await db.query('SELECT count(*) n FROM pedidos')).rows[0].n,0);assert.equal((await db.query('SELECT count(*) n FROM dispatch_wakes')).rows[0].n,0);
  await db.exec('DROP TRIGGER zzz_test_crash ON pedidos');await create();
 });
 await test('private tables and service quote preparation are denied to client roles',async()=>{
  for(const name of['anon','authenticated']){
   await role(operator,name);await db.exec('SET ROLE '+name);
   for(const table of['eats_restaurant_delivery_access','eats_restaurant_delivery_quotes','eats_restaurant_delivery_requests'])await assert.rejects(db.query('SELECT * FROM '+table),/permission denied/);
   await assert.rejects(db.query('SELECT eats_restaurant_delivery_prepare($1,$2,$3,$4,50,200,\'50 pesos\',null)',[operator,quote,branch,destination]),/permission denied/);
  }
  await role('','anon');await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT eats_restaurant_delivery_create($1,$2)',[request,input]),/permission denied/);
 });
 await test('quotes and recent requests have finite budgets and explicit scope',async()=>{
  for(let n=0;n<20;n++)await prepare({key:id(100+n)});await assert.rejects(prepare({key:id(120)}),/Espera un momento/);
  await role(operator,'authenticated');assert.deepEqual((await db.query('SELECT eats_restaurant_delivery_recent($1) result',[branch])).rows[0].result,[]);
 });
 await test('unused old quotes are pruned in a bounded actor scope while consumed receipts remain',async()=>{
  await prepare();await create();await prepare({key:id(101)});await role();await db.exec("UPDATE eats_restaurant_delivery_quotes SET created_at=now()-interval '2 days'");
  await prepare({key:id(102)});await role();assert.equal((await db.query('SELECT count(*) n FROM eats_restaurant_delivery_quotes WHERE id=$1',[id(101)])).rows[0].n,0);assert.equal((await db.query('SELECT count(*) n FROM eats_restaurant_delivery_quotes WHERE id=$1',[quote])).rows[0].n,1);
 });
 await test('existing outbox accepts a committed portal link but never a forged portal origin',async()=>{
  await prepare();await create();await role();
  assert.equal((await db.query("SELECT eats_capture_order_event(p,NULL,'INSERT') handled FROM pedidos p")).rows[0].handled,true);
  assert.equal((await db.query('SELECT count(*) n FROM test_notices')).rows[0].n,0);
  await db.exec("CREATE TEMP TABLE before_order AS SELECT * FROM pedidos; UPDATE pedidos SET estado='asignado'");
  assert.equal((await db.query("SELECT eats_capture_order_event(p,jsonb_populate_record(NULL::pedidos,to_jsonb(b)),'UPDATE') handled FROM pedidos p CROSS JOIN before_order b")).rows[0].handled,true);
  assert.equal((await db.query('SELECT count(*) n FROM test_notices')).rows[0].n,0);
  assert.equal((await db.query("SELECT eats_capture_order_event(jsonb_populate_record(NULL::pedidos,to_jsonb(p)||jsonb_build_object('id',gen_random_uuid())),NULL,'INSERT') handled FROM pedidos p")).rows[0].handled,false);
  for(const origin of[null,'whatsapp','robins','otra_ruta'])assert.equal((await db.query("SELECT eats_capture_order_event(jsonb_populate_record(NULL::pedidos,to_jsonb(p)||jsonb_build_object('origen',$1::text)),NULL,'INSERT') handled FROM pedidos p",[origin])).rows[0].handled,false);
 });
 await test('the new order origin is private to its brand and the authorized driver pool',async()=>{
  await prepare();await create();await role(foreign,'authenticated');await db.exec('SET ROLE authenticated');assert.equal((await db.query('SELECT count(*) n FROM pedidos')).rows[0].n,0);
  await role('','anon');await db.exec('SET ROLE anon');assert.equal((await db.query('SELECT count(*) n FROM pedidos')).rows[0].n,0);
  await role(owner,'authenticated');await db.exec('SET ROLE authenticated');assert.equal((await db.query('SELECT count(*) n FROM pedidos')).rows[0].n,1);
  await role();await db.query("INSERT INTO repartidores(user_id,telefono,nombre,activo) VALUES($1,'0000000000','Repartidor sintético',true)",[foreign]);
  await role(foreign,'authenticated');await db.exec('SET ROLE authenticated');assert.equal((await db.query('SELECT count(*) n FROM pedidos')).rows[0].n,1);
  await role();await db.exec("UPDATE pedidos SET estado='ofrecido',repartidor_id='00000000-0000-4000-8000-000000000099'");await role(foreign,'authenticated');await db.exec('SET ROLE authenticated');assert.equal((await db.query('SELECT count(*) n FROM pedidos')).rows[0].n,0);
 });
 await test('a pin uses the configured full H3 fee before the restaurant contribution',async()=>{
  await db.query("INSERT INTO h3_zonas VALUES('8a6d2e884807fff',60)");const q=await location({source:'pin'});
  assert.equal(q.pricing,'h3');assert.equal(q.locationSource,'pin');assert.equal(q.fee,60);assert.equal(q.customerToCollect,245);assert.equal(q.restaurantSettlement,185);
  const result=await create();assert.equal(result.fee,60);assert.equal(result.pricing,'h3');assert.equal(result.total-result.restaurantSettlement,60);
 });
 await test('a written address is accepted without inventing a destination coordinate or H3 fee',async()=>{
  const q=await location({point:{lat:null,lng:null,address:'Calle escrita por el cliente, número 12'}});assert.equal(q.pricing,'manual');assert.equal(q.destination.lat,null);await create();await role();
  const p=(await db.query('SELECT *,pedido_admite_repartidor(pedidos) admitted FROM pedidos')).rows[0];
  for(const key of['lat','lng','lat_entrega','lng_entrega'])assert.equal(p[key],null);
  assert.equal(p.restaurante_lat,16.1);assert.equal(p.admitted,true);assert.match(p.descripcion,/sin pin confirmado/);
 });
 await test('missing, duplicate and invalid H3 tariffs are explicit errors, never a default price',async()=>{
  for(const prices of[[],[45,60],[0],[-1],[10.001]]){await role();await db.exec('TRUNCATE h3_zonas');for(const price of prices)await db.query("INSERT INTO h3_zonas VALUES('8a6d2e884807fff',$1)",[price]);await assert.rejects(location({source:'pin'}),/tarifa H3 válida/);}
  assert.equal((await db.query('SELECT count(*) n FROM eats_restaurant_delivery_quotes')).rows[0].n,0);
 });
 await test('the automatic mode rejects a manual fee, an absent pin and mixed location metadata',async()=>{
  await assert.rejects(location({source:'pin',fee:50}),/tarifa la calcula/);
  await assert.rejects(location({source:'pin',point:{lat:null,lng:null,address:'Sin pin'}}),/pin necesita/);
  await assert.rejects(location({source:'address',cell:'8a6d2e884807fff'}),/precio acordado/);
  await assert.rejects(location({point:{lat:null,lng:-92.13,address:'Coordenada incompleta'}}),/ubicación de entrega válida/);
 });
 await test('an H3 quote replay retains its reviewed tariff even when the configured price changes',async()=>{
  await db.query("INSERT INTO h3_zonas VALUES('8a6d2e884807fff',60)");const first=await location({source:'pin'});await db.exec('UPDATE h3_zonas SET precio=75');assert.deepEqual(await location({source:'pin'}),first);
  assert.equal((await create()).fee,60);await role();assert.equal((await location({source:'pin',key:id(101)})).fee,75);
 });
 await test('changing pin versus written address needs a new quote; the location RPC is service-only',async()=>{
  await location();await assert.rejects(location({source:'pin'}),/tipo de ubicación cambió/);
  for(const name of['anon','authenticated']){await role(operator,name);await db.exec('SET ROLE '+name);await assert.rejects(db.query('SELECT eats_restaurant_delivery_prepare_location($1,$2,$3,$4,$5,50,200,$6,null,null)',[operator,id(101),branch,destination,'address','50']),/permission denied/);}
 });
 await db.close();isolatedDb=null;console.log(passed+' isolated restaurant delivery contracts passed; no production rows or messages.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{if(isolatedDb)await isolatedDb.close();});

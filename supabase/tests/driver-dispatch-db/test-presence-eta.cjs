const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const file=(p)=>fs.readFileSync(path.resolve(__dirname,p),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const order=id(900),device=id(800),session=id(700);
let database;
(async()=>{
 const db=database=new PGlite();let count=0;
 await db.exec(file('../fixtures/eats-dispatch-v2-schema.sql'));
 await db.exec(file('../fixtures/eats-algorithms-baseline.sql'));
 await db.exec(file('../../migrations/20261025143743_eats_dispatch_notification_algorithms.sql'));
 await db.exec(file('../../migrations/20261025150138_eats_dispatch_presence_eta.sql'));
 const role=async(name='service_role',actor='')=>db.query("SELECT set_config('test.role',$1,false),set_config('test.uid',$2,false)",[name,actor]);
 const reset=async()=>{await db.exec('TRUNCATE eats_dispatch_contexts,eats_driver_presence,eats_dispatch_kitchen_clock,pedidos,repartidores,restaurantes CASCADE;UPDATE eats_dispatch_policy SET mode=\'active\',strict_presence=false');await role();};
 const test=async(name,run)=>{await reset();await run();count++;console.log('PASS '+name);};
 const seed=async(n=3)=>{for(let i=1;i<=n;i++){
  await db.query("INSERT INTO repartidores(id,user_id,nombre,activo,bateria,lat,lng,current_device_id) VALUES($1,$1,'Conductor sintético',true,80,16,$2,$3)",[id(i),-92+i/10000,device]);
  await role('authenticated',id(i));await db.query('UPDATE repartidores SET lat=lat,lng=lng WHERE id=$1',[id(i)]);
 }await role();};
 const addOrder=async(key=order,driver=null,state='buscando_repartidor')=>db.query("INSERT INTO pedidos(id,estado,repartidor_id,tipo_pedido,metodo_pago,estado_pago,estado_cocina,tiempo_preparacion_minutos,oferta_token,oferta_vence_at,restaurante_lat,restaurante_lng,despacho_intentos) VALUES($1,$2,$3,'domicilio','efectivo','pendiente','en_cocina',15,$4,$5,16,-92,1)",[key,state,driver,state==='ofrecido'?id(600):null,state==='ofrecido'?new Date(Date.now()+25000).toISOString():null]);
 const begin=async(actor=id(1),sessionId=session,deviceId=device)=>{await role('authenticated',actor);return(await db.query('SELECT driver_presence_begin($1,$2,$3) result',[actor,deviceId,sessionId])).rows[0].result;};
 const report=async(seq=1,override={})=>{const v={lat:16,lng:-92.00001,gps:new Date().toISOString(),accuracy:10,battery:80,sent:new Date().toISOString(),...override};return(await db.query('SELECT driver_presence_report($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[id(1),session,seq,v.sent,v.lat,v.lng,v.gps,v.accuracy,v.battery])).rows[0].result;};
 const context=async()=>{await role();return(await db.query('SELECT eats_dispatch_context($1) result',[order])).rows[0].result;};
 const rank=async(c,routes=[],source='geographic',reason='provider_error')=>(await db.query('SELECT eats_rank_dispatch($1,$2,$3,$4) result',[c.context_id,JSON.stringify(routes),source,reason])).rows[0].result;
 const offer=async(c,driver)=>(await db.query('SELECT eats_offer_ranked($1,$2,$3) result',[order,driver,c.context_id])).rows[0].result;
 await test('presence binds profile, authenticated actor and current device',async()=>{
  await seed();assert.equal(await begin(id(1),session,id(999)),false);assert.equal(await begin(id(1)),true);
  await role('authenticated',id(2));assert.equal((await db.query('SELECT driver_presence_begin($1,$2,$3) result',[id(1),device,id(701)])).rows[0].result,false);
  await role('anon');assert.equal((await db.query('SELECT driver_presence_begin($1,$2,$3) result',[id(1),device,session])).rows[0].result,false);
 });
 await test('valid GPS is timestamped separately from the authenticated heartbeat',async()=>{
  await seed();await begin();const result=await report();assert.equal(result.accepted,true);assert.equal(result.gps_accepted,true);
  const v=(await db.query('SELECT lat,lng,sequence,contact_at>gps_at AS received_after FROM eats_driver_presence WHERE profile_id=$1',[id(1)])).rows[0];
  assert.equal(v.sequence,1);assert.equal(v.lng,-92.00001);assert.equal(v.received_after,true);
 });
 await test('old/future/inaccurate/mock-equivalent GPS never becomes fresh by resending it',async()=>{
  await seed();await begin();
  let sequence=1;
  for(const o of [{gps:new Date(Date.now()-180000).toISOString()},{gps:new Date(Date.now()+60000).toISOString()},{accuracy:101},{accuracy:-1},{lat:91},{lat:null,lng:null,gps:null,accuracy:null}]){
   await db.exec("UPDATE eats_driver_presence SET contact_at=now()-interval '10 seconds'");const result=await report(sequence++,o);
   assert.equal(result.gps_accepted,false);await db.exec('UPDATE eats_driver_presence SET sequence=0');
  }
  assert.equal((await db.query('SELECT gps_at FROM eats_driver_presence')).rows[0].gps_at,null);
 });
 await test('out of order sequence and an obsolete session cannot alter the new GPS',async()=>{
  await seed();await begin();await report(2);assert.equal((await report(1)).reason,'old_sequence');
  await begin(id(1),id(701));assert.equal((await report(3)).reason,'session');
 });
 await test('heartbeat after Offline cannot activate the driver or update coordinates',async()=>{
  await seed();await begin();await db.exec('UPDATE repartidores SET activo=false');assert.equal((await report()).reason,'offline');
  assert.equal((await db.query('SELECT sequence FROM eats_driver_presence')).rows[0].sequence,0);
 });
 await test('another device invalidates an earlier background process',async()=>{
  await seed();await begin();await db.query('UPDATE repartidores SET current_device_id=$1',[id(801)]);
  assert.equal((await report()).reason,'session');
 });
 await test('strict rollout excludes unmeasured profiles, compatibility keeps them explicit',async()=>{
  await seed();await addOrder();let c=await context();assert.equal(c.drivers.length,3);assert(c.drivers.every(d=>d.legacy_presence));
  await db.exec("TRUNCATE eats_dispatch_contexts;UPDATE eats_dispatch_policy SET strict_presence=true");c=await context();assert.equal(c.drivers.length,0);
 });
 await test('legacy compatibility proves recent contact without fabricating GPS age or trusting administrator updates',async()=>{
  await seed(1);const v=(await db.query('SELECT protocol,gps_at,accuracy_m FROM eats_driver_presence')).rows[0];
  assert.deepEqual(v,{protocol:0,gps_at:null,accuracy_m:null});await addOrder();
  await db.exec("UPDATE eats_driver_presence SET contact_at=now()-interval '91 seconds'");assert.equal((await context()).drivers.length,0);
  await db.exec('TRUNCATE eats_dispatch_contexts');await role('service_role');await db.exec('UPDATE repartidores SET lat=lat');assert.equal((await context()).drivers.length,0);
 });
 await test('known stale GPS is excluded even while legacy compatibility is enabled',async()=>{
  await seed(1);await begin();await report();await role();await addOrder();
  assert.equal((await context()).drivers.length,1);
  await db.exec("TRUNCATE eats_dispatch_contexts;UPDATE eats_driver_presence SET gps_at=now()-interval '121 seconds'");
  assert.equal((await context()).drivers.length,0);
 });
 await test('shortlist excludes busy/rejected before LIMIT and preserves the eleventh free candidate',async()=>{
  await seed(11);await addOrder();for(let i=1;i<=9;i++)await addOrder(id(100+i),id(i),'asignado');
  await db.query('UPDATE pedidos SET ofertas_rechazadas=$1 WHERE id=$2',[[id(10)],order]);
  assert.deepEqual((await context()).drivers.map(d=>d.id),[id(11)]);
 });
 await test('road ETA wins over geographic proximity without an arbitrary acceptance penalty',async()=>{
  await seed(2);await addOrder();await db.exec('TRUNCATE eats_dispatch_kitchen_clock');const c=await context();
  const ranked=await rank(c,[{id:id(1),seconds:600},{id:id(2),seconds:180}],'mapbox',null);
  assert.deepEqual(ranked.map(d=>d.id),[id(2),id(1)]);assert.equal(ranked[0].pickup_seconds,180);
 });
 await test('fairness is capped at thirty seconds and does not hide a long detour',async()=>{
  await seed(2);await addOrder();await db.exec('TRUNCATE eats_dispatch_kitchen_clock');await db.query("UPDATE repartidores SET ultimo_pedido_entregado_at=now()-interval '5 hours' WHERE id=$1",[id(1)]);
  const c=await context();const ranked=await rank(c,[{id:id(1),seconds:500},{id:id(2),seconds:100}],'mapbox',null);
  assert.equal(ranked[0].id,id(2));assert.equal(ranked[1].score,470);
 });
 await test('no-route is excluded, not turned into zero or a straight-line success',async()=>{
  await seed(2);await addOrder();const c=await context();const ranked=await rank(c,[{id:id(1),seconds:null},{id:id(2),seconds:50}],'mapbox',null);
  assert.deepEqual(ranked.map(d=>d.id),[id(2)]);
 });
 await test('invalid, duplicate and unrequested route evidence fail before a decision persists',async()=>{
  await seed(1);await addOrder();const c=await context();
  for(const routes of [[{id:id(5),seconds:10}],[{id:id(1),seconds:-1}],[{id:id(1),seconds:10},{id:id(1),seconds:12}],[{id:id(1)}]])await assert.rejects(rank(c,routes,'mapbox',null));
  assert.equal((await db.query('SELECT result FROM eats_dispatch_contexts')).rows[0].result,null);
 });
 await test('observe mode keeps baseline offers and records the proposal without a second assignment',async()=>{
  await seed(2);await addOrder();await db.exec("TRUNCATE eats_dispatch_kitchen_clock;UPDATE eats_dispatch_policy SET mode='observe'");const c=await context();
  const chosen=await rank(c,[{id:id(1),seconds:600},{id:id(2),seconds:180}],'mapbox',null);
  assert.equal(chosen[0].id,c.legacy[0].id);assert.equal((await db.query("SELECT result->'proposed'->0->>'id' id FROM eats_dispatch_contexts")).rows[0].id,id(2));
  assert.equal((await db.query('SELECT estado FROM pedidos')).rows[0].estado,'buscando_repartidor');
 });
 await test('ranked atomic offer revalidates load and a stale context cannot overwrite ownership',async()=>{
  await seed(2);await addOrder();const c=await context();await rank(c);await addOrder(id(101),id(1),'asignado');
  assert.equal(await offer(c,id(1)),false);assert.equal(await offer(c,id(2)),true);assert.equal(await offer(c,id(1)),false);
  assert.equal((await db.query('SELECT repartidor_id FROM pedidos WHERE id=$1',[order])).rows[0].repartidor_id,id(2));
 });
 await test('movement after road estimate and context expiry require a new decision',async()=>{
  await seed(1);await addOrder();const c=await context();await rank(c);await role('authenticated',id(1));await db.exec('UPDATE repartidores SET lng=lng+0.02');await role();assert.equal(await offer(c,id(1)),false);
  await db.exec("UPDATE eats_dispatch_contexts SET created_at=now()-interval '21 seconds'");assert.deepEqual(await rank(c),[]);
 });
 await test('private presence and route contexts cannot be read or mutated by client roles',async()=>{
  for(const role of ['anon','authenticated'])for(const table of ['eats_driver_presence','eats_dispatch_contexts','eats_dispatch_policy'])
   assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3) allowed',[role,table,'SELECT'])).rows[0].allowed,false);
 });
 await test('an expired/rejected recipient cannot bypass the offer by accepting the direct pool',async()=>{
  await seed(1);await addOrder();await db.query('UPDATE pedidos SET ofertas_rechazadas=$1 WHERE id=$2',[[id(1)],order]);
  await role('authenticated',id(1));assert.equal((await db.query('SELECT aceptar_pedido_atomico($1,$2) result',[order,id(1)])).rows[0].result,false);
 });
 await test('direct acceptance cannot ignore a different pending offer and accepted replay remains idempotent',async()=>{
  await seed(1);await addOrder();await addOrder(id(101),id(1),'ofrecido');await role('authenticated',id(1));
  assert.equal((await db.query('SELECT aceptar_pedido_atomico($1,$2) result',[order,id(1)])).rows[0].result,false);
  await db.query('DELETE FROM pedidos WHERE id=$1',[id(101)]);
  assert.equal((await db.query('SELECT aceptar_pedido_atomico($1,$2) result',[order,id(1)])).rows[0].result,true);
  await db.exec('UPDATE repartidores SET activo=false,bateria=1');
  assert.equal((await db.query('SELECT aceptar_pedido_atomico($1,$2) result',[order,id(1)])).rows[0].result,true);
  assert.equal((await db.query('SELECT total_aceptaciones FROM repartidores')).rows[0].total_aceptaciones,1);
 });
 await test('a missing origin is explicit and never bypasses presence into a claimed road assignment',async()=>{
  await seed(1);await addOrder();await db.exec('UPDATE pedidos SET restaurante_lat=NULL,restaurante_lng=NULL');
  const c=await context();assert.equal(c.mode,'active');assert.equal(c.pickup,null);assert.deepEqual(await rank(c,[],'legacy','no_origin'),[]);
 });
 await test('kitchen timestamp is durable, not rewritten by another edit or backfilled from updated_at',async()=>{
  await seed(1);await addOrder();const before=(await db.query('SELECT accepted_at FROM eats_dispatch_kitchen_clock')).rows[0].accepted_at;
  await db.exec('UPDATE pedidos SET tiempo_preparacion_minutos=30');assert.deepEqual((await db.query('SELECT accepted_at FROM eats_dispatch_kitchen_clock')).rows[0].accepted_at,before);
  await db.exec("UPDATE pedidos SET estado_cocina='listo_para_recoger'");assert.notEqual((await db.query('SELECT ready_at FROM eats_dispatch_kitchen_clock')).rows[0].ready_at,null);
 });
 console.log(count+' presence and ETA checks passed; isolated single-connection engine with synthetic geometry.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{if(database)await database.close();});

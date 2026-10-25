const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.resolve(__dirname,'../../migrations/20261025143743_eats_dispatch_notification_algorithms.sql'),'utf8');
const baseline=fs.readFileSync(path.resolve(__dirname,'../fixtures/eats-algorithms-baseline.sql'),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const order=id(900),notice=id(901),lease=id(902);
(async()=>{
 const db=new PGlite();let count=0;
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE SCHEMA auth;CREATE SCHEMA extensions;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('test.role',true)$$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
 CREATE TABLE repartidores(id uuid,user_id uuid PRIMARY KEY,nombre text,activo boolean,bateria integer,lat float8,lng float8,
  meta_envios integer,total_ofertas integer DEFAULT 0,total_aceptaciones integer DEFAULT 0,ultimo_pedido_entregado_at timestamptz);
 CREATE TABLE pedidos(id uuid PRIMARY KEY,estado text,repartidor_id uuid,tipo_pedido text,metodo_pago text,estado_pago text,
  estado_cocina text,tiempo_preparacion_minutos integer,ofertas_rechazadas uuid[],oferta_token uuid,oferta_vence_at timestamptz,
  despacho_reintentar_at timestamptz,despacho_incidente text,despacho_intentos integer DEFAULT 0,pickup_pin text,pin_seguridad text,
  lat_entrega float8,lng_entrega float8,pago_pendiente_restaurante boolean);
 CREATE TABLE eats_order_notifications(id uuid PRIMARY KEY,pedido_id uuid,recipient text,kind text DEFAULT 'restaurant_receipt',state text,
  provider_id text,provider_status text,error_code text,price numeric,currency text,lease_until timestamptz,
  recoveries integer DEFAULT 0,attempts integer DEFAULT 0,next_attempt_at timestamptz DEFAULT now(),lease_token uuid,group_key text,
  sequence integer DEFAULT 0,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE TABLE eats_notification_settings(enabled boolean);INSERT INTO eats_notification_settings VALUES(true);
 CREATE TABLE pedido_logs(pedido_id uuid,accion text,detalles text);
 -- Deterministic spatial substitutes test eligibility/order/LIMIT, not PostGIS.
 CREATE DOMAIN geography AS float8[];
 CREATE FUNCTION st_makepoint(float8,float8) RETURNS float8[] LANGUAGE sql IMMUTABLE AS $$SELECT ARRAY[$1,$2]$$;
 CREATE FUNCTION st_setsrid(float8[],integer) RETURNS geography LANGUAGE sql IMMUTABLE AS $$SELECT $1::geography$$;
 CREATE FUNCTION st_distancesphere(geography,geography) RETURNS float8 LANGUAGE sql IMMUTABLE AS $$SELECT sqrt(power($1[1]-$2[1],2)+power($1[2]-$2[2],2))*100000$$;
 CREATE FUNCTION st_dwithin(geography,geography,float8) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT st_distancesphere($1,$2)<=$3$$;
 SELECT set_config('test.role','service_role',false);
 `);
 await db.exec(baseline);
 await db.query("INSERT INTO pedidos(id,estado) VALUES($1,'ofrecido')",[order]);
 await assert.rejects(db.exec(migration),/Malformed offer requires explicit review/);await db.exec('ROLLBACK');
 assert.equal((await db.query('SELECT estado FROM pedidos')).rows[0].estado,'ofrecido');
 assert.equal((await db.query("SELECT to_regprocedure('buscar_repartidores_cercanos(float8,float8,float8,float8,float8,uuid[])') function")).rows[0].function,null);
 count++;console.log('PASS migration refuses malformed legacy offers and rolls back instead of guessing ownership');
 await db.exec('TRUNCATE pedidos');await db.exec(migration);
 const reset=async()=>{await db.exec('RESET ROLE;TRUNCATE pedidos,repartidores,eats_order_notifications,pedido_logs;UPDATE eats_notification_settings SET enabled=true');await db.exec("SELECT set_config('test.role','service_role',false),set_config('test.uid','',false)");};
 const test=async(name,run)=>{await reset();await run();count++;console.log('PASS '+name);};
 const seed=async(n=11)=>{for(let i=1;i<=n;i++)await db.query("INSERT INTO repartidores(id,user_id,nombre,activo,bateria,lat,lng) VALUES($1,$1,'Conductor sintético',true,80,16,$2)",[id(i),-92+i/10000]);};
 const search=async(excluded=[],lat=16,lng=-92)=>(await db.query('SELECT * FROM buscar_repartidores_cercanos($1::float8,$2::float8,5000::float8,null::float8,null::float8,$3::uuid[])',[lat,lng,excluded])).rows;
 const addOrder=async(key=order,driver=null,state='buscando_repartidor')=>db.query("INSERT INTO pedidos(id,estado,repartidor_id,tipo_pedido,metodo_pago,estado_pago,estado_cocina,tiempo_preparacion_minutos,oferta_token,oferta_vence_at) VALUES($1,$2,$3,'domicilio','efectivo','pendiente','en_cocina',15,$4,$5)",[key,state,driver,state==='ofrecido'?lease:null,state==='ofrecido'?new Date(Date.now()+25000).toISOString():null]);
 const append=async(key,sequence,state='queued',group='fixture',attempts=0)=>db.query('INSERT INTO eats_order_notifications(id,pedido_id,recipient,state,group_key,sequence,attempts) VALUES($1,$2,$3,$4,$5,$6,$7)',[key,order,'5550000000',state,group,sequence,attempts]);
 const due=async()=>(await db.query('SELECT eats_notifications_due() result')).rows[0].result;
 const claim=async()=>(await db.query('SELECT eats_notification_claim() result')).rows[0].result;
 const callback=async(state,code=null,provider='fixture-provider',recipient='+525550000000')=>db.query('SELECT eats_notification_status($1,$2,$3,$4,$5,$6) result',['ee-order-'+notice,provider,'+522201465989',recipient,state,code]);
 await test('rejections are removed before LIMIT, so the eleventh eligible driver is returned',async()=>{
  await seed();await addOrder();const excluded=Array.from({length:10},(_,i)=>id(i+1));
  const found=await search(excluded);assert.deepEqual(found.map(r=>r.user_id),[id(11)]);
  assert.equal((await db.query('SELECT asignar_pedido_atomico($1,$2) result',[order,found[0].user_id])).rows[0].result,true);
 });
 await test('drivers with another offer are excluded before scoring and LIMIT',async()=>{
  await seed();await db.exec('UPDATE repartidores SET total_ofertas=100,total_aceptaciones=100');
  await db.query('UPDATE repartidores SET total_aceptaciones=0,lng=-91.96 WHERE user_id=$1',[id(11)]);
  for(let i=1;i<=10;i++)await addOrder(id(100+i),id(i),'ofrecido');
  assert.deepEqual((await search()).map(r=>r.user_id),[id(11)]);
 });
 await test('no-origin fallback shares exclusions and pending-offer protection without fake GPS',async()=>{
  await seed(3);await addOrder(order,id(1),'ofrecido');
  const found=await search([id(2)],null,null);assert.deepEqual(found.map(r=>r.user_id),[id(3)]);assert.equal(found[0].distancia_metros,null);
 });
 await test('capacity, battery and active status are checked before returning candidates',async()=>{
  await seed(4);for(let i=1;i<=3;i++)await addOrder(id(100+i),id(1),'asignado');
  await db.query('UPDATE repartidores SET bateria=14 WHERE user_id=$1',[id(2)]);await db.query('UPDATE repartidores SET activo=false WHERE user_id=$1',[id(3)]);
  assert.deepEqual((await search()).map(r=>r.user_id),[id(4)]);
 });
 await test('legacy five-argument API remains unambiguous and bounded to ten',async()=>{
  await seed(11);const found=(await db.query('SELECT * FROM buscar_repartidores_cercanos(16::float8,(-92)::float8)')).rows;
  assert.equal(found.length,10);assert.equal((await search([null])).length,10);
 });
 await test('invalid origin and direct client calls cannot bypass the server search',async()=>{
  await assert.rejects(search([],null,-92),/Invalid dispatch search/);await assert.rejects(search([],99,-92),/Invalid dispatch search/);
  await db.exec("SELECT set_config('test.role','authenticated',false)");await assert.rejects(search(),/Server required/);
  for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_function_privilege($1,'buscar_repartidores_cercanos(float8,float8,float8,float8,float8,uuid[])','EXECUTE') permitted",[role])).rows[0].permitted,false);
 });
 await test('offer constraint rejects missing identity, token, deadline and infinite deadline',async()=>{
  await seed(1);await addOrder();
  for(const mutation of ["estado='ofrecido'",`estado='ofrecido',repartidor_id='${id(1)}',oferta_token='${lease}'`,`estado='ofrecido',repartidor_id='${id(1)}',oferta_vence_at=now()`,`estado='ofrecido',repartidor_id='${id(1)}',oferta_token='${lease}',oferta_vence_at='infinity'`]){
   await assert.rejects(db.query('UPDATE pedidos SET '+mutation+' WHERE id=$1',[order]),/pedidos_oferta_completa/);
  }
  assert.equal((await db.query('SELECT asignar_pedido_atomico($1,$2) result',[order,id(1)])).rows[0].result,true);
  await assert.rejects(db.query('UPDATE pedidos SET oferta_token=NULL WHERE id=$1',[order]),/pedidos_oferta_completa/);
 });
 await test('failed provider status survives late accepted and sent callbacks',async()=>{
  await append(notice,0,'sending');await callback('failed','131026');await callback('accepted');await callback('sent');
  const row=(await db.query('SELECT state,error_code FROM eats_order_notifications')).rows[0];assert.deepEqual(row,{state:'failed',error_code:'131026'});
 });
 await test('actual delivery/read proof can advance a failed status without later downgrade',async()=>{
  await append(notice,0,'sending');await callback('failed','131026');await callback('delivered');await callback('accepted');
  assert.equal((await db.query('SELECT state FROM eats_order_notifications')).rows[0].state,'delivered');
  await callback('read');await callback('failed','131026');assert.equal((await db.query('SELECT state FROM eats_order_notifications')).rows[0].state,'read');
 });
 await test('wrong provider, phone or null identity cannot rewrite a callback',async()=>{
  await append(notice,0,'sending');await callback('sent');
  assert.equal((await callback('failed','131026','other-provider')).rows[0].result,false);
  assert.equal((await callback('failed','131026','fixture-provider','+525550000001')).rows[0].result,false);
  assert.equal((await callback(null)).rows[0].result,false);assert.equal((await db.query('SELECT state FROM eats_order_notifications')).rows[0].state,'sent');
 });
 for(const state of ['failed','uncertain','superseded'])await test('dependent queued parts close once after '+state+', without repeating a send',async()=>{
  await append(notice,0,state);await append(id(903),1);assert.equal(await due(),true);assert.equal(await claim(),null);
  const part=(await db.query('SELECT state,error_code,attempts FROM eats_order_notifications WHERE id=$1',[id(903)])).rows[0];
  assert.deepEqual(part,{state:'failed',error_code:'predecessor_terminal',attempts:0});assert.equal(await due(),false);
  await claim();assert.equal((await db.query('SELECT count(*) n FROM pedido_logs')).rows[0].n,1);
  assert.equal((await db.query('SELECT state FROM eats_order_notifications WHERE id=$1',[notice])).rows[0].state,state);
 });
 await test('working predecessor waits without waking, then accepted predecessor unlocks next part',async()=>{
  await append(notice,0,'working');await db.query("UPDATE eats_order_notifications SET lease_until=now()+interval '1 minute' WHERE id=$1",[notice]);await append(id(903),1);
  assert.equal(await due(),false);assert.equal(await claim(),null);
  await db.query("UPDATE eats_order_notifications SET state='accepted',lease_until=null WHERE id=$1",[notice]);
  assert.equal(await due(),true);assert.equal((await claim()).id,id(903));
 });
 await test('expired uncertain predecessor is retained and dependent parts become visible failures',async()=>{
  await append(notice,0,'sending');await db.query("UPDATE eats_order_notifications SET lease_until=now()-interval '1 minute' WHERE id=$1",[notice]);await append(id(903),1);
  assert.equal(await due(),true);assert.equal(await claim(),null);assert.equal(await due(),false);
  assert.equal((await db.query('SELECT state FROM eats_order_notifications WHERE id=$1',[notice])).rows[0].state,'uncertain');
 });
 await test('maintenance is bounded to one hundred unsent parts per claim',async()=>{
  await append(notice,0,'failed');for(let i=1;i<=101;i++)await append(id(1000+i),i);
  await claim();assert.equal((await db.query("SELECT count(*) n FROM eats_order_notifications WHERE state='queued'")).rows[0].n,1);assert.equal(await due(),true);
  await claim();assert.equal(await due(),false);assert.equal((await db.query('SELECT count(*) n FROM pedido_logs')).rows[0].n,101);
 });
 await test('exhausted queued attempts close once instead of waking a job that can never claim',async()=>{
  await append(notice,0,'queued','fixture',3);assert.equal(await due(),true);await claim();assert.equal(await due(),false);
  assert.equal((await db.query('SELECT error_code FROM eats_order_notifications')).rows[0].error_code,'attempt_limit_reached');
 });
 await test('full concurrency suppresses unnecessary wakeups until a lease expires',async()=>{
  for(let i=0;i<3;i++){await append(id(100+i),0,'working','group-'+i);}
  await db.exec("UPDATE eats_order_notifications SET lease_until=now()+interval '1 minute'");await append(notice,0,'queued','independent');
  assert.equal(await due(),false);assert.equal(await claim(),null);await db.exec("UPDATE eats_order_notifications SET lease_until=now()-interval '1 minute' WHERE state='working'");assert.equal(await due(),true);
 });
 await test('pickup PIN and final delivery contract stay unchanged by user instruction',async()=>{
  await seed(1);await addOrder();await db.query("UPDATE pedidos SET estado='en_camino',repartidor_id=$2,pickup_pin='1234',pin_seguridad='9876' WHERE id=$1",[order,id(1)]);
  await db.query("SELECT set_config('test.role','authenticated',false),set_config('test.uid',$1,false)",[id(1)]);
  assert.equal((await db.query("SELECT avanzar_pedido_repartidor($1,$2,'en_camino','entregado') result",[order,id(1)])).rows[0].result,true);
 });
 await db.close();console.log(count+' algorithm database checks passed; no production writes, no multi-session contention or PostGIS validation.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});

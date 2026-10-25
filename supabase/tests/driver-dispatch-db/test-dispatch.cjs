const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'../../..');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',C='00000000-0000-4000-8000-000000000003';
const order='00000000-0000-4000-8000-000000000011',rest='00000000-0000-4000-8000-000000000021';
async function main(){
 const db=new PGlite();let passed=0;
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE SCHEMA vault; CREATE SCHEMA net; CREATE SCHEMA cron; CREATE SCHEMA extensions;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('test.role',true)$$;
 CREATE TABLE public.admins(id uuid PRIMARY KEY);
 CREATE TABLE public.restaurantes(id uuid PRIMARY KEY,admin_id uuid);
 CREATE TABLE public.repartidores(user_id uuid PRIMARY KEY,activo boolean,bateria integer,total_ofertas integer NOT NULL DEFAULT 0,total_aceptaciones integer NOT NULL DEFAULT 0);
 CREATE TABLE public.pedidos(id uuid PRIMARY KEY,estado text NOT NULL,repartidor_id uuid REFERENCES repartidores(user_id),tipo_pedido text,metodo_pago text,estado_pago text,
 estado_cocina text,tiempo_preparacion_minutos integer,ofertas_rechazadas uuid[],pickup_pin varchar,lat_entrega float8,lng_entrega float8,pago_pendiente_restaurante boolean,
 restaurante_id uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),foto_entrega_url text,total numeric);
 CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
 INSERT INTO vault.decrypted_secrets VALUES('estrella_dispatch_token',repeat('x',32));
 CREATE FUNCTION net.http_post(url text,headers jsonb DEFAULT '{}',body jsonb DEFAULT '{}',timeout_milliseconds integer DEFAULT 1000) RETURNS bigint LANGUAGE sql AS $$SELECT 1::bigint$$;
 CREATE FUNCTION cron.schedule(jobname text,schedule text,command text) RETURNS bigint LANGUAGE sql AS $$SELECT 1::bigint$$;
 CREATE FUNCTION public.buscar_repartidores_cercanos(double precision,double precision,double precision,double precision,double precision) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN -- WHERE r.activo = true; 'ofrecido', 'asignado', 'preparando', 'en_camino'
 RETURN; END; $$;
 GRANT USAGE ON SCHEMA public,auth TO authenticated;
 GRANT SELECT,UPDATE ON public.pedidos TO authenticated;
 GRANT SELECT ON public.admins,public.restaurantes TO authenticated;
 GRANT EXECUTE ON FUNCTION auth.uid(),auth.role() TO authenticated;
 `);
 const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261006000001_driver_dispatch_reliability.sql'),'utf8');
 await db.exec(sql);
 const acceptanceMigration=fs.readFileSync(path.join(root,'supabase/migrations/20261017151707_eats_driver_acceptance_guards.sql'),'utf8');
 const acceptanceFunction=acceptanceMigration.match(/CREATE OR REPLACE FUNCTION public\.aceptar_pedido_atomico[\s\S]*?END; \$function\$/);
 if(!acceptanceFunction)throw Error('Reviewed acceptance function missing');
 await db.exec(acceptanceFunction[0]+';');
 await db.exec(`CREATE TRIGGER trg_validar_flujo_pedido_trigger BEFORE UPDATE ON pedidos FOR EACH ROW EXECUTE FUNCTION trg_validar_flujo_pedido();`);
 const role=async(uid='',r='service_role')=>{await db.query("SELECT set_config('test.uid',$1,false),set_config('test.role',$2,false)",[uid,r]);};
 const state=async()=>{const result=await db.query('SELECT * FROM pedidos WHERE id=$1',[order]);return result.rows[0];};
 const rpc=async(name,args)=>{const result=await db.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args);return result.rows[0].result;};
 const reset=async()=>{await db.exec('RESET ROLE; TRUNCATE pedidos,repartidores,restaurantes,admins CASCADE');await role();
 await db.query('INSERT INTO repartidores(user_id,activo,bateria) VALUES($1,true,80),($2,true,80),($3,true,80)',[A,B,C]);
 await db.query('INSERT INTO restaurantes VALUES($1,$2)',[rest,C]);
 await db.query("INSERT INTO pedidos(id,estado,tipo_pedido,metodo_pago,estado_pago,estado_cocina,tiempo_preparacion_minutos,restaurante_id) VALUES($1,'buscando_repartidor','domicilio','efectivo','pendiente','en_cocina',15,$2)",[order,rest]);};
 const test=async(name,fn)=>{await reset();await fn();passed++;console.log('PASS '+name);};
 await test('offer cannot overwrite accepted ownership',async()=>{assert.equal(await rpc('asignar_pedido_atomico',[order,A]),true);await role(A,'authenticated');assert.equal(await rpc('aceptar_pedido_atomico',[order,A]),true);await role();assert.equal(await rpc('asignar_pedido_atomico',[order,B]),false);assert.equal((await state()).repartidor_id,A);});
 await test('direct pool acceptance generates a pickup PIN and requires it to collect',async()=>{await role(A,'authenticated');assert.equal(await rpc('aceptar_pedido_atomico',[order,A]),true);assert.match((await state()).pickup_pin,/^[0-9]{4}$/);assert.equal(await rpc('avanzar_pedido_repartidor',[order,A,'asignado','recibido']),true);assert.equal(await rpc('avanzar_pedido_repartidor',[order,A,'recibido','en_camino']),false);assert.equal(await rpc('avanzar_pedido_repartidor',[order,A,'recibido','en_camino',null,null,null,(await state()).pickup_pin]),true);});
 await test('nonexistent order and unknown driver cannot produce fake success',async()=>{assert.equal(await rpc('asignar_pedido_atomico',[C,A]),false);assert.equal(await rpc('asignar_pedido_atomico',[order,order]),false);});
 await test('accept requires caller identity, unpaid order is blocked',async()=>{await role(B,'authenticated');assert.equal(await rpc('aceptar_pedido_atomico',[order,A]),false);await role();await db.query("UPDATE pedidos SET estado='pendiente_pago',metodo_pago='en_linea',estado_pago='pendiente' WHERE id=$1",[order]);await role(A,'authenticated');assert.equal(await rpc('aceptar_pedido_atomico',[order,A]),false);await role();assert.equal(await rpc('asignar_pedido_atomico',[order,A]),false);});
 await test('three received jobs enforce capacity for offer and direct accept',async()=>{for(let i=31;i<34;i++)await db.query("INSERT INTO pedidos(id,estado,repartidor_id,tipo_pedido,metodo_pago,estado_cocina,tiempo_preparacion_minutos) VALUES($1,'recibido',$2,'domicilio','efectivo','en_cocina',15)",['00000000-0000-4000-8000-0000000000'+i,A]);assert.equal(await rpc('asignar_pedido_atomico',[order,A]),false);await role(A,'authenticated');assert.equal(await rpc('aceptar_pedido_atomico',[order,A]),false);});
 await test('offer rejects disabled driver, occupied offer and rejected identity',async()=>{await db.query('UPDATE repartidores SET activo=false WHERE user_id=$1',[A]);assert.equal(await rpc('asignar_pedido_atomico',[order,A]),false);await db.query('UPDATE repartidores SET activo=true WHERE user_id=$1',[A]);await role(A,'authenticated');assert.equal(await rpc('rechazar_pedido_atomico',[order,A]),true);await role();assert.equal(await rpc('asignar_pedido_atomico',[order,A]),false);assert.equal(await rpc('asignar_pedido_atomico',[order,B]),true);});
 await test('expired offer cannot be accepted and old token cannot release new offer',async()=>{await rpc('asignar_pedido_atomico',[order,A]);const token=(await state()).oferta_token;await db.query("UPDATE pedidos SET oferta_vence_at=now()-interval '1 second' WHERE id=$1",[order]);await role(A,'authenticated');assert.equal(await rpc('aceptar_pedido_atomico',[order,A]),false);await role();assert.equal(await rpc('expirar_oferta_pedido',[order,A,token]),true);assert.equal(await rpc('asignar_pedido_atomico',[order,B]),true);assert.equal(await rpc('expirar_oferta_pedido',[order,A,token]),false);assert.equal((await state()).repartidor_id,B);});
 await test('timeout cannot release accepted order; accept metrics are idempotent',async()=>{await rpc('asignar_pedido_atomico',[order,A]);const token=(await state()).oferta_token;await role(A,'authenticated');assert.equal(await rpc('aceptar_pedido_atomico',[order,A]),true);assert.equal(await rpc('aceptar_pedido_atomico',[order,A]),true);await role();assert.equal(await rpc('expirar_oferta_pedido',[order,A,token]),false);assert.equal((await db.query('SELECT total_aceptaciones FROM repartidores WHERE user_id=$1',[A])).rows[0].total_aceptaciones,1);});
 await test('rejection persists exactly once; active jobs cannot be rejected',async()=>{await rpc('asignar_pedido_atomico',[order,A]);await role(A,'authenticated');assert.equal(await rpc('rechazar_pedido_atomico',[order,A]),true);assert.equal(await rpc('rechazar_pedido_atomico',[order,A]),true);assert.deepEqual((await state()).ofertas_rechazadas,[A]);await role();await rpc('asignar_pedido_atomico',[order,B]);await role(B,'authenticated');await rpc('aceptar_pedido_atomico',[order,B]);assert.equal(await rpc('rechazar_pedido_atomico',[order,B]),false);});
 await test('retry lease excludes duplicates and stops after six attempts',async()=>{for(let i=0;i<6;i++){assert.equal(await rpc('reclamar_despacho_pedido',[order]),true);assert.equal(await rpc('reclamar_despacho_pedido',[order]),false);await db.query("UPDATE pedidos SET despacho_reintentar_at=now()-interval '1 second' WHERE id=$1",[order]);}assert.equal(await rpc('reclamar_despacho_pedido',[order]),false);assert.equal((await state()).despacho_incidente,'requiere_asignacion_manual');});
 await test('state advance checks owner, sequence, idempotency and valid GPS',async()=>{await rpc('asignar_pedido_atomico',[order,A]);await role(A,'authenticated');await rpc('aceptar_pedido_atomico',[order,A]);assert.equal(await rpc('avanzar_pedido_repartidor',[order,A,'asignado','entregado']),false);await role(B,'authenticated');assert.equal(await rpc('avanzar_pedido_repartidor',[order,A,'asignado','recibido']),false);await role(A,'authenticated');assert.equal(await rpc('avanzar_pedido_repartidor',[order,A,'asignado','recibido']),true);assert.equal(await rpc('avanzar_pedido_repartidor',[order,A,'recibido','en_camino']),false);assert.equal(await rpc('avanzar_pedido_repartidor',[order,A,'recibido','en_camino',null,null,null,(await state()).pickup_pin]),true);assert.equal(await rpc('avanzar_pedido_repartidor',[order,A,'en_camino','entregado',99,-92]),false);assert.equal(await rpc('avanzar_pedido_repartidor',[order,A,'en_camino','entregado']),true);assert.equal(await rpc('avanzar_pedido_repartidor',[order,A,'en_camino','entregado']),true);});
 await test('direct authenticated write cannot assign or modify another driver',async()=>{await role(A,'authenticated');await db.exec('SET ROLE authenticated');await assert.rejects(db.query("UPDATE pedidos SET estado='asignado',repartidor_id=$1 WHERE id=$2",[A,order]));await assert.rejects(db.query('UPDATE pedidos SET total=1 WHERE id=$1',[order]));});
 await test('kitchen update retains accepted driver and state',async()=>{await rpc('asignar_pedido_atomico',[order,A]);await role(A,'authenticated');await rpc('aceptar_pedido_atomico',[order,A]);await role(C,'authenticated');await db.exec('SET ROLE authenticated');await db.query("UPDATE pedidos SET estado='buscando_repartidor',estado_cocina='listo_para_recoger' WHERE id=$1",[order]);assert.equal((await state()).estado,'asignado');assert.equal((await state()).repartidor_id,A);});
 await test('unauthorized driver cannot invoke server offer RPC',async()=>{await role(A,'authenticated');await db.exec('SET ROLE authenticated');await assert.rejects(rpc('asignar_pedido_atomico',[order,A]));});
 await test('direct acceptance cannot bypass the automatic minimum battery',async()=>{
  await db.query('UPDATE repartidores SET bateria=10 WHERE user_id=$1',[A]);await role(A,'authenticated');
  assert.equal(await rpc('aceptar_pedido_atomico',[order,A]),false);assert.equal((await state()).estado,'buscando_repartidor');
 });
 await test('an offer without its durable token and deadline fails closed',async()=>{
  await rpc('asignar_pedido_atomico',[order,A]);await db.query('UPDATE pedidos SET oferta_vence_at=NULL,oferta_token=NULL WHERE id=$1',[order]);await role(A,'authenticated');
  assert.equal(await rpc('aceptar_pedido_atomico',[order,A]),false);assert.equal((await state()).estado,'ofrecido');
 });
 await test('unknown battery cannot take a new order; fifteen percent can',async()=>{
  await db.query('UPDATE repartidores SET bateria=NULL WHERE user_id=$1',[A]);await role(A,'authenticated');
  assert.equal(await rpc('aceptar_pedido_atomico',[order,A]),false);await role();
  await db.query('UPDATE repartidores SET bateria=15 WHERE user_id=$1',[A]);await role(A,'authenticated');
  assert.equal(await rpc('aceptar_pedido_atomico',[order,A]),true);
 });
 await test('a battery drop never abandons an already accepted order or counts it twice',async()=>{
  await role(A,'authenticated');assert.equal(await rpc('aceptar_pedido_atomico',[order,A]),true);await role();
  await db.query('UPDATE repartidores SET bateria=1 WHERE user_id=$1',[A]);await role(A,'authenticated');
  assert.equal(await rpc('aceptar_pedido_atomico',[order,A]),true);assert.equal((await state()).repartidor_id,A);
  assert.equal((await db.query('SELECT total_aceptaciones FROM repartidores WHERE user_id=$1',[A])).rows[0].total_aceptaciones,1);
 });
 await db.close(); console.log(`PostgreSQL isolated tests: ${passed} passed. Single-connection engine; no multi-session contention or PostGIS coverage.`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

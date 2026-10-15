const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
 const db = new PGlite();
 const root = path.resolve(__dirname, '../..');
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('test.role',true)$$;
 CREATE FUNCTION public.loyalty_is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
 CREATE TABLE public.restaurantes(id uuid PRIMARY KEY, admin_id uuid, matriz_id uuid REFERENCES public.restaurantes,
 es_matriz boolean DEFAULT false,nombre text,nombre_sucursal text,telefono text,direccion text,
 lat double precision,lng double precision,activo boolean DEFAULT false,perfil_completo boolean NOT NULL DEFAULT false,foto_fachada_url text,logo_url text,
 descripcion_corta text,categorias text[],horarios jsonb,hora_apertura time,hora_cierre time,
 es_socio boolean,comision_porcentaje numeric,mp_access_token text,mp_refresh_token text,mp_user_id text,
 stripe_account_id text,envios_gratis_patrocinados numeric,puntos_otorgados_total numeric,clientes_afiliados_count numeric);
 CREATE TABLE public.menu_items(restaurante_id uuid,disponible boolean);
 CREATE TABLE public.menu_combos(restaurante_id uuid,disponible boolean);
 CREATE TABLE public.menu_promociones(restaurante_id uuid,activa boolean);
 INSERT INTO public.restaurantes(id,admin_id,nombre,telefono,perfil_completo) VALUES
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','Marca QA','0000000001',true),
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000012','Otra marca','0000000002',true);`);
 const guard=fs.readFileSync(path.join(root,'supabase/tests/fixtures/restaurant-identity-guard.sql'),'utf8');
 await db.exec(guard);
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261015000003_restaurant_branches.sql'),'utf8'));
 await db.exec(`SELECT set_config('test.role','authenticated',false),set_config('test.uid','00000000-0000-4000-8000-000000000011',false);`);
 const call=(parent,branch,name='Centro',phone='0000000003',lat=0,lng=0)=>db.query('SELECT public.restaurant_upsert_branch($1,$2,$3,$4,$5,$6,$7,$8) AS result',[parent,branch,name,phone,'Calle QA 123',lat,lng,false]);
 const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',c='00000000-0000-4000-8000-000000000003';
 let passed=0;
 async function test(name,fn){await fn();passed++;process.stdout.write('ok '+name+'\n');}
 await test('owner can create a branch without disabling the identity guard',async()=>{assert.equal((await call(a,c)).rows[0].result.id,c)});
 await test('same branch identifier makes retries idempotent',async()=>{await call(a,c);assert.equal((await db.query('SELECT count(*)::integer AS n FROM restaurantes WHERE matriz_id=$1',[a])).rows[0].n,1)});
 await test('new locations inherit the validated profile flag',async()=>{assert.equal((await db.query('SELECT perfil_completo FROM restaurantes WHERE id=$1',[c])).rows[0].perfil_completo,true)});
 await test('an incomplete principal cannot create an invisible branch',async()=>{
  await db.query('UPDATE restaurantes SET perfil_completo=false WHERE id=$1',[a]);
  await assert.rejects(call(a,'00000000-0000-4000-8000-000000000004','Sur','0000000004'),e=>e.code==='22023');
  await db.query('UPDATE restaurantes SET perfil_completo=true WHERE id=$1',[a]);
 });
 await test('a location without a menu cannot be activated',async()=>{await assert.rejects(db.query('SELECT restaurant_upsert_branch($1,$2,$3,$4,$5,$6,$7,true)',[a,c,'Centro','0000000003','Calle QA 123',0,0]),e=>e.code==='22023')});
 await test('new branch keeps the owner and brand',async()=>{const r=(await db.query('SELECT admin_id,nombre,lat,lng,activo FROM restaurantes WHERE id=$1',[c])).rows[0];assert.equal(r.admin_id,'00000000-0000-4000-8000-000000000011');assert.equal(r.nombre,'Marca QA');assert.equal(r.lat,0);assert.equal(r.lng,0);assert.equal(r.activo,false)});
 await test('another owner cannot create a branch',async()=>{await assert.rejects(call(b,'00000000-0000-4000-8000-000000000004'),e=>e.code==='42501')});
 await test('a branch cannot become a parent',async()=>{await assert.rejects(call(c,'00000000-0000-4000-8000-000000000004'),e=>e.code==='22023')});
 await test('coordinates and phone are validated in PostgreSQL',async()=>{await assert.rejects(call(a,c,'Centro','12'),e=>e.code==='22023');await assert.rejects(call(a,c,'Centro','0000000003',91,0),e=>e.code==='22023');await assert.rejects(call(a,c,'Centro','0000000003',NaN,0),e=>e.code==='22023')});
 await test('a root or another brand cannot be reparented',async()=>{await assert.rejects(call(a,b),e=>e.code==='42501')});
 await test('duplicate location labels fail without adding another row',async()=>{await assert.rejects(call(a,'00000000-0000-4000-8000-000000000004','centro','0000000004'),e=>e.code==='23505')});
 await test('branch login phones cannot duplicate a different brand without relying on a nonexistent live constraint',async()=>{await assert.rejects(call(a,c,'Norte','0000000002'),e=>e.code==='23505')});
 await test('owner can edit and pause a branch without deleting it',async()=>{await call(a,c,'Norte');assert.equal((await db.query('SELECT nombre_sucursal FROM restaurantes WHERE id=$1',[c])).rows[0].nombre_sucursal,'Norte')});
 await test('anonymous callers have no execute privilege',async()=>{assert.equal((await db.query("SELECT has_function_privilege('anon','public.restaurant_upsert_branch(uuid,uuid,text,text,text,double precision,double precision,boolean)','EXECUTE') AS allowed")).rows[0].allowed,false);await db.exec("SELECT set_config('test.role','anon',false)");await assert.rejects(call(a,c),e=>e.code==='42501')});
 await db.exec(`CREATE ROLE service_role; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb);
 CREATE TABLE public.menu_categorias(restaurante_id uuid);
 CREATE TABLE public.pedidos(id uuid PRIMARY KEY,restaurante_id uuid);
 SELECT set_config('test.role','service_role',false);
 GRANT USAGE ON SCHEMA public,auth TO authenticated;
 GRANT SELECT,INSERT,UPDATE,DELETE ON menu_categorias,menu_items,menu_combos,menu_promociones,pedidos TO authenticated;
 ALTER TABLE menu_categorias ENABLE ROW LEVEL SECURITY; ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
 ALTER TABLE menu_combos ENABLE ROW LEVEL SECURITY; ALTER TABLE menu_promociones ENABLE ROW LEVEL SECURITY;
 ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
 INSERT INTO menu_items VALUES ('${c}',true),('${b}',true);
 INSERT INTO pedidos VALUES ('00000000-0000-4000-8000-000000000051','${c}'),('00000000-0000-4000-8000-000000000052','${b}');`);
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261015000004_branch_login.sql'),'utf8'));
 const owner='00000000-0000-4000-8000-000000000011';
 const actor=async(id,role='authenticated')=>db.query("SELECT set_config('test.uid',$1,false),set_config('test.role',$2,false)",[id,role]);
 const begin=()=>db.query('SELECT begin_branch_access($1,$2,false) AS r',[a,c]);
 await actor(owner);
 let lease;
 await test('only root owner can reserve an independent branch identity',async()=>{lease=(await begin()).rows[0].r;assert.equal(lease.decision,'reserved');assert.equal(lease.phone,'0000000003')});
 await test('concurrent access requests are fenced by a durable lease',async()=>{await assert.rejects(begin(),e=>e.code==='PT409')});
 await test('authenticated caller cannot complete the provider binding',async()=>{await assert.rejects(db.query('SELECT complete_branch_access($1,$2)',[c,lease.lease_token]),e=>e.code==='42501')});
 await test('provider identity must be confirmed before branch ownership changes',async()=>{await actor(owner,'service_role');await assert.rejects(db.query('SELECT complete_branch_access($1,$2)',[c,lease.lease_token]),e=>e.code==='PT409')});
 await test('mismatched provider metadata cannot bind another identity',async()=>{
  await db.query('INSERT INTO auth.users VALUES($1,$2,$3)',[lease.auth_user_id,'aliado_0000000003@app-estrella.shop',JSON.stringify({restaurant_branch_id:b})]);
  await assert.rejects(db.query('SELECT complete_branch_access($1,$2)',[c,lease.lease_token]),e=>e.code==='PT409');
  await db.query('UPDATE auth.users SET raw_app_meta_data=$2 WHERE id=$1',[lease.auth_user_id,JSON.stringify({restaurant_branch_id:c})]);
 });
 await test('verified provider account binds only the reserved branch',async()=>{
  assert.equal((await db.query('SELECT complete_branch_access($1,$2) AS r',[c,lease.lease_token])).rows[0].r.ok,true);
  const branch=(await db.query('SELECT admin_id,matriz_id,nombre FROM restaurantes WHERE id=$1',[c])).rows[0];assert.equal(branch.admin_id,lease.auth_user_id);assert.equal(branch.matriz_id,a);assert.equal(branch.nombre,'Marca QA');
 });
 await test('linked access check is idempotent and does not rotate the password',async()=>{await actor(owner);assert.equal((await begin()).rows[0].r.decision,'exists')});
 await test('a cleared lease cannot be completed with a null token',async()=>{await actor(owner,'service_role');await assert.rejects(db.query('SELECT complete_branch_access($1,NULL)',[c]),e=>e.code==='PT409')});
 await test('branch manager cannot issue sibling or parent credentials',async()=>{await actor(lease.auth_user_id);await assert.rejects(begin(),e=>e.code==='42501')});
 await test('root still manages branches after their identities become independent',async()=>{await actor(owner);assert.equal((await db.query('SELECT loyalty_manages_restaurant($1) AS allowed',[c])).rows[0].allowed,true);await call(a,c,'Norte')});
 await test('branch actor cannot manage another brand or its parent',async()=>{await actor(lease.auth_user_id);assert.equal((await db.query('SELECT loyalty_manages_restaurant($1) AS allowed',[a])).rows[0].allowed,false);assert.equal((await db.query('SELECT loyalty_manages_restaurant($1) AS allowed',[b])).rows[0].allowed,false)});
 await test('phone is stable once it identifies a branch login',async()=>{await actor(owner);await assert.rejects(call(a,c,'Norte','0000000009'),e=>e.code==='22023')});
 await test('direct profile edits cannot duplicate another branch phone',async()=>{await assert.rejects(db.query('UPDATE restaurantes SET telefono=$2 WHERE id=$1',[b,'+52 000 000 0003']),e=>e.code==='23505')});
 await test('branch keeps shared brand and root rename synchronizes it',async()=>{
  await assert.rejects(db.query('UPDATE restaurantes SET nombre=$2 WHERE id=$1',[c,'Unauthorized brand']),e=>e.code==='22023');
  await db.query('UPDATE restaurantes SET nombre=$2 WHERE id=$1',[a,'Marca nueva QA']);assert.equal((await db.query('SELECT nombre FROM restaurantes WHERE id=$1',[c])).rows[0].nombre,'Marca nueva QA');
 });
 await test('reservations and provider finalization are inaccessible to authenticated SQL role',async()=>{
  assert.equal((await db.query("SELECT has_table_privilege('authenticated','restaurant_branch_access','SELECT') AS allowed")).rows[0].allowed,false);
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','complete_branch_access(uuid,uuid)','EXECUTE') AS allowed")).rows[0].allowed,false);
 });
 await test('real RLS isolates kitchen orders and catalog writes by branch identity',async()=>{
  // Production still has a legacy public tracking policy. Branch isolation must
  // remain effective even in the presence of that permissive policy.
  await db.exec('CREATE POLICY legacy_public_tracking ON pedidos FOR SELECT TO authenticated USING(true)');
  await actor(lease.auth_user_id);await db.exec('SET ROLE authenticated');
  try {
   assert.equal((await db.query('SELECT count(*)::integer AS n FROM pedidos')).rows[0].n,1);
   assert.equal((await db.query('UPDATE menu_items SET disponible=false WHERE restaurante_id=$1 RETURNING *',[b])).rows.length,0);
   assert.equal((await db.query('UPDATE menu_items SET disponible=false WHERE restaurante_id=$1 RETURNING *',[c])).rows.length,1);
  } finally {await db.exec('RESET ROLE')}
  await actor(owner);await db.exec('SET ROLE authenticated');
  try {assert.equal((await db.query('UPDATE menu_items SET disponible=true WHERE restaurante_id=$1 RETURNING *',[c])).rows.length,1)}finally{await db.exec('RESET ROLE')}
 });
 await test('rotation cooldown and stale completion prevent overlapping password changes',async()=>{
  await actor(owner);await assert.rejects(db.query('SELECT begin_branch_access($1,$2,true)',[a,c]),e=>e.code==='PT429');
  await actor(owner,'service_role');await db.query("UPDATE restaurant_branch_access SET last_started_at=now()-interval '2 minutes' WHERE branch_id=$1",[c]);await actor(owner);
  const next=(await db.query('SELECT begin_branch_access($1,$2,true) AS r',[a,c])).rows[0].r;assert.equal(next.auth_user_id,lease.auth_user_id);assert.notEqual(next.lease_token,lease.lease_token);
  await actor(owner,'service_role');await assert.rejects(db.query('SELECT complete_branch_access($1,$2)',[c,lease.lease_token]),e=>e.code==='PT409');
  await db.query('SELECT release_branch_access($1,$2)',[c,lease.lease_token]);assert.equal((await db.query('SELECT lease_token FROM restaurant_branch_access WHERE branch_id=$1',[c])).rows[0].lease_token,next.lease_token);
 });
 console.log(passed+' branch database checks passed (isolated PostgreSQL).');
 await db.close();
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

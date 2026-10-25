const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const rest='00000000-0000-4000-8000-000000000003',orderId='00000000-0000-4000-8000-000000000004';
(async()=>{
 const db=new PGlite();let count=0;
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('test.role',true)$$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
 CREATE TABLE admins(id uuid PRIMARY KEY);
 CREATE TABLE restaurantes(id uuid PRIMARY KEY,admin_id uuid,matriz_id uuid);
 CREATE TABLE pedidos(id uuid PRIMARY KEY,restaurante_id uuid,tipo_pedido text,estado text,estado_cocina text,tiempo_preparacion_minutos integer,metodo_pago text,estado_pago text);
 `);
 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../migrations/20261006000003_kitchen_order_transitions.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../migrations/20261006000004_pickup_kitchen_compatibility.sql'),'utf8'));
 await db.exec('CREATE TRIGGER kitchen BEFORE UPDATE ON pedidos FOR EACH ROW EXECUTE FUNCTION trg_update_estado_pedido()');
 const reset=async()=>{await db.exec('TRUNCATE pedidos,restaurantes,admins');await db.query("SELECT set_config('test.role','authenticated',false),set_config('test.uid',$1,false)",[owner]);
 await db.query('INSERT INTO restaurantes VALUES($1,$2,null)',[rest,owner]);await db.query("INSERT INTO pedidos VALUES($1,$2,'domicilio','pendiente','pendiente',null,'efectivo','pendiente')",[orderId,rest]);};
 const move=async(next,expected,minutes=null)=>(await db.query('SELECT cambiar_estado_cocina($1,$2,$3,$4) AS result',[orderId,next,expected,minutes])).rows[0].result;
 const test=async(name,run)=>{await reset();await run();count++;console.log('PASS '+name);};
 await test('home delivery enters dispatch only when kitchen accepts',async()=>{const r=await move('en_cocina','pendiente',15);assert.equal(r.pedido.estado,'buscando_repartidor');assert.equal(r.pedido.tiempo_preparacion_minutos,15);});
 await test('pickup never enters dispatch and completes only after ready',async()=>{
 await db.exec("UPDATE pedidos SET tipo_pedido='tienda'");assert.equal((await move('en_cocina','pendiente',15)).pedido.estado,'pendiente');
 await assert.rejects(()=>move('entregado','en_cocina'));await move('listo_para_recoger','en_cocina');
 const first=await move('entregado','listo_para_recoger');assert.equal(first.pedido.estado,'entregado');assert.equal(first.pedido.estado_pago,'pagado');
 assert.equal((await move('entregado','listo_para_recoger')).replayed,true);
 });
 await test('driver ownership lifecycle is never rewound by kitchen',async()=>{
 for(const state of ['ofrecido','asignado','recibido','en_camino']){await reset();await db.query('UPDATE pedidos SET estado=$1',[state]);assert.equal((await move('en_cocina','pendiente',15)).pedido.estado,state);}
 });
 await test('an older kitchen tab can accept pickup without creating a dispatch',async()=>{
 await db.exec("UPDATE pedidos SET tipo_pedido='tienda'; UPDATE pedidos SET estado_cocina='en_cocina',estado='buscando_repartidor',tiempo_preparacion_minutos=15;");
 const row=(await db.query('SELECT estado,estado_cocina FROM pedidos')).rows[0];assert.equal(row.estado,'pendiente');assert.equal(row.estado_cocina,'en_cocina');
 });
 await test('kitchen cannot complete a home delivery',async()=>{await move('en_cocina','pendiente',15);await move('listo_para_recoger','en_cocina');await assert.rejects(()=>move('entregado','listo_para_recoger'));});
 await test('unauthorized restaurant, anonymous and missing session are denied',async()=>{
 await db.query("SELECT set_config('test.uid',$1,false)",[other]);await assert.rejects(()=>move('en_cocina','pendiente',15));
 await db.exec("SELECT set_config('test.role','anon',false)");await assert.rejects(()=>move('en_cocina','pendiente',15));
 await db.exec("SELECT set_config('test.role','authenticated',false),set_config('test.uid','',false)");await assert.rejects(()=>move('en_cocina','pendiente',15));
 });
 await test('linked branch uses its matrix owner; platform admin uses stored identity',async()=>{
 await db.query('INSERT INTO restaurantes VALUES($1,$2,null)',[other,owner]);await db.query('UPDATE restaurantes SET admin_id=null,matriz_id=$1 WHERE id=$2',[other,rest]);assert.ok((await move('en_cocina','pendiente',15)).pedido);
 await reset();await db.query('INSERT INTO admins VALUES($1)',[other]);await db.query("SELECT set_config('test.uid',$1,false)",[other]);assert.ok((await move('en_cocina','pendiente',15)).pedido);
 });
 await test('retries do not mutate preparation time or overwrite a later stage',async()=>{
 await move('en_cocina','pendiente',15);assert.equal((await move('en_cocina','pendiente',15)).replayed,true);
 await assert.rejects(()=>move('en_cocina','pendiente',20));await move('listo_para_recoger','en_cocina');await assert.rejects(()=>move('en_cocina','pendiente',15));
 });
 await test('cancelled, unpaid online and invalid preparation time fail closed',async()=>{
 for(const minutes of [null,0,-1,181])await assert.rejects(()=>move('en_cocina','pendiente',minutes));
 await db.exec("UPDATE pedidos SET metodo_pago='en_linea'");await assert.rejects(()=>move('en_cocina','pendiente',15));
 await db.exec("UPDATE pedidos SET metodo_pago='efectivo',estado='cancelado'");await assert.rejects(()=>move('en_cocina','pendiente',15));
 });
 await db.close();console.log(count+' kitchen database tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});

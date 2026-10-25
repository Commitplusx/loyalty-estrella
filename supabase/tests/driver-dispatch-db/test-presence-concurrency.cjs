const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('pg');
const file=p=>fs.readFileSync(path.resolve(__dirname,p),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const order=id(900),device=id(800),session=id(700),token=id(600);
const configPath=process.env.DISPATCH_TEST_CONNECTION;
if(!configPath)throw new Error('Set DISPATCH_TEST_CONNECTION to the private loopback test cluster configuration');
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
if(config.host!=='127.0.0.1'||config.database!=='postgres'||!Number.isInteger(config.port))throw new Error('Refusing a non-loopback test target');
const name='dispatch_test_'+Date.now();
if(!/^dispatch_test_[0-9]+$/.test(name))throw new Error('Invalid isolated test name');
const admin=new Client(config),clients=[];let db,count=0,adminConnected=false;
const role=(client,name='service_role',actor='')=>client.query("SELECT set_config('test.role',$1,false),set_config('test.uid',$2,false)",[name,actor]);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(){const client=new Client({...config,database:name,statement_timeout:4000,query_timeout:5000});await client.connect();clients.push(client);await role(client);return client;}
async function waiting(pid){for(let i=0;i<100;i++){const r=await db.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",[pid]);if(r.rows[0]?.wait_event_type==='Lock')return;await delay(10);}throw new Error('Second session did not reach the expected database lock');}
async function reset(){await db.query('TRUNCATE eats_dispatch_contexts,eats_driver_presence,eats_dispatch_kitchen_clock,pedidos,repartidores,restaurantes CASCADE');await db.query("UPDATE eats_dispatch_policy SET mode='active',strict_presence=false");await role(db);}
async function seed(n=2){for(let i=1;i<=n;i++){
 await db.query("INSERT INTO repartidores(id,user_id,nombre,activo,bateria,lat,lng,current_device_id) VALUES($1,$1,'Conductor sintético',true,80,16,$2,$3)",[id(i),-92+i/10000,device]);
 await role(db,'authenticated',id(i));await db.query('UPDATE repartidores SET lat=lat WHERE id=$1',[id(i)]);
}await role(db);}
const add=(key=order,driver=null,state='buscando_repartidor')=>db.query("INSERT INTO pedidos(id,estado,repartidor_id,tipo_pedido,metodo_pago,estado_pago,estado_cocina,tiempo_preparacion_minutos,restaurante_lat,restaurante_lng,despacho_intentos,oferta_token,oferta_vence_at) VALUES($1,$2,$3,'domicilio','efectivo','pendiente','en_cocina',15,16,-92,1,$4,$5)",[key,state,driver,state==='ofrecido'?token:null,state==='ofrecido'?new Date(Date.now()+10000):null]);
async function context(key=order){const c=(await db.query('SELECT eats_dispatch_context($1) result',[key])).rows[0].result;await db.query("SELECT eats_rank_dispatch($1,'[]','geographic','provider_error')",[c.context_id]);return c.context_id;}
const offer=(client,key,driver,contextId)=>client.query('SELECT eats_offer_ranked($1,$2,$3) result',[key,driver,contextId]);
async function race(a,b,first,second){await a.query('BEGIN');try{
 const firstResult=await first();const pid=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 const pending=second();await waiting(pid);await a.query('COMMIT');return [firstResult.rows[0].result,(await pending).rows[0].result];
}catch(error){await a.query('ROLLBACK');throw error;}}
async function test(label,run){await reset();await run();count++;console.log('PASS '+label);}
(async()=>{
 await admin.connect();
 adminConnected=true;
 for(const role of ['anon','authenticated','service_role'])if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)await admin.query('CREATE ROLE '+role);
 await admin.query('CREATE DATABASE '+name);
 db=await connect();
 await db.query(file('../fixtures/eats-dispatch-v2-schema.sql').replace(/CREATE ROLE (anon|authenticated|service_role);/g,''));
 await db.query(file('../fixtures/eats-algorithms-baseline.sql'));
 await db.query(file('../fixtures/eats-offer-expiration-baseline.sql'));
 await db.query(file('../../migrations/20261025143743_eats_dispatch_notification_algorithms.sql'));
 await db.query(file('../../migrations/20261025150138_eats_dispatch_presence_eta.sql'));
 const a=await connect(),b=await connect();
 await test('two orders racing for one driver produce exactly one live offer',async()=>{
  await seed(1);await add();await add(id(901));const c1=await context(),c2=await context(id(901));
  assert.deepEqual(await race(a,b,()=>offer(a,order,id(1),c1),()=>offer(b,id(901),id(1),c2)),[true,false]);
  assert.equal((await db.query("SELECT count(*)::int count FROM pedidos WHERE estado='ofrecido'")).rows[0].count,1);
 });
 await test('two drivers racing for one order cannot overwrite the first owner',async()=>{
  await seed();await add();const c=await context();
  assert.deepEqual(await race(a,b,()=>offer(a,order,id(1),c),()=>offer(b,order,id(2),c)),[true,false]);
  assert.equal((await db.query('SELECT repartidor_id FROM pedidos WHERE id=$1',[order])).rows[0].repartidor_id,id(1));
 });
 await test('an acceptance holding the order lock defeats a later expired timeout',async()=>{
  await seed(1);await add(order,id(1),'ofrecido');await db.query("UPDATE pedidos SET oferta_vence_at=clock_timestamp()+interval '200 milliseconds'");await role(a,'authenticated',id(1));
  const result=await race(a,b,()=>a.query('SELECT aceptar_pedido_atomico($1,$2) result',[order,id(1)]),async()=>{
   // Expiration predicate is evaluated while the accepted row is still uncommitted.
   await delay(300);
   await b.query('SET test.role=\'service_role\'');
   return b.query('SELECT expirar_oferta_pedido($1,$2,$3) result',[order,id(1),token]);
  });
  assert.deepEqual(result,[true,false]);await role(a);
 });
 await test('expiration winning the row lock makes the old recipient acceptance fail',async()=>{
  await seed(1);await add(order,id(1),'ofrecido');await db.query("UPDATE pedidos SET oferta_vence_at=now()-interval '1 second'");
  await role(b,'authenticated',id(1));
  assert.deepEqual(await race(a,b,()=>a.query('SELECT expirar_oferta_pedido($1,$2,$3) result',[order,id(1),token]),()=>b.query('SELECT aceptar_pedido_atomico($1,$2) result',[order,id(1)])),[true,false]);
  await role(b);
 });
 await test('Offline serialized before a heartbeat never reactivates or refreshes that driver',async()=>{
  await seed(1);await role(db,'authenticated',id(1));await db.query('SELECT driver_presence_begin($1,$2,$3)',[id(1),device,session]);await role(db);
  await role(b,'authenticated',id(1));
  await a.query('BEGIN');await a.query('UPDATE repartidores SET activo=false WHERE id=$1',[id(1)]);
  const pid=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const pending=b.query('SELECT driver_presence_report($1,$2,1,clock_timestamp(),16,-92,clock_timestamp(),10,80) result',[id(1),session]);
  await waiting(pid);await a.query('COMMIT');assert.equal((await pending).rows[0].result.reason,'offline');await role(b);
  assert.equal((await db.query('SELECT sequence::int sequence FROM eats_driver_presence')).rows[0].sequence,0);
 });
 await test('database grants block real client roles from private routing snapshots',async()=>{
  await b.query('SET ROLE authenticated');try{await assert.rejects(b.query('SELECT * FROM public.eats_dispatch_contexts'),error=>error.code==='42501');}finally{await b.query('RESET ROLE');}
 });
 console.log(count+' multi-session PostgreSQL checks passed on an isolated loopback database; geometry is synthetic.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
 await Promise.allSettled(clients.map(client=>client.end()));
 if(adminConnected){try{await admin.query('DROP DATABASE IF EXISTS '+name);}finally{await admin.end();}}
});

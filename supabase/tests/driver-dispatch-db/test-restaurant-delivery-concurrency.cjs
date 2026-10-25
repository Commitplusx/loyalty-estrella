const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('pg');
const root=path.resolve(__dirname,'../../..'),file=p=>fs.readFileSync(path.join(root,p),'utf8');
const configPath=process.env.DISPATCH_TEST_CONNECTION;if(!configPath)throw new Error('Private loopback connection configuration required');
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
if(config.host!=='127.0.0.1'||config.database!=='postgres'||!Number.isInteger(config.port))throw new Error('Refusing a non-loopback test target');
const name='delivery_request_test_'+Date.now();if(!/^delivery_request_test_[0-9]+$/.test(name))throw new Error('Invalid isolated database name');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const matrix=id(1),branch=id(2),owner=id(11),operator=id(12),foreign=id(13),quote=id(100),request=id(200);
const point={lat:16.25,lng:-92.13,address:'Destino sintético'},input={quoteId:quote,name:'Prueba aislada',phone:'0000000000',description:'NO PREPARAR — AISLADO',references:'',preparationMinutes:15};
const admin=new Client(config),clients=[];let connected=false,db,count=0;
async function connect(){const c=new Client({...config,database:name,statement_timeout:5000,query_timeout:6000});await c.connect();clients.push(c);return c;}
const role=(c,actor='',name='service_role')=>c.query("SELECT set_config('test.uid',$1,false),set_config('test.role',$2,false)",[actor,name]);
const prepare=(c,key=quote)=>c.query('SELECT eats_restaurant_delivery_prepare($1,$2,$3,$4,50,200,\'50 pesos\',null) result',[operator,key,branch,point]);
const create=(c,key=request)=>c.query('SELECT eats_restaurant_delivery_create($1,$2) result',[key,input]);
async function waiting(c){const pid=(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid;return pid;}
async function waitLock(pid){for(let i=0;i<100;i++){if((await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0]?.wait_event_type==='Lock')return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Expected database lock was not reached');}
async function reset(){await db.query('TRUNCATE eats_restaurant_delivery_requests,eats_restaurant_delivery_quotes,eats_restaurant_delivery_access,test_notices,dispatch_wakes,repartidores,pedidos,restaurantes CASCADE');
 await db.query("INSERT INTO restaurantes(id,nombre,nombre_sucursal,matriz_id,admin_id,activo,lat,lng,direccion) VALUES($1,'Robin sintético','Matriz',NULL,$3,true,16,-92,'Origen'),($2,'Robin sintético','Sucursal',$1,$4,true,16.1,-92.1,'Sucursal')",[matrix,branch,owner,operator]);await db.query('INSERT INTO eats_restaurant_delivery_access(matriz_id,enabled) VALUES($1,true)',[matrix]);await role(db);await prepare(db);
}
async function test(label,run){await reset();await run();count++;console.log('PASS '+label);}
async function race(a,b,first,second,commit=true){await a.query('BEGIN');try{
 const initial=await first();const pid=await waiting(b);const pending=second().then(value=>({ok:true,value}),error=>({ok:false,error}));await waitLock(pid);await a.query(commit?'COMMIT':'ROLLBACK');return{initial,next:await pending};
}catch(error){await a.query('ROLLBACK');throw error;}}
(async()=>{
 await admin.connect();connected=true;
 for(const role of['anon','authenticated','service_role'])if(!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)await admin.query('CREATE ROLE '+role);
 await admin.query('CREATE DATABASE '+name);db=await connect();
 await db.query(file('supabase/tests/fixtures/eats-restaurant-delivery-schema.sql').replace(/CREATE ROLE (anon|authenticated|service_role);/g,''));
 const admission=file('supabase/migrations/20261006000001_driver_dispatch_reliability.sql').match(/CREATE OR REPLACE FUNCTION public\.pedido_admite_repartidor[\s\S]*?\$\$;/);if(!admission)throw new Error('Reviewed admission missing');await db.query(admission[0]);
 await db.query(file('supabase/migrations/20261025202620_eats_restaurant_delivery_requests.sql'));
 const a=await connect(),b=await connect();
 await test('two real sessions replay one request as one order and one dispatch wake',async()=>{
  await role(a,operator,'authenticated');await role(b,operator,'authenticated');const r=await race(a,b,()=>create(a),()=>create(b));assert.equal(r.next.ok,true);assert.deepEqual(r.initial.rows[0].result,r.next.value.rows[0].result);
  assert.equal((await db.query('SELECT count(*)::int n FROM pedidos')).rows[0].n,1);assert.equal((await db.query('SELECT count(*)::int n FROM dispatch_wakes')).rows[0].n,1);
 });
 await test('one quote racing through different request keys cannot create two services',async()=>{
  await role(a,operator,'authenticated');await role(b,operator,'authenticated');const r=await race(a,b,()=>create(a),()=>create(b,id(201)));assert.equal(r.next.ok,false);assert.equal(r.next.error.code,'PT409');assert.equal((await db.query('SELECT count(*)::int n FROM pedidos')).rows[0].n,1);
 });
 await test('rollback before commit lets the waiting same-key retry create one complete service',async()=>{
  await role(a,operator,'authenticated');await role(b,operator,'authenticated');const r=await race(a,b,()=>create(a),()=>create(b),false);assert.equal(r.next.ok,true);assert.equal((await db.query('SELECT count(*)::int n FROM pedidos')).rows[0].n,1);assert.equal((await db.query('SELECT count(*)::int n FROM dispatch_wakes')).rows[0].n,1);
 });
 for(const[label,sql,args]of[
  ['branch pause','UPDATE restaurantes SET activo=false WHERE id=$1',[branch]],
  ['branch ownership change','UPDATE restaurantes SET admin_id=$1 WHERE id=$2',[foreign,branch]],
  ['brand entitlement disabled','UPDATE eats_restaurant_delivery_access SET enabled=false WHERE matriz_id=$1',[matrix]],
 ])await test(label+' winning the lock blocks a stale authorization decision',async()=>{
  await role(a);await role(b,operator,'authenticated');const r=await race(a,b,()=>a.query(sql,args),()=>create(b));assert.equal(r.next.ok,false);assert.equal(r.next.error.code,'42501');assert.equal((await db.query('SELECT count(*)::int n FROM pedidos')).rows[0].n,0);
 });
 await test('concurrent quote retries preserve one manual financial snapshot',async()=>{
  await role(a);await role(b);const r=await race(a,b,()=>prepare(a,id(101)),()=>prepare(b,id(101)));assert.equal(r.next.ok,true);assert.deepEqual(r.initial.rows[0].result,r.next.value.rows[0].result);assert.equal((await db.query('SELECT count(*)::int n FROM eats_restaurant_delivery_quotes WHERE id=$1',[id(101)])).rows[0].n,1);
 });
 console.log(count+' real multi-session restaurant delivery checks passed on an isolated loopback database.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
 await Promise.allSettled(clients.map(c=>c.end()));if(connected){try{await admin.query('DROP DATABASE IF EXISTS '+name);}finally{await admin.end();}}
});

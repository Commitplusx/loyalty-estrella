import { assert, assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert'
import { BranchAccessError, generateBranchPassword, parseBranchAccessRequest, provisionBranchAccess } from '../functions/_shared/branch-access.ts'
import type { BranchAccessStore, BranchReservation, BranchAuthAccount, BranchAccessRequest } from '../functions/_shared/branch-access.ts'
import { handleBranchAccess } from '../functions/_shared/branch-access-gateway.ts'

const parentId='00000000-0000-4000-8000-000000000001', branchId='00000000-0000-4000-8000-000000000002', authId='00000000-0000-4000-8000-000000000003', token='00000000-0000-4000-8000-000000000004'
const request: BranchAccessRequest={parentId,branchId,rotate:false}
class Store implements BranchAccessStore {
  calls: string[]=[]
  reservation: BranchReservation={decision:'reserved',phone:'0000000001',authId,token}
  existing: BranchAuthAccount|null=null
  fail=''
  private step(name: string) { this.calls.push(name); if(this.fail===name) throw new BranchAccessError('Controlled failure',409) }
  async begin(_request: BranchAccessRequest) { this.step('begin');return this.reservation }
  async account(_authId: string) { this.step('account');return this.existing }
  async create(_authId: string,_email: string,_branchId: string,password: string) { assert(password.length>=30);this.step('create') }
  async password(_authId: string,password: string) { assert(password.length>=30);this.step('password') }
  async complete(_branchId: string,_token: string) { this.step('complete') }
  async release(_branchId: string,_token: string) { this.step('release') }
}
Deno.test('untrusted request cannot set phone, password or owner',()=>{
  assertEquals(parseBranchAccessRequest({parent_id:parentId,branch_id:branchId,action:'create',phone:'9999999999',password:'x',owner:'x'}),request)
  for(const body of [null,[],{}, {parent_id:parentId,branch_id:parentId,action:'create'}, {parent_id:parentId,branch_id:branchId,action:'delete'}]) assertThrows(()=>parseBranchAccessRequest(body),BranchAccessError)
})
Deno.test('server passwords have random entropy and required classes',()=>{
  const passwords=new Set(Array.from({length:100},()=>generateBranchPassword()))
  assertEquals(passwords.size,100)
  for(const password of passwords) {assertEquals(password.length,32);assert(/[A-Z]/.test(password));assert(/[a-z]/.test(password));assert(/[0-9]/.test(password));assert(password.includes('!'))}
})
Deno.test('successful create returns credentials only after durable identity binding',async()=>{
  const store=new Store(), result=await provisionBranchAccess(store,request)
  assertEquals(result.status,'generated');assertEquals(store.calls,['begin','account','create','complete'])
})
Deno.test('linked account check does not read or reset a password',async()=>{
  const store=new Store();store.reservation={decision:'exists',phone:'0000000001'}
  assertEquals(await provisionBranchAccess(store,request),{status:'exists',phone:'0000000001'});assertEquals(store.calls,['begin'])
})
Deno.test('lost create response recovers the link without replacing credentials',async()=>{
  const store=new Store();store.existing={id:authId,email:'aliado_0000000001@app-estrella.shop',branchId}
  assertEquals((await provisionBranchAccess(store,request)).status,'exists');assertEquals(store.calls,['begin','account','complete'])
})
Deno.test('explicit rotation updates only the reserved verified identity',async()=>{
  const store=new Store();store.existing={id:authId,email:'aliado_0000000001@app-estrella.shop',branchId}
  assertEquals((await provisionBranchAccess(store,{...request,rotate:true})).status,'generated');assertEquals(store.calls,['begin','account','password','complete'])
})
Deno.test('another identity is never adopted or reset',async()=>{
  const store=new Store();store.existing={id:authId,email:'other@example.invalid',branchId}
  await assertRejects(()=>provisionBranchAccess(store,{...request,rotate:true}),BranchAccessError)
  assertEquals(store.calls,['begin','account','release'])
})
Deno.test('provider or linking failure never returns fabricated success',async()=>{
  for(const fail of ['account','create','complete']) {const store=new Store();store.fail=fail;await assertRejects(()=>provisionBranchAccess(store,request),BranchAccessError);assertEquals(store.calls.at(-1),'release')}
  const store=new Store();store.fail='begin';await assertRejects(()=>provisionBranchAccess(store,request));assertEquals(store.calls,['begin'])
})
const config={url:'https://test.invalid',anonKey:'test-public',serviceKey:'test-private'}
const body=JSON.stringify({parent_id:parentId,branch_id:branchId,action:'create'})
Deno.test('HTTP boundary rejects anonymous, wrong method and oversized requests',async()=>{
  const unexpected: typeof fetch=()=>{throw new Error('No provider call allowed')}
  assertEquals((await handleBranchAccess(new Request(config.url,{method:'POST',body}),config,unexpected)).status,401)
  assertEquals((await handleBranchAccess(new Request(config.url),config,unexpected)).status,405)
  assertEquals((await handleBranchAccess(new Request(config.url,{method:'POST',headers:{authorization:'Bearer test-caller'},body:'x'.repeat(5000)}),config,unexpected)).status,413)
})
Deno.test('gateway uses caller JWT for authorization and server key only for provider and binding',async()=>{
  const paths: string[]=[]
  const transport: typeof fetch=async(input,init)=>{
    const url=String(input), headers=new Headers(init?.headers);paths.push(new URL(url).pathname)
    if(url.endsWith('/begin_branch_access')) {assertEquals(headers.get('authorization'),'Bearer test-caller');assertEquals(headers.get('apikey'),'test-public');return Response.json({decision:'reserved',phone:'0000000001',auth_user_id:authId,lease_token:token})}
    assertEquals(headers.get('authorization'),'Bearer test-private')
    if(init?.method==='GET') return Response.json({error:'not found'},{status:404})
    if(url.endsWith('/admin/users')) {const data:unknown=JSON.parse(String(init?.body));assert(typeof data==='object'&&data!==null&&'id' in data);assertEquals(data.id,authId);return Response.json({id:authId})}
    return Response.json({ok:true,branch_id:branchId})
  }
  const response=await handleBranchAccess(new Request(config.url,{method:'POST',headers:{authorization:'Bearer test-caller'},body}),config,transport)
  assertEquals(response.status,200);assertEquals(response.headers.get('cache-control'),'no-store');assertEquals(paths.length,4)
  const result: unknown=await response.json();assert(typeof result==='object'&&result!==null&&'status' in result);assertEquals(result.status,'generated')
})
Deno.test('gateway preserves authorization failures without exposing provider errors',async()=>{
  const response=await handleBranchAccess(new Request(config.url,{method:'POST',headers:{authorization:'Bearer invalid'},body}),config,()=>Promise.resolve(Response.json({message:'private provider body'},{status:401})))
  assertEquals(response.status,401);assert(!(await response.text()).includes('private provider'))
})

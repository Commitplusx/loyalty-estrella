import { BranchAccessError, parseBranchAccessRequest, provisionBranchAccess } from './branch-access.ts'
import type { BranchAccessStore, BranchAccessRequest, BranchReservation, BranchAuthAccount } from './branch-access.ts'
import { readBoundedJson, BoundedRequestError } from './http-request.ts'

interface Config { url: string; anonKey: string; serviceKey: string }
const headers = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Pragma':'no-cache','Content-Type':'application/json','X-Content-Type-Options':'nosniff' }
function row(value: unknown): Record<string,unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new BranchAccessError('El servidor no confirmó el acceso.')
  return value as Record<string,unknown>
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new BranchAccessError('El servidor no confirmó la identidad.')
  return value
}
export class BranchAccessGateway implements BranchAccessStore {
  constructor(private readonly config: Config, private readonly authorization: string, private readonly request: typeof fetch = fetch) {}
  private async call(path: string, method: 'GET'|'POST'|'PUT', body?: Record<string,unknown>, caller=false): Promise<unknown> {
    let response: Response
    try {
      response = await this.request(this.config.url+path, { method,
        headers: {apikey: caller ? this.config.anonKey : this.config.serviceKey, Authorization: caller ? this.authorization : 'Bearer '+this.config.serviceKey,'Content-Type':'application/json'},
        body: body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(10000) })
    } catch { throw new BranchAccessError('La operación tardó demasiado. Reintenta desde la sucursal.') }
    if (method==='GET' && response.status===404) return null
    const data: unknown = await response.json().catch(()=>null)
    if (!response.ok) {
      const error = typeof data === 'object' && data !== null ? row(data) : {}
      if (['42501','22023','PT409','PT429'].includes(String(error.code)) && typeof error.message==='string') {
        throw new BranchAccessError(error.message, error.code==='42501'?403:error.code==='PT429'?429:409)
      }
      throw new BranchAccessError(response.status===401 ? 'Inicia sesión de nuevo con la cuenta principal.' : 'No pudimos confirmar el acceso de la sucursal.',response.status===401?401:503)
    }
    return data
  }
  async begin(request: BranchAccessRequest): Promise<BranchReservation> {
    const result=row(await this.call('/rest/v1/rpc/begin_branch_access','POST',{p_parent:request.parentId,p_branch:request.branchId,p_rotate:request.rotate},true))
    if (typeof result.phone!=='string' || !/^\d{10}$/.test(result.phone)) throw new BranchAccessError('No pudimos confirmar el número de acceso.')
    if (result.decision==='exists') return {decision:'exists',phone:result.phone}
    if (result.decision!=='reserved') throw new BranchAccessError('No pudimos reservar el acceso.')
    return {decision:'reserved',phone:result.phone,authId:uuid(result.auth_user_id),token:uuid(result.lease_token)}
  }
  async account(id: string): Promise<BranchAuthAccount | null> {
    const result=await this.call('/auth/v1/admin/users/'+uuid(id),'GET')
    if (result===null) return null
    const account=row(result), metadata=row(account.app_metadata)
    if (typeof account.email!=='string' || typeof metadata.restaurant_branch_id!=='string') throw new BranchAccessError('La cuenta pertenece a otro acceso. Contacta a soporte.',409)
    return {id:uuid(account.id),email:account.email,branchId:uuid(metadata.restaurant_branch_id)}
  }
  async create(id: string,email: string,branchId: string,password: string): Promise<void> {
    const created=row(await this.call('/auth/v1/admin/users','POST',{id,email,password,email_confirm:true,app_metadata:{restaurant_branch_id:branchId}}))
    if (created.id!==id) throw new BranchAccessError('El proveedor no confirmó la cuenta de la sucursal.')
  }
  async password(id: string,password: string): Promise<void> {
    const updated=row(await this.call('/auth/v1/admin/users/'+uuid(id),'PUT',{password}))
    if (updated.id!==id) throw new BranchAccessError('El proveedor no confirmó la contraseña.')
  }
  async complete(id: string,token: string): Promise<void> {
    const result=row(await this.call('/rest/v1/rpc/complete_branch_access','POST',{p_branch:id,p_token:token}))
    if (result.ok!==true || result.branch_id!==id) throw new BranchAccessError('No pudimos confirmar el vínculo de la sucursal.')
  }
  async release(id: string,token: string): Promise<void> { await this.call('/rest/v1/rpc/release_branch_access','POST',{p_branch:id,p_token:token}) }
}

export async function handleBranchAccess(req: Request, config: Config, request: typeof fetch = fetch): Promise<Response> {
  const response=(body: unknown,status=200)=>new Response(JSON.stringify(body),{status,headers})
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers})
  if (req.method!=='POST') return response({error:'Usa el formulario de sucursales.'},405)
  const authorization=req.headers.get('authorization') || ''
  if (!/^Bearer \S+$/i.test(authorization)) return response({error:'Inicia sesión con la cuenta principal.'},401)
  try {
    const args=parseBranchAccessRequest(await readBoundedJson(req,4096,3000))
    return response(await provisionBranchAccess(new BranchAccessGateway(config,authorization,request),args))
  } catch (error: unknown) {
    if (error instanceof BoundedRequestError) return response({error:'Revisa el formulario de acceso.'},error.status)
    return response({error:error instanceof BranchAccessError?error.message:'No pudimos generar el acceso.'},error instanceof BranchAccessError?error.status:503)
  }
}

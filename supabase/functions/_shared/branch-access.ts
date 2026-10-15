export class BranchAccessError extends Error {
  constructor(message: string, readonly status = 503) { super(message) }
}
export interface BranchAccessRequest { parentId: string; branchId: string; rotate: boolean }
export type BranchReservation = { decision: 'exists'; phone: string } | {
  decision: 'reserved'; phone: string; authId: string; token: string
}
export interface BranchAuthAccount { id: string; email: string; branchId: string }
export interface BranchAccessStore {
  begin(request: BranchAccessRequest): Promise<BranchReservation>
  account(authId: string): Promise<BranchAuthAccount | null>
  create(authId: string, email: string, branchId: string, password: string): Promise<void>
  password(authId: string, password: string): Promise<void>
  complete(branchId: string, token: string): Promise<void>
  release(branchId: string, token: string): Promise<void>
}
export type BranchAccessResult = { status: 'exists'; phone: string } | { status: 'generated'; phone: string; password: string }
export function parseBranchAccessRequest(value: unknown): BranchAccessRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new BranchAccessError('Revisa la sucursal elegida.',400)
  const row = value as Record<string,unknown>
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (typeof row.parent_id !== 'string' || !uuid.test(row.parent_id) || typeof row.branch_id !== 'string' || !uuid.test(row.branch_id)
    || row.parent_id === row.branch_id || (row.action !== 'create' && row.action !== 'rotate')) throw new BranchAccessError('Revisa la sucursal elegida.',400)
  return { parentId: row.parent_id, branchId: row.branch_id, rotate: row.action === 'rotate' }
}
export function generateBranchPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return 'Ee!' + btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'') + '7a'
}

export async function provisionBranchAccess(store: BranchAccessStore, request: BranchAccessRequest): Promise<BranchAccessResult> {
  const reservation = await store.begin(request)
  if (reservation.decision === 'exists') return {status:'exists',phone:reservation.phone}
  const email = `aliado_${reservation.phone}@app-estrella.shop`
  try {
    const account = await store.account(reservation.authId)
    if (account && (account.id !== reservation.authId || account.email.toLowerCase() !== email || account.branchId !== request.branchId)) {
      throw new BranchAccessError('La cuenta de acceso no coincide con esta sucursal. Contacta a soporte.',409)
    }
    // A recovered create can link the verified account, but never invents or
    // automatically replaces a password whose successful response was lost.
    if (account && !request.rotate) {
      await store.complete(request.branchId,reservation.token)
      return {status:'exists',phone:reservation.phone}
    }
    const password = generateBranchPassword()
    if (account) await store.password(reservation.authId,password)
    else await store.create(reservation.authId,email,request.branchId,password)
    await store.complete(request.branchId,reservation.token)
    return {status:'generated',phone:reservation.phone,password}
  } catch (error: unknown) {
    try { await store.release(request.branchId,reservation.token) }
    catch { throw new BranchAccessError('No pudimos confirmar el acceso. Espera 90 segundos antes de reintentar.') }
    throw error instanceof BranchAccessError ? error : new BranchAccessError('No pudimos confirmar el acceso. Reintenta desde la sucursal.')
  }
}

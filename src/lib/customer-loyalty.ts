import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Cliente, RegistroMovimiento } from '@/types';

const id = z.uuid();
const timestamp = z.string().refine(value => Number.isFinite(Date.parse(value)));
export const loginChallengeSchema = z.object({
  phone: z.string().regex(/^\d{10}$/), key: id,
  challengeId: id.optional(), expiresAt: z.number().finite().positive().optional(),
});
export type LoginChallenge = z.infer<typeof loginChallengeSchema>;
const profileSchema = z.object({
  id, nombre: z.string(), telefono: z.string().regex(/^\d{10}$/), qr_code: z.string(),
  puntos: z.number().int().nonnegative(), envios_gratis_disponibles: z.number().int().nonnegative(),
  envios_totales: z.number().int().nonnegative(), es_vip: z.boolean(), rango: z.enum(['bronce','plata','oro']),
  saldo_billetera: z.number().finite().nonnegative(), cupon_activo: z.string().nullable(),
  created_at: timestamp, updated_at: timestamp, acepta_terminos: z.literal(true),
});
const historySchema = z.array(z.object({
  id, cliente_id: id, tipo: z.enum(['acumulacion','canje']), puntos: z.number().int(),
  monto_saldo: z.number().finite().nullable().transform(value => value ?? undefined),
  descripcion: z.string().nullable().transform(value => value ?? ''), created_at: timestamp,
})).max(100);
const startSchema = z.object({ ok: z.literal(true), challenge_id: id, expires_in: z.number().int().positive().max(300) });
const credentialSchema = z.object({ ok: z.literal(true), token_hash: z.string().min(1).max(512), verification_type: z.literal('email') });
const errorSchema = z.object({error: z.string().min(1).max(500),code: z.string().optional()});

export class LoyaltyAccessError extends Error {
  readonly code: string;
  constructor(message: string, code = 'access_unavailable') { super(message); this.code = code; }
}
export interface CustomerLoyaltyGateway {
  restore(): Promise<Cliente | null>;
  request(challenge: LoginChallenge): Promise<LoginChallenge>;
  verify(challenge: LoginChallenge, code: string): Promise<Cliente>;
  profile(): Promise<Cliente>;
  history(): Promise<RegistroMovimiento[]>;
  signOut(): Promise<void>;
  subscribe(customerId: string, onChange: (newAccumulationId?: string) => void, onSignedOut: () => void): () => void;
}

export function createCustomerLoyaltyGateway(client: SupabaseClient): CustomerLoyaltyGateway {
  async function invoke(body: Record<string,unknown>): Promise<unknown> {
    const { data, error } = await client.functions.invoke('auth-otp', {body});
    if (error instanceof FunctionsHttpError) {
      let raw: unknown;
      try { raw = await error.context.json(); } catch { raw = null; }
      const parsed = errorSchema.safeParse(raw);
      if (parsed.success) throw new LoyaltyAccessError(parsed.data.error, parsed.data.code);
    }
    if (error) throw new LoyaltyAccessError('No pudimos conectar. Revisa tu internet y vuelve a intentarlo.');
    return data;
  }
  async function profile(): Promise<Cliente> {
    const { data, error } = await client.rpc('get_my_loyalty_customer');
    if (error?.code === '42501') throw new LoyaltyAccessError('Tu sesión terminó. Verifica tu WhatsApp para volver a entrar.', 'session_expired');
    const parsed = profileSchema.safeParse(data);
    if (error || !parsed.success) throw new LoyaltyAccessError('No pudimos cargar tu tarjeta. Intenta de nuevo en un momento.');
    return parsed.data;
  }
  return {
    profile,
    async restore() {
      const {data: {session}, error: sessionError} = await client.auth.getSession();
      if (sessionError) throw new LoyaltyAccessError('No pudimos recuperar tu acceso. Intenta de nuevo.');
      if (!session) return null;
      const {data: {user}, error} = await client.auth.getUser();
      if (error && error.status !== 401 && error.status !== 403 && error.status !== 400) throw new LoyaltyAccessError('No pudimos verificar tu sesión. Revisa tu conexión.');
      if (error || !user || user.app_metadata.account_kind !== 'loyalty_customer') {
        await client.auth.signOut({scope:'local'});
        return null;
      }
      return profile();
    },
    async request(challenge) {
      const raw = await invoke({action:'request-customer-login',telefono:challenge.phone,idempotency_key:challenge.key});
      const parsed = startSchema.safeParse(raw);
      if (!parsed.success) throw new LoyaltyAccessError('No pudimos confirmar el envío del código. Intenta de nuevo.');
      return {...challenge, challengeId:parsed.data.challenge_id, expiresAt:Date.now()+parsed.data.expires_in*1000};
    },
    async verify(challenge, code) {
      if (!challenge.challengeId || !/^\d{6}$/.test(code)) throw new LoyaltyAccessError('Escribe los seis dígitos que recibiste en WhatsApp.');
      const raw = await invoke({action:'verify-customer-login',telefono:challenge.phone,challenge_id:challenge.challengeId,codigo:code});
      const parsed = credentialSchema.safeParse(raw);
      if (!parsed.success) throw new LoyaltyAccessError('No pudimos activar tu acceso. Reintenta con el mismo código.');
      const {data,error} = await client.auth.verifyOtp({token_hash:parsed.data.token_hash,type:parsed.data.verification_type});
      if (error || !data.session || data.user?.app_metadata.account_kind !== 'loyalty_customer') throw new LoyaltyAccessError('No pudimos abrir tu sesión. Reintenta con el mismo código.');
      const customer = await profile();
      if (customer.telefono !== challenge.phone) {
        await client.auth.signOut({scope:'local'});
        throw new LoyaltyAccessError('El acceso no coincide con el número que verificaste. Solicita un código nuevo.');
      }
      return customer;
    },
    async history() {
      const {data,error} = await client.rpc('get_my_loyalty_history');
      const parsed = historySchema.safeParse(data);
      if (error || !parsed.success) throw new LoyaltyAccessError('No pudimos cargar tus movimientos. Puedes volver a intentarlo.');
      return parsed.data;
    },
    async signOut() {
      // Customer Auth has a separate storage key; admin sessions are untouched.
      const {error} = await client.auth.signOut({scope:'local'});
      if (error) throw new LoyaltyAccessError('No pudimos cerrar la sesión. Intenta de nuevo.');
    },
    subscribe(customerId,onChange,onSignedOut) {
      const channel = client.channel('loyalty-customer-'+customerId)
        .on('postgres_changes',{event:'*',schema:'public',table:'clientes',filter:'id=eq.'+customerId},() => onChange())
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'registros_puntos',filter:'cliente_id=eq.'+customerId},payload => {
          const record = z.object({id,tipo:z.string(),cliente_id:id}).safeParse(payload.new);
          onChange(record.success && record.data.cliente_id===customerId && record.data.tipo==='acumulacion' ? record.data.id : undefined);
        })
        .subscribe();
      const {data:{subscription}} = client.auth.onAuthStateChange(event => {if (event === 'SIGNED_OUT') onSignedOut();});
      return () => {subscription.unsubscribe(); void client.removeChannel(channel);};
    },
  };
}

export const customerSupabase = createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY,{
  auth:{storageKey:'estrella-loyalty-customer-auth',detectSessionInUrl:false},
  global:{fetch:(input,init) => fetch(input,{...init,signal:AbortSignal.timeout(15000)})},
});
export const customerLoyalty = createCustomerLoyaltyGateway(customerSupabase);

const redemptionSchema=z.object({
  ok:z.literal(true),success:z.literal(true),codigo:z.string().regex(/^CANJE-[A-Z0-9-]{1,80}$/),
  valor_pesos:z.number().finite().positive(),puntos_nuevos:z.number().int().nonnegative(),
  saldo_nuevo:z.number().finite().nonnegative(),envios_gratis_nuevos:z.number().int().nonnegative(),expires_at:timestamp,
  notification_status:z.enum(['pending','sending','accepted','failed','unknown']),replayed:z.boolean(),
});
export type CustomerRedemption=z.infer<typeof redemptionSchema>;
export interface RedemptionIntent {phone:string;type:'envio_normal'|'envio_vip'|'billetera';amount?:number;delivery?:number}
const redemptionRequestSchema=z.object({key:id,intent:z.string()});
const pendingRedemptions=new Map<string,string>();
export async function redeemCustomerBenefit(intent:RedemptionIntent):Promise<CustomerRedemption> {
  const signature=JSON.stringify({phone:intent.phone,type:intent.type,amount:intent.amount??0,delivery:intent.delivery??0});
  const storageKey='estrella-loyalty-pending-redemption';
  let key=pendingRedemptions.get(signature)??crypto.randomUUID();
  try {
    const raw:unknown=JSON.parse(sessionStorage.getItem(storageKey)??'null');
    const pending=redemptionRequestSchema.safeParse(raw);
    if (pending.success && pending.data.intent===signature) key=pending.data.key;
    sessionStorage.setItem(storageKey,JSON.stringify({key,intent:signature}));
  } catch { /* Disabled storage retains the recovery key in this page's memory. */ }
  pendingRedemptions.set(signature,key);
  const {data,error}=await customerSupabase.functions.invoke('canjear-puntos',{body:{
    clienteTel:intent.phone,tipo:intent.type,saldoAUsar:intent.amount??0,montoPedido:intent.delivery??0,idempotency_key:key,
  }});
  if (error instanceof FunctionsHttpError) {
    let raw:unknown; try {raw=await error.context.json();} catch {raw=null;}
    const parsed=errorSchema.safeParse(raw);
    if (parsed.success) throw new LoyaltyAccessError(parsed.data.error,parsed.data.code);
  }
  if (error) throw new LoyaltyAccessError('No pudimos confirmar el canje. Reintenta con el mismo importe.');
  const parsed=redemptionSchema.safeParse(data);
  if (!parsed.success) throw new LoyaltyAccessError('No pudimos confirmar el resultado. Reintenta con el mismo importe.');
  pendingRedemptions.delete(signature);
  try {sessionStorage.removeItem(storageKey);} catch { /* No stored data grants a benefit. */ }
  return parsed.data;
}

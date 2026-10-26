export const EATS_SENDER = '+522201465989';
export const EATS_WABA = '1740083707098052';
export const EATS_RELAY_URL = 'https://knghdwpxheenkpuajkxl.supabase.co/functions/v1/ycloud-webhook';
export const RESTAURANT_TIMED_TEMPLATE = 'eats_pedido_restaurante_v2';
import { RestaurantBillingError, type RestaurantFoodBilling } from './restaurant-food-billing.ts';
export interface RestaurantNoticeOptions { billing: RestaurantFoodBilling; timed: boolean }

export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_object');
  return Object.fromEntries(Object.entries(value));
}
export function phone(value: unknown): string {
  if (typeof value !== 'string' || !/^\+?[\d ()-]+$/.test(value)) throw new Error('invalid_phone');
  const digits = value.replace(/\D/g, '');
  if (!/^(52|521)?\d{10}$/.test(digits)) throw new Error('invalid_phone');
  return '+52' + digits.slice(-10);
}
function text(value: unknown, name: string, max = 4000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('invalid_' + name);
  return value;
}
export interface Notice {
  id: string; leaseToken: string; kind: string; recipient: string; snapshot: Record<string, unknown>;
}
export function notice(value: unknown): Notice {
  const row = object(value);
  return {id: text(row.id, 'id', 36), leaseToken: text(row.lease_token, 'lease', 36),
    kind: text(row.kind, 'kind', 40), recipient: phone(row.recipient), snapshot: object(row.snapshot)};
}
export interface MessagePlan { type: 'text' | 'interactive' | 'template'; [key: string]: unknown }
interface Button { id: string; title: string }
const tracker = (id: string): string => 'https://estrella-eats.mx/tracker?pedido=' + encodeURIComponent(id);
function buttons(body: string, values: Button[]): MessagePlan {
  if (body.length > 4096 || values.some(v => v.title.length > 20)) throw new Error('message_too_large');
  return {type: 'interactive', interactive: {type: 'button', body: {text: body},
    action: {buttons: values.map(v => ({type: 'reply', reply: v}))}}};
}
function cta(body: string, url: string): MessagePlan {
  if (body.length > 4096) throw new Error('message_too_large');
  return {type: 'interactive', interactive: {type: 'cta_url', body: {text: body},
    action: {name: 'cta_url', parameters: {display_text: 'Ver mi pedido', url}}}};
}
function template(name: string, parameters: string[], id?: string): MessagePlan {
  const components: Record<string, unknown>[] = [{type: 'body', parameters: parameters.map(value => ({type: 'text', text: value.replace(/\s+/g, ' ').trim()}))}];
  if (id) components.push({type: 'button', sub_type: 'url', index: '0', parameters: [{type: 'text', text: id}]});
  return {type: 'template', template: {name, language: {code: 'es_MX'}, components}};
}
export function templateName(plan: MessagePlan): string | null {
  return plan.type === 'template' ? text(object(plan.template).name, 'template', 100) : null;
}

export function planMessage(n: Notice, windowOpen: boolean, driverName = 'tu repartidor', trackingToken: string | null = null, restaurantNotice?: RestaurantNoticeOptions): MessagePlan {
  const p = n.snapshot, id = text(p.id, 'order', 36), folio = text(p.folio, 'folio', 60);
  const customer = text(p.customer, 'customer', 200), restaurant = text(p.restaurant, 'restaurant', 283);
  const description = typeof p.description === 'string' ? p.description : '';
  if (n.kind === 'restaurant_new') {
    if (!restaurantNotice) throw new Error('restaurant_billing_unavailable');
    const {billing,timed} = restaurantNotice;
    const detail = description.replace(/\s+/g,' ').trim();
    const summary = restaurant + '. ' + (detail && detail.length <= 500 ? detail : 'Consulta el detalle completo en https://restaurantes-app-estrella.shop/portal. También lo recibirás al aceptar el pedido.');
    if (!windowOpen) {
      const message = timed ? template(RESTAURANT_TIMED_TEMPLATE, [folio, summary, billing.amount, billing.payment])
        : template('pedido_nuevo_restaurante', [folio, `${billing.payment}. Comida a cobrar: ${billing.amount}`, summary]);
      const contract = object(message.template);
      const components = contract.components;
      if (!Array.isArray(components)) throw new Error('invalid_components');
      const replies = timed ? [15,30,45].map(minutes => `REST_TIME_${minutes}_${id}`)
        : ['REST_ORDER_PREPARE_' + id,'REST_ORDER_REJECT_' + id];
      components.push(...replies.map((payload,index) => ({type:'button',sub_type:'quick_reply',index:String(index),parameters:[{type:'payload',payload}]})));
      return message;
    }
    return buttons(`🍽️ *Nuevo pedido #${folio}*\nComida a cobrar: ${billing.amount}\nPago: ${billing.payment}\n\n${summary}\n\n¿Lo puedes preparar?`, [
      {id: 'REST_ORDER_PREPARE_' + id, title: 'Aceptar'}, {id: 'REST_ORDER_REJECT_' + id, title: 'Rechazar'}]);
  }
  if (n.kind === 'kitchen_prompt') {
    if (!windowOpen) throw new Error('kitchen_window_closed');
    return buttons(`⏱️ ¿En cuánto tiempo estará listo el pedido #${folio}?`, [15,30,45].map(minutes => ({
      id: `REST_TIME_${minutes}_${id}`, title: `${minutes} minutos`})));
  }
  if (n.kind === 'restaurant_receipt') {
    if (!windowOpen) throw new Error('kitchen_window_closed');
    const body = `👨‍🍳 *A preparar — #${folio}*\n${restaurant}\n\n${description}\n\nPedido: https://restaurantes-app-estrella.shop/portal`;
    return p.last_part === true ? buttons(body + '\n\nCuando esté empacado, avísanos aquí 👇', [
      {id: 'REST_ORDER_READY_' + id, title: '¡Ya está listo!'}]) : {type: 'text', text: {body}};
  }
  if (n.kind === 'restaurant_rejected') {
    if (!windowOpen) throw new Error('kitchen_window_closed');
    return {type: 'text', text: {body: `✅ Registré el rechazo del pedido #${folio}. Se avisará al cliente.`}};
  }
  const driverNotice = n.kind === 'driver_ready';
  if (!driverNotice && (!trackingToken || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trackingToken))) {
    throw new Error('tracking_access_unavailable');
  }
  const suffix = driverNotice ? id + '#repartidor' : id + '#clave=' + trackingToken;
  const trackingUrl = tracker(id) + (driverNotice ? '#repartidor' : '#clave=' + trackingToken);
  if (n.kind === 'asignado') {
    if (!windowOpen) return template('eats_repartidor_asignado_v1', [customer, driverName, folio, restaurant], suffix);
    return cta(`Hola, ${customer}. 🛵 *${driverName}* aceptó tu pedido #${folio} de *${restaurant}* y va a recogerlo.`, trackingUrl);
  }
  const updates: Record<string, string> = {
    preparing: `El restaurante está preparando tu pedido${typeof p.minutes === 'number' ? `; tiempo estimado de cocina: ${p.minutes} min` : ''}.`,
    en_camino: 'Tu pedido va en camino. 🛵', entregado: 'Tu pedido fue entregado. ¡Buen provecho! 🍗',
    cancelado: 'Tu pedido fue cancelado. Puedes consultar su estado o contactarnos aquí.',
    pickup_ready: 'Tu pedido está listo para recoger en sucursal. 🛍️',
    driver_ready: 'El restaurante informa que la comida está lista para recoger. Revisa el pedido en tu APK.',
  };
  const update = updates[n.kind];
  if (!update) throw new Error('unsupported_notice');
  if (!windowOpen) return template('eats_estado_pedido_v1', [customer, folio, restaurant, update], suffix);
  if (driverNotice) return {type: 'text', text: {body: `📦 *Pedido #${folio} — ${restaurant}*\n\n${update}`}};
  return cta(`📦 *Pedido #${folio} — ${restaurant}*\n\n${update}`, trackingUrl);
}

export type ProviderState = 'accepted' | 'sent' | 'delivered' | 'read';
export type SendResult = {state: ProviderState; id: string} | {state: 'queued' | 'failed' | 'uncertain'; code: string};
export async function sendNotice(n: Notice, plan: MessagePlan, apiKey: string, transport: typeof fetch = fetch): Promise<SendResult> {
  try {
    const response = await transport('https://api.ycloud.com/v2/whatsapp/messages/sendDirectly', {
      method: 'POST', headers: {'X-API-Key': apiKey, 'Content-Type': 'application/json'},
      body: JSON.stringify({from: EATS_SENDER, to: n.recipient, externalId: 'ee-order-' + n.id, ...plan}),
      signal: AbortSignal.timeout(15000),
    });
    const value: unknown = await response.json().catch(() => null);
    const data = value !== null && typeof value === 'object' && !Array.isArray(value) ? object(value) : {};
    if (response.ok && data.error===undefined && typeof data.id === 'string' && data.id.trim() && data.id.length<=300 && ['accepted','sent','delivered','read'].includes(String(data.status))) {
      const status = data.status;
      if (status === 'accepted' || status === 'sent' || status === 'delivered' || status === 'read') return {state: status, id: data.id};
    }
    if (response.status === 429) return {state: 'queued', code: 'provider_rate_limit'};
    if (response.status >= 400 && response.status < 500) return {state: 'failed', code: 'provider_rejected_' + response.status};
    return {state: 'uncertain', code: 'provider_acceptance_unknown'};
  } catch (_error: unknown) { return {state: 'uncertain', code: 'provider_acceptance_unknown'}; }
}

export interface NotificationJobs {
  claim(): Promise<unknown>; start(n: Notice): Promise<boolean>;
  current(n: Notice): Promise<boolean>;
  finish(n: Notice, state: string, providerId: string | null, code: string | null): Promise<void>;
  driver(id: string): Promise<string>; window(recipient: string): Promise<boolean>;
  trackingToken(orderId: string): Promise<string>;
  restaurantBilling(n: Notice): Promise<RestaurantFoodBilling>;
  template(name: string): Promise<'APPROVED' | 'PENDING' | 'FAILED'>;
}
export async function processOrderOutbox(jobs: NotificationJobs, apiKey: string, transport: typeof fetch = fetch): Promise<number> {
  let processed = 0;
  // Two sequential jobs per invocation: bounded provider time and no overlapping parts.
  for (let index = 0; index < 2; index++) {
    const raw = await jobs.claim();
    if (raw === null) break;
    const row = object(raw);
    // Preserve the lease identity even for invalid recipient/catalog data.
    const identity: Notice = {id: text(row.id, 'id', 36), leaseToken: text(row.lease_token, 'lease', 36),
      kind: String(row.kind), recipient: '', snapshot: row.snapshot!==null && typeof row.snapshot==='object' && !Array.isArray(row.snapshot)?object(row.snapshot):{}};
    let n: Notice;
    try { n = notice(raw); }
    catch (_error: unknown) { await jobs.finish(identity, 'failed', null, 'invalid_notification_data'); processed++; continue; }
    try {
      if (!await jobs.current(n)) { await jobs.finish(n, 'superseded', null, 'order_already_advanced'); processed++; continue; }
      let open=false;
      try { open=await jobs.window(n.recipient); }
      catch (_error: unknown) {
        if (['kitchen_prompt','restaurant_receipt','restaurant_rejected'].includes(n.kind)) throw new Error('window_lookup_unavailable');
        console.warn(JSON.stringify({event:'order_window_unknown_using_template',notification_id:n.id}));
      }
      const driver = n.kind === 'asignado' && typeof n.snapshot.driver_id === 'string' ? await jobs.driver(n.snapshot.driver_id) : 'tu repartidor';
      const customerNotice = ['asignado','preparing','en_camino','entregado','cancelado','pickup_ready'].includes(n.kind);
      const access = customerNotice && typeof n.snapshot.id === 'string' ? await jobs.trackingToken(n.snapshot.id) : null;
      let restaurantNotice: RestaurantNoticeOptions | undefined;
      let timedApproval: 'APPROVED' | 'PENDING' | 'FAILED' | undefined;
      if (n.kind === 'restaurant_new') {
        const billing = await jobs.restaurantBilling(n);
        if (!open) timedApproval = await jobs.template(RESTAURANT_TIMED_TEMPLATE);
        restaurantNotice = {billing,timed:timedApproval === 'APPROVED'};
        if (!open && timedApproval !== 'APPROVED') console.info(JSON.stringify({event:'restaurant_template_legacy_selected',notification_id:n.id,reason:timedApproval}));
      }
      const plan = planMessage(n, open, driver, access, restaurantNotice);
      const name = templateName(plan);
      if (name) {
        const approval = name === RESTAURANT_TIMED_TEMPLATE ? timedApproval : await jobs.template(name);
        if (approval !== 'APPROVED') {
          await jobs.finish(n, approval === 'PENDING' ? 'template_pending' : 'failed', null,
            approval === 'PENDING' ? 'template_pending' : 'template_unavailable'); processed++; continue;
        }
      }
      if (!await jobs.current(n)) {
        await jobs.finish(n,'superseded',null,'order_already_advanced'); processed++; continue;
      }
      if (!await jobs.start(n)) continue;
      const result = await sendNotice(n, plan, apiKey, transport);
      await jobs.finish(n, result.state, 'id' in result ? result.id : null, 'code' in result ? result.code : null);
      processed++;
    } catch (error: unknown) {
      // No second HTTP send here. A failed persistence leaves the lease for recovery.
      console.error(JSON.stringify({event: 'order_notification_processing_failed', notification_id: n.id,
        code: error instanceof RestaurantBillingError ? error.code : error instanceof Error && error.message === 'kitchen_window_closed' ? 'kitchen_window_closed' : 'processing_unavailable'}));
      if (error instanceof RestaurantBillingError) {
        await jobs.finish(n,'failed',null,error.code); processed++;
      }
      if (error instanceof Error && error.message === 'kitchen_window_closed') {
        await jobs.finish(n, 'failed', null, 'kitchen_window_closed'); processed++;
      }
    }
  }
  return processed;
}

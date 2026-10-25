import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { EATS_SENDER,EATS_WABA,EATS_RELAY_URL,RESTAURANT_TIMED_TEMPLATE,object,phone,processOrderOutbox } from './eats-order-notifications.ts';
import type { NotificationJobs,Notice } from './eats-order-notifications.ts';
import type {OrderNotificationDatabase} from './eats-notification-database.ts';
import { restaurantFoodBilling, RestaurantBillingError, type RestaurantFoodBilling } from './restaurant-food-billing.ts';

export class OrderNotificationGateway implements NotificationJobs {
  constructor(readonly client: SupabaseClient<OrderNotificationDatabase>, readonly apiKey: string, readonly relayToken: string, readonly transport: typeof fetch = fetch) {}
  async rpc<Name extends keyof OrderNotificationDatabase['public']['Functions']>(name: Name,
    values: OrderNotificationDatabase['public']['Functions'][Name]['Args']): Promise<unknown> {
    const {data,error} = await this.client.rpc(name,values).abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error('notification_database_unavailable');
    return data;
  }
  async claim(): Promise<unknown> { return await this.rpc('eats_notification_claim',{}); }
  async start(n: Notice): Promise<boolean> { return await this.rpc('eats_notification_start',{p_id:n.id,p_token:n.leaseToken}) === true; }
  async finish(n: Notice,state: string,id: string|null,code: string|null): Promise<void> {
    if (await this.rpc('eats_notification_finish',{p_id:n.id,p_token:n.leaseToken,p_state:state,p_provider_id:id,p_code:code}) !== true) throw new Error('notification_lease_changed');
  }
  async current(n: Notice): Promise<boolean> {
    if(typeof n.snapshot.id!=='string') throw new Error('invalid_order_id');
    const {data,error} = await this.client.from('pedidos').select('estado,estado_cocina,repartidor_id').eq('id',n.snapshot.id).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
    if (error || !data) throw new Error('order_state_unavailable');
    const p = object(data);
    if (n.kind==='asignado') return ['asignado','recibido'].includes(String(p.estado)) && p.repartidor_id===n.snapshot.driver_id;
    if (n.kind==='preparing') return ['pendiente','buscando_repartidor','ofrecido'].includes(String(p.estado)) && p.estado_cocina==='en_cocina';
    if (n.kind==='restaurant_new' || n.kind==='kitchen_prompt') return p.estado==='pendiente' && (p.estado_cocina===null || p.estado_cocina==='pendiente');
    if (n.kind==='restaurant_receipt') return p.estado_cocina==='en_cocina' && !['cancelado','entregado'].includes(String(p.estado));
    if (n.kind==='driver_ready') return p.estado_cocina==='listo_para_recoger' && ['asignado','recibido'].includes(String(p.estado));
    if (n.kind==='pickup_ready') return p.estado_cocina==='listo_para_recoger' && p.estado!=='entregado';
    if (['entregado','en_camino','cancelado'].includes(n.kind)) return p.estado===n.kind;
    return n.kind==='restaurant_rejected';
  }
  async restaurantBilling(n: Notice): Promise<RestaurantFoodBilling> {
    const id = n.snapshot.id, restaurant = n.snapshot.restaurant_id;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof id !== 'string' || !uuid.test(id) || typeof restaurant !== 'string' || !uuid.test(restaurant)) throw new RestaurantBillingError('invalid_restaurant_identity');
    const {data,error} = await this.client.from('pedidos')
      .select('items,total,precio_entrega,descuento_plataforma,metodo_pago,estado_pago,tipo_pedido')
      .eq('id',id).eq('restaurante_id',restaurant).eq('origen','web')
      .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
    if (error || !data) throw new Error('restaurant_billing_unavailable');
    return restaurantFoodBilling(data);
  }
  async driver(id: string): Promise<string> {
    const {data,error} = await this.client.from('repartidores').select('nombre').eq('user_id',id).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
    if (error || !data) throw new Error('driver_identity_unavailable');
    const name = object(data).nombre;
    if (typeof name!=='string' || !name.trim() || name.length>200) throw new Error('invalid_driver_name');
    return name;
  }
  async trackingToken(orderId: string): Promise<string> {
    const {data,error} = await this.client.from('pedidos').select('access_token').eq('id',orderId)
      .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
    if (error || !data) throw new Error('tracking_access_unavailable');
    const token = object(data).access_token;
    if (typeof token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      throw new Error('tracking_access_unavailable');
    }
    return token;
  }
  async window(recipient: string): Promise<boolean> {
    if (!this.relayToken || this.relayToken.length<32) throw new Error('relay_unconfigured');
    try {
      const response=await this.transport(EATS_RELAY_URL,{method:'POST',
        headers:{'Content-Type':'application/json','x-order-relay-token':this.relayToken},
        body:JSON.stringify({action:'eats_customer_window',sender:EATS_SENDER,recipient}),signal:AbortSignal.timeout(3000)});
      if (!response.ok) throw new Error('window_lookup_unavailable');
      const value: unknown=await response.json(); const data=object(value);
      if (typeof data.lastInboundAt!=='string') return false;
      const sent=Date.parse(data.lastInboundAt),now=Date.now();
      return Number.isFinite(sent) && sent<=now+30000 && sent>now-(24*60-5)*60000;
    } catch (_error: unknown) { throw new Error('window_lookup_unavailable'); }
  }
  async template(name: string): Promise<'APPROVED'|'PENDING'|'FAILED'> {
    const response=await this.transport(`https://api.ycloud.com/v2/whatsapp/templates/${EATS_WABA}/${name}/es_MX`,{
      headers:{'X-API-Key':this.apiKey},signal:AbortSignal.timeout(5000)});
    if (response.status===404) return 'FAILED';
    if (!response.ok) throw new Error('template_provider_unavailable');
    const value: unknown=await response.json(); const data=object(value);
    if (data.name!==name || data.language!=='es_MX' || data.category!=='UTILITY') return 'FAILED';
    if (data.status==='APPROVED') {
      if (name === RESTAURANT_TIMED_TEMPLATE) {
        if (!Array.isArray(data.components)) return 'FAILED';
        const components = data.components.map(object);
        const body = components.find(c => c.type === 'BODY');
        const replies = components.find(c => c.type === 'BUTTONS');
        if (typeof body?.text !== 'string' || JSON.stringify(body.text.match(/\{\{\s*\d+\s*\}\}/g)) !== JSON.stringify(['{{1}}','{{2}}','{{3}}','{{4}}'])) return 'FAILED';
        if (!Array.isArray(replies?.buttons) || replies.buttons.length !== 3) return 'FAILED';
        if (!replies.buttons.every((raw,index) => {
          const button=object(raw);
          return button.type === 'QUICK_REPLY' && button.text === [15,30,45][index] + ' minutos';
        })) return 'FAILED';
      }
      return 'APPROVED';
    }
    return data.status==='PENDING' ? 'PENDING' : 'FAILED';
  }
}

export async function relaySecretMatches(provided: string|null,expected: string|undefined): Promise<boolean> {
  if (!provided || !expected || expected.length<32) return false;
  const encoder=new TextEncoder();
  const [first,second]=await Promise.all([provided,expected].map(value=>crypto.subtle.digest('SHA-256',encoder.encode(value))));
  const a=new Uint8Array(first),b=new Uint8Array(second);let difference=0;
  for(let i=0;i<a.length;i++) difference|=a[i]^b[i];
  return difference===0;
}

export async function handleOrderProviderEvent(payload: unknown,gateway: OrderNotificationGateway): Promise<{handled:boolean}> {
  const input=object(payload);
  if (input.event==='status') {
    const message=object(input.message);
    if(typeof message.externalId!=='string' || typeof message.id!=='string' || typeof message.status!=='string') throw new Error('invalid_status_event');
    const handled=await gateway.rpc('eats_notification_status',{
      p_external_id:message.externalId,p_provider_id:message.id,p_sender:phone(message.from),p_recipient:phone(message.to),
      p_status:message.status,p_code:typeof message.errorCode==='string'?message.errorCode:null,
      p_price:typeof message.totalPrice==='number' && Number.isFinite(message.totalPrice)?message.totalPrice:null,
      p_currency:typeof message.currency==='string' && /^[A-Z]{3}$/.test(message.currency)?message.currency:null,
    });
    return {handled:handled===true};
  }
  if (input.event==='kitchen') {
    const message=object(input.message);
    if (phone(message.to)!==EATS_SENDER || typeof message.id!=='string' || typeof message.buttonId!=='string') throw new Error('invalid_kitchen_event');
    const id=message.buttonId;
    const match=id.match(/^REST_ORDER_(PREPARE|REJECT|READY)_(.+)$/);
    const time=id.match(/^REST_TIME_(15|30|45)_(.+)$/);
    const key=match?.[2] || time?.[2];
    if (!key || !/^(?:[0-9a-f-]{36}|[A-Za-z0-9-]{3,50})$/.test(key)) throw new Error('invalid_order_key');
    const action=time?'prepare':match?.[1]==='PREPARE'?'prompt':match?.[1]==='REJECT'?'reject':'ready';
    const result=object(await gateway.rpc('eats_kitchen_action',{p_order_key:key,p_phone:phone(message.from),
      p_message_id:message.id,p_action:action,p_minutes:time?Number(time[1]):null}));
    return {handled:result.handled===true};
  }
  throw new Error('invalid_relay_event');
}

export function runOrderOutbox(gateway: OrderNotificationGateway): Promise<number> {
  return processOrderOutbox(gateway,gateway.apiKey,gateway.transport);
}

export async function usesOrderOutbox(payload: unknown,gateway: OrderNotificationGateway): Promise<boolean> {
  const body=object(payload);
  if (body.tipo==='process_order_outbox') return true;
  const record=body.type && body.table==='pedidos' ? object(body.record) : null;
  const manual=['preparando','comida_lista','asignado','recibido','en_camino','entregado','creado','nueva_orden_admin'].includes(String(body.tipo));
  if (!record && !manual) return false;
  const settings=await gateway.client.from('eats_notification_settings').select('enabled').eq('singleton',true).maybeSingle();
  if (settings.error) {
    // Prior to the SQL release the existing route remains the only producer.
    if (settings.error.code==='PGRST205' || settings.error.code==='42P01') return false;
    throw new Error('notification_settings_unavailable');
  }
  if (!settings.data || object(settings.data).enabled!==true) return false;
  const key=record?.id || body.pedido_id || body.ticket_id;
  if (typeof key!=='string') return false;
  const query=gateway.client.from('pedidos').select('id,origen,restaurante_id');
  const lookup=/^[0-9a-f-]{36}$/i.test(key)?query.eq('id',key):query.eq('wb_message_id',key);
  const {data,error}=await lookup.maybeSingle();
  if (error) throw new Error('order_scope_unavailable');
  if (!data) return false;
  const order=object(data);
  if(typeof order.restaurante_id!=='string') return false;
  if(order.origen==='portal_restaurante') {
    if(typeof order.id!=='string') return false;
    // A public origin label is not authorization. Only the transactional
    // receipt of this exact order and branch enters the existing outbox.
    const receipt=await gateway.client.from('eats_restaurant_delivery_requests').select('id')
      .eq('pedido_id',order.id).eq('restaurante_id',order.restaurante_id)
      .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
    if(receipt.error || receipt.status!==200) throw new Error('restaurant_delivery_scope_unavailable');
    if(!receipt.data) return false;
  } else if(order.origen!=='web') return false;
  const restaurant=await gateway.client.from('restaurantes').select('es_socio').eq('id',order.restaurante_id).maybeSingle();
  if(restaurant.error) throw new Error('restaurant_scope_unavailable');
  return restaurant.data!==null && object(restaurant.data).es_socio!==false;
}

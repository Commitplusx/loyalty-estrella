import { promotionIdsFromCart, promotionMenuIds, validatePromotionCart } from './promotion-catalog.ts';

export type ObjectData = Record<string, unknown>;
export function object(value: unknown): ObjectData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Datos inválidos. Recarga el checkout.');
  return value as ObjectData;
}
export function text(value: unknown, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Faltan datos válidos del pedido.');
  return value.trim();
}
export function uuid(value: unknown): string {
  const id = text(value, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Identificador inválido.');
  return id.toLowerCase();
}
export function phone(value: unknown): string {
  const digits = text(value, 20).replace(/\D/g, '');
  if (!/^(?:52|521)?\d{10}$/.test(digits)) throw new Error('Escribe un teléfono mexicano de 10 dígitos.');
  return digits.slice(-10);
}
export function isCheckoutOtpSender(value: unknown): boolean {
  try { return phone(value).startsWith('220'); }
  catch { return false; }
}
export function money(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') throw new Error('Precio inválido.');
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new Error('Precio inválido.');
  return n;
}
function list(value: unknown, max = 100): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('Lista inválida.');
  return value;
}
function coordinate(value: unknown, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > maximum) throw new Error('Confirma una ubicación válida.');
  return value;
}
export interface Selection { grupo: string; opcion: string; precio_extra: number; menu_item_id?: string }
export interface Line { item: {id: string; tipo: 'item' | 'combo' | 'promo'; opcionesSeleccionadas: Selection[]}; cantidad: number }
export interface CashIntent {
  phone: string; key: string; restaurantId: string; name: string;
  delivery: 'domicilio' | 'tienda'; lat: number | null; lng: number | null;
  address: string | null; references: string | null; expectedTotal: number;
  couponId: string | null; couponCode: string | null; benefit: boolean;
  wallet: number; walletPin: string | null; cash: number; lines: Line[];
}
export function parseIntent(payloadValue: unknown, cartValue: unknown): CashIntent {
  const payload = object(payloadValue);
  if (payload.metodo_pago !== 'efectivo') throw new Error('Por ahora sólo aceptamos efectivo.');
  if (payload.tipo_pedido !== 'domicilio' && payload.tipo_pedido !== 'tienda') throw new Error('Elige domicilio o recogida.');
  const lines: Line[] = list(cartValue, 50).map((value): Line => {
    const line = object(value), item = object(line.item);
    if (item.tipo !== 'item' && item.tipo !== 'combo' && item.tipo !== 'promo') throw new Error('Producto inválido.');
    if (typeof line.cantidad !== 'number' || !Number.isInteger(line.cantidad) || line.cantidad < 1 || line.cantidad > 50) throw new Error('Cantidad inválida.');
    const selections = list(item.opcionesSeleccionadas ?? [], 50).map(value => {
      const s = object(value);
      return {grupo: text(s.grupo), opcion: text(s.opcion), precio_extra: 0, ...(s.menu_item_id ? {menu_item_id: uuid(s.menu_item_id)} : {})};
    });
    return {item: {id: uuid(item.id), tipo: item.tipo, opcionesSeleccionadas: selections}, cantidad: line.cantidad};
  });
  if (!lines.length || lines.reduce((sum, line) => sum + line.cantidad, 0) > 100) throw new Error('El carrito debe contener entre 1 y 100 productos.');
  const delivery = payload.tipo_pedido;
  return {
    phone: phone(payload.cliente_tel), key: uuid(payload.idempotency_key), restaurantId: uuid(payload.restaurante_id),
    name: text(payload.cliente_nombre, 120), delivery,
    lat: delivery === 'domicilio' ? coordinate(payload.lat, 90) : null,
    lng: delivery === 'domicilio' ? coordinate(payload.lng, 180) : null,
    address: delivery === 'domicilio' ? text(payload.direccion, 500) : null,
    references: payload.referencias_entrega ? text(payload.referencias_entrega, 1000) : null,
    expectedTotal: money(payload.total), couponId: payload.cupon_plataforma_id ? uuid(payload.cupon_plataforma_id) : null,
    couponCode: payload.cupon_cliente ? text(payload.cupon_cliente, 80).toUpperCase() : null,
    benefit: payload.usar_beneficio_fidelidad === true,
    wallet: payload.usar_saldo_vip === true ? money(payload.monto_saldo_vip) : 0,
    walletPin: payload.pin_vip ? text(payload.pin_vip, 10) : null,
    cash: money(payload.monto_efectivo ?? payload.total), lines,
  };
}
export interface Catalog {
  restaurant: ObjectData; products: ObjectData[]; combos: ObjectData[]; promotions: ObjectData[];
  linked: ObjectData[]; customer: ObjectData | null; zonePrice: number | null; coupon: ObjectData | null;
}
export function catalogStamp(product: ObjectData): ObjectData {
  return {id: product.id, restaurante_id: product.restaurante_id,
    price: money(product.precio_especial ?? product.precio), opciones: product.opciones ?? null,
    disponible: product.disponible ?? true, activo: product.activa ?? product.activo ?? true,
    agotado_hoy: product.agotado_hoy ?? false, aplica_subsidio: product.aplica_subsidio ?? true};
}
function available(product: ObjectData): boolean {
  return product.disponible === true && product.activo !== false && product.agotado_hoy !== true;
}
function canonicalOptions(product: ObjectData, selections: Selection[]): Selection[] {
  const groups = list(product.opciones ?? [], 30).map(object);
  const chosen = new Map<string, Set<string>>();
  const result = selections.map(s => {
    const group = groups.find(g => g.titulo === s.grupo);
    const option = group && list(group.opciones, 500).map(object).find(o => o.nombre === s.opcion);
    if (!group || !option) throw new Error('Una opción ya no pertenece al producto. Vuelve a elegirla.');
    const names = chosen.get(s.grupo) ?? new Set<string>();
    if (names.has(s.opcion)) throw new Error('Una opción está duplicada.');
    names.add(s.opcion); chosen.set(s.grupo, names);
    if (option.menu_item_id !== undefined && option.menu_item_id !== s.menu_item_id) throw new Error('La opción no corresponde al menú.');
    return {...s, precio_extra: money(option.precio_extra ?? 0)};
  });
  for (const g of groups) {
    const count = chosen.get(text(g.titulo))?.size ?? 0;
    const max = g.maximo_selecciones ?? 1;
    if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || count > max || (g.requerido === true && count < 1)) throw new Error('Completa las opciones del producto.');
  }
  return result;
}
function couponDiscount(coupon: ObjectData, subtotal: number, shipping: number, now: Date): {discount: number; shipping: number} {
  if (coupon.activo !== true || (coupon.fecha_fin && new Date(text(coupon.fecha_fin)).getTime() < now.getTime())
    || (Number(coupon.uso_maximo) > 0 && Number(coupon.usos_actuales) >= Number(coupon.uso_maximo))) throw new Error('El cupón ya no está disponible.');
  const value = money(coupon.valor);
  if (coupon.tipo === 'porcentaje') {
    if (value > 100) throw new Error('Cupón inválido.');
    return {discount: Math.min(subtotal, subtotal * value / 100), shipping};
  }
  if (coupon.tipo === 'fijo') return {discount: Math.min(subtotal, value), shipping};
  if (coupon.tipo === 'envio_gratis') return {discount: 0, shipping: 0};
  if (coupon.tipo === 'envio_fijo') return {discount: 0, shipping: Math.min(shipping, value)};
  throw new Error('Tipo de cupón inválido.');
}
/** Construct only server-owned order fields. Never spread a client payload. */
export function canonicalOrder(intent: CashIntent, catalog: Catalog, now = new Date()): ObjectData {
  if (intent.wallet > 0) throw new Error('Por ahora el pedido se paga únicamente en efectivo. Conservamos tu saldo VIP.');
  const rest = catalog.restaurant;
  if (rest.id !== intent.restaurantId || rest.activo !== true) throw new Error('El restaurante ya no acepta pedidos.');
  const promoIds = promotionIdsFromCart(intent.lines);
  const promoLines = promoIds.length ? validatePromotionCart(intent.lines, catalog.promotions, catalog.linked, intent.restaurantId, now) : [];
  const items: ObjectData[] = [];
  let subtotal = 0, subsidy = 0;
  for (const [index, line] of intent.lines.entries()) {
    const sources = line.item.tipo === 'item' ? catalog.products : line.item.tipo === 'combo' ? catalog.combos : catalog.promotions;
    const product = sources.find(p => p.id === line.item.id && p.restaurante_id === intent.restaurantId);
    if (!product || (line.item.tipo !== 'promo' && !available(product))) throw new Error('Un producto ya no está disponible. Recarga el menú.');
    const options = line.item.tipo === 'promo' ? promoLines.find(l => l.index === index)?.selections ?? [] : canonicalOptions(product, line.item.opcionesSeleccionadas);
    const price = money(line.item.tipo === 'promo' ? product.precio_especial : product.precio) + options.reduce((sum, s) => sum + s.precio_extra, 0);
    subtotal += price * line.cantidad;
    if (product.aplica_subsidio !== false) subsidy += line.cantidad * 8;
    items.push({cantidad: line.cantidad, item: {id: product.id, tipo: line.item.tipo, nombre: text(product.nombre), precio: price,
      aplica_subsidio: product.aplica_subsidio !== false, opcionesSeleccionadas: options}});
  }
  const customer = catalog.customer;
  let shipping = 0;
  if (intent.delivery === 'domicilio') {
    if (catalog.zonePrice === null) throw new Error('La ubicación está fuera de cobertura. Confirma otra ubicación.');
    const tariff = customer?.es_vip === true ? (Number(customer.puntos) < 26 ? 10 : 7) : money(catalog.zonePrice);
    shipping = Math.max(0, tariff - subsidy);
  }
  const driverShipping = shipping;
  if (intent.benefit) {
    if (intent.delivery !== 'domicilio') throw new Error('Al recoger en tienda el envío ya es gratis. Guarda tu beneficio para un pedido a domicilio.');
    if (!customer || customer.es_vip === true || !(Number(customer.envios_gratis_disponibles) > 0 || Number(customer.puntos) >= 6)) throw new Error('No tienes un envío gratis disponible.');
    shipping = 0;
  }
  let discount = 0;
  if (intent.couponId || intent.couponCode) {
    if (!catalog.coupon || (intent.couponId && catalog.coupon.id !== intent.couponId)
      || (catalog.coupon.restaurante_id && catalog.coupon.restaurante_id !== intent.restaurantId)) throw new Error('Cupón inválido.');
    const result = couponDiscount(catalog.coupon, subtotal, shipping, now);
    discount = result.discount; shipping = result.shipping;
  }
  const total = Math.round(Math.max(0, subtotal + shipping - discount) * 100) / 100;
  if (Math.abs(total - intent.expectedTotal) > 0.01) throw new Error('El precio cambió. Revisa el resumen antes de confirmar.');
  if (intent.cash < total) throw new Error('El efectivo indicado no cubre el total.');
  const desc = items.map(line => {
    const item = object(line.item);
    const opts = list(item.opcionesSeleccionadas).map(object).map(s => s.opcion).join(', ');
    return line.cantidad + ' × ' + item.nombre + (opts ? ' (' + opts + ')' : '');
  }).join('\n') + '\nPago en efectivo con $' + intent.cash.toFixed(2);
  return {
    cliente_tel: intent.phone, cliente_nombre: intent.name, restaurante_id: intent.restaurantId, restaurante: text(rest.nombre),
    restaurante_lat: coordinate(rest.lat, 90), restaurante_lng: coordinate(rest.lng, 180),
    tipo_pedido: intent.delivery, metodo_pago: 'efectivo', estado: 'pendiente', estado_pago: 'pendiente', estado_cocina: 'pendiente',
    direccion: intent.address, referencias_entrega: intent.references, lat: intent.lat, lng: intent.lng,
    descripcion: desc, items, total, precio_entrega: driverShipping,
    descuento_plataforma: Math.min(discount, subtotal + shipping) + driverShipping - shipping,
    cupon_plataforma_id: intent.couponId, idempotency_key: intent.key,
    _catalog: [...catalog.products.map(row => ({kind: 'item', stamp: catalogStamp(row)})),
      ...catalog.combos.map(row => ({kind: 'combo', stamp: catalogStamp(row)})),
      ...catalog.promotions.map(row => ({kind: 'promo', stamp: catalogStamp(row)})),
      ...catalog.linked.filter(row => !catalog.products.some(p => p.id === row.id)).map(row => ({kind: 'item', stamp: catalogStamp(row)}))],
    _wallet: intent.wallet, _benefit: intent.benefit, _coupon_id: catalog.coupon?.id ?? null,
    _coupon_type: catalog.coupon?.tipo ?? null, _coupon_value: catalog.coupon?.valor ?? null,
    _coupon_restaurant: Boolean(catalog.coupon?.restaurante_id),
  };
}
export function linkedProductIds(promotions: ObjectData[]): string[] { return promotionMenuIds(promotions); }
export async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export function secureCode(length: 4 | 6): string {
  const range = length === 6 ? 900000 : 9000;
  const max = Math.floor(0x100000000 / range) * range;
  let n: number;
  do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= max);
  return String(n % range + (length === 6 ? 100000 : 1000));
}

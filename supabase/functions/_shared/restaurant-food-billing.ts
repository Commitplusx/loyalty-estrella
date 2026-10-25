/** Presentation of the persisted checkout amounts. Never recalculates an order
 * price from today's catalog, free-form description, or a model response. */
export interface RestaurantFoodBilling { amount: string; payment: string }
export class RestaurantBillingError extends Error {
  constructor(readonly code: 'invalid_restaurant_billing'|'invalid_restaurant_amount'|'restaurant_items_unavailable'|'invalid_restaurant_quantity'|'restaurant_amounts_inconsistent'|'invalid_restaurant_delivery'|'invalid_restaurant_payment'|'restaurant_payment_unconfirmed'|'invalid_restaurant_identity') {
    super(code);
  }
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new RestaurantBillingError('invalid_restaurant_billing');
  return Object.fromEntries(Object.entries(value));
}
function amount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000) throw new RestaurantBillingError('invalid_restaurant_amount');
  return value;
}
function money(value: number): string {
  return '$' + (value / 100).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' MXN';
}
export function restaurantFoodBilling(value: unknown): RestaurantFoodBilling {
  const order = record(value);
  if (!Array.isArray(order.items) || order.items.length === 0 || order.items.length > 100) throw new RestaurantBillingError('restaurant_items_unavailable');
  let foodValue = 0;
  for (const raw of order.items) {
    const line = record(raw), item = record(line.item);
    if (typeof line.cantidad !== 'number' || !Number.isSafeInteger(line.cantidad) || line.cantidad < 1 || line.cantidad > 100) throw new RestaurantBillingError('invalid_restaurant_quantity');
    // Canonical checkout item.precio already includes the selected option prices.
    foodValue += amount(item.precio) * line.cantidad;
    if (!Number.isFinite(foodValue) || foodValue > 1000000) throw new RestaurantBillingError('invalid_restaurant_amount');
  }
  const totalValue = amount(order.total), shippingValue = amount(order.precio_entrega), discountValue = amount(order.descuento_plataforma);
  const total = Math.round(totalValue * 100), food = Math.round(foodValue * 100), discount = Math.round(discountValue * 100);
  // Checkout rounds the final total once; a percentage discount can retain
  // fractional cents in PostgreSQL. Do not round every unit/discount first.
  if (Math.abs(total - totalValue * 100) > 0.000001 || Math.round((foodValue + shippingValue - discountValue) * 100) !== total) throw new RestaurantBillingError('restaurant_amounts_inconsistent');
  if (order.tipo_pedido !== 'tienda' && order.tipo_pedido !== 'domicilio') throw new RestaurantBillingError('invalid_restaurant_delivery');
  if (order.tipo_pedido === 'tienda' && shippingValue !== 0) throw new RestaurantBillingError('restaurant_amounts_inconsistent');
  if (order.metodo_pago !== 'efectivo' && order.metodo_pago !== 'en_linea') throw new RestaurantBillingError('invalid_restaurant_payment');
  if (order.estado_pago === 'pagado') {
    return {amount: money(0), payment: (order.metodo_pago === 'en_linea' ? 'En línea' : 'Efectivo') + ' · pago confirmado; no cobrar otra vez. Comida: ' + money(food)};
  }
  if (order.estado_pago !== 'pendiente' || order.metodo_pago !== 'efectivo') throw new RestaurantBillingError('restaurant_payment_unconfirmed');
  // Pickup is collected from the customer; its final total has no delivery.
  // Delivery shows the restaurant's persisted food value, not the courier fee
  // or the customer's shipping subsidy. Platform discounts remain explicit.
  const due = order.tipo_pedido === 'tienda' ? total : food;
  const note = discount > 0 ? ' · descuento en el total del cliente: ' + money(discount) + '; consulta el desglose en el panel' : '';
  return {amount: money(due), payment: 'Efectivo · sólo comida, sin envío' + note};
}

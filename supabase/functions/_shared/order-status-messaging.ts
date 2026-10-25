export interface AcceptedOrderNames {
  customerName: unknown;
  driverName: unknown;
  restaurantName: unknown;
}

interface TemplateTextParameter {
  type: 'text';
  text: string;
}

export type AcceptedOrderBodyParameters = [
  TemplateTextParameter,
  TemplateTextParameter,
  TemplateTextParameter,
];

function displayName(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\s+/g, ' ') : fallback;
}

// Approved pedido_aceptado_v2 / es_MX: {{1}} customer, {{2}} driver, {{3}} restaurant.
// Named fields keep database roles independent of the template's positional contract.
export function acceptedOrderBodyParameters(names: AcceptedOrderNames): AcceptedOrderBodyParameters {
  return [
    { type: 'text', text: displayName(names.customerName, 'Cliente') },
    { type: 'text', text: displayName(names.driverName, 'tu repartidor') },
    { type: 'text', text: displayName(names.restaurantName, 'Restaurante') },
  ];
}

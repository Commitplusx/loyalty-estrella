import { acceptedOrderBodyParameters } from '../functions/_shared/order-status-messaging.ts';

function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Unexpected template roles');
}

Deno.test('approved acceptance template identifies customer, driver and restaurant in the correct roles', () => {
  const parameters = acceptedOrderBodyParameters({
    customerName: 'Cliente de prueba',
    driverName: 'Repartidor de prueba',
    restaurantName: 'Restaurante de prueba',
  });
  // Contract from the approved template, not from the outgoing implementation.
  const approvedBody = 'Hola, {{1}}; nuestro repartidor {{2}} ha aceptado tu pedido de {{3}}.';
  const rendered = parameters.reduce((text, parameter, index) => text.replace(`{{${index + 1}}}`, parameter.text), approvedBody);
  equal(rendered, 'Hola, Cliente de prueba; nuestro repartidor Repartidor de prueba ha aceptado tu pedido de Restaurante de prueba.');
  equal(parameters.map(parameter => parameter.type), ['text', 'text', 'text']);
});

Deno.test('a driver matching the customer name cannot replace the restaurant parameter', () => {
  const parameters = acceptedOrderBodyParameters({
    customerName: 'Persona de prueba', driverName: 'Persona de prueba', restaurantName: 'Sucursal de prueba',
  });
  equal(parameters.map(parameter => parameter.text), ['Persona de prueba', 'Persona de prueba', 'Sucursal de prueba']);
});

Deno.test('missing or invalid data uses role-specific labels without shifting other participants', () => {
  for (const missing of [null, undefined, '', '   ', 42, {}, []]) {
    equal(acceptedOrderBodyParameters({customerName: missing, driverName: 'Repartidor de prueba', restaurantName: 'Sucursal de prueba'})
      .map(parameter => parameter.text), ['Cliente', 'Repartidor de prueba', 'Sucursal de prueba']);
    equal(acceptedOrderBodyParameters({customerName: 'Cliente de prueba', driverName: missing, restaurantName: 'Sucursal de prueba'})
      .map(parameter => parameter.text), ['Cliente de prueba', 'tu repartidor', 'Sucursal de prueba']);
    equal(acceptedOrderBodyParameters({customerName: 'Cliente de prueba', driverName: 'Repartidor de prueba', restaurantName: missing})
      .map(parameter => parameter.text), ['Cliente de prueba', 'Repartidor de prueba', 'Restaurante']);
  }
});

Deno.test('names retain accents and punctuation and normalize accidental whitespace', () => {
  equal(acceptedOrderBodyParameters({
    customerName: '  José   de la Cruz  ', driverName: '\nMaría\tLópez ', restaurantName: " Pollo Robin's  Centro ",
  }).map(parameter => parameter.text), ['José de la Cruz', 'María López', "Pollo Robin's Centro"]);
});

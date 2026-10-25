import 'package:flutter_test/flutter_test.dart';
import 'package:estrella_admin/models/pedido_model.dart';

PedidoModel delivery({required double customerTotal, required double fee, required String instructions}) => PedidoModel.fromMap(<String, Object?>{
  'id': '00000000-0000-4000-8000-000000000001',
  'cliente_tel': '0000000000',
  'restaurante': 'Robin sintético · Sucursal',
  'descripcion': instructions,
  'estado': 'asignado',
  'tipo_pedido': 'restaurante_delivery',
  'metodo_pago': 'efectivo',
  'total': customerTotal,
  'precio_entrega': fee,
  'created_at': '2026-10-25T20:00:00Z',
  'updated_at': '2026-10-25T20:00:00Z',
});

void main() {
  test('manual Robin service preserves full driver fee and the exact customer cash charge', () {
    final order = delivery(customerTotal: 235, fee: 50, instructions: 'Comida pendiente: 200. Robin pone 15 y el cliente 35 del envío.');
    expect(order.total, 235);
    expect(order.costoEnvioCalculado, 50);
    expect(order.costoRestauranteCalculado, 185);
    expect(order.total! - order.costoRestauranteCalculado, 50);
  });
  test('prepaid food does not tell the driver to collect the restaurant share from the customer', () {
    final order = delivery(customerTotal: 35, fee: 50, instructions: 'Recibir de la sucursal: \$15.00 para completar el envío. No volver a cobrárselo al cliente.');
    expect(order.total, 35);
    expect(order.costoEnvioCalculado, 50);
    expect(order.costoRestauranteCalculado, 0);
    expect(order.descripcion, contains('Recibir de la sucursal: \$15.00'));
  });
}

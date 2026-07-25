import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'driver_pedidos_screen.dart';
export 'driver_pedidos_screen.dart' show pedidosActivosProvider, repartidoresListProvider;

class PedidosScreen extends ConsumerWidget {
  const PedidosScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return const DriverPedidosScreen();
  }
}

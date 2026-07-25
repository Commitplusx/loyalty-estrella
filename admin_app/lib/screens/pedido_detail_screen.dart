// lib/screens/pedido_detail_screen.dart
// Pantalla de detalle de pedido para el REPARTIDOR y ADMIN
// Se abre via deep-link: https://www.app-estrella.shop/pedido/{id}

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:go_router/go_router.dart';
import '../models/pedido_model.dart';
import '../services/pedido_service.dart';
import '../core/user_role.dart';
import '../services/gasto_service.dart';
import '../core/ui_helpers.dart';
import '../core/swipe_button.dart';
import 'package:flutter_map/flutter_map.dart';
import 'admin_dashboard_screen.dart' show statsProvider;
import '../main.dart' show stopAlarm;
import '../widgets/navigation_map.dart';
import '../widgets/ghost_trail_map.dart';
import '../widgets/incoming_order_overlay.dart';
import '../services/origin_island_service.dart';
import 'admin_pedido_detail_view.dart';
import 'driver_pedido_detail_view.dart';

final _pedidoProvider = FutureProvider.autoDispose.family<PedidoModel?, String>(
  (ref, id) => ref.read(pedidoServiceProvider).getPedido(id),
);

Color _estadoBadgeColor(String? estado) {
  switch (estado) {
    case 'asignado': return const Color(0xFF3B82F6);
    case 'recibido': return const Color(0xFFF59E0B);
    case 'en_camino': return const Color(0xFF8B5CF6);
    case 'entregado': return const Color(0xFF10B981);
    case 'cancelado': return Colors.redAccent;
    default: return Colors.black54;
  }
}

class PedidoDetailScreen extends ConsumerWidget {
  final String pedidoId;
  const PedidoDetailScreen({super.key, required this.pedidoId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    stopAlarm(); // Detener alarma ruidosa si estaba sonando
    
    // Escuchar cambios en tiempo real (incluso si los hace el Admin en la web)
    ref.listen<AsyncValue<PedidoModel?>>(_pedidoProvider(pedidoId), (previous, next) {
      // ⚠️ El Origin Island es EXCLUSIVO del repartidor — el admin NUNCA lo usa
      final isAdmin = ref.read(isAdminProvider);
      if (isAdmin) return;

      if (next.hasValue && next.value != null) {
        final pedido = next.value!;
        final estado = pedido.estado;
        if (estado != 'entregado' && estado != 'cancelado' && estado != 'pendiente') {
          OriginIslandService.updateIsland(
            'Pedido ${estado?.replaceAll('_', ' ') ?? 'Activo'}',
            'A: ${pedido.clienteNombre ?? "Cliente"}',
          );
        } else if (estado == 'entregado' || estado == 'cancelado') {
          OriginIslandService.stopIsland();
        }
      }
    });

    final pedidoAsync = ref.watch(_pedidoProvider(pedidoId));
    final theme = Theme.of(context);

    return pedidoAsync.when(
      loading: () => Scaffold(
          appBar: AppBar(title: const Text('Detalle del Pedido')),
          body: Center(
              child:
                  CircularProgressIndicator(color: theme.colorScheme.primary))),
      error: (e, _) => Scaffold(
          appBar: AppBar(title: const Text('Detalle del Pedido')),
          body: Center(
              child: Text('Error: $e',
                  style: TextStyle(color: theme.colorScheme.error)))),
      data: (pedido) {
        if (pedido == null) {
          return Scaffold(
              appBar: AppBar(title: const Text('Detalle del Pedido')),
              body: Center(
                child: Text('Pedido no encontrado',
                    style: theme.textTheme.bodyLarge?.copyWith(
                        color: theme.colorScheme.onSurface.withOpacity(0.5))),
              ));
        }
        final isAdmin = ref.watch(isAdminProvider);

        // Si es repartidor y el pedido sigue pendiente (ofrecido, no aceptado aún), mostrar Overlay Rappi-style
        if (!isAdmin && pedido.estado == 'pendiente') {
          return IncomingOrderOverlay(
            pedido: pedido,
            onAccept: () {
              PremiumToast.show(context,
                  title: 'Pedido Aceptado',
                  description: '¡Buen viaje y maneja con cuidado!',
                  isError: false);
                  
              OriginIslandService.startIsland(
                'Pedido Aceptado', 
                'Dirígete a: ${pedido.restaurante ?? "Restaurante"}'
              );
              
              ref.invalidate(_pedidoProvider(pedidoId));
              ref.invalidate(statsProvider);
            },
            onReject: () {
              PremiumToast.show(context,
                  title: 'Pedido Rechazado',
                  description: 'Asignando a otro repartidor...',
                  isError: true);
              ref.invalidate(_pedidoProvider(pedidoId));
              ref.invalidate(statsProvider);
              context.go('/dashboard');
            },
          );
        }

        final shortId = pedidoId.replaceAll('-', '').substring(pedidoId.replaceAll('-', '').length - 5).toUpperCase();
        return Scaffold(
          backgroundColor: theme.scaffoldBackgroundColor,
          appBar: AppBar(
            systemOverlayStyle: theme.brightness == Brightness.dark 
                ? SystemUiOverlayStyle.light 
                : SystemUiOverlayStyle.dark,
            backgroundColor: theme.scaffoldBackgroundColor,
            elevation: 0,
            surfaceTintColor: Colors.transparent,
            leading: Padding(
              padding: const EdgeInsets.all(10),
              child: GestureDetector(
                onTap: () {
                  if (Navigator.canPop(context)) {
                    Navigator.pop(context);
                  } else {
                    context.go('/dashboard');
                  }
                },
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.black,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 16),
                ),
              ),
            ),
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Detalle del Pedido',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: theme.colorScheme.onSurface)),
                Text('EST-$shortId',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: theme.colorScheme.onSurface.withOpacity(0.4), letterSpacing: 1.2)),
              ],
            ),
            actions: [
              if (pedido.estado != 'entregado' && pedido.estado != 'cancelado')
                Container(
                  margin: const EdgeInsets.only(right: 12),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: _estadoBadgeColor(pedido.estado).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: _estadoBadgeColor(pedido.estado).withOpacity(0.3)),
                  ),
                  child: Text(
                    pedido.estadoLabel.toUpperCase(),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: _estadoBadgeColor(pedido.estado),
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
            ],
          ),
          body: AdminPedidoDetailView(
            pedido: pedido,
            onRefresh: () {
              ref.invalidate(_pedidoProvider(pedidoId));
              ref.invalidate(statsProvider);
            },
          ),
        );
      },
    );
  }
}

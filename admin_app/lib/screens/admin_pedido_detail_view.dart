import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/pedido_model.dart';
import '../services/pedido_service.dart';
import '../core/ui_helpers.dart';
import '../core/user_role.dart';
import '../widgets/ghost_trail_map.dart';

class AdminPedidoDetailView extends ConsumerStatefulWidget {
  final PedidoModel pedido;
  final VoidCallback onRefresh;

  const AdminPedidoDetailView({
    super.key,
    required this.pedido,
    required this.onRefresh,
  });

  @override
  ConsumerState<AdminPedidoDetailView> createState() => _AdminPedidoDetailViewState();
}

class _AdminPedidoDetailViewState extends ConsumerState<AdminPedidoDetailView> {
  bool _loading = false;

  Color _estadoColor(String? estado) {
    switch (estado) {
      case 'pendiente':
        return const Color(0xFFEA580C);
      case 'asignado':
        return const Color(0xFF3B82F6);
      case 'en_cocina':
        return const Color(0xFFEAB308);
      case 'listo_para_recoger':
        return const Color(0xFF14B8A6);
      case 'recibido':
        return const Color(0xFFF59E0B);
      case 'en_camino':
        return const Color(0xFF8B5CF6);
      case 'entregado':
        return const Color(0xFF10B981);
      case 'cancelado':
        return Colors.redAccent;
      case 'pendiente_pago':
        return const Color(0xFF6366F1);
      default:
        return Colors.black54;
    }
  }

  IconData _estadoIcon(String? estado) {
    switch (estado) {
      case 'pendiente':
        return Icons.search_rounded;
      case 'asignado':
        return Icons.motorcycle_rounded;
      case 'en_cocina':
        return Icons.restaurant_rounded;
      case 'listo_para_recoger':
        return Icons.takeout_dining_rounded;
      case 'recibido':
        return Icons.inventory_2_rounded;
      case 'en_camino':
        return Icons.directions_bike_rounded;
      case 'entregado':
        return Icons.check_circle_rounded;
      case 'cancelado':
        return Icons.cancel_rounded;
      case 'pendiente_pago':
        return Icons.payments_rounded;
      default:
        return Icons.help_outline_rounded;
    }
  }

  Future<void> _reasignarRepartidor() async {
    final sb = Supabase.instance.client;

    setState(() => _loading = true);
    final data = await sb
        .from('repartidores')
        .select('id, user_id, nombre')
        .eq('activo', true)
        .order('nombre');
    setState(() => _loading = false);

    if (!mounted) return;

    final repartidorElegido = await PremiumBottomSheet.showCustom<Map<String, dynamic>>(
      context,
      title: 'Reasignar Repartidor',
      child: ListView.separated(
        shrinkWrap: true,
        physics: const BouncingScrollPhysics(),
        itemCount: data.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (ctx, i) {
          final rep = data[i];
          final tieneCuenta = rep['user_id'] != null;
          return ListTile(
            enabled: tieneCuenta,
            leading: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: tieneCuenta
                    ? Theme.of(context).colorScheme.primary.withOpacity(0.1)
                    : Colors.orange.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                tieneCuenta ? Icons.two_wheeler_rounded : Icons.warning_amber_rounded,
                color: tieneCuenta ? Theme.of(context).colorScheme.primary : Colors.orange,
              ),
            ),
            title: Text(
              rep['nombre'] ?? 'Sin Nombre',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: tieneCuenta ? null : Colors.grey,
              ),
            ),
            subtitle: tieneCuenta
                ? null
                : const Text(
                    'Debe hacer login en la app primero',
                    style: TextStyle(fontSize: 11, color: Colors.orange),
                  ),
            trailing: tieneCuenta
                ? const Icon(Icons.chevron_right_rounded)
                : const Icon(Icons.lock_outline_rounded, color: Colors.orange, size: 18),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            onTap: tieneCuenta ? () => Navigator.pop(ctx, rep) : null,
          );
        },
      ),
    );

    if (repartidorElegido != null) {
      final repId = repartidorElegido['user_id'];
      if (repId != null) {
        setState(() => _loading = true);
        final error = await ref
            .read(pedidoServiceProvider)
            .reasignarPedido(widget.pedido.id, repId.toString());
        setState(() => _loading = false);

        if (mounted) {
          PremiumToast.show(
            context,
            title: error == null ? 'Reasignado' : 'Error',
            description: error == null
                ? 'Notificado al nuevo repartidor'
                : 'Error al reasignar: $error',
            isError: error != null,
          );
          if (error == null) widget.onRefresh();
        }
      }
    }
  }

  Future<void> _forzarCancelacion() async {
    final confirm = await PremiumBottomSheet.showConfirm(
      context,
      title: 'Cancelar Pedido',
      content: '¿Estás seguro de que quieres forzar la cancelación de este pedido? Esta acción no se puede deshacer.',
      confirmText: 'Sí, Cancelar',
      cancelText: 'Volver',
    );

    if (confirm == true) {
      setState(() => _loading = true);
      final error = await ref.read(pedidoServiceProvider).actualizarEstado(widget.pedido.id, 'cancelado');
      setState(() => _loading = false);

      if (mounted) {
        PremiumToast.show(
          context,
          title: error == null ? 'Cancelado' : 'Error',
          description: error == null ? 'Pedido cancelado correctamente.' : 'Error: $error',
          isError: error != null,
        );
        if (error == null) widget.onRefresh();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final pedido = widget.pedido;
    final color = _estadoColor(pedido.estado);
    
    final minutosRetraso = DateTime.now().difference(pedido.createdAt).inMinutes;
    final estaAtrasado = pedido.estado != 'entregado' && pedido.estado != 'cancelado' && minutosRetraso > 20;
    final bannerColor = (pedido.estado == 'pendiente' || estaAtrasado) ? const Color(0xFFEA580C) : color;

    return Stack(
      children: [
        SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
          physics: const BouncingScrollPhysics(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── HEADER ESTADO ──
              _buildHeader(bannerColor, isDark, estaAtrasado, minutosRetraso),
              const SizedBox(height: 24),

              // ── RUTA (ORIGEN Y DESTINO) ──
              _buildRutaCard(isDark),
              const SizedBox(height: 24),

              // ── FINANCIERO & MÉTODO PAGO ──
              _buildFinancieroCard(isDark),
              const SizedBox(height: 24),

              // ── REPARTIDOR ASIGNADO ──
              _buildRepartidorCard(isDark),
              const SizedBox(height: 24),
              
              // ── QUÉ LLEVAS ──
              _buildPaqueteCard(isDark),
              const SizedBox(height: 24),

              // ── MAPA FANTASMA (AUDITORÍA) ──
              if (pedido.estado == 'entregado' && pedido.repartidorId != null) ...[
                Text('Auditoría de Ruta', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: theme.colorScheme.onSurface)),
                const SizedBox(height: 12),
                GhostTrailMap(
                  repartidorId: pedido.repartidorId!,
                  startTime: pedido.createdAt,
                  endTime: pedido.updatedAt,
                ),
                const SizedBox(height: 24),
              ],

              // ── ACCIONES PELIGROSAS ──
              if (pedido.estado != 'entregado' && pedido.estado != 'cancelado') ...[
                const Divider(),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 54,
                  child: OutlinedButton.icon(
                    onPressed: _forzarCancelacion,
                    icon: const Icon(Icons.cancel_rounded, color: Colors.redAccent),
                    label: const Text('Forzar Cancelación', style: TextStyle(color: Colors.redAccent, fontSize: 16, fontWeight: FontWeight.w800)),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Colors.redAccent, width: 2),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                  ),
                ),
                const SizedBox(height: 40), // Espacio inferior
              ],
            ],
          ),
        ),

        // LOADING OVERLAY
        if (_loading)
          Positioned.fill(
            child: Container(
              color: isDark ? Colors.black54 : Colors.white60,
              child: const Center(
                child: CircularProgressIndicator(),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildHeader(Color bannerColor, bool isDark, bool estaAtrasado, int minutosRetraso) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isDark ? bannerColor.withOpacity(0.1) : Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: isDark ? [] : [
          BoxShadow(color: bannerColor.withOpacity(0.08), blurRadius: 24, offset: const Offset(0, 10))
        ],
        border: Border.all(color: bannerColor.withOpacity(isDark ? 0.3 : 0.1), width: 1.5),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: bannerColor.withOpacity(0.15), shape: BoxShape.circle),
            child: Icon(estaAtrasado ? Icons.timer_off_rounded : _estadoIcon(widget.pedido.estado), color: bannerColor, size: 32),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  estaAtrasado ? 'RETRASO DE ${minutosRetraso}M' : widget.pedido.estadoLabel.toUpperCase(),
                  style: TextStyle(color: bannerColor, fontSize: 17, fontWeight: FontWeight.w900, letterSpacing: 0.5),
                ),
                const SizedBox(height: 4),
                Text(
                  DateFormat('dd MMM yyyy - hh:mm a').format(widget.pedido.createdAt),
                  style: TextStyle(color: bannerColor.withOpacity(0.7), fontSize: 12, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRutaCard(bool isDark) {
    final theme = Theme.of(context);
    final p = widget.pedido;
    
    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: isDark ? [] : [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 15, offset: const Offset(0, 5))],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Ruta de Entrega', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: theme.colorScheme.onSurface)),
          const SizedBox(height: 20),
          
          // Origen (Restaurante)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  Container(
                    width: 32, height: 32,
                    decoration: BoxDecoration(color: const Color(0xFF1E293B), borderRadius: BorderRadius.circular(8)),
                    child: const Icon(Icons.storefront_rounded, color: Colors.white, size: 18),
                  ),
                  Container(width: 2, height: 30, color: theme.colorScheme.onSurface.withOpacity(0.1), margin: const EdgeInsets.symmetric(vertical: 4)),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Origen (Restaurante)', style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurface.withOpacity(0.5), fontWeight: FontWeight.w700)),
                    Text(p.restaurante?.isNotEmpty == true ? p.restaurante! : 'Estrella', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: theme.colorScheme.onSurface)),
                  ],
                ),
              ),
            ],
          ),
          
          // Destino (Cliente)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 32, height: 32,
                decoration: BoxDecoration(color: theme.colorScheme.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                child: Icon(Icons.person_pin_circle_rounded, color: theme.colorScheme.primary, size: 18),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Destino (Cliente)', style: TextStyle(fontSize: 11, color: theme.colorScheme.onSurface.withOpacity(0.5), fontWeight: FontWeight.w700)),
                    Text(p.clienteNombre?.isNotEmpty == true ? p.clienteNombre! : 'Sin Nombre', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: theme.colorScheme.onSurface)),
                    const SizedBox(height: 4),
                    Text(p.clienteTel.isNotEmpty ? p.clienteTel : 'Sin teléfono', style: TextStyle(fontSize: 13, color: theme.colorScheme.primary, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
              if (p.clienteTel.isNotEmpty)
                IconButton(
                  icon: const Icon(Icons.phone_rounded, color: Colors.green),
                  style: IconButton.styleFrom(backgroundColor: Colors.green.withOpacity(0.1)),
                  onPressed: () => launchUrl(Uri.parse('tel:${p.clienteTel}')),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFinancieroCard(bool isDark) {
    final theme = Theme.of(context);
    final p = widget.pedido;
    
    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: isDark ? [] : [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 15, offset: const Offset(0, 5))],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Resumen Financiero', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: theme.colorScheme.onSurface)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: p.metodoPago == 'efectivo' ? const Color(0xFFF59E0B).withOpacity(0.1) : const Color(0xFF10B981).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(p.metodoPago == 'efectivo' ? Icons.payments_rounded : Icons.credit_card_rounded, 
                      size: 14, 
                      color: p.metodoPago == 'efectivo' ? const Color(0xFFF59E0B) : const Color(0xFF10B981)
                    ),
                    const SizedBox(width: 4),
                    Text(p.metodoPago == 'efectivo' ? 'EFECTIVO' : 'EN LÍNEA', style: TextStyle(
                      fontSize: 10, fontWeight: FontWeight.w900,
                      color: p.metodoPago == 'efectivo' ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
                    )),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Costo de Envío', style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurface.withOpacity(0.6), fontWeight: FontWeight.w600)),
              Text('\$${(p.precioEntrega ?? 0).toStringAsFixed(2)}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: theme.colorScheme.onSurface)),
            ],
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Divider(height: 1),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Total del Pedido', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: theme.colorScheme.onSurface)),
              Text('\$${(p.total ?? 0).toStringAsFixed(2)}', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: theme.colorScheme.onSurface)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildRepartidorCard(bool isDark) {
    final theme = Theme.of(context);
    final p = widget.pedido;
    
    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: isDark ? [] : [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 15, offset: const Offset(0, 5))],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Repartidor', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: theme.colorScheme.onSurface)),
              if (p.estado != 'entregado' && p.estado != 'cancelado')
                InkWell(
                  onTap: _reasignarRepartidor,
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.all(4.0),
                    child: Text('Reasignar', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: theme.colorScheme.primary)),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          if (p.repartidorId != null)
            Row(
              children: [
                Container(
                  width: 48, height: 48,
                  decoration: BoxDecoration(color: theme.colorScheme.primary.withOpacity(0.1), shape: BoxShape.circle),
                  child: Icon(Icons.two_wheeler_rounded, color: theme.colorScheme.primary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p.repartidorNombre ?? 'Desconocido', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: theme.colorScheme.onSurface)),
                    ],
                  ),
                ),
              ],
            )
          else
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.orange.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
              child: const Row(
                children: [
                  Icon(Icons.warning_amber_rounded, color: Colors.orange),
                  SizedBox(width: 12),
                  Text('Sin repartidor asignado', style: TextStyle(color: Colors.orange, fontWeight: FontWeight.w800)),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildPaqueteCard(bool isDark) {
    final theme = Theme.of(context);
    final p = widget.pedido;
    
    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: isDark ? [] : [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 15, offset: const Offset(0, 5))],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Contenido del Paquete', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: theme.colorScheme.onSurface)),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: theme.colorScheme.onSurface.withOpacity(0.04),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Text(
              p.descripcion?.isNotEmpty == true ? p.descripcion! : 'Sin detalles específicos.',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: theme.colorScheme.onSurface.withOpacity(0.9), height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}

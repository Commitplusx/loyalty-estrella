// lib/screens/pedido_detail_screen.dart
// Pantalla de detalle de pedido para el REPARTIDOR
// Se abre via deep-link: https://www.app-estrella.shop/pedido/{id}

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:image_picker/image_picker.dart';
import '../models/pedido_model.dart';
import '../services/pedido_service.dart';
import '../core/user_role.dart';
import '../services/repartidor_service.dart';
import '../services/gasto_service.dart';
import '../core/ui_helpers.dart';
import 'package:flutter_map/flutter_map.dart';
import 'dashboard_screen.dart' show statsProvider;
import 'pedidos_screen.dart' show pedidosActivosProvider;

final _pedidoProvider = FutureProvider.autoDispose.family<PedidoModel?, String>(
  (ref, id) => ref.read(pedidoServiceProvider).getPedido(id),
);

class PedidoDetailScreen extends ConsumerWidget {
  final String pedidoId;
  const PedidoDetailScreen({super.key, required this.pedidoId});

  static Future<void> show(BuildContext context, String pedidoId) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      useRootNavigator: true,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.85, maxChildSize: 0.95, minChildSize: 0.5,
        builder: (ctx, scrollController) => Container(
          decoration: BoxDecoration(
            color: isDark ? theme.scaffoldBackgroundColor : const Color(0xFFF8FAFC),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
          ),
          child: Column(
            children: [
              Center(child: Container(margin: const EdgeInsets.symmetric(vertical: 16), width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey.withOpacity(0.3), borderRadius: BorderRadius.circular(10)))),
              Expanded(
                child: Consumer(
                  builder: (context, ref, child) {
                    final asyncVal = ref.watch(_pedidoProvider(pedidoId));
                    return asyncVal.when(
                       loading: () => Center(child: CircularProgressIndicator(color: theme.colorScheme.primary)),
                       error: (e, _) => Center(child: Text('Error: $e', style: TextStyle(color: theme.colorScheme.error))),
                       data: (pedido) => pedido == null 
                         ? Center(child: Text('Pedido no encontrado', style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.5)))) 
                         : _PedidoBody(
                             pedido: pedido, 
                             scrollController: scrollController, 
                             onEstadoActualizado: () {
                               ref.invalidate(_pedidoProvider(pedidoId));
                               ref.invalidate(statsProvider);
                               ref.invalidate(pedidosActivosProvider);
                             }
                           )
                    );
                  }
                )
              )
            ]
          )
        )
      )
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pedidoAsync = ref.watch(_pedidoProvider(pedidoId));
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Detalle del Pedido'),
      ),
      body: pedidoAsync.when(
        loading: () => Center(child: CircularProgressIndicator(color: theme.colorScheme.primary)),
        error: (e, _) => Center(child: Text('Error: $e', style: TextStyle(color: theme.colorScheme.error))),
        data: (pedido) {
          if (pedido == null) {
            return Center(
              child: Text('Pedido no encontrado', style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.5))),
            );
          }
          return _PedidoBody(
            pedido: pedido,
            onEstadoActualizado: () {
              ref.invalidate(_pedidoProvider(pedidoId));
              ref.invalidate(statsProvider);
              ref.invalidate(pedidosActivosProvider);
            },
          );
        },
      ),
    );
  }
}

class _PedidoBody extends ConsumerStatefulWidget {
  final PedidoModel pedido;
  final VoidCallback onEstadoActualizado;
  final ScrollController? scrollController;

  const _PedidoBody({required this.pedido, required this.onEstadoActualizado, this.scrollController});

  @override
  ConsumerState<_PedidoBody> createState() => _PedidoBodyState();
}

class _PedidoBodyState extends ConsumerState<_PedidoBody> {
  bool _loading = false;

  Future<void> _avanzarEstado() async {
    final siguiente = widget.pedido.siguienteEstado;
    if (siguiente == null) return;

    final theme = Theme.of(context);
    final color = _estadoColor(siguiente);

    final confirm = await PremiumBottomSheet.showConfirm(
      context,
      title: widget.pedido.siguienteEstadoLabel ?? 'Confirmar',
      content: '¿Confirmar cambio de estado a "${_estadoLabel(siguiente)}"?',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
    );

    if (confirm != true) return;

    setState(() => _loading = true);

    // ── LÓGICA DE FOTO FACHADA PARA EL REPARTIDOR ──
    if (siguiente == 'entregado') {
      try {
        final sb = Supabase.instance.client;
        final clienteTel = widget.pedido.clienteTel.replaceAll(RegExp(r'\D'), '');
        final cliente = await sb.from('clientes').select('foto_fachada_url').eq('telefono', clienteTel).maybeSingle();
        
        if (cliente == null || cliente['foto_fachada_url'] == null) {
          final ImagePicker picker = ImagePicker();
          final XFile? photo = await picker.pickImage(source: ImageSource.camera, imageQuality: 70);
          if (photo != null) {
            final file = File(photo.path);
            final pathName = 'fachada_${clienteTel}_${DateTime.now().millisecondsSinceEpoch}.jpg';
            await sb.storage.from('fachadas_clientes').upload(pathName, file);
            final urlPublica = sb.storage.from('fachadas_clientes').getPublicUrl(pathName);
            await sb.from('clientes').update({'foto_fachada_url': urlPublica}).eq('telefono', clienteTel);
          }
        }
      } catch (e) {
        debugPrint('Aviso: Falla al subir fachada $e');
      }
    }

    final ok = await ref
        .read(pedidoServiceProvider)
        .actualizarEstado(widget.pedido.id, siguiente);
    setState(() => _loading = false);

    if (mounted) {
      PremiumToast.show(
        context,
        title: ok ? 'Estado actualizado' : 'Error',
        description: ok ? 'Mensaje enviado al cliente por WhatsApp' : 'Error al actualizar el estado',
        isError: !ok,
      );
      if (ok) widget.onEstadoActualizado();
    }
  }

  Future<void> _reasignarRepartidor() async {
    final sb = Supabase.instance.client;
    
    setState(() => _loading = true);
    // Traemos TODOS los repartidores activos (con y sin cuenta auth)
    final data = await sb.from('repartidores').select('id, user_id, nombre').eq('activo', true).order('nombre');
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
        final ok = await ref.read(pedidoServiceProvider).reasignarPedido(widget.pedido.id, repId.toString());
        setState(() => _loading = false);

        if (mounted) {
          PremiumToast.show(
            context,
            title: ok ? 'Reasignado' : 'Error',
            description: ok ? 'Notificado al nuevo repartidor' : 'Error al reasignar',
            isError: !ok,
          );
          if (ok) widget.onEstadoActualizado();
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final pedido = widget.pedido;
    final color = _estadoColor(pedido.estado);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final isAdmin = ref.watch(isAdminProvider);

    final minutosRetraso = DateTime.now().difference(pedido.createdAt).inMinutes;
    final estaAtrasado = pedido.estado != 'entregado' && pedido.estado != 'cancelado' && minutosRetraso > 20;
    
    // Forzar color naranja si está pendiente o atrasado
    final bannerColor = (pedido.estado == 'pendiente' || estaAtrasado) 
        ? const Color(0xFFEA580C) 
        : color;

    double? finalLat = pedido.lat;
    double? finalLng = pedido.lng;

    if (finalLat == null || finalLng == null) {
      final regex = RegExp(r'https:\/\/www\.google\.com\/maps\?q=([0-9.-]+),([0-9.-]+)');
      final match = regex.firstMatch(pedido.descripcion ?? '');
      if (match != null) {
        finalLat = double.tryParse(match.group(1)!);
        finalLng = double.tryParse(match.group(2)!);
      }
    }

    return ListView(
      controller: widget.scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      physics: const BouncingScrollPhysics(),
      children: [
        // ── Banner de Estado (Premium) ──
        Container(
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
                decoration: BoxDecoration(
                  color: bannerColor.withOpacity(0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  estaAtrasado ? Icons.timer_off_rounded : _estadoIcon(pedido.estado), 
                  color: bannerColor, 
                  size: 32
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      estaAtrasado ? 'RETRASO DE ${minutosRetraso}M' : pedido.estadoLabel.toUpperCase(),
                      style: TextStyle(
                        color: bannerColor,
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      estaAtrasado ? 'Este pedido requiere atención inmediata.' : _estadoSubtitulo(pedido.estado),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface.withOpacity(0.6),
                        fontSize: 12,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 24),

        // ── Barra de Progreso ──
        Container(
          padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
            borderRadius: BorderRadius.circular(24),
            boxShadow: isDark ? [] : [
              BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 15, offset: const Offset(0, 5))
            ],
          ),
          child: _ProgressoEstados(estadoActual: pedido.estado),
        ),

        const SizedBox(height: 24),

        // ── GPS Card ──
        if (finalLat != null && finalLng != null)
          _GpsCard(lat: finalLat, lng: finalLng),

        // ── Detalles de la Orden ──
        _SectionTitle(title: 'Detalles de la Orden', icon: Icons.receipt_long_rounded),
        Container(
          decoration: BoxDecoration(color: isDark ? const Color(0xFF1E1E1E) : Colors.white, borderRadius: BorderRadius.circular(24), boxShadow: isDark ? [] : [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 15, offset: const Offset(0, 5))]),
          child: Column(
            children: [
              if (pedido.tipoPedido == 'mandadito') ...[
                _InfoRow(icon: Icons.inventory_2_rounded, title: 'Tipo', value: 'Mandadito', isFirst: true),
                if (pedido.origen != null) _InfoRow(icon: Icons.flight_takeoff_rounded, title: 'Origen', value: pedido.origen!),
                if (pedido.destino != null) _InfoRow(icon: Icons.flight_land_rounded, title: 'Destino', value: pedido.destino!),
                _InfoRow(icon: Icons.payment_rounded, title: 'Pago', value: pedido.metodoPago == 'transferencia' ? 'Transferencia' : 'Efectivo'),
                _InfoRow(icon: Icons.attach_money_rounded, title: 'Precio', value: '\$${pedido.precioEntrega ?? 0}', isLast: true),
              ] else ...[
                if (pedido.restaurante != null && pedido.restaurante!.isNotEmpty)
                  _InfoRow(icon: Icons.storefront_rounded, title: 'Restaurante', value: pedido.restaurante!, isFirst: true),
                _InfoRow(
                  icon: Icons.subject_rounded, 
                  title: 'Descripción', 
                  value: pedido.descripcion ?? 'Sin descripción', 
                  isFirst: pedido.restaurante == null || pedido.restaurante!.isEmpty,
                  isLast: true
                ),
              ],
            ],
          ),
        ),

        const SizedBox(height: 24),

        // ── Cliente y Entrega ──
        _SectionTitle(title: 'Cliente y Entrega', icon: Icons.person_pin_circle_rounded),
        Container(
          decoration: BoxDecoration(color: isDark ? const Color(0xFF1E1E1E) : Colors.white, borderRadius: BorderRadius.circular(24), boxShadow: isDark ? [] : [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 15, offset: const Offset(0, 5))]),
          child: Column(
            children: [
              if (pedido.clienteNombre != null && pedido.clienteNombre!.isNotEmpty)
                _InfoRow(icon: Icons.person_outline_rounded, title: 'Cliente', value: pedido.clienteNombre!, isFirst: true),
              if (pedido.direccion != null && pedido.direccion!.isNotEmpty)
                _InfoRow(icon: Icons.location_on_outlined, title: 'Dirección', value: pedido.direccion!, isFirst: pedido.clienteNombre == null || pedido.clienteNombre!.isEmpty),
              _InfoRow(
                icon: Icons.phone_outlined, 
                title: 'Teléfono', 
                value: pedido.clienteTel,
                isLast: true,
                isFirst: (pedido.clienteNombre == null || pedido.clienteNombre!.isEmpty) && (pedido.direccion == null || pedido.direccion!.isEmpty)
              ),
            ],
          ),
        ),

        // ── Botón GPS ──
        if (finalLat != null && finalLng != null) ...[
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: () => launchUrl(
              Uri.parse('https://www.google.com/maps/search/?api=1&query=$finalLat,$finalLng'), 
              mode: LaunchMode.externalApplication
            ),
            icon: const Icon(Icons.map_rounded),
            label: const Text('Ver Ubicación en Mapa', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF10B981).withOpacity(0.15),
              foregroundColor: const Color(0xFF10B981),
              minimumSize: const Size(double.infinity, 56),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              elevation: 0,
            ),
          ),
        ],

        const SizedBox(height: 24),

        // ── Seguimiento ──
        _SectionTitle(title: 'Seguimiento', icon: Icons.access_time_filled_rounded),
        Container(
          decoration: BoxDecoration(color: isDark ? const Color(0xFF1E1E1E) : Colors.white, borderRadius: BorderRadius.circular(24), boxShadow: isDark ? [] : [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 15, offset: const Offset(0, 5))]),
          child: Column(
            children: [
              _InfoRow(icon: Icons.access_time_rounded, title: 'Asignado', value: _formatDateTime(pedido.createdAt), isFirst: true),
              _InfoRow(icon: Icons.update_rounded, title: 'Actualizado', value: _formatDateTime(pedido.updatedAt), isLast: true),
            ],
          ),
        ),

        const SizedBox(height: 32),

        // ── Acción Principal ──
        if (pedido.siguienteEstado != null)
          _loading
              ? const Center(child: CircularProgressIndicator())
              : ElevatedButton(
                  onPressed: _avanzarEstado,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _estadoColor(pedido.siguienteEstado!),
                    foregroundColor: Colors.white,
                    minimumSize: const Size(double.infinity, 60),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                    elevation: 0,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(_estadoIcon(pedido.siguienteEstado!), size: 24),
                      const SizedBox(width: 12),
                      Text(
                        pedido.siguienteEstadoLabel ?? 'Actualizar',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, letterSpacing: 0.5),
                      ),
                    ],
                  ),
                )
        else
          Container(
            padding: const EdgeInsets.symmetric(vertical: 20),
            decoration: BoxDecoration(
              color: const Color(0xFF10B981).withOpacity(0.1),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF10B981).withOpacity(0.2)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 28),
                const SizedBox(width: 12),
                Text(
                  '¡Pedido Entregado!',
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: const Color(0xFF10B981),
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),

        const SizedBox(height: 16),
        
        // ── Botón Reasignar ──
        if (isAdmin && pedido.estado != 'entregado' && pedido.estado != 'cancelado')
          OutlinedButton.icon(
            onPressed: _loading ? null : _reasignarRepartidor,
            icon: const Icon(Icons.sync_alt_rounded),
            label: const Text('Reasignar Repartidor', style: TextStyle(fontWeight: FontWeight.w700)),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(double.infinity, 56),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              side: BorderSide(color: theme.colorScheme.onSurface.withOpacity(0.1), width: 1.5),
            ),
          ),

        const SizedBox(height: 100),
      ],
    );
  }
}

// ── Widgets Auxiliares Rediseñados ──────────────────────────────────────────

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;
  final bool isFirst;
  final bool isLast;

  const _InfoRow({
    required this.icon,
    required this.title,
    required this.value,
    this.isFirst = false,
    this.isLast = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                margin: const EdgeInsets.only(top: 2),
                child: Icon(icon, size: 18, color: theme.colorScheme.primary.withOpacity(0.8)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: theme.colorScheme.onSurface.withOpacity(0.4),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      value,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: theme.colorScheme.onSurface.withOpacity(0.9),
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (!isLast)
          Divider(height: 1, thickness: 1, color: theme.dividerColor.withOpacity(0.4), indent: 46, endIndent: 16),
      ],
    );
  }
}

class _ProgressoEstados extends StatelessWidget {
  final String estadoActual;
  const _ProgressoEstados({required this.estadoActual});

  static const _estados = ['asignado', 'recibido', 'en_camino', 'entregado'];
  static const _labels = ['Asignado', 'Recibido', 'Camino', 'Entregado'];
  static const _icons = [Icons.assignment_turned_in_rounded, Icons.storefront_rounded, Icons.two_wheeler_rounded, Icons.check_circle_rounded];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final currentIdx = _estados.indexOf(estadoActual);
    final activeColor = theme.colorScheme.primary;
    final inactiveColor = isDark ? Colors.white.withOpacity(0.05) : Colors.black.withOpacity(0.05);

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: List.generate(_estados.length, (i) {
        final done = i <= currentIdx;
        final current = i == currentIdx;
        
        return Expanded(
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Container(
                      height: 3,
                      color: i == 0 ? Colors.transparent : (done ? activeColor : inactiveColor),
                    ),
                  ),
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    width: current ? 36 : 28,
                    height: current ? 36 : 28,
                    decoration: BoxDecoration(
                      color: done ? activeColor : inactiveColor,
                      shape: BoxShape.circle,
                      boxShadow: current ? [
                        BoxShadow(color: activeColor.withOpacity(0.4), blurRadius: 12, offset: const Offset(0, 4))
                      ] : null,
                    ),
                    child: Icon(
                      _icons[i],
                      size: current ? 18 : 14,
                      color: done ? Colors.white : theme.colorScheme.onSurface.withOpacity(0.3),
                    ),
                  ),
                  Expanded(
                    child: Container(
                      height: 3,
                      color: i == _estados.length - 1 ? Colors.transparent : (i < currentIdx ? activeColor : inactiveColor),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              AnimatedDefaultTextStyle(
                duration: const Duration(milliseconds: 300),
                style: TextStyle(
                  fontFamily: theme.textTheme.bodyMedium?.fontFamily,
                  color: current ? activeColor : (done ? theme.colorScheme.onSurface.withOpacity(0.8) : theme.colorScheme.onSurface.withOpacity(0.4)),
                  fontSize: current ? 12 : 10,
                  fontWeight: current ? FontWeight.w800 : (done ? FontWeight.w600 : FontWeight.w500),
                ),
                child: Text(_labels[i], textAlign: TextAlign.center),
              ),
            ],
          ),
        );
      }),
    );
  }
}

// ── Helpers de estilo ─────────────────────────────────────────────────────────

Color _estadoColor(String estado) {
  switch (estado) {
    case 'pendiente': return const Color(0xFFEA580C);
    case 'asignado':  return const Color(0xFF3B82F6);
    case 'recibido':  return const Color(0xFFF59E0B);
    case 'en_camino': return const Color(0xFF8B5CF6);
    case 'entregado': return const Color(0xFF10B981);
    default:          return Colors.grey;
  }
}

IconData _estadoIcon(String estado) {
  switch (estado) {
    case 'pendiente': return Icons.warning_rounded;
    case 'asignado':  return Icons.assignment_rounded;
    case 'recibido':  return Icons.handshake_rounded;
    case 'en_camino': return Icons.delivery_dining_rounded;
    case 'entregado': return Icons.check_circle_rounded;
    default:          return Icons.help_outline;
  }
}

String _estadoLabel(String estado) {
  switch (estado) {
    case 'pendiente': return 'Pendiente';
    case 'asignado':  return 'Asignado';
    case 'recibido':  return 'Recibido';
    case 'en_camino': return 'En Camino';
    case 'entregado': return 'Entregado';
    default:          return estado;
  }
}

String _estadoSubtitulo(String estado) {
  switch (estado) {
    case 'pendiente': return 'Aún no se ha asignado a ningún repartidor.';
    case 'asignado':  return 'El pedido fue asignado. Confírmalo al recibirlo.';
    case 'recibido':  return 'Tienes el pedido. Sal a entregarlo cuando estés listo.';
    case 'en_camino': return 'Estás en camino. ¡El cliente ya fue notificado!';
    case 'entregado': return '¡Entregado exitosamente! El cliente lo sabe. 🎉';
    default:          return '';
  }
}

String _formatDateTime(DateTime dt) {
  final d = '${dt.day.toString().padLeft(2,'0')}/${dt.month.toString().padLeft(2,'0')}/${dt.year}';
  final t = '${dt.hour.toString().padLeft(2,'0')}:${dt.minute.toString().padLeft(2,'0')}';
  return '$d • $t';
}

// ── Tarjeta GPS ───────────────────────────────────────────────────────────────
class _GpsCard extends StatelessWidget {
  final double lat;
  final double lng;
  const _GpsCard({required this.lat, required this.lng});

  Future<void> _abrirMapa() async {
    final uri = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return GestureDetector(
      onTap: _abrirMapa,
      child: Container(
        margin: const EdgeInsets.only(bottom: 24),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B) : const Color(0xFFEFF6FF),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: const Color(0xFF3B82F6).withOpacity(0.2), width: 1.5),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF3B82F6).withOpacity(0.15),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.near_me_rounded, color: Color(0xFF3B82F6), size: 28),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Ubicación de Entrega',
                      style: TextStyle(color: isDark ? Colors.white : const Color(0xFF1E3A8A), fontWeight: FontWeight.w800, fontSize: 15)),
                  const SizedBox(height: 4),
                  Text('Toca para abrir en Google Maps',
                      style: TextStyle(color: const Color(0xFF3B82F6).withOpacity(0.8), fontSize: 12, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
            Icon(Icons.arrow_forward_ios_rounded, color: const Color(0xFF3B82F6).withOpacity(0.5), size: 16),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;
  final IconData icon;
  const _SectionTitle({required this.title, required this.icon});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: const Color(0xFFFF6B35).withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 18, color: const Color(0xFFFF6B35)),
          ),
          const SizedBox(width: 10),
          Text(
            title,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: theme.colorScheme.onSurface.withOpacity(0.9),
            ),
          ),
        ],
      ),
    );
  }
}

// lib/screens/pedido_detail_screen.dart
// Pantalla de detalle de pedido para el REPARTIDOR
// Se abre via deep-link: https://www.app-estrella.shop/pedido/{id}

import 'dart:io';
import 'dart:math';
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
import '../core/swipe_button.dart';
import '../core/user_role.dart';
import 'dart:async';
import 'package:flutter_polyline_points/flutter_polyline_points.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:flutter_polyline_points/flutter_polyline_points.dart';
import 'package:geolocator/geolocator.dart';

import 'dashboard_screen.dart' show statsProvider;
import 'pedidos_screen.dart' show pedidosActivosProvider;
import '../main.dart' show stopAlarm;

final _pedidoProvider = FutureProvider.autoDispose.family<PedidoModel?, String>(
  (ref, id) => ref.read(pedidoServiceProvider).getPedido(id),
);

class PedidoDetailScreen extends ConsumerWidget {
  final String pedidoId;
  const PedidoDetailScreen({super.key, required this.pedidoId});

  static Future<void> show(BuildContext context, String pedidoId) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    // Detectar si es repartidor leyendo el provider directamente del contexto
    final container = ProviderScope.containerOf(context);
    final isAdmin = container.read(isAdminProvider);

    if (!isAdmin) {
      // Repartidor: pantalla completa para que el mapa sea interactivo
      return Navigator.of(context, rootNavigator: true).push(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (_) => ProviderScope(
            parent: container,
            child: _DriverFullScreen(pedidoId: pedidoId),
          ),
        ),
      );
    }

    // Admin: bottom sheet normal
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
                      data: (pedido) {
                        if (pedido == null) return Center(child: Text('Pedido no encontrado', style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.5))));
                        return _PedidoBody(
                          pedido: pedido,
                          scrollController: scrollController,
                          onEstadoActualizado: () {
                            ref.invalidate(_pedidoProvider(pedidoId));
                            ref.invalidate(statsProvider);
                            ref.invalidate(pedidosActivosProvider);
                          },
                        );
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // stopAlarm(); removed to allow it to ring
    final pedidoAsync = ref.watch(_pedidoProvider(pedidoId));
    final theme = Theme.of(context);

    return PopScope(
      canPop: true,
      onPopInvoked: (_) => stopAlarm(),
      child: Scaffold(
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
          final isAdmin = ref.watch(isAdminProvider);
          return isAdmin
            ? _PedidoBody(
                pedido: pedido,
                onEstadoActualizado: () {
                  ref.invalidate(_pedidoProvider(pedidoId));
                  ref.invalidate(statsProvider);
                  ref.invalidate(pedidosActivosProvider);
                },
              )
            : _DriverRouteMode(
                pedido: pedido,
                onEstadoActualizado: () {
                  ref.invalidate(_pedidoProvider(pedidoId));
                  ref.invalidate(statsProvider);
                  ref.invalidate(pedidosActivosProvider);
                },
              );
        },
      ),
    ));
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
    stopAlarm();
    final siguiente = widget.pedido.siguienteEstado;
    if (siguiente == null) return;

    final theme = Theme.of(context);
    final color = _estadoColor(siguiente);

    bool? confirm;
    bool? pagoPendiente;

    if (siguiente == 'en_camino' && widget.pedido.metodoPago == 'efectivo') {
      final res = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          title: const Text('â”¬â”Alcanzaste a pagar?', style: TextStyle(fontWeight: FontWeight.bold)),
          content: const Text(
            'Si pagaste el costo de la comida en el restaurante con tu dinero, presiona "Pagado".\n\n'
            'Si el restaurante te lo fio (no trajiste efectivo), presiona "Pago Pendiente" (la deuda se cargarâ”œÃ­ a tu cuenta).',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, 'cancelar'),
              child: const Text('Cancelar', style: TextStyle(color: Colors.grey, fontWeight: FontWeight.bold)),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, 'pendiente'),
              child: const Text('Pago Pendiente', style: TextStyle(color: Colors.orange, fontWeight: FontWeight.bold)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () => Navigator.pop(ctx, 'pagado'),
              child: const Text('Pagado', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      );
      if (res == null || res == 'cancelar') return;
      confirm = true;
      pagoPendiente = (res == 'pendiente');
    } else {
      confirm = await PremiumBottomSheet.showConfirm(
        context,
        title: widget.pedido.siguienteEstadoLabel ?? 'Confirmar',
        content: 'â”¬â”Confirmar cambio de estado a "${_estadoLabel(siguiente)}"?',
        confirmText: 'Confirmar',
        cancelText: 'Cancelar',
      );
    }

    if (confirm != true) return;

    setState(() => _loading = true);

    // Ã”Ã¶Ã‡Ã”Ã¶Ã‡ Lâ”œÃ´GICA DE FOTO FACHADA PARA EL REPARTIDOR Ã”Ã¶Ã‡Ã”Ã¶Ã‡
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

    final String? errorMsg = await ref
        .read(pedidoServiceProvider)
        .actualizarEstado(widget.pedido.id, siguiente, pagoPendienteRestaurante: pagoPendiente);
    setState(() => _loading = false);

    if (mounted) {
      PremiumToast.show(
        context,
        title: errorMsg == null ? 'Estado actualizado' : 'Error',
        description: errorMsg == null ? 'Mensaje enviado al cliente por WhatsApp' : errorMsg,
        isError: errorMsg != null,
      );
      if (errorMsg == null) widget.onEstadoActualizado();
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
        final String? errorMsg = await ref.read(pedidoServiceProvider).reasignarPedido(widget.pedido.id, repId.toString());
        setState(() => _loading = false);

        if (mounted) {
          PremiumToast.show(
            context,
            title: errorMsg == null ? 'Reasignado' : 'Error',
            description: errorMsg == null ? 'Notificado al nuevo repartidor' : errorMsg,
            isError: errorMsg != null,
          );
          if (errorMsg == null) widget.onEstadoActualizado();
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
    
    // Forzar color naranja si estâ”œÃ­ pendiente o atrasado
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
        // Ã”Ã¶Ã‡Ã”Ã¶Ã‡ Banner de Estado (Premium) Ã”Ã¶Ã‡Ã”Ã¶Ã‡
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
              Hero(
                tag: 'pedido_icon_${pedido.id}',
                child: Material(
                  color: Colors.transparent,
                  child: Container(
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
                    const SizedBox(height: 4),
                    Text(
                      'EST-${pedido.id.replaceAll('-', '').substring(pedido.id.replaceAll('-', '').length - 5).toUpperCase()}',
                      style: TextStyle(
                        color: bannerColor.withValues(alpha: 0.7),
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.5,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      estaAtrasado ? 'Este pedido requiere atención inmediata.' : _estadoSubtitulo(pedido.estado),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface.withOpacity(0.6),
                        fontSize: 12,
                        height: 1.3,
                      ),
                    ),
                    if (!estaAtrasado && pedido.estado != 'entregado' && pedido.estado != 'cancelado')
                      Padding(
                        padding: const EdgeInsets.only(top: 8.0),
                        child: Row(
                          children: [
                            Icon(Icons.directions_car_rounded, size: 14, color: bannerColor),
                            const SizedBox(width: 4),
                            Text(
                              pedido.estado == 'en_camino' ? 'Llegada est. al cliente: ~8 min' : 'Llegada est. al local: ~4 min',
                              style: TextStyle(color: bannerColor, fontSize: 13, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 20),

        // â”€â”€ Progreso de Estados â”€â”€
        Container(
          padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: isDark ? [] : [
              BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 15, offset: const Offset(0, 5))
            ],
          ),
          child: _ProgressoEstados(estadoActual: pedido.estado),
        ),

        const SizedBox(height: 24),

        // â”€â”€ GPS Card â”€â”€
        if (finalLat != null && finalLng != null)
          _GpsCard(lat: finalLat, lng: finalLng),

        // Ã”Ã¶Ã‡Ã”Ã¶Ã‡ Detalles de la Orden Ã”Ã¶Ã‡Ã”Ã¶Ã‡
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
                  title: 'Descripciâ”œâ”‚n', 
                  value: pedido.descripcion ?? 'Sin descripciâ”œâ”‚n', 
                  isFirst: pedido.restaurante == null || pedido.restaurante!.isEmpty,
                  isLast: false
                ),
                _InfoRow(
                  icon: Icons.payments_outlined,
                  title: 'Mâ”œÂ®todo de Pago',
                  value: pedido.metodoPago == 'en_linea' ? 'Â­Æ’Ã†â”‚ Ya Pagado (En lâ”œÂ¡nea)' : 'Â­Æ’Ã†Ã  Efectivo (Cobrar)',
                  isLast: pedido.metodoPago == 'en_linea' || pedido.total == null
                ),
                if (pedido.metodoPago == 'efectivo' && pedido.total != null)
                  _InfoRow(
                    icon: Icons.attach_money_rounded,
                    title: 'Total a Cobrar',
                    value: '\$${pedido.total!.toStringAsFixed(2)}',
                    isLast: true
                  ),
              ],
            ],
          ),
        ),

        const SizedBox(height: 24),

        // Ã”Ã¶Ã‡Ã”Ã¶Ã‡ Cliente y Entrega Ã”Ã¶Ã‡Ã”Ã¶Ã‡
        _SectionTitle(title: 'Cliente y Entrega', icon: Icons.person_pin_circle_rounded),
        Container(
          decoration: BoxDecoration(color: isDark ? const Color(0xFF1E1E1E) : Colors.white, borderRadius: BorderRadius.circular(24), boxShadow: isDark ? [] : [BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 15, offset: const Offset(0, 5))]),
          child: Column(
            children: [
              if (pedido.clienteNombre != null && pedido.clienteNombre!.isNotEmpty)
                _InfoRow(icon: Icons.person_outline_rounded, title: 'Cliente', value: pedido.clienteNombre!, isFirst: true),
              if (pedido.direccion != null && pedido.direccion!.isNotEmpty)
                _InfoRow(icon: Icons.location_on_outlined, title: 'Direcciâ”œâ”‚n', value: pedido.direccion!, isFirst: pedido.clienteNombre == null || pedido.clienteNombre!.isEmpty),
              _InfoRow(
                icon: Icons.phone_outlined, 
                title: 'Telâ”œÂ®fono', 
                value: pedido.clienteTel,
                isLast: true,
                isFirst: (pedido.clienteNombre == null || pedido.clienteNombre!.isEmpty) && (pedido.direccion == null || pedido.direccion!.isEmpty)
              ),
            ],
          ),
        ),

        // Ã”Ã¶Ã‡Ã”Ã¶Ã‡ Botâ”œâ”‚n GPS Ã”Ã¶Ã‡Ã”Ã¶Ã‡
        if (finalLat != null && finalLng != null) ...[
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: () => launchUrl(
              Uri.parse('https://www.google.com/maps/search/?api=1&query=$finalLat,$finalLng'), 
              mode: LaunchMode.externalApplication
            ),
            icon: const Icon(Icons.map_rounded),
            label: const Text('Ver Ubicaciâ”œâ”‚n en Mapa', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
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


        // Ã”Ã¶Ã‡Ã”Ã¶Ã‡ Acciâ”œâ”‚n Principal Ã”Ã¶Ã‡Ã”Ã¶Ã‡
        if (pedido.siguienteEstado != null)
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 600),
            switchInCurve: Curves.easeOutBack,
            switchOutCurve: Curves.easeInBack,
            transitionBuilder: (child, animation) => ScaleTransition(
              scale: animation,
              child: FadeTransition(opacity: animation, child: child),
            ),
            child: _loading
                ? const Center(key: ValueKey('loading'), child: CircularProgressIndicator())
                : ElevatedButton(
                    key: ValueKey(pedido.siguienteEstado),
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
                  'â”¬Ã­Pedido Entregado!',
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: const Color(0xFF10B981),
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),

        const SizedBox(height: 16),
        
        // Ã”Ã¶Ã‡Ã”Ã¶Ã‡ Botâ”œâ”‚n Reasignar Ã”Ã¶Ã‡Ã”Ã¶Ã‡
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

// Ã”Ã¶Ã‡Ã”Ã¶Ã‡ Widgets Auxiliares Rediseâ”œâ–’ados Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡

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
  static const _labels = ['Asignado', 'En el local', 'En camino', 'Entregado'];
  static const _subtitles = [
    'El pedido te ha sido asignado',
    'Recogiendo el pedido en el local',
    'Dirigiéndose al cliente',
    'Entrega finalizada con éxito'
  ];
  static const _icons = [
    Icons.assignment_turned_in_rounded, 
    Icons.storefront_rounded, 
    Icons.two_wheeler_rounded, 
    Icons.check_circle_rounded
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final currentIdx = _estados.indexOf(estadoActual);
    final activeColor = theme.colorScheme.primary;
    final inactiveColor = isDark ? Colors.white.withOpacity(0.1) : Colors.black.withOpacity(0.05);

    return Column(
      children: List.generate(_estados.length, (i) {
        final done = i <= currentIdx;
        final current = i == currentIdx;
        final isLast = i == _estados.length - 1;
        
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 400),
                  curve: Curves.easeOutBack,
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
                if (!isLast)
                  Container(
                    width: 3,
                    height: 36,
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    decoration: BoxDecoration(
                      color: (i < currentIdx) ? activeColor : inactiveColor,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 20),
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(top: current ? 4.0 : 2.0, bottom: isLast ? 0 : 20.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AnimatedDefaultTextStyle(
                      duration: const Duration(milliseconds: 300),
                      style: TextStyle(
                        fontFamily: theme.textTheme.bodyMedium?.fontFamily,
                        color: current ? activeColor : (done ? theme.colorScheme.onSurface.withOpacity(0.9) : theme.colorScheme.onSurface.withOpacity(0.4)),
                        fontSize: current ? 16 : 14,
                        fontWeight: current ? FontWeight.w900 : (done ? FontWeight.w700 : FontWeight.w600),
                        letterSpacing: -0.3,
                      ),
                      child: Text(_labels[i]),
                    ),
                    const SizedBox(height: 4),
                    AnimatedDefaultTextStyle(
                      duration: const Duration(milliseconds: 300),
                      style: TextStyle(
                        fontFamily: theme.textTheme.bodySmall?.fontFamily,
                        color: current 
                          ? theme.colorScheme.onSurface.withOpacity(0.7) 
                          : theme.colorScheme.onSurface.withOpacity(0.4),
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                      child: Text(_subtitles[i]),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      }),
    );
  }
}


// u{2500}u{2500} Helpers de estilo u{2500}u{2500}

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
    case 'pendiente': return 'Aâ”œâ•‘n no se ha asignado a ningâ”œâ•‘n repartidor.';
    case 'asignado':  return 'El pedido fue asignado. Confâ”œÂ¡rmalo al recibirlo.';
    case 'recibido':  return 'Tienes el pedido. Sal a entregarlo cuando estâ”œÂ®s listo.';
    case 'en_camino': return 'Estâ”œÃ­s en camino. â”¬Ã­El cliente ya fue notificado!';
    case 'entregado': return 'â”¬Ã­Entregado exitosamente! El cliente lo sabe. Â­Æ’Ã„Ã«';
    default:          return '';
  }
}

String _formatDateTime(DateTime dt) {
  final d = '${dt.day.toString().padLeft(2,'0')}/${dt.month.toString().padLeft(2,'0')}/${dt.year}';
  final t = '${dt.hour.toString().padLeft(2,'0')}:${dt.minute.toString().padLeft(2,'0')}';
  return '$d Ã”Ã‡Ã³ $t';
}

// Ã”Ã¶Ã‡Ã”Ã¶Ã‡ Tarjeta GPS Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡Ã”Ã¶Ã‡
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
                  Text('Ubicaciâ”œâ”‚n de Entrega',
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

class _DriverFullScreen extends ConsumerWidget {
  final String pedidoId;
  const _DriverFullScreen({required this.pedidoId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final pedidoAsync = ref.watch(_pedidoProvider(pedidoId));

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: SafeArea(
          child: GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              margin: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
            ),
          ),
        ),
      ),
      body: pedidoAsync.when(
        loading: () => Center(child: CircularProgressIndicator(color: theme.colorScheme.primary)),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (pedido) {
          if (pedido == null) return const Center(child: Text('Pedido no encontrado'));
          return _DriverRouteMode(
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

class _DriverRouteMode extends ConsumerStatefulWidget {
  final PedidoModel pedido;
  final VoidCallback onEstadoActualizado;

  const _DriverRouteMode({required this.pedido, required this.onEstadoActualizado});

  @override
  ConsumerState<_DriverRouteMode> createState() => _DriverRouteModeState();
}

class _DriverRouteModeState extends ConsumerState<_DriverRouteMode> {
  bool _loading = false;
  GoogleMapController? _mapController;
  StreamSubscription<Position>? _positionStream;
  Position? _currentPosition;
  Set<Polyline> _polylines = {};
  Set<Marker> _markers = {};

  final String _googleMapsKey = 'AIzaSyBOZkp595ze0Agwb7yPG5u7MD29EL9gHMw';

  @override
  void initState() {
    super.initState();
    _startTracking();
  }

  @override
  void dispose() {
    _positionStream?.cancel();
    _mapController?.dispose();
    super.dispose();
  }

  void _startTracking() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return;

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return;
    }

    Position? lastPos = await Geolocator.getLastKnownPosition();
    if (lastPos != null && mounted) {
      setState(() => _currentPosition = lastPos);
      _updateRoute();
    }

    _positionStream = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 5),
    ).listen((Position position) {
      if (!mounted) return;
      setState(() => _currentPosition = position);
      _updateRoute();
      
      // Si el pedido está pendiente, no forzar la cámara al centro del repartidor 
      // porque queremos ver el encuadre (bounds) completo de ambas ubicaciones.
      if (_mapController != null && _currentPosition != null && widget.pedido.estado != 'pendiente') {
        _mapController!.animateCamera(CameraUpdate.newLatLng(LatLng(position.latitude, position.longitude)));
      }
    });
  }

  Future<void> _updateRoute() async {
    if (_currentPosition == null) return;

    final estado = widget.pedido.estado;
    bool haciaRestaurante = estado == 'pendiente' || estado == 'asignado' || estado == 'aceptado' ||
        estado == 'en_cocina' || estado == 'listo_para_recoger';

    double? destLat = haciaRestaurante ? widget.pedido.restauranteLat : widget.pedido.lat;
    double? destLng = haciaRestaurante ? widget.pedido.restauranteLng : widget.pedido.lng;

    if (!mounted) return;
    setState(() {
      _markers = {
        Marker(
          markerId: const MarkerId('driver'),
          position: LatLng(_currentPosition!.latitude, _currentPosition!.longitude),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
          infoWindow: const InfoWindow(title: 'Tú'),
        ),
        if (destLat != null && destLng != null)
          Marker(
            markerId: const MarkerId('destination'),
            position: LatLng(destLat, destLng),
            icon: BitmapDescriptor.defaultMarkerWithHue(
                haciaRestaurante ? BitmapDescriptor.hueOrange : BitmapDescriptor.hueGreen),
            infoWindow: InfoWindow(title: haciaRestaurante ? 'Restaurante' : 'Cliente'),
          ),
      };
    });

    if (destLat == null || destLng == null) {
      PremiumToast.show(
        context,
        title: 'Atención',
        description: haciaRestaurante 
          ? 'El restaurante no tiene ubicación en el mapa.'
          : 'El cliente no tiene ubicación en el mapa.',
        isError: true,
      );
      return;
    }

    PolylinePoints polylinePoints = PolylinePoints();
    PolylineResult result = await polylinePoints.getRouteBetweenCoordinates(
      googleApiKey: _googleMapsKey,
      request: PolylineRequest(
        origin: PointLatLng(_currentPosition!.latitude, _currentPosition!.longitude),
        destination: PointLatLng(destLat, destLng),
        mode: TravelMode.driving,
      ),
    );

    if (result.points.isNotEmpty) {
      List<LatLng> polylineCoordinates = result.points.map((p) => LatLng(p.latitude, p.longitude)).toList();
      if (!mounted) return;
      setState(() {
        _polylines = {
          Polyline(
            polylineId: const PolylineId('route'),
            color: Colors.blue,
            width: 5,
            points: polylineCoordinates,
          )
        };
      });
      
      // Animar mapa hacia la nueva ruta
      Future.delayed(const Duration(milliseconds: 300), () {
        if (mounted) _centrarRuta(destLat, destLng);
      });
    } else {
      // Si no hay ruta dibujada, de todos modos animar hacia los pines
      Future.delayed(const Duration(milliseconds: 300), () {
        if (mounted) _centrarRuta(destLat, destLng);
      });
    }
  }

  Future<void> _cambiarEstado(String nuevoEstado) async {
    setState(() => _loading = true);

    if (nuevoEstado == 'aceptado') {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId != null) {
        try {
          await Supabase.instance.client
              .from('pedidos')
              .update({'estado': 'aceptado', 'repartidor_id': userId}).eq('id', widget.pedido.id);
        } catch (_) {}
      }
    }

    try {
      final errorMsg = await ref.read(pedidoServiceProvider).actualizarEstado(widget.pedido.id, nuevoEstado);
      setState(() => _loading = false);
      if (errorMsg == null) {
        widget.onEstadoActualizado();
        _updateRoute();
      } else {
        if (mounted) PremiumToast.show(context, title: 'Error', description: errorMsg, isError: true);
      }
    } catch (e) {
      setState(() => _loading = false);
      String errMsg = e.toString();
      if (errMsg.contains('FRAUDE')) {
        errMsg = 'Repartidor demasiado lejos del destino para entregar.';
      }
      if (mounted) PremiumToast.show(context, title: 'Error', description: errMsg, isError: true);
    }
  }

  void _centrarRuta(double destLat, double destLng) {
    if (_mapController == null || _currentPosition == null) return;
    
    double minLat = min(_currentPosition!.latitude, destLat);
    double maxLat = max(_currentPosition!.latitude, destLat);
    double minLng = min(_currentPosition!.longitude, destLng);
    double maxLng = max(_currentPosition!.longitude, destLng);

    // Evitar un zoom extremo si los puntos están muy cerca (menos de ~500 metros)
    // Añadiendo un margen artificial para que siempre se vea el contexto de la ciudad/barrio.
    if ((maxLat - minLat) < 0.005) {
      minLat -= 0.003;
      maxLat += 0.003;
    }
    if ((maxLng - minLng) < 0.005) {
      minLng -= 0.003;
      maxLng += 0.003;
    }

    LatLngBounds bounds = LatLngBounds(
      southwest: LatLng(minLat, minLng),
      northeast: LatLng(maxLat, maxLng),
    );

    // Aumentamos el padding a 100 para que respire más la ruta y no pegue en los bordes
    _mapController!.animateCamera(CameraUpdate.newLatLngBounds(bounds, 100));
  }

  String _getMapStyle(bool isDark) {
    if (isDark) {
      return '''[{"elementType":"geometry","stylers":[{"color":"#212121"}]},{"elementType":"labels.icon","stylers":[{"visibility":"off"}]},{"elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"elementType":"labels.text.stroke","stylers":[{"color":"#212121"}]},{"featureType":"administrative","elementType":"geometry","stylers":[{"color":"#757575"}]},{"featureType":"administrative.country","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]},{"featureType":"administrative.land_parcel","stylers":[{"visibility":"off"}]},{"featureType":"administrative.locality","elementType":"labels.text.fill","stylers":[{"color":"#bdbdbd"}]},{"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#181818"}]},{"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"featureType":"poi.park","elementType":"labels.text.stroke","stylers":[{"color":"#1b1b1b"}]},{"featureType":"road","elementType":"geometry.fill","stylers":[{"color":"#2c2c2c"}]},{"featureType":"road","elementType":"labels.text.fill","stylers":[{"color":"#8a8a8a"}]},{"featureType":"road.arterial","elementType":"geometry","stylers":[{"color":"#373737"}]},{"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#3c3c3c"}]},{"featureType":"road.highway.controlled_access","elementType":"geometry","stylers":[{"color":"#4e4e4e"}]},{"featureType":"road.local","elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"featureType":"transit","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"water","elementType":"geometry","stylers":[{"color":"#000000"}]},{"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#3d3d3d"}]}]''';
    } else {
      return '''[{"elementType":"geometry","stylers":[{"color":"#f5f5f5"}]},{"elementType":"labels.icon","stylers":[{"visibility":"off"}]},{"elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"elementType":"labels.text.stroke","stylers":[{"color":"#f5f5f5"}]},{"featureType":"administrative.land_parcel","elementType":"labels.text.fill","stylers":[{"color":"#bdbdbd"}]},{"featureType":"poi","elementType":"geometry","stylers":[{"color":"#eeeeee"}]},{"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#e5e5e5"}]},{"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]},{"featureType":"road","elementType":"geometry","stylers":[{"color":"#ffffff"}]},{"featureType":"road.arterial","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#dadada"}]},{"featureType":"road.highway","elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"featureType":"road.local","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]},{"featureType":"transit.line","elementType":"geometry","stylers":[{"color":"#e5e5e5"}]},{"featureType":"transit.station","elementType":"geometry","stylers":[{"color":"#eeeeee"}]},{"featureType":"water","elementType":"geometry","stylers":[{"color":"#c9c9c9"}]},{"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]}]''';
    }
  }

  Widget _buildRappiIncomingOrder(BuildContext context, bool isDark, ColorScheme cs) {
    return Stack(
      children: [
        // Mapa 100% fondo
        Positioned.fill(
          child: _currentPosition == null
              ? Container(
                  color: isDark ? Colors.black : Colors.grey[200],
                  child: const Center(child: CircularProgressIndicator()))
              : GoogleMap(
                  initialCameraPosition: CameraPosition(
                      target: LatLng(_currentPosition!.latitude, _currentPosition!.longitude),
                      zoom: 15),
                  polylines: _polylines,
                  markers: _markers,
                  myLocationEnabled: true,
                  myLocationButtonEnabled: true,
                  zoomControlsEnabled: false,
                  onMapCreated: (controller) {
                    _mapController = controller;
                    _mapController!.setMapStyle(_getMapStyle(isDark));
                  },
                ),
        ),

        // Bottom Sheet de Rappi
        Align(
          alignment: Alignment.bottomCenter,
          child: Container(
            margin: const EdgeInsets.only(left: 12, right: 12, bottom: 24),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E1E28) : const Color(0xFFF3F4F6),
              borderRadius: BorderRadius.circular(32),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.2),
                  blurRadius: 20,
                  offset: const Offset(0, 10),
                )
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.all(20.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Cabecera
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Nuevo pedido',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: isDark ? Colors.white70 : Colors.black54,
                        ),
                      ),
                      GestureDetector(
                        onTap: () => Navigator.pop(context),
                        child: Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            color: isDark ? Colors.white10 : Colors.black.withOpacity(0.05),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(Icons.close_rounded, size: 20, color: isDark ? Colors.white70 : Colors.black54),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Cápsula del restaurante
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: isDark ? Colors.white.withOpacity(0.05) : Colors.white,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: const BoxDecoration(
                            color: Color(0xFFE8F5E9),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.fastfood_rounded, color: Color(0xFF4CAF50), size: 18),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Restaurante',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: isDark ? Colors.white : Colors.black87,
                                ),
                              ),
                              Text(
                                '1 pedido en la ruta',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: isDark ? Colors.white54 : Colors.black54,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: isDark ? Colors.white10 : const Color(0xFFE5E7EB),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            '2.5 km', // Placeholder, idealmente calcular distancia
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: isDark ? Colors.white : Colors.black87,
                            ),
                          ),
                        )
                      ],
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Ganancia
                  Text(
                    '\$45.50',
                    style: TextStyle(
                      fontSize: 48,
                      fontWeight: FontWeight.w900,
                      color: isDark ? Colors.white : Colors.black,
                      height: 1.1,
                      letterSpacing: -1.5,
                    ),
                  ),
                  
                  const SizedBox(height: 8),

                  // Incentivo
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE0F2F1),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(
                            border: Border.all(color: const Color(0xFF00897B), width: 1.5),
                            shape: BoxShape.circle,
                          ),
                          child: const Text(
                            '+1',
                            style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF00897B)),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: const [
                            Text('En tu incentivo asegurado', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF00897B))),
                            Text('Revisa el avance al finalizar', style: TextStyle(fontSize: 9, color: Color(0xFF00695C))),
                          ],
                        )
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // Direcciones
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.storefront_rounded, color: Colors.grey, size: 20),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(widget.pedido.restaurante ?? 'Restaurante Estrella', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: isDark ? Colors.white70 : Colors.black87)),
                            const Text('Recoger en establecimiento', style: TextStyle(fontSize: 12, color: Colors.grey)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.person_outline_rounded, color: Colors.grey, size: 20),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Entrega a ${widget.pedido.clienteNombre ?? "Cliente"}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: isDark ? Colors.white70 : Colors.black87)),
                            Text(widget.pedido.direccion ?? 'Sin dirección', style: TextStyle(fontSize: 12, color: Colors.grey), maxLines: 1, overflow: TextOverflow.ellipsis),
                          ],
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 24),

                  // Botón Aceptar con Temporizador
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: ElevatedButton(
                      onPressed: () => _cambiarEstado('aceptado'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF0C625D),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(28),
                        ),
                        elevation: 0,
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const SizedBox(width: 32), // spacer for centering text
                          const Text(
                            'Aceptar pedido',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.5,
                            ),
                          ),
                          _buildCircularCountdown(),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCircularCountdown() {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 1.0, end: 0.0),
      duration: const Duration(seconds: 15),
      builder: (context, value, child) {
        return Container(
          width: 36,
          height: 36,
          decoration: const BoxDecoration(
            color: Color(0xFF167B75),
            shape: BoxShape.circle,
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              CircularProgressIndicator(
                value: value,
                backgroundColor: Colors.transparent,
                color: Colors.white,
                strokeWidth: 3,
              ),
              Text(
                '${(value * 15).ceil()}',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    // Aplicar estilo si el mapa ya existe y cambiamos de tema
    if (_mapController != null) {
      _mapController!.setMapStyle(_getMapStyle(isDark));
    }
    
    final cs = Theme.of(context).colorScheme;
    final estado = widget.pedido.estado;

    final bool faseRestaurante = estado == 'pendiente' || estado == 'asignado' ||
        estado == 'aceptado' || estado == 'en_cocina' || estado == 'listo_para_recoger';
    final bool faseRecoleccion = estado == 'recibido';
    final bool faseCliente = estado == 'en_camino';

    String swipeText = 'Desliza';
    String? nextState;
    Color swipeColor = Colors.orange;

    if (faseRestaurante) {
      swipeText = estado == 'pendiente' ? 'Aceptar Pedido' : 'Llegué al Restaurante';
      nextState = estado == 'pendiente' ? 'aceptado' : 'recibido';
      swipeColor = Colors.orange;
    } else if (faseRecoleccion) {
      swipeText = 'En Camino al Cliente';
      nextState = 'en_camino';
      swipeColor = Colors.blue;
    } else if (faseCliente) {
      swipeText = 'Entregar Pedido';
      nextState = 'entregado';
      swipeColor = Colors.green;
    }

    if (estado == 'pendiente') {
      return _buildRappiIncomingOrder(context, isDark, cs);
    }

    return Column(
      children: [
        // Mapa 40%
        SizedBox(
          height: MediaQuery.of(context).size.height * 0.40,
          child: _currentPosition == null
              ? Container(
                  color: isDark ? Colors.black : Colors.grey[200],
                  child: const Center(child: CircularProgressIndicator()))
              : GoogleMap(
                  initialCameraPosition: CameraPosition(
                      target: LatLng(_currentPosition!.latitude, _currentPosition!.longitude),
                      zoom: 15),
                  polylines: _polylines,
                  markers: _markers,
                  myLocationEnabled: true,
                  myLocationButtonEnabled: true,
                  zoomControlsEnabled: false,
                  onMapCreated: (controller) {
                    _mapController = controller;
                    _mapController!.setMapStyle(_getMapStyle(isDark));
                  },
                ),
        ),

        // Contenido 60%
        Expanded(
          child: Stack(
            children: [
              Container(
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF0F0F16) : const Color(0xFFF8F9FA),
                  borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(32), topRight: Radius.circular(32)),
                  boxShadow: [
                    BoxShadow(
                        color: Colors.black.withOpacity(0.1),
                        blurRadius: 20,
                        offset: const Offset(0, -5))
                  ],
                ),
                child: ListView(
                  padding: const EdgeInsets.only(top: 16, bottom: 120),
                  children: [
                    Center(
                        child: Container(
                            width: 40,
                            height: 4,
                            decoration: BoxDecoration(
                                color: Colors.grey.withOpacity(0.4),
                                borderRadius: BorderRadius.circular(2)))),
                    const SizedBox(height: 20),

                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 600),
                      switchInCurve: Curves.easeOutBack,
                      switchOutCurve: Curves.easeIn,
                      transitionBuilder: (child, animation) => FadeTransition(
                        opacity: animation,
                        child: SlideTransition(
                          position: Tween<Offset>(
                            begin: const Offset(0.0, 0.15),
                            end: Offset.zero,
                          ).animate(animation),
                          child: child,
                        ),
                      ),
                      child: Column(
                        key: ValueKey(estado),
                        children: [
                          // FASE 1: Camino al restaurante
                          if (faseRestaurante)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF161622) : Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: [
                              BoxShadow(
                                  color: Colors.black.withOpacity(0.05),
                                  blurRadius: 10,
                                  offset: const Offset(0, 4))
                            ],
                          ),
                          child: Column(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                    color: Colors.orange.withOpacity(0.15),
                                    shape: BoxShape.circle),
                                child: const Icon(Icons.storefront_rounded,
                                    size: 36, color: Colors.orange),
                              ),
                              const SizedBox(height: 12),
                              Text(
                                widget.pedido.restaurante ?? 'Restaurante',
                                style: TextStyle(
                                    fontSize: 22,
                                    fontWeight: FontWeight.w900,
                                    color: cs.onSurface),
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 4),
                              Text('Ve al restaurante a recoger el pedido',
                                  style:
                                      TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
                              const SizedBox(height: 16),
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton.icon(
                                  onPressed: () {
                                    if (widget.pedido.restauranteLat != null &&
                                        widget.pedido.restauranteLng != null) {
                                      _centrarRuta(widget.pedido.restauranteLat!,
                                          widget.pedido.restauranteLng!);
                                    }
                                  },
                                  icon: const Icon(Icons.navigation_rounded),
                                  label: const Text('Centrar en la Ruta'),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.orange,
                                    foregroundColor: Colors.white,
                                    padding:
                                        const EdgeInsets.symmetric(vertical: 14),
                                    shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(14)),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                          // FASE 2: Verificar pedido
                          if (faseRecoleccion)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF161622) : Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: [
                              BoxShadow(
                                  color: Colors.black.withOpacity(0.05),
                                  blurRadius: 10,
                                  offset: const Offset(0, 4))
                            ],
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.all(10),
                                    decoration: BoxDecoration(
                                        color: Colors.orange.withOpacity(0.15),
                                        borderRadius: BorderRadius.circular(12)),
                                    child: const Icon(Icons.receipt_long_rounded,
                                        color: Colors.orange, size: 24),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text('Verifica el pedido',
                                            style: TextStyle(
                                                fontSize: 17,
                                                fontWeight: FontWeight.w900,
                                                color: cs.onSurface)),
                                        Text('Confirma que esté todo completo',
                                            style: TextStyle(
                                                fontSize: 12,
                                                color: cs.onSurfaceVariant)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              Text(widget.pedido.descripcion,
                                  style: TextStyle(
                                      fontSize: 14, height: 1.5, color: cs.onSurface)),
                            ],
                          ),
                        ),
                      ),
                          // FASE 3: Camino al cliente
                          if (faseCliente)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF161622) : Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: [
                              BoxShadow(
                                  color: Colors.black.withOpacity(0.05),
                                  blurRadius: 10,
                                  offset: const Offset(0, 4))
                            ],
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  CircleAvatar(
                                    backgroundColor: Colors.blue.withOpacity(0.12),
                                    radius: 24,
                                    child: const Icon(Icons.person,
                                        color: Colors.blue, size: 26),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                            widget.pedido.clienteNombre ?? 'Cliente',
                                            style: TextStyle(
                                                fontSize: 18,
                                                fontWeight: FontWeight.w900,
                                                color: cs.onSurface)),
                                        Text(widget.pedido.clienteTel,
                                            style: TextStyle(color: cs.onSurfaceVariant)),
                                      ],
                                    ),
                                  ),
                                  IconButton(
                                    onPressed: () => launchUrl(
                                        Uri.parse('tel:${widget.pedido.clienteTel}')),
                                    icon: const Icon(Icons.phone_in_talk_rounded,
                                        color: Colors.green),
                                    style: IconButton.styleFrom(
                                        backgroundColor:
                                            Colors.green.withOpacity(0.12)),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 14),
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Icon(Icons.location_on_rounded,
                                      color: cs.onSurfaceVariant, size: 18),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                        widget.pedido.direccion ?? 'Sin dirección',
                                        style: TextStyle(
                                            fontSize: 14,
                                            height: 1.4,
                                            color: cs.onSurface)),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              if (widget.pedido.lat != null && widget.pedido.lng != null)
                                SizedBox(
                                  width: double.infinity,
                                  child: ElevatedButton.icon(
                                    onPressed: () => _centrarRuta(
                                        widget.pedido.lat!, widget.pedido.lng!),
                                    icon: const Icon(Icons.navigation_rounded),
                                    label: const Text('Centrar en la Ruta'),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.blue.shade600,
                                      foregroundColor: Colors.white,
                                      padding:
                                          const EdgeInsets.symmetric(vertical: 14),
                                      shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(14)),
                                    ),
                                  ),
                                ),
                              const SizedBox(height: 12),
                              if (widget.pedido.metodoPago == 'tarjeta')
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 12, vertical: 10),
                                  decoration: BoxDecoration(
                                      color: Colors.blue.withOpacity(0.1),
                                      borderRadius: BorderRadius.circular(10)),
                                  child: const Row(
                                    children: [
                                      Icon(Icons.credit_card_rounded,
                                          color: Colors.blue, size: 20),
                                      SizedBox(width: 8),
                                      Text('Pagado con Tarjeta — No cobrar.',
                                          style: TextStyle(
                                              color: Colors.blue,
                                              fontWeight: FontWeight.bold)),
                                    ],
                                  ),
                                )
                              else
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 12, vertical: 10),
                                  decoration: BoxDecoration(
                                      color: Colors.green.withOpacity(0.1),
                                      borderRadius: BorderRadius.circular(10)),
                                  child: Row(
                                    children: [
                                      const Icon(Icons.payments_rounded,
                                          color: Colors.green, size: 20),
                                      const SizedBox(width: 8),
                                      Text(
                                        'Cobrar: \$${widget.pedido.total?.toStringAsFixed(2) ?? '0.00'}',
                                        style: const TextStyle(
                                            color: Colors.green,
                                            fontWeight: FontWeight.bold,
                                            fontSize: 16),
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ], // Cierra AnimatedSwitcher children
                  ), // Cierra AnimatedSwitcher Column
                ), // Cierra AnimatedSwitcher
              ], // Cierra ListView children
            ), // Cierra ListView
          ), // Cierra Container

              // Swipe Button
              if (nextState != null && !widget.pedido.isTerminado)
                Positioned(
                  left: 24,
                  right: 24,
                  bottom: 24,
                  child: _loading
                      ? Center(
                          child:
                              CircularProgressIndicator(color: swipeColor))
                      : SwipeButton(
                          text: swipeText,
                          activeColor: swipeColor,
                          onSwipe: () => _cambiarEstado(nextState!),
                        ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}


// lib/screens/pedido_detail_screen.dart
// Pantalla de detalle de pedido para el REPARTIDOR
// Se abre via deep-link: https://www.app-estrella.shop/pedido/{id}

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:go_router/go_router.dart';
import '../models/pedido_model.dart';
import '../services/pedido_service.dart';
import '../core/user_role.dart';
import '../services/repartidor_service.dart';
import '../services/gasto_service.dart';
import '../core/ui_helpers.dart';
import '../core/swipe_button.dart';
import '../core/user_role.dart';
import 'package:flutter_map/flutter_map.dart';
import 'dashboard_screen.dart' show statsProvider;
import 'pedidos_screen.dart' show pedidosActivosProvider;
import '../main.dart' show stopAlarm;
import '../widgets/incoming_order_overlay.dart';
import '../widgets/navigation_map.dart';

final _pedidoProvider = FutureProvider.autoDispose.family<PedidoModel?, String>(
  (ref, id) => ref.read(pedidoServiceProvider).getPedido(id),
);

class PedidoDetailScreen extends ConsumerWidget {
  final String pedidoId;
  const PedidoDetailScreen({super.key, required this.pedidoId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    stopAlarm(); // Detener alarma ruidosa si estaba sonando
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

        // Si es repartidor y el pedido sigue pendiente (ofrecido, no aceptado aÃƒÂºn), mostrar Overlay Rappi-style
        if (!isAdmin && pedido.estado == 'pendiente') {
          return IncomingOrderOverlay(
            pedido: pedido,
            onAccept: () {
              PremiumToast.show(context,
                  title: 'Pedido Aceptado',
                  description: 'Ã‚Â¡Buen viaje y maneja con cuidado!',
                  isError: false);
              ref.invalidate(_pedidoProvider(pedidoId));
              ref.invalidate(statsProvider);
              ref.invalidate(pedidosActivosProvider);
            },
            onReject: () {
              PremiumToast.show(context,
                  title: 'Pedido Rechazado',
                  description: 'Asignando a otro repartidor...',
                  isError: true);
              ref.invalidate(_pedidoProvider(pedidoId));
              ref.invalidate(statsProvider);
              ref.invalidate(pedidosActivosProvider);
            },
          );
        }

        return Scaffold(
          appBar: AppBar(
            title: const Text('Detalle del Pedido'),
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () {
                if (Navigator.canPop(context)) {
                  Navigator.pop(context);
                } else {
                  context.go('/dashboard');
                }
              },
            ),
          ),
          body: _PedidoBody(
            pedido: pedido,
            onEstadoActualizado: () {
              ref.invalidate(_pedidoProvider(pedidoId));
              ref.invalidate(statsProvider);
              ref.invalidate(pedidosActivosProvider);
            },
          ),
        );
      },
    );
  }
}

class _PedidoBody extends ConsumerStatefulWidget {
  final PedidoModel pedido;
  final VoidCallback onEstadoActualizado;
  final ScrollController? scrollController;

  const _PedidoBody(
      {required this.pedido,
      required this.onEstadoActualizado,
      this.scrollController});

  @override
  ConsumerState<_PedidoBody> createState() => _PedidoBodyState();
}

class _PedidoBodyState extends ConsumerState<_PedidoBody> {
  bool _loading = false;
  bool _mostrarMapa = false;
  String? _transitionText;
  bool _isProcessing = false;

  Future<void> _avanzarEstado() async {
    if (_loading || _isProcessing) return;
    
    final siguiente = widget.pedido.siguienteEstado;
    if (siguiente == null) return;

    setState(() {
      _isProcessing = true;
    });

    final theme = Theme.of(context);
    final color = _estadoColor(siguiente);

    bool? confirm;
    bool? pagoPendiente;

    if ((siguiente == 'en_camino' || (siguiente == 'entregado' && widget.pedido.pagoPendienteRestaurante == null)) && widget.pedido.metodoPago == 'efectivo') {
      final res = await showDialog<String>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => TweenAnimationBuilder<double>(
          tween: Tween(begin: 0.0, end: 1.0),
          duration: const Duration(milliseconds: 380),
          curve: Curves.easeOutBack,
          builder: (context, value, child) => Transform.scale(
            scale: value,
            child: Opacity(opacity: value.clamp(0.0, 1.0), child: child),
          ),
          child: Dialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Icono
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF59E0B).withOpacity(0.12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.storefront_rounded, color: Color(0xFFF59E0B), size: 36),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    '¿Pagaste en el restaurante?',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Indica si cubriste el costo de la comida con tu efectivo.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                  ),
                  const SizedBox(height: 24),

                  // Opción SÍ PAGUÉ
                  GestureDetector(
                    onTap: () => Navigator.pop(ctx, 'pagado'),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withOpacity(0.08),
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: const Color(0xFF10B981).withOpacity(0.4), width: 1.5),
                      ),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: const Color(0xFF10B981).withOpacity(0.15),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 26),
                          ),
                          const SizedBox(width: 14),
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Sí pagué', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFF10B981))),
                                SizedBox(height: 2),
                                Text('Cubrí el costo de la comida con mi dinero', style: TextStyle(fontSize: 12, color: Colors.grey)),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right_rounded, color: Color(0xFF10B981)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Opción NO PAGUÉ / FIADO
                  GestureDetector(
                    onTap: () => Navigator.pop(ctx, 'pendiente'),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF59E0B).withOpacity(0.08),
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: const Color(0xFFF59E0B).withOpacity(0.4), width: 1.5),
                      ),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF59E0B).withOpacity(0.15),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(Icons.schedule_rounded, color: Color(0xFFF59E0B), size: 26),
                          ),
                          const SizedBox(width: 14),
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Me lo fiaron', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Color(0xFFF59E0B))),
                                SizedBox(height: 2),
                                Text('La deuda se cargará a mi cuenta', style: TextStyle(fontSize: 12, color: Colors.grey)),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right_rounded, color: Color(0xFFF59E0B)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Cancelar
                  TextButton(
                    onPressed: () => Navigator.pop(ctx, 'cancelar'),
                    child: const Text('Cancelar', style: TextStyle(color: Colors.grey, fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      if (res == null || res == 'cancelar') {
        if (mounted) setState(() => _isProcessing = false);
        return;
      }
      confirm = true;
      pagoPendiente = (res == 'pendiente');
    } else {
      confirm = await PremiumBottomSheet.showConfirm(
        context,
        title: widget.pedido.siguienteEstadoLabel ?? 'Confirmar',
        content:
            '¿Confirmar cambio de estado a "${_estadoLabel(siguiente)}"?',
        confirmText: 'Confirmar',
        cancelText: 'Cancelar',
      );
    }

    if (confirm != true) {
      if (mounted) setState(() => _isProcessing = false);
      return;
    }

    setState(() {
      _loading = true;
      if (siguiente == 'recibido') {
        _transitionText = 'Confirmando recolección...';
      } else if (siguiente == 'en_camino') {
        _transitionText = 'Avisando al cliente que vas en camino...';
      } else if (siguiente == 'entregado') {
        _transitionText = 'Finalizando entrega...';
      } else {
        _transitionText = 'Actualizando estado...';
      }
    });

    // ── LÓGICA DE FOTO FACHADA PARA EL REPARTIDOR ──
    if (siguiente == 'entregado') {
      try {
        final sb = Supabase.instance.client;
        final clienteTel =
            widget.pedido.clienteTel.replaceAll(RegExp(r'\D'), '');
        final cliente = await sb
            .from('clientes')
            .select('foto_fachada_url')
            .eq('telefono', clienteTel)
            .maybeSingle();

        if (cliente == null || cliente['foto_fachada_url'] == null) {
          // Ocultar temporalmente el loader para mostrar el diálogo bien
          if (mounted) setState(() => _loading = false);
          
          final quiereFoto = await showDialog<bool>(
            context: context,
            barrierDismissible: false,
            builder: (ctx) => AlertDialog(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              title: Row(
                children: const [
                  Icon(Icons.add_a_photo_rounded, color: Color(0xFF10B981)),
                  SizedBox(width: 10),
                  Text('Foto de Fachada'),
                ],
              ),
              content: const Text('Este domicilio no tiene foto registrada.\n\n¿Quieres tomarle una foto rápida a la fachada para ayudar a otros repartidores en el futuro?'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('Saltar por ahora', style: TextStyle(color: Colors.grey)),
                ),
                ElevatedButton.icon(
                  onPressed: () => Navigator.pop(ctx, true),
                  icon: const Icon(Icons.camera_alt, color: Colors.white),
                  label: const Text('Tomar Foto', style: TextStyle(color: Colors.white)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF10B981),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
              ],
            ),
          );

          if (mounted) setState(() => _loading = true);

          if (quiereFoto == true) {
            final ImagePicker picker = ImagePicker();
            // Limitar resolución a 1200px salva muchísima memoria RAM y previene crashes
            final XFile? photo = await picker.pickImage(
                source: ImageSource.camera, 
                imageQuality: 70,
                maxWidth: 1200,
                maxHeight: 1200,
            );
            if (photo != null) {
            final file = File(photo.path);
            final pathName =
                'fachada_${clienteTel}_${DateTime.now().millisecondsSinceEpoch}.jpg';
            await sb.storage.from('fachadas_clientes').upload(pathName, file).timeout(const Duration(seconds: 15));
            final urlPublica =
                sb.storage.from('fachadas_clientes').getPublicUrl(pathName);
            await sb.from('clientes').update(
                {'foto_fachada_url': urlPublica}).eq('telefono', clienteTel);
            }
          }
        }
      } catch (e) {
        debugPrint('Aviso: Falla al subir fachada $e');
      }
    }

    final minimumWait = Future.delayed(const Duration(milliseconds: 1500));
    String? error;
    try {
      error = await ref.read(pedidoServiceProvider).actualizarEstado(
          widget.pedido.id, siguiente,
          pagoPendienteRestaurante: pagoPendiente);
    } catch (e) {
      error = e.toString();
      // Limpiar el mensaje técnico para el usuario si es de fraude
      if (error.contains('FRAUDE DE GEOCERCA')) {
        error = 'Estás demasiado lejos del destino para entregar este pedido.';
      }
    }
    await minimumWait;
    
    if (mounted) {
      setState(() {
        _loading = false;
        _isProcessing = false;
        _transitionText = null;
      });
      PremiumToast.show(
        context,
        title: error == null ? 'Estado actualizado' : 'Error',
        description: error == null
            ? 'Mensaje enviado al cliente por WhatsApp'
            : 'Error al actualizar el estado: $error',
        isError: error != null,
      );
      if (error == null) widget.onEstadoActualizado();
    }
  }

  Future<void> _reasignarRepartidor() async {
    final sb = Supabase.instance.client;

    setState(() => _loading = true);
    // Traemos TODOS los repartidores activos (con y sin cuenta auth)
    final data = await sb
        .from('repartidores')
        .select('id, user_id, nombre')
        .eq('activo', true)
        .order('nombre');
    setState(() => _loading = false);

    if (!mounted) return;

    final repartidorElegido =
        await PremiumBottomSheet.showCustom<Map<String, dynamic>>(
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
                tieneCuenta
                    ? Icons.two_wheeler_rounded
                    : Icons.warning_amber_rounded,
                color: tieneCuenta
                    ? Theme.of(context).colorScheme.primary
                    : Colors.orange,
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
                : const Icon(Icons.lock_outline_rounded,
                    color: Colors.orange, size: 18),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
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
          if (error == null) widget.onEstadoActualizado();
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    debugPrint('=== RENDERIZANDO VISTA POR PASOS (_DriverRouteMode) ===');
    final pedido = widget.pedido;
    final color = _estadoColor(pedido.estado);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final isAdmin = ref.watch(isAdminProvider);

    final minutosRetraso =
        DateTime.now().difference(pedido.createdAt).inMinutes;
    final estaAtrasado = pedido.estado != 'entregado' &&
        pedido.estado != 'cancelado' &&
        minutosRetraso > 20;

    // Forzar color naranja si estÃƒÂ¡ pendiente o atrasado
    final bannerColor = (pedido.estado == 'pendiente' || estaAtrasado)
        ? const Color(0xFFEA580C)
        : color;

    double? finalLat = pedido.lat;
    double? finalLng = pedido.lng;

    if (finalLat == null || finalLng == null) {
      final regex =
          RegExp(r'https:\/\/www\.google\.com\/maps\?q=([0-9.-]+),([0-9.-]+)');
      final match = regex.firstMatch(pedido.descripcion ?? '');
      if (match != null) {
        finalLat = double.tryParse(match.group(1)!);
        finalLng = double.tryParse(match.group(2)!);
      }
    }

    return Stack(
      children: [
        ListView(
          controller: widget.scrollController,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
          physics: const BouncingScrollPhysics(),
          children: [
        // â”€â”€ Banners Administrativos â”€â”€
        if (isAdmin) ...[
          // â”€â”€ Banner de Estado (Premium) â”€â”€
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: isDark ? bannerColor.withOpacity(0.1) : Colors.white,
              borderRadius: BorderRadius.circular(24),
              boxShadow: isDark
                  ? []
                  : [
                      BoxShadow(
                          color: bannerColor.withOpacity(0.08),
                          blurRadius: 24,
                          offset: const Offset(0, 10))
                    ],
              border: Border.all(
                  color: bannerColor.withOpacity(isDark ? 0.3 : 0.1),
                  width: 1.5),
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
                          estaAtrasado
                              ? Icons.timer_off_rounded
                              : _estadoIcon(pedido.estado),
                          color: bannerColor,
                          size: 32),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        estaAtrasado
                            ? 'RETRASO DE ${minutosRetraso}M'
                            : pedido.estadoLabel.toUpperCase(),
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
                        estaAtrasado
                            ? 'Este pedido requiere atención inmediata.'
                            : _estadoSubtitulo(pedido.estado),
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

          // â”€â”€ Barra de Progreso â”€â”€
          Container(
            padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
              borderRadius: BorderRadius.circular(24),
              boxShadow: isDark
                  ? []
                  : [
                      BoxShadow(
                          color: Colors.black.withOpacity(0.03),
                          blurRadius: 15,
                          offset: const Offset(0, 5))
                    ],
            ),
            child: _ProgressoEstados(estadoActual: pedido.estado),
          ),

          const SizedBox(height: 24),
        ],

        // 🗺️ Navigation Map 🗺️
        if (finalLat != null && finalLng != null && pedido.estado != 'entregado' && (isAdmin || pedido.estado == 'en_camino' || _mostrarMapa)) ...[
          const SizedBox(height: 16),
          NavigationMap(
            key: ValueKey('map_${pedido.id}_${pedido.estado}'),
            destLat: finalLat,
            destLng: finalLng,
            destinationName: pedido.estado == 'asignado'
                ? (pedido.restaurante ?? 'Restaurante')
                : (pedido.clienteNombre ?? 'Cliente'),
            googleMapsApiKey: 'AIzaSyBOZkp595ze0Agwb7yPG5u7MD29EL9gHMw',
          ),
          const SizedBox(height: 16),
        ],

        // â”€â”€ SecciÃ³n: Restaurante (asignado) â”€â”€
        if (isAdmin || pedido.estado == 'asignado') ...[
          _SectionTitle(
              title: 'Recolección en Restaurante',
              icon: Icons.storefront_rounded),
          Container(
            decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
                borderRadius: BorderRadius.circular(24),
                boxShadow: isDark
                    ? []
                    : [
                        BoxShadow(
                            color: Colors.black.withOpacity(0.03),
                            blurRadius: 15,
                            offset: const Offset(0, 5))
                      ]),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      // Logo Squircle
                      if (pedido.restauranteLogoUrl != null && pedido.restauranteLogoUrl!.isNotEmpty)
                        Container(
                          width: 72,
                          height: 72,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: Colors.black.withOpacity(0.05), width: 1),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withOpacity(0.04),
                                blurRadius: 10,
                                offset: const Offset(0, 4),
                              ),
                            ],
                            image: DecorationImage(
                              image: NetworkImage(pedido.restauranteLogoUrl!),
                              fit: BoxFit.cover,
                            ),
                          ),
                        )
                      else
                        Container(
                          width: 72,
                          height: 72,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(16),
                            color: Theme.of(context).colorScheme.primary.withOpacity(0.1),
                          ),
                          child: Icon(Icons.storefront_rounded, size: 36, color: Theme.of(context).colorScheme.primary),
                        ),
                      const SizedBox(width: 16),
                      // Text
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (!isAdmin && pedido.estado == 'asignado')
                              const Text(
                                'Dirígete a recoger en:',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFFF59E0B),
                                ),
                              )
                            else
                              Text(
                                'RESTAURANTE',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: Theme.of(context).colorScheme.onSurface.withOpacity(0.4),
                                ),
                              ),
                            const SizedBox(height: 4),
                            Text(
                              (pedido.restaurante != null && pedido.restaurante!.isNotEmpty) ? pedido.restaurante! : 'Estrella',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w900,
                                color: Theme.of(context).colorScheme.onSurface.withOpacity(0.9),
                                height: 1.1,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      // Map Button (Rappi style)
                      if (!isAdmin && pedido.estado == 'asignado' && !_mostrarMapa)
                        Padding(
                          padding: const EdgeInsets.only(left: 12),
                          child: InkWell(
                            onTap: () {
                              setState(() {
                                _mostrarMapa = true;
                              });
                            },
                            borderRadius: BorderRadius.circular(30),
                            child: Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: const Color(0xFF10B981).withOpacity(0.15),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                Icons.near_me_rounded,
                                color: Color(0xFF10B981),
                                size: 28,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],

        // ── Sección: Qué Llevas (recibido) ──
        if (isAdmin ||
            pedido.estado == 'recibido') ...[
          _SectionTitle(
              title: 'Verifica tu Paquete', icon: Icons.fastfood_rounded),
          Container(
            decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
                borderRadius: BorderRadius.circular(24),
                boxShadow: isDark
                    ? []
                    : [
                        BoxShadow(
                            color: Colors.black.withOpacity(0.03),
                            blurRadius: 15,
                            offset: const Offset(0, 5))
                      ]),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.inventory_2_rounded, color: Theme.of(context).colorScheme.primary, size: 24),
                          const SizedBox(width: 8),
                          Text(
                            'CONTENIDO DEL PAQUETE',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: Theme.of(context).colorScheme.onSurface.withOpacity(0.5),
                              letterSpacing: 1.2,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.onSurface.withOpacity(0.04),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Text(
                          pedido.descripcion?.isNotEmpty == true ? pedido.descripcion! : 'Sin detalles específicos.',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: Theme.of(context).colorScheme.onSurface.withOpacity(0.9),
                            height: 1.4,
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Método de Pago',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Theme.of(context).colorScheme.onSurface.withOpacity(0.5),
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  Icon(
                                    pedido.metodoPago == 'efectivo' ? Icons.payments_rounded : Icons.credit_card_rounded,
                                    size: 18,
                                    color: pedido.metodoPago == 'efectivo' ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    pedido.metodoPago == 'efectivo' ? 'Efectivo' : 'En línea',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 15,
                                      color: Theme.of(context).colorScheme.onSurface.withOpacity(0.8),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                pedido.metodoPago == 'efectivo' ? 'Total a Cobrar' : 'Total',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Theme.of(context).colorScheme.onSurface.withOpacity(0.5),
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                pedido.total != null ? '\$${pedido.total!.toStringAsFixed(2)}' : '\$0.00',
                                style: TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w900,
                                  color: pedido.metodoPago == 'efectivo' ? const Color(0xFFF59E0B) : Theme.of(context).colorScheme.onSurface,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],

        // â”€â”€ SecciÃ³n: Cliente (en_camino o entregado) â”€â”€
        if (isAdmin ||
            pedido.estado == 'en_camino' ||
            pedido.estado == 'entregado') ...[
          _SectionTitle(
              title: 'Entrega al Cliente',
              icon: Icons.person_pin_circle_rounded),
          Container(
            decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
                borderRadius: BorderRadius.circular(24),
                boxShadow: isDark
                    ? []
                    : [
                        BoxShadow(
                            color: Colors.black.withOpacity(0.03),
                            blurRadius: 15,
                            offset: const Offset(0, 5))
                      ]),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      // Squircle avatar for Customer
                      Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(16),
                          color: Theme.of(context).colorScheme.secondary.withOpacity(0.1),
                        ),
                        child: Icon(Icons.person_rounded, size: 36, color: Theme.of(context).colorScheme.secondary),
                      ),
                      const SizedBox(width: 16),
                      // Text
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (!isAdmin && pedido.estado == 'en_camino')
                              const Text(
                                'Dirígete a entregar a:',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFFF59E0B),
                                ),
                              )
                            else
                              Text(
                                'CLIENTE',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: Theme.of(context).colorScheme.onSurface.withOpacity(0.4),
                                ),
                              ),
                            const SizedBox(height: 4),
                            Text(
                              pedido.clienteNombre?.isNotEmpty == true ? pedido.clienteNombre! : 'Cliente',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w900,
                                color: Theme.of(context).colorScheme.onSurface.withOpacity(0.9),
                                height: 1.1,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (pedido.direccion != null && pedido.direccion!.isNotEmpty) ...[
                              const SizedBox(height: 6),
                              Text(
                                pedido.direccion!,
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Theme.of(context).colorScheme.onSurface.withOpacity(0.6),
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ],
                        ),
                      ),
                      // Action buttons: Maps and Phone
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (finalLat != null && finalLng != null)
                            Padding(
                              padding: const EdgeInsets.only(left: 8),
                              child: InkWell(
                                onTap: () async {
                                  final url = Uri.parse('google.navigation:q=$finalLat,$finalLng&mode=d');
                                  if (await canLaunchUrl(url)) {
                                    await launchUrl(url);
                                  } else {
                                    final webUrl = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$finalLat,$finalLng');
                                    await launchUrl(webUrl);
                                  }
                                },
                                borderRadius: BorderRadius.circular(30),
                                child: Container(
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF10B981).withOpacity(0.15),
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(
                                    Icons.directions_rounded,
                                    color: Color(0xFF10B981),
                                    size: 28,
                                  ),
                                ),
                              ),
                            ),
                          Padding(
                            padding: const EdgeInsets.only(left: 8),
                            child: InkWell(
                              onTap: () async {
                                final tel = pedido.clienteTel.replaceAll(RegExp(r'\D'), '');
                                final url = Uri.parse('tel:$tel');
                                if (await canLaunchUrl(url)) {
                                  await launchUrl(url);
                                }
                              },
                              borderRadius: BorderRadius.circular(30),
                              child: Container(
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF3B82F6).withOpacity(0.15),
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.phone_rounded,
                                  color: Color(0xFF3B82F6),
                                  size: 28,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                Divider(height: 1, color: Theme.of(context).colorScheme.onSurface.withOpacity(0.05)),
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Icon(
                            pedido.metodoPago == 'efectivo' ? Icons.attach_money_rounded : Icons.check_circle_rounded,
                            color: pedido.metodoPago == 'efectivo' ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            pedido.metodoPago == 'efectivo' ? 'Cobrar al Cliente' : 'Ya pagado',
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                          ),
                        ],
                      ),
                      Text(
                        pedido.metodoPago == 'efectivo' && pedido.total != null 
                            ? '\$${pedido.total!.toStringAsFixed(2)}' 
                            : 'NADA',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                          color: pedido.metodoPago == 'efectivo' ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],

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
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20)),
                    elevation: 0,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(_estadoIcon(pedido.siguienteEstado!), size: 24),
                      const SizedBox(width: 12),
                      Text(
                        pedido.siguienteEstadoLabel ?? 'Actualizar',
                        style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.5),
                      ),
                    ],
                  ),
                )
        else
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [const Color(0xFF10B981).withOpacity(0.15), const Color(0xFF059669).withOpacity(0.05)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: const Color(0xFF10B981).withOpacity(0.3)),
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.task_alt_rounded, color: Color(0xFF10B981), size: 32),
                    const SizedBox(width: 12),
                    Text(
                      'Resumen de Entrega',
                      style: theme.textTheme.titleLarge?.copyWith(
                        color: const Color(0xFF10B981),
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                if (pedido.total != null) ...[
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: isDark ? Colors.black45 : Colors.white70,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('Costo Restaurante', style: TextStyle(color: isDark ? Colors.white60 : Colors.black54, fontSize: 14, fontWeight: FontWeight.w600)),
                            Text('\$${pedido.costoRestauranteCalculado.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('Ganancia (Envío)', style: TextStyle(color: isDark ? Colors.white60 : Colors.black54, fontSize: 14, fontWeight: FontWeight.w600)),
                            Text('+\$${pedido.costoEnvioCalculado.toStringAsFixed(2)}', style: const TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.w900, fontSize: 14)),
                          ],
                        ),
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 12),
                          child: Divider(height: 1, thickness: 1),
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('Total', style: TextStyle(color: isDark ? Colors.white : Colors.black, fontSize: 16, fontWeight: FontWeight.w900)),
                            Text('\$${pedido.total!.toStringAsFixed(2)}', style: TextStyle(color: isDark ? Colors.white : Colors.black, fontSize: 18, fontWeight: FontWeight.w900)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                Text(
                  'Entregado el ${DateFormat('dd MMM hh:mm a', 'es_MX').format(pedido.updatedAt)}',
                  style: TextStyle(fontSize: 12, color: isDark ? Colors.white54 : Colors.black54, fontWeight: FontWeight.w500),
                )
              ],
            ),
          ),

        const SizedBox(height: 16),

        // Ã¢â€â‚¬Ã¢â€â‚¬ BotÃƒÂ³n Reasignar Ã¢â€â‚¬Ã¢â€â‚¬
        if (isAdmin &&
            pedido.estado != 'entregado' &&
            pedido.estado != 'cancelado')
          OutlinedButton.icon(
            onPressed: _loading ? null : _reasignarRepartidor,
            icon: const Icon(Icons.sync_alt_rounded),
            label: const Text('Reasignar Repartidor',
                style: TextStyle(fontWeight: FontWeight.w700)),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(double.infinity, 56),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20)),
              side: BorderSide(
                  color: theme.colorScheme.onSurface.withOpacity(0.1),
                  width: 1.5),
            ),
          ),

        const SizedBox(height: 100),
          ],
        ),

        // ── Overlay de Transición de Estado ──
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 350),
          transitionBuilder: (child, animation) => FadeTransition(
            opacity: animation,
            child: child,
          ),
          child: _loading && _transitionText != null
              ? _TransitionOverlay(text: _transitionText!, key: const ValueKey('overlay'))
              : const SizedBox.shrink(key: ValueKey('empty')),
        ),
      ],
    );
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Widgets Auxiliares RediseÃƒÂ±ados Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

// ── Overlay Animado de Transición ──────────────────────────────────────────

class _TransitionOverlay extends StatefulWidget {
  final String text;
  const _TransitionOverlay({required this.text, super.key});

  @override
  State<_TransitionOverlay> createState() => _TransitionOverlayState();
}

class _TransitionOverlayState extends State<_TransitionOverlay>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<Offset> _slide;
  late Animation<double> _fade;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
    _slide = Tween<Offset>(begin: const Offset(0, 0.25), end: Offset.zero)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    _fade = CurvedAnimation(parent: _ctrl, curve: Curves.easeOut);
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return FadeTransition(
      opacity: _fade,
      child: Container(
        width: double.infinity,
        height: double.infinity,
        color: isDark ? Colors.black.withOpacity(0.75) : Colors.white.withOpacity(0.88),
        child: Center(
          child: SlideTransition(
            position: _slide,
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 40),
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 36),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E293B) : Colors.white,
                borderRadius: BorderRadius.circular(32),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.14),
                    blurRadius: 48,
                    offset: const Offset(0, 20),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(
                    width: 60,
                    height: 60,
                    child: CircularProgressIndicator(
                      strokeWidth: 5,
                      valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFFF6B35)),
                    ),
                  ),
                  const SizedBox(height: 28),
                  Text(
                    widget.text,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Notificando al cliente via WhatsApp...',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: isDark ? Colors.white54 : const Color(0xFF64748B),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ── Widgets Auxiliares ──────────────────────────────────────────────────────


class _ProgressoEstados extends StatelessWidget {
  final String estadoActual;
  const _ProgressoEstados({required this.estadoActual});

  static const _estados = ['asignado', 'recibido', 'en_camino', 'entregado'];
  static const _labels = ['Asignado', 'Recibido', 'Camino', 'Entregado'];
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
    final inactiveColor = isDark
        ? Colors.white.withOpacity(0.05)
        : Colors.black.withOpacity(0.05);

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
                      color: i == 0
                          ? Colors.transparent
                          : (done ? activeColor : inactiveColor),
                    ),
                  ),
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    width: current ? 36 : 28,
                    height: current ? 36 : 28,
                    decoration: BoxDecoration(
                      color: done ? activeColor : inactiveColor,
                      shape: BoxShape.circle,
                      boxShadow: current
                          ? [
                              BoxShadow(
                                  color: activeColor.withOpacity(0.4),
                                  blurRadius: 12,
                                  offset: const Offset(0, 4))
                            ]
                          : null,
                    ),
                    child: Icon(
                      _icons[i],
                      size: current ? 18 : 14,
                      color: done
                          ? Colors.white
                          : theme.colorScheme.onSurface.withOpacity(0.3),
                    ),
                  ),
                  Expanded(
                    child: Container(
                      height: 3,
                      color: i == _estados.length - 1
                          ? Colors.transparent
                          : (i < currentIdx ? activeColor : inactiveColor),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              AnimatedDefaultTextStyle(
                duration: const Duration(milliseconds: 300),
                style: TextStyle(
                  fontFamily: theme.textTheme.bodyMedium?.fontFamily,
                  color: current
                      ? activeColor
                      : (done
                          ? theme.colorScheme.onSurface.withOpacity(0.8)
                          : theme.colorScheme.onSurface.withOpacity(0.4)),
                  fontSize: current ? 12 : 10,
                  fontWeight: current
                      ? FontWeight.w800
                      : (done ? FontWeight.w600 : FontWeight.w500),
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Helpers de estilo Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

Color _estadoColor(String estado) {
  switch (estado) {
    case 'pendiente':
      return const Color(0xFFEA580C);
    case 'asignado':
      return const Color(0xFF3B82F6);
    case 'recibido':
      return const Color(0xFFF59E0B);
    case 'en_camino':
      return const Color(0xFF8B5CF6);
    case 'entregado':
      return const Color(0xFF10B981);
    default:
      return Colors.grey;
  }
}

IconData _estadoIcon(String estado) {
  switch (estado) {
    case 'pendiente':
      return Icons.warning_rounded;
    case 'asignado':
      return Icons.assignment_rounded;
    case 'recibido':
      return Icons.handshake_rounded;
    case 'en_camino':
      return Icons.delivery_dining_rounded;
    case 'entregado':
      return Icons.check_circle_rounded;
    default:
      return Icons.help_outline;
  }
}

String _estadoLabel(String estado) {
  switch (estado) {
    case 'pendiente':
      return 'Pendiente';
    case 'asignado':
      return 'Asignado';
    case 'recibido':
      return 'Recibido';
    case 'en_camino':
      return 'En Camino';
    case 'entregado':
      return 'Entregado';
    default:
      return estado;
  }
}

String _estadoSubtitulo(String estado) {
  switch (estado) {
    case 'pendiente':
      return 'AÃƒÂºn no se ha asignado a ningÃƒÂºn repartidor.';
    case 'asignado':
      return 'El pedido fue asignado. ConfÃƒÂ­rmalo al recibirlo.';
    case 'recibido':
      return 'Tienes el pedido. Sal a entregarlo cuando estÃƒÂ©s listo.';
    case 'en_camino':
      return 'EstÃƒÂ¡s en camino. Ã‚Â¡El cliente ya fue notificado!';
    case 'entregado':
      return 'Ã‚Â¡Entregado exitosamente! El cliente lo sabe. Ã°Å¸Å½â€°';
    default:
      return '';
  }
}

String _formatDateTime(DateTime dt) {
  final d =
      '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';
  final t =
      '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  return '$d Ã¢â‚¬Â¢ $t';
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Tarjeta GPS Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
class _GpsCard extends StatelessWidget {
  final double lat;
  final double lng;
  const _GpsCard({required this.lat, required this.lng});

  Future<void> _abrirMapa() async {
    final uri = Uri.parse(
        'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving');
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
          border: Border.all(
              color: const Color(0xFF3B82F6).withOpacity(0.2), width: 1.5),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF3B82F6).withOpacity(0.15),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.near_me_rounded,
                  color: Color(0xFF3B82F6), size: 28),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('UbicaciÃƒÂ³n de Entrega',
                      style: TextStyle(
                          color:
                              isDark ? Colors.white : const Color(0xFF1E3A8A),
                          fontWeight: FontWeight.w800,
                          fontSize: 15)),
                  const SizedBox(height: 4),
                  Text('Toca para abrir en Google Maps',
                      style: TextStyle(
                          color: const Color(0xFF3B82F6).withOpacity(0.8),
                          fontSize: 12,
                          fontWeight: FontWeight.w600)),
                ],
              ),
            ),
            Icon(Icons.arrow_forward_ios_rounded,
                color: const Color(0xFF3B82F6).withOpacity(0.5), size: 16),
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

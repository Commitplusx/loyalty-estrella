import 'dart:io';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:go_router/go_router.dart';
import '../core/ui_helpers.dart';
import '../models/pedido_model.dart';
import '../services/pedido_service.dart';
import '../main.dart' show stopAlarm;
import '../core/theme.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../screens/driver_pedidos_screen.dart' show rejectedPedidosProvider;
import '../screens/pedido_detail_screen.dart' show pedidoDetailProvider;
import '../core/theme_provider.dart';
import 'package:action_slider/action_slider.dart';

class IncomingOrderSheet extends ConsumerWidget {
  final Map<String, dynamic> payload;

  const IncomingOrderSheet({super.key, required this.payload});

  static Future<void> show(BuildContext context, Map<String, dynamic> payload) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      builder: (ctx) => IncomingOrderSheet(payload: payload),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(32), // Bordes más redondeados
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.15),
              blurRadius: 30,
              offset: const Offset(0, 15),
            )
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: _IncomingOrderSheetContent(payload: payload, isDark: false),
        ),
      ),
    );
  }
}
class _IncomingOrderSheetContent extends ConsumerStatefulWidget {
  final Map<String, dynamic> payload;
  final bool isDark;
  const _IncomingOrderSheetContent({required this.payload, required this.isDark});

  @override
  ConsumerState<_IncomingOrderSheetContent> createState() => _IncomingOrderSheetContentState();
}

class _IncomingOrderSheetContentState extends ConsumerState<_IncomingOrderSheetContent> {
  bool _isLoading = true;
  PedidoModel? _pedido;
  String _error = '';
  bool _isProcessing = false;
  RealtimeChannel? _subscription;

  @override
  void initState() {
    super.initState();
    _loadPedido();
    _setupRealtime();
  }

  void _setupRealtime() {
    final pedidoId = widget.payload['pedido_id'] as String;
    _subscription = Supabase.instance.client
        .channel('public:pedidos:id=eq.$pedidoId')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'pedidos',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: pedidoId,
          ),
          callback: (payload) {
            final data = payload.newRecord;
            final currentUserId = Supabase.instance.client.auth.currentUser?.id;
            final isOfrecido = data['estado'] == 'ofrecido' && data['repartidor_id'] == currentUserId;
            final isBuscando = data['estado'] == 'buscando_repartidor' && data['repartidor_id'] == null;
            final isMio = (data['estado'] == 'asignado' || data['estado'] == 'en_camino') && data['repartidor_id'] == currentUserId;
            
            if (!isOfrecido && !isBuscando && !isMio) {
              if (mounted && Navigator.canPop(context)) {
                stopAlarm();
                Navigator.of(context).pop();
                PremiumToast.show(
                  context,
                  title: 'Viaje no disponible',
                  description: 'El pedido fue tomado por otro repartidor o expiró.',
                  isError: true,
                  icon: Icons.timer_off_rounded,
                );
              }
            } else if (isMio && !_isProcessing) {
              // Si es mío y yo no lo estoy procesando aquí, significa que lo acepté desde la lista principal.
              if (mounted && Navigator.canPop(context)) {
                stopAlarm();
                Navigator.of(context).pop();
              }
            }
          },
        )
        .subscribe();
  }

  @override
  void dispose() {
    _subscription?.unsubscribe();
    super.dispose();
  }

  Future<void> _loadPedido() async {
//     debugPrint('🚀 [IncomingOrderSheet] Iniciando carga de detalles del pedido. Payload: ${widget.payload}');
    try {
      final pedidoId = widget.payload['pedido_id'] as String;
//       debugPrint('🔍 [IncomingOrderSheet] Consultando BD para pedido ID: $pedidoId');
      final pedido = await PedidoService().getPedido(pedidoId);
      
      if (mounted) {
        final currentUserId = Supabase.instance.client.auth.currentUser?.id;
        final isMio = (pedido?.estado == 'asignado' || pedido?.estado == 'en_camino') && pedido?.repartidorId == currentUserId;
        
        if (isMio) {
          // Ya lo habíamos aceptado por fuera (ej. en la lista)
          if (Navigator.canPop(context)) {
            stopAlarm();
            Navigator.of(context).pop();
          }
          return;
        }

        setState(() {
          _pedido = pedido;
          _isLoading = false;
        });
//         debugPrint('✅ [IncomingOrderSheet] Pedido cargado con éxito. Restaurante: ${pedido?.restaurante}, Ganancia: \$${pedido?.precioEntrega}');
      }
    } catch (e) {
      debugPrint('❌ [IncomingOrderSheet] Error crítico cargando detalles del pedido: $e');
      if (mounted) {
        setState(() {
          _error = 'Error cargando detalles del pedido';
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _aceptarPedido() async {
//     debugPrint('🟢 [IncomingOrderSheet] Usuario presionó ACEPTAR pedido. ID: ${_pedido?.id}');
    if (_pedido == null) return;
    
    // Control de estado de carga para evitar múltiple clic
    setState(() => _isProcessing = true);
    
    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      
      // Llamada RPC atómica al backend
      final dynamic response = await Supabase.instance.client.rpc(
        'aceptar_pedido_atomico', 
        params: {
          'p_pedido_id': _pedido!.id,
          'p_repartidor_id': userId,
        }
      ).timeout(const Duration(seconds: 10)); // Timeout preventivo
      
      final bool exito = response == true;
      
      if (!mounted) return; // Validación de mounted temprana
      
      stopAlarm();
      Navigator.of(context).pop(); // Cerramos el modal primero de forma limpia
      
      if (exito) {
//         debugPrint('================================================================');
//         debugPrint('✅ [IncomingOrderSheet] 🚀 VIAJE ACEPTADO (ATÓMICAMENTE)');
//         debugPrint('ID Pedido: ${_pedido!.id}');
//         debugPrint('¿Era Viaje Apilado?: ${widget.payload['viaje_apilado']}');
//         debugPrint('================================================================');
        
        // Refrescar explícitamente el provider por si la pantalla ya estaba montada de fondo
        ref.invalidate(pedidoDetailProvider(_pedido!.id));
        
        context.push('/pedidos/${_pedido!.id}'); // Ir al Itinerario
        PremiumToast.show(
          context,
          title: '¡Viaje Aceptado!',
          description: 'Sigue la ruta en tu itinerario.',
          icon: Icons.check_circle_rounded,
        );
      } else {
        PremiumToast.show(
          context,
          title: 'Viaje no disponible',
          description: 'Alguien más tomó este pedido o tu tiempo expiró.',
          isError: true,
          icon: Icons.error_outline_rounded,
        );
      }
    } on SocketException catch (e) {
      debugPrint('❌ [IncomingOrderSheet] Error de red (SocketException): $e');
      if (mounted) {
        setState(() => _isProcessing = false);
        PremiumToast.show(
          context,
          title: 'Sin conexión',
          description: 'Verifica tu red 4G e intenta de nuevo.',
          isError: true,
          icon: Icons.wifi_off_rounded,
        );
      }
    } on TimeoutException catch (e) {
      debugPrint('❌ [IncomingOrderSheet] Timeout: $e');
      if (mounted) {
        setState(() => _isProcessing = false);
        PremiumToast.show(
          context,
          title: 'Conexión lenta',
          description: 'El servidor tardó mucho en responder.',
          isError: true,
          icon: Icons.timer_off_rounded,
        );
      }
    } catch (e) {
      debugPrint('❌ [IncomingOrderSheet] Error al aceptar el pedido (update): $e');
      if (mounted) {
        setState(() => _isProcessing = false);
        PremiumToast.show(
          context,
          title: 'Error Inesperado',
          description: 'No se pudo procesar la solicitud.',
          isError: true,
        );
      }
    }
  }

  Future<void> _rechazarPedido() async {
//     debugPrint('🔴 [IncomingOrderSheet] Usuario presionó RECHAZAR pedido. ID: ${_pedido?.id}');
    if (_pedido == null) {
      debugPrint('⚠️ [IncomingOrderSheet] Intento de rechazar pero el pedido es null.');
      return;
    }
    setState(() => _isProcessing = true);
    
    try {
      // Registrar el rechazo y penalizar
      final userId = Supabase.instance.client.auth.currentUser?.id;
      
      if (userId != null) {
        try {
          debugPrint('⚠️ [IncomingOrderSheet] Ejecutando RPC rechazar_pedido_atomico...');
          final response = await Supabase.instance.client.rpc(
            'rechazar_pedido_atomico', 
            params: {
              'p_pedido_id': _pedido!.id,
              'p_repartidor_id': userId,
            }
          ).timeout(const Duration(seconds: 10));
          
          if (response == true) {
//              debugPrint('✅ [IncomingOrderSheet] Rechazo atómico exitoso.');
          } else {
             debugPrint('⚠️ [IncomingOrderSheet] El rechazo atómico devolvió false (quizás ya expiró).');
          }
        } catch (e) {
          debugPrint('❌ [IncomingOrderSheet] Fallo al ejecutar RPC rechazar_pedido_atomico: $e');
        }
      }

      // Update local rejected state to hide it instantly from the pool
      ref.read(rejectedPedidosProvider.notifier).update((state) => {...state, _pedido!.id});
          
//       debugPrint('✅ [IncomingOrderSheet] Pedido liberado en BD. Apagando alarma...');
      stopAlarm();
      
      if (mounted) {
//         debugPrint('➡️ [IncomingOrderSheet] Cerrando el BottomSheet de rechazo.');
        Navigator.of(context).pop(); // Cerrar BottomSheet
        PremiumToast.show(
          context,
          title: 'Viaje Rechazado',
          description: 'El sistema buscará a otro repartidor.',
          isError: true,
          icon: Icons.cancel_rounded,
        );
      }
    } catch (e) {
      debugPrint('❌ [IncomingOrderSheet] Error crítico al rechazar el pedido: $e');
      setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const SizedBox(
        height: 200,
        child: Center(
          child: CircularProgressIndicator(color: Color(0xFFFF6B35)),
        ),
      );
    }

    if (_error.isNotEmpty || _pedido == null) {
      return SizedBox(
        height: 150,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error, style: const TextStyle(color: Colors.red)),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {
                  stopAlarm();
                  Navigator.of(context).pop();
                },
                child: const Text('Cerrar'),
              )
            ],
          ),
        ),
      );
    }

    final isDark = false; // El usuario pidió mantenerlo siempre en modo claro
    final textColor = Colors.black87;
    final subtitleColor = Colors.black54;
    final cardBgColor = Colors.white;
    final routeCardColor = const Color(0xFFF8FAFC);
    final borderColor = const Color(0xFFE2E8F0);

    final esApilado = widget.payload['viaje_apilado'] == true || widget.payload['viaje_apilado'] == 'true';
    final p = _pedido!;
    final double fee = p.precioEntrega ?? p.costoEnvioCalculado;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (esApilado) ...[
          Container(
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [Color(0xFF10B981).withOpacity(0.2), Color(0xFF10B981).withOpacity(0.05)]),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF10B981).withOpacity(0.5)),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.rocket_launch_rounded, color: Color(0xFF10B981), size: 20),
                SizedBox(width: 10),
                Text('VIAJE APILADO (En Ruta)', style: TextStyle(color: Color(0xFF047857), fontWeight: FontWeight.w900, letterSpacing: 0.5)),
              ],
            ),
          ),
          const SizedBox(height: 20),
        ],
        
        // Header Icono Premium
        Center(
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: const Color(0xFFFFF7ED), // Fondo naranja claro
              borderRadius: BorderRadius.circular(24),
            ),
            child: const Icon(Icons.notifications_active_rounded, color: Color(0xFFF97316), size: 36),
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          'NUEVO VIAJE',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: Colors.black, letterSpacing: -0.5),
        ),
        const SizedBox(height: 4),
        const Text(
          'Tienes un viaje disponible para ti',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 15, color: Colors.black54, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 24),

        // Bloque Principal: Ganancia
        Container(
          padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
          decoration: BoxDecoration(
            color: const Color(0xFFECFDF5), // Fondo verde suave
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.2)),
          ),
          child: Column(
            children: [
              const Text(
                'GANANCIA ESTIMADA',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: Color(0xFF047857), fontWeight: FontWeight.w900, letterSpacing: 1.1),
              ),
              const SizedBox(height: 8),
              Text(
                '\$${fee.toStringAsFixed(2)}',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 54, fontWeight: FontWeight.w900, color: Color(0xFF047857), height: 1.0, letterSpacing: -1.5),
              ),
              
              if (p.tiempoPreparacion != null && p.tiempoPreparacion! > 0) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.local_fire_department_rounded, color: Color(0xFFF97316), size: 18),
                      const SizedBox(width: 8),
                      Text(
                        'Lista en ${p.tiempoPreparacion} min',
                        style: const TextStyle(color: Color(0xFFF97316), fontWeight: FontWeight.w800, fontSize: 14),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
        
        const SizedBox(height: 20),
        
        // Detalles Origen / Destino (Ruta)
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: const BoxDecoration(color: Color(0xFFFFF7ED), shape: BoxShape.circle),
                    child: const Icon(Icons.storefront_rounded, color: Color(0xFFF97316), size: 22),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('RECOGER EN', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Color(0xFFF97316), letterSpacing: 0.5)),
                        const SizedBox(height: 4),
                        Text(p.restaurante ?? 'Restaurante Estrella', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Colors.black87)),
                      ],
                    ),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.only(left: 20, top: 4, bottom: 4),
                child: SizedBox(
                  height: 24, 
                  child: CustomPaint(painter: DottedLinePainter(color: Colors.black26)), 
                ),
              ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: const BoxDecoration(color: Color(0xFFF3E8FF), shape: BoxShape.circle), // Morado suave
                    child: const Icon(Icons.location_on_rounded, color: Color(0xFF9333EA), size: 22),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('ENTREGAR EN', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Color(0xFF9333EA), letterSpacing: 0.5)),
                        const SizedBox(height: 4),
                        Text(p.direccion ?? 'Dirección del cliente', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: Colors.black87, height: 1.2)),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        
        const SizedBox(height: 24),
        
        // Botones de acción rediseñados
        Column(
          children: [
            ActionSlider.standard(
              rolling: true,
              height: 60,
              backgroundColor: const Color(0xFF10B981), // Verde Esmeralda Premium
              toggleColor: Colors.white,
              icon: const Icon(Icons.chevron_right_rounded, color: Color(0xFF10B981), size: 30),
              successIcon: const Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 30),
              action: (controller) async {
                controller.loading();
                await _aceptarPedido();
                // Si la pantalla se cierra antes (porque _aceptarPedido hace pop), el controller.success no importará mucho,
                // pero si da tiempo, se verá bien.
                if (mounted) controller.success();
              },
              child: const Text('Desliza para ACEPTAR', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16)),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: _isProcessing ? null : _rechazarPedido,
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  backgroundColor: isDark ? Colors.red.withValues(alpha: 0.15) : Colors.red.withValues(alpha: 0.08),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                child: _isProcessing 
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.red))
                  : const Text('Rechazar viaje', style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold, fontSize: 15)),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// Painter para la línea punteada vertical
class DottedLinePainter extends CustomPainter {
  final Color color;
  DottedLinePainter({this.color = Colors.black26});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    const dashHeight = 4.0;
    const dashSpace = 4.0;
    double startY = 0;
    while (startY < size.height) {
      canvas.drawLine(Offset(0, startY), Offset(0, startY + dashHeight), paint);
      startY += dashHeight + dashSpace;
    }
  }

  @override
  bool shouldRepaint(CustomPainter oldDelegate) => false;
}

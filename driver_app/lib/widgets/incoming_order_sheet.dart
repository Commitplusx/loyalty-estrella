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

class IncomingOrderSheet extends StatelessWidget {
  final Map<String, dynamic> payload;

  const IncomingOrderSheet({super.key, required this.payload});

  static Future<void> show(BuildContext context, Map<String, dynamic> payload) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(16.0),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white, // ⚪ Fondo blanco limpio
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.15),
                blurRadius: 20,
                offset: const Offset(0, 10),
              )
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header Rojo Estrella
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 16),
                decoration: BoxDecoration(
                  gradient: AppGradients.brand,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                ),
                child: const Text(
                  '🚨 ¡NUEVO VIAJE ASIGNADO!',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(20),
                child: _IncomingOrderSheetContent(payload: payload),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return _IncomingOrderSheetContent(payload: payload);
  }
}
class _IncomingOrderSheetContent extends ConsumerStatefulWidget {
  final Map<String, dynamic> payload;
  const _IncomingOrderSheetContent({required this.payload});

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
    debugPrint('🚀 [IncomingOrderSheet] Iniciando carga de detalles del pedido. Payload: ${widget.payload}');
    try {
      final pedidoId = widget.payload['pedido_id'] as String;
      debugPrint('🔍 [IncomingOrderSheet] Consultando BD para pedido ID: $pedidoId');
      final pedido = await PedidoService().getPedido(pedidoId);
      
      if (mounted) {
        setState(() {
          _pedido = pedido;
          _isLoading = false;
        });
        debugPrint('✅ [IncomingOrderSheet] Pedido cargado con éxito. Restaurante: ${pedido?.restaurante}, Ganancia: \$${pedido?.precioEntrega}');
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
    debugPrint('🟢 [IncomingOrderSheet] Usuario presionó ACEPTAR pedido. ID: ${_pedido?.id}');
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
        debugPrint('================================================================');
        debugPrint('✅ [IncomingOrderSheet] 🚀 VIAJE ACEPTADO (ATÓMICAMENTE)');
        debugPrint('ID Pedido: ${_pedido!.id}');
        debugPrint('¿Era Viaje Apilado?: ${widget.payload['viaje_apilado']}');
        debugPrint('================================================================');
        
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
    debugPrint('🔴 [IncomingOrderSheet] Usuario presionó RECHAZAR pedido. ID: ${_pedido?.id}');
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
             debugPrint('✅ [IncomingOrderSheet] Rechazo atómico exitoso.');
          } else {
             debugPrint('⚠️ [IncomingOrderSheet] El rechazo atómico devolvió false (quizás ya expiró).');
          }
        } catch (e) {
          debugPrint('❌ [IncomingOrderSheet] Fallo al ejecutar RPC rechazar_pedido_atomico: $e');
        }
      }

      // Update local rejected state to hide it instantly from the pool
      ref.read(rejectedPedidosProvider.notifier).update((state) => {...state, _pedido!.id});
          
      debugPrint('✅ [IncomingOrderSheet] Pedido liberado en BD. Apagando alarma...');
      stopAlarm();
      
      if (mounted) {
        debugPrint('➡️ [IncomingOrderSheet] Cerrando el BottomSheet de rechazo.');
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
        
        // Bloque Principal: Ganancia y Preparación
        Container(
          padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: AppColors.brandRed.withOpacity(0.08),
                blurRadius: 24,
                spreadRadius: 4,
                offset: const Offset(0, 8),
              )
            ],
            border: Border.all(color: AppColors.brandRed.withOpacity(0.2)),
          ),
          child: Column(
            children: [
              const Text(
                'GANANCIA ESTIMADA',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: Colors.black54, fontWeight: FontWeight.w800, letterSpacing: 1.1),
              ),
              const SizedBox(height: 4),
              Text(
                '\$${fee.toStringAsFixed(2)}',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 54, fontWeight: FontWeight.w900, color: AppColors.brandRed, height: 1.1, letterSpacing: -1),
              ),
              
              if (p.tiempoPreparacion != null && p.tiempoPreparacion! > 0) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.brandRed.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppColors.brandRed.withOpacity(0.2)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.local_fire_department_rounded, color: AppColors.brandRed, size: 16),
                      const SizedBox(width: 6),
                      Text(
                        'Lista en ${p.tiempoPreparacion} min',
                        style: const TextStyle(color: AppColors.brandRed, fontWeight: FontWeight.w800, fontSize: 13),
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
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10)]),
                    child: const Icon(Icons.storefront_rounded, color: Colors.black87, size: 20),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('RECOGER EN', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.black45, letterSpacing: 0.5)),
                        const SizedBox(height: 2),
                        Text(p.restaurante ?? 'Restaurante Estrella', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Colors.black87)),
                      ],
                    ),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.only(left: 17, top: 4, bottom: 4),
                child: SizedBox(
                  height: 24, 
                  child: CustomPaint(painter: DottedLinePainter()), // Un toque premium con línea punteada
                ),
              ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(color: AppColors.brandRed.withOpacity(0.1), shape: BoxShape.circle),
                    child: const Icon(Icons.location_on_rounded, color: AppColors.brandRed, size: 20),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('ENTREGAR EN', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.black45, letterSpacing: 0.5)),
                        const SizedBox(height: 2),
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
        
        // Botones de acción
        Row(
          children: [
            Expanded(
              flex: 2,
              child: Container(
                decoration: BoxDecoration(
                  gradient: AppGradients.brand,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(color: AppColors.brandRed.withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4))
                  ]
                ),
                child: ElevatedButton(
                  onPressed: _isProcessing ? null : _aceptarPedido,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.transparent,
                    shadowColor: Colors.transparent,
                    padding: const EdgeInsets.symmetric(vertical: 18),
                  ),
                  child: _isProcessing 
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                    : const Text('ACEPTAR', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, letterSpacing: 0.5)),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 1,
              child: TextButton(
                onPressed: _isProcessing ? null : _rechazarPedido,
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  backgroundColor: Colors.red.withOpacity(0.08),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                child: _isProcessing 
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.red))
                  : const Text('RECHAZAR', style: TextStyle(color: Colors.red, fontWeight: FontWeight.w900, letterSpacing: 0.5)),
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
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.black26
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

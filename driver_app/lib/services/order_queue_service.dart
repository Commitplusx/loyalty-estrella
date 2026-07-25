import 'dart:collection';
import 'package:flutter/material.dart';
import '../widgets/incoming_order_sheet.dart';

/// Servicio Singleton para gestionar la cola de pedidos entrantes.
/// Evita que múltiples BottomSheets (pings de QStash) se empalmen en pantalla.
class OrderQueueService {
  static final OrderQueueService _instance = OrderQueueService._internal();
  
  factory OrderQueueService() {
    return _instance;
  }
  
  OrderQueueService._internal();

  final List<Map<String, dynamic>> _queue = [];
  bool _isShowing = false;
  String? _currentShowingPedidoId;

  /// Añade un nuevo pedido a la cola y evalúa si puede mostrarse inmediatamente
  void enqueue(BuildContext context, Map<String, dynamic> payload) {
    final String pedidoId = payload['pedido_id'] ?? '';

    // Evitar duplicados (Ej: llega por FCM y Websocket al mismo tiempo)
    if (pedidoId.isNotEmpty) {
      if (_currentShowingPedidoId == pedidoId) {
        debugPrint('⚠️ [OrderQueueService] Pedido $pedidoId ya se está mostrando en pantalla. Ignorando duplicado.');
        return;
      }
      if (_queue.any((p) => p['pedido_id'] == pedidoId)) {
        debugPrint('⚠️ [OrderQueueService] Pedido $pedidoId ya está en cola. Ignorando duplicado.');
        return;
      }
    }

    debugPrint('================================================================');
    debugPrint('🚨 [OrderQueueService] 📥 NUEVO VIAJE RECIBIDO (PAYLOAD BRUTO)');
    debugPrint('================================================================');
    debugPrint('ID Pedido: ${payload['pedido_id']}');
    debugPrint('Payload Completo: $payload');
    
    // Agregamos timestamp local para el TTL (Time To Live)
    payload['_enqueued_at'] = DateTime.now();

    final esApilado = payload['viaje_apilado'] == true || payload['viaje_apilado'] == 'true';
    debugPrint('🔎 [OrderQueueService] ¿Es Viaje Apilado?: $esApilado');
    
    if (esApilado) {
      // Prioridad máxima: lo mandamos al frente de la cola
      debugPrint('🚀🚀🚀 [OrderQueueService] VIAJE APILADO (BATCH) DETECTADO 🚀🚀🚀');
      debugPrint('👉 Este viaje saltará la cola y se mostrará de inmediato al repartidor.');
      _queue.insert(0, payload);
    } else {
      // Pedido normal: al final de la cola
      debugPrint('📦 [OrderQueueService] Viaje normal detectado. Añadido al final de la cola.');
      _queue.add(payload);
    }
    
    debugPrint('📊 [OrderQueueService] Total de pedidos en cola actualmente: ${_queue.length}');
    debugPrint('================================================================\n');
    _processQueue(context);
  }

  /// Procesa la cola secuencialmente
  Future<void> _processQueue(BuildContext context) async {
    // Si ya estamos mostrando un modal o no hay nada en la cola, abortar
    if (_isShowing || _queue.isEmpty) {
      return;
    }

    _isShowing = true;
    final nextPayload = _queue.removeAt(0);
    _currentShowingPedidoId = nextPayload['pedido_id'];
    
    // Verificamos el TTL (Time To Live) de 15 segundos
    final enqueuedAt = nextPayload['_enqueued_at'] as DateTime;
    if (DateTime.now().difference(enqueuedAt).inSeconds > 15) {
      debugPrint('🗑️ [OrderQueueService] Pedido expirado (TTL > 15s). Descartando pedido fantasma: ${nextPayload['pedido_id']}');
      _isShowing = false;
      // Saltamos directamente al siguiente sin mostrar nada
      _processQueue(context);
      return;
    }

    debugPrint('🚀 [OrderQueueService] Mostrando BottomSheet para: ${nextPayload['pedido_id']}');

    try {
      if (context.mounted) {
        // La ejecución se pausará aquí hasta que el BottomSheet se cierre 
        await IncomingOrderSheet.show(context, nextPayload);
      }
    } finally {
      // Liberamos el candado de la UI
      _isShowing = false;
      _currentShowingPedidoId = null;
      debugPrint('🔓 [OrderQueueService] BottomSheet cerrado. Pedidos restantes en cola: ${_queue.length}');
      
      // Si hay más pedidos esperando, procesamos el siguiente
      if (context.mounted && _queue.isNotEmpty) {
        await Future.delayed(const Duration(milliseconds: 300));
        _processQueue(context);
      }
    }
  }
  
  /// Limpia la cola en caso de desconexión o reseteo
  void clearQueue() {
    _queue.clear();
    _currentShowingPedidoId = null;
    debugPrint('🧹 [OrderQueueService] Cola limpiada manualmente.');
  }
}

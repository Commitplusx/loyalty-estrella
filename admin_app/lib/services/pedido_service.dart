// lib/services/pedido_service.dart

import 'dart:math';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/foundation.dart';
import '../core/supabase_config.dart';
import '../models/pedido_model.dart';

final pedidoServiceProvider = Provider((ref) => PedidoService());

class PedidoService {
  /// Obtiene todos los pedidos activos (no entregados)
  Future<List<PedidoModel>> getPedidosActivos() async {
    final data = await supabase
        .from('pedidos')
        .select()
        .neq('estado', 'entregado')
        .order('created_at', ascending: false);
    return (data as List).map((m) => PedidoModel.fromMap(m)).toList();
  }

  /// Obtiene todos los pedidos (historial)
  Future<List<PedidoModel>> getTodosPedidos() async {
    final data = await supabase
        .from('pedidos')
        .select()
        .order('created_at', ascending: false)
        .limit(50);
    return (data as List).map((m) => PedidoModel.fromMap(m)).toList();
  }

  /// Obtiene un pedido por ID
  Future<PedidoModel?> getPedido(String id) async {
    try {
      final data = await supabase
          .from('pedidos')
          .select()
          .eq('id', id)
          .single();
      return PedidoModel.fromMap(data);
    } catch (e) {
      debugPrint('Error getPedido: $e');
      return null;
    }
  }

  /// Obtiene pedidos del repartidor actual (para la vista del repartidor)
  Future<List<PedidoModel>> getMisPedidos(String repartidorUserId) async {
    final data = await supabase
        .from('pedidos')
        .select()
        .eq('repartidor_id', repartidorUserId)
        .neq('estado', 'entregado')
        .order('created_at', ascending: false);
    return (data as List).map((m) => PedidoModel.fromMap(m)).toList();
  }

  /// Crea un pedido y envía el WhatsApp al repartidor
  Future<({bool ok, String? error, String? pedidoId})> crearPedido({
    required String clienteTel,
    String? clienteNombre,
    String? restaurante,
    required String repartidorId,
    required String descripcion,
    String? direccion,
  }) async {
    try {
      final inserted = await supabase
          .from('pedidos')
          .insert({
            'cliente_tel': clienteTel,
            if (clienteNombre != null && clienteNombre.isNotEmpty) 'cliente_nombre': clienteNombre,
            if (restaurante != null && restaurante.isNotEmpty) 'restaurante': restaurante,
            'repartidor_id': repartidorId,
            'descripcion': descripcion,
            if (direccion != null && direccion.isNotEmpty) 'direccion': direccion,
            'estado': 'asignado',
          })
          .select('id')
          .single();

      final pedidoId = inserted['id'] as String;
      await _notificar(pedidoId: pedidoId, tipo: 'asignacion');
      return (ok: true, error: null, pedidoId: pedidoId);
    } catch (e) {
      debugPrint('Error crearPedido: $e');
      return (ok: false, error: e.toString(), pedidoId: null);
    }
  }

  /// Actualiza el estado y envía WhatsApp al cliente, con protección Anti-Fraude si es "entregado"
  Future<bool> actualizarEstado(String pedidoId, String nuevoEstado) async {
    int attempts = 0;
    bool success = false;
    Position? currentPos;

    // 1. Si es entregado, intentamos obtener GPS para la Geocerca
    if (nuevoEstado == 'entregado') {
      try {
        currentPos = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
          timeLimit: const Duration(seconds: 5),
        );
      } catch (e) {
        debugPrint('Aviso: No se pudo obtener GPS rápido para Geocerca.');
      }
    }

    // 2. Retry Logic Exponencial (Inmune a intermitencias de 4G)
    while (attempts < 3 && !success) {
      try {
        attempts++;
        await supabase
            .from('pedidos')
            .update({
              'estado': nuevoEstado,
              if (nuevoEstado == 'entregado' && currentPos != null) 'lat_entrega': currentPos.latitude,
              if (nuevoEstado == 'entregado' && currentPos != null) 'lng_entrega': currentPos.longitude,
            })
            .eq('id', pedidoId);

        success = true;
      } catch (e) {
        // Validación Anti-Fraude de Supabase (SQL RAISE EXCEPTION)
        if (e is PostgrestException && e.message.contains('FRAUDE DE GEOCERCA')) {
          debugPrint('🚨 RECHAZADO por DB: Repartidor lejos del destino.');
          rethrow; // Rompe el ciclo y le lanza el error a la UI
        }

        debugPrint('⚠️ Fallo actualizando estado (Intento $attempts): $e');
        if (attempts >= 3) break;
        
        // Exponential Backoff (2s, 4s...)
        await Future.delayed(Duration(seconds: pow(2, attempts).toInt()));
      }
    }

    if (success) {
      // 3. Notificación Fire & Forget
      _notificar(pedidoId: pedidoId, tipo: nuevoEstado);
      return true;
    } else {
      debugPrint('❌ Fracaso tras 3 intentos. Guardando en Offline Queue (Pendiente implementar SQLite/Hive).');
      return false;
    }
  }

  /// Llama a la Supabase Edge Function para enviar el WhatsApp
  Future<void> _notificar({
    required String pedidoId,
    required String tipo,
  }) async {
    try {
      await supabase.functions.invoke(
        'notificar-whatsapp',
        body: {'pedido_id': pedidoId, 'tipo': tipo},
      );
    } catch (e) {
      // No lanzar error si el WA falla — el pedido ya fue guardado
      debugPrint('⚠️ WhatsApp notification failed: $e');
    }
  }
}

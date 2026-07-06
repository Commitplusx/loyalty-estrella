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
  /// Obtiene todos los pedidos activos (no entregados). Filtra por repartidor si no es admin.
  Future<List<PedidoModel>> getPedidosActivos({String? repartidorUserId}) async {
    var query = supabase
        .from('pedidos')
        .select()
        .not('estado', 'in', '("entregado","cancelado")');

    if (repartidorUserId != null) {
      query = query.eq('repartidor_id', repartidorUserId);
    }
    
    final data = await query.order('created_at', ascending: false);
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
          
      if (data['restaurante_id'] != null || data['restaurante'] != null) {
        try {
          Map<String, dynamic>? restData;
          
          // Intento 1: Por ID exacto (más seguro)
          if (data['restaurante_id'] != null) {
            restData = await supabase
                .from('restaurantes')
                .select('lat, lng, foto_fachada_url')
                .eq('id', data['restaurante_id'])
                .maybeSingle();
          }
          
          // Intento 2: Búsqueda flexible por nombre si falló por ID
          if (restData == null && data['restaurante'] != null) {
            String nombreLimpio = data['restaurante'].toString().trim();
            
            // Búsqueda en DB con ilike
            restData = await supabase
                .from('restaurantes')
                .select('lat, lng, foto_fachada_url')
                .ilike('nombre_comercial', '%$nombreLimpio%')
                .maybeSingle();

            // Intento 3: Búsqueda ultra-flexible en memoria (ignora acentos y mayúsculas)
            if (restData == null) {
              final todos = await supabase.from('restaurantes').select('nombre_comercial, lat, lng, foto_fachada_url');
              
              String normalizar(String s) {
                return s.toLowerCase()
                    .replaceAll(RegExp(r'[áäâà]'), 'a')
                    .replaceAll(RegExp(r'[éëêè]'), 'e')
                    .replaceAll(RegExp(r'[íïîì]'), 'i')
                    .replaceAll(RegExp(r'[óöôò]'), 'o')
                    .replaceAll(RegExp(r'[úüûù]'), 'u')
                    .replaceAll(' ', '');
              }

              String nReq = normalizar(nombreLimpio);
              
              for (var r in (todos as List)) {
                String nDB = normalizar((r['nombre_comercial'] ?? '').toString());
                if (nDB.isNotEmpty && (nDB.contains(nReq) || nReq.contains(nDB))) {
                  restData = r as Map<String, dynamic>;
                  break;
                }
              }
            }
          }
          
          if (restData != null) {
            data['restaurantes'] = restData;
          }
        } catch (_) {}
      }
      
      return PedidoModel.fromMap(data);
    } catch (e) {
      debugPrint('Error getPedido: $e');
      throw Exception('Error al obtener pedido: $e');
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
      // 1. Registro Silencioso: Asegurar que el cliente exista en la BD para fotos de fachada
      if (clienteTel.length == 10) {
        try {
          final loyaltyUrl = 'https://www.app-estrella.shop/loyalty/$clienteTel';
          await supabase.from('clientes').upsert({
            'telefono': clienteTel,
            'nombre': (clienteNombre != null && clienteNombre.isNotEmpty) ? clienteNombre : 'Cliente Express',
            'direccion': (direccion != null && direccion.isNotEmpty) ? direccion : null,
            'puntos': 0,
            'acepta_terminos': false,
            'qr_code': loyaltyUrl
          }, onConflict: 'telefono', ignoreDuplicates: true);
        } catch (e) {
          debugPrint('Error en registro silencioso: $e');
        }
      }

      // 2. Insertar Pedido
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
  /// Actualiza el estado y envía WhatsApp al cliente, con protección Anti-Fraude si es "entregado"
  Future<String?> actualizarEstado(String pedidoId, String nuevoEstado, {bool? pagoPendienteRestaurante}) async {
    int attempts = 0;
    bool success = false;
    String? lastError;
    Position? currentPos;

    // 1. Si es entregado, intentamos obtener GPS para la Geocerca
    if (nuevoEstado == 'entregado') {
      try {
        currentPos = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
          timeLimit: const Duration(seconds: 5),
        ).timeout(const Duration(seconds: 6));
      } catch (e) {
        debugPrint('Aviso: No se pudo obtener GPS rapido para Geocerca.');
      }
    }

        // 2. Retry Logic Exponencial (Inmune a intermitencias de 4G)
    while (attempts < 3 && !success) {
      try {
        attempts++;
        final user = supabase.auth.currentUser;
        
        final priority = {
          'pagado': -1, 'pendiente_pago': 0, 'pendiente': 1, 'asignado': 2, 'aceptado': 3, 'en_cocina': 4, 
          'listo_para_recoger': 5, 'recibido': 6, 'en_camino': 7, 'entregado': 8, 'cancelado': 9, 'rechazado': 10
        };
        
        final currentData = await supabase.from('pedidos').select('estado').eq('id', pedidoId).single();
        final currentState = currentData['estado'] as String;
        final currentPriority = priority[currentState] ?? -2;
        final newPriority = priority[nuevoEstado] ?? -2;

        if (newPriority < currentPriority) {
          debugPrint('AVISO: Intento de regresar estado de $currentState a $nuevoEstado bloqueado.');
          // Si el repartidor intentaba aceptar ('asignado') un pedido que ya está en cocina, SOLO le asignamos su ID sin cambiar estado
          if (nuevoEstado == 'asignado' && user != null) {
            await supabase.from('pedidos').update({'repartidor_id': user.id}).eq('id', pedidoId);
          }
          success = true;
          break;
        }

        await supabase
            .from('pedidos')
            .update({
              'estado': nuevoEstado,
              if (nuevoEstado == 'entregado' && currentPos != null) 'lat_entrega': currentPos.latitude,
              if (nuevoEstado == 'entregado' && currentPos != null) 'lng_entrega': currentPos.longitude,
              if ((nuevoEstado == 'asignado' || nuevoEstado == 'aceptado') && user != null) 'repartidor_id': user.id,
              if (pagoPendienteRestaurante != null) 'pago_pendiente_restaurante': pagoPendienteRestaurante,
            })
            .eq('id', pedidoId)
            .timeout(const Duration(seconds: 15));

        success = true;
      } catch (e) {
        // Validación Anti-Fraude de Supabase (SQL RAISE EXCEPTION)
        if (e is PostgrestException && e.message.contains('FRAUDE DE GEOCERCA')) {
          debugPrint('RECHAZADO por DB: Repartidor lejos del destino.');
          rethrow; // Rompe el ciclo y le lanza el error a la UI
        }

        lastError = e.toString();
        debugPrint('Fallo actualizando estado (Intento $attempts): $e');
        if (attempts >= 3) break;
        
        // Exponential Backoff (2s, 4s...)
        await Future.delayed(Duration(seconds: pow(2, attempts).toInt()));
      }
    }

    if (success) {
      // Registrar log local
      try {
        await supabase.from('pedido_logs').insert({
          'pedido_id': pedidoId,
          'accion': 'ESTADO_CAMBIADO',
          'detalles': 'Estado cambiado a $nuevoEstado',
          'actor_id': supabase.auth.currentUser?.id,
        });
      } catch (_) {}

      // 3. Notificación Fire & Forget
      _notificar(pedidoId: pedidoId, tipo: nuevoEstado);
      return null;
    } else {
      debugPrint('Fracaso tras 3 intentos. Error final: $lastError');
      return lastError ?? 'Error desconocido al conectar con la base de datos.';
    }
  }

  /// Reasigna un pedido a otro repartidor
  Future<String?> reasignarPedido(String pedidoId, String nuevoRepartidorId) async {
    try {
      await supabase
          .from('pedidos')
          .update({
            'repartidor_id': nuevoRepartidorId,
            'estado': 'pendiente',
          })
          .eq('id', pedidoId);

      try {
        await supabase.from('pedido_logs').insert({
          'pedido_id': pedidoId,
          'accion': 'REASIGNADO',
          'detalles': 'Pedido reasignado al repartidor $nuevoRepartidorId',
          'actor_id': supabase.auth.currentUser?.id,
        });
      } catch (_) {}

      // Ping instantáneo al repartidor
      try {
        await supabase.channel('repartidores_ping').sendBroadcastMessage(
          event: 'order_offered',
          payload: {'target_driver_id': nuevoRepartidorId, 'pedido_id': pedidoId},
        );
      } catch (e) {
        debugPrint('Error enviando ping de reasignación: $e');
      }

      _notificar(pedidoId: pedidoId, tipo: 'asignacion');
      return null; // Null significa éxito sin errores
    } catch (e) {
      debugPrint('Fallo reasignando pedido: $e');
      return e.toString();
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
      debugPrint('WhatsApp notification failed: $e');
    }
  }

  // ── Pedido de Prueba ──────────────────────────────────────────────────
  /// Inserta un pedido de prueba directamente en la BD sin enviar WhatsApp.
  /// Útil para probar el flujo completo sin molestar a nadie.
  Future<String?> crearPedidoPrueba({required String repartidorId}) async {
    try {
      final inserted = await supabase
          .from('pedidos')
          .insert({
            'cliente_tel': '9999999999',
            'cliente_nombre': '🧪 Cliente Prueba',
            'restaurante': '🧪 Restaurante Test',
            'repartidor_id': repartidorId,
            'descripcion': 'PEDIDO DE PRUEBA — No es un pedido real. Puedes eliminarlo cuando termines.',
            'direccion': 'Av. Prueba #123, Comitán',
            'estado': 'asignado',
            'metodo_pago': 'efectivo',
            'total': 150.0,
            'precio_entrega': 30.0,
            'tipo_pedido': 'mandadito',
          })
          .select('id')
          .single();
      return inserted['id'] as String?;
    } catch (e) {
      debugPrint('Error crearPedidoPrueba: $e');
      return null;
    }
  }
}

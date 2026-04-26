import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/supabase_config.dart';
import 'sync_service.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

final repartidorServiceProvider = Provider((ref) => RepartidorService());

final restaurantesProvider = FutureProvider.autoDispose((ref) {
  return ref.read(repartidorServiceProvider).getRestaurantes();
});

class RepartidorService {
  // ── Restaurantes ──────────────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> getRestaurantes() async {
    final data = await supabase.from('restaurantes').select().order('nombre');
    return List<Map<String, dynamic>>.from(data);
  }

  Future<bool> addRestaurante({
    required String nombre,
    required String telefono,
    String? direccion,
    String? mapsUrl,
    double? lat,
    double? lng,
    String? etiquetaZona,
  }) async {
    try {
      final user = supabase.auth.currentUser;
      if (user == null) return false;
      await supabase.from('restaurantes').insert({
        'admin_id': user.id,
        'nombre': nombre.trim().toUpperCase(),
        'telefono': telefono.trim(),
        'activo': true,
        'direccion': direccion?.trim(),
        'maps_url': mapsUrl?.trim(),
        'lat': lat,
        'lng': lng,
        'etiqueta_zona': etiquetaZona ?? 'verde',
      });
      return true;
    } catch (e) {
      debugPrint('Error adding restaurante: $e');
      return false;
    }
  }

  Future<bool> updateRestaurante({
    required String id,
    required String nombre,
    required String telefono,
    required bool activo,
    String? direccion,
    String? mapsUrl,
    double? lat,
    double? lng,
    String? etiquetaZona,
  }) async {
    try {
      await supabase.from('restaurantes').update({
        'nombre': nombre.trim().toUpperCase(),
        'telefono': telefono.trim(),
        'activo': activo,
        'direccion': direccion?.trim(),
        'maps_url': mapsUrl?.trim(),
        'lat': lat,
        'lng': lng,
        'etiqueta_zona': etiquetaZona ?? 'verde',
      }).eq('id', id);
      return true;
    } catch (e) {
      debugPrint('Error updating restaurante: $e');
      return false;
    }
  }

  // ── Repartidores ──────────────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> getRepartidores() async {
    final data = await supabase
        .from('repartidores')
        .select('*, motos(placa, alias)')
        .eq('activo', true)
        .order('nombre');
    return List<Map<String, dynamic>>.from(data);
  }

  Future<String?> getRepartidorIdByUserId(String userId) async {
    final data = await supabase
        .from('repartidores')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
        
    if (data != null) return data['id']?.toString();

    // Auto-link if not found: Check if email prefix matches a 'telefono' in unlinked repartidores
    final user = supabase.auth.currentUser;
    if (user != null && user.email != null) {
      final emailPrefix = user.email!.split('@').first;
      
      // Fetch all unlinked to do local normalization check if needed
      final unlinked = await supabase
          .from('repartidores')
          .select('id, telefono')
          .filter('user_id', 'is', null);

      for (var row in unlinked) {
        final dbPhone = row['telefono']?.toString().replaceAll(RegExp(r'[^0-9]'), '') ?? '';
        final loginPhone = emailPrefix.replaceAll(RegExp(r'[^0-9]'), '');
        
        // Exact match or suffix match (to handle +52 etc)
        if (dbPhone == loginPhone || (dbPhone.length >= 10 && loginPhone.endsWith(dbPhone))) {
          await supabase.from('repartidores').update({'user_id': userId}).eq('id', row['id']);
          return row['id'].toString();
        }
      }
    }
    
    return null;
  }

  Future<String?> addRepartidor(String nombre, String? telefono, String? alias) async {
    try {
      await supabase.from('repartidores').insert({
        'nombre': nombre,
        'telefono': telefono,
        'alias': alias,
        'activo': true,
      });
      return null;
    } catch (e) {
      return e.toString();
    }
  }

  Future<bool> toggleActivo(String id, bool activo) async {
    try {
      await supabase.from('repartidores').update({'activo': activo}).eq('id', id);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> assignMoto(String repartidorId, String? motoId) async {
    try {
      await supabase.from('repartidores').update({'moto_id': motoId}).eq('id', repartidorId);
      return true;
    } catch (e) {
      debugPrint('Error assignMoto: $e');
      return false;
    }
  }

  // ── Servicios ─────────────────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> getServicios({String? repartidorId, DateTime? fecha}) async {
    final fechaStr = (fecha ?? DateTime.now()).toIso8601String().split('T')[0];
    
    // 1. Fetch from servicios_repartidor
    var queryServicios = supabase
        .from('servicios_repartidor')
        .select('*, repartidores(nombre, alias), clientes(nombre), restaurantes(nombre)')
        .eq('turno_fecha', fechaStr)
        .eq('liquidado', false);
    if (repartidorId != null) queryServicios = queryServicios.eq('repartidor_id', repartidorId);
    
    final dataServicios = await queryServicios;
    final List<Map<String, dynamic>> combined = List<Map<String, dynamic>>.from(dataServicios);

    // 2. Fetch from pedidos (WhatsApp / Bot)
    // Map pedidos to match servicios_repartidor structure
    var queryPedidos = supabase
        .from('pedidos')
        .select('*, repartidores:repartidor_id(nombre, alias)')
        .filter('created_at', 'gte', '${fechaStr}T00:00:00')
        .filter('created_at', 'lte', '${fechaStr}T23:59:59')
        .eq('estado', 'entregado'); // Only delivered orders count for cashout
    
    if (repartidorId != null) {
      // Find the user_id if we only have repartidorId
      final rep = await supabase.from('repartidores').select('user_id').eq('id', repartidorId).maybeSingle();
      if (rep != null && rep['user_id'] != null) {
        queryPedidos = queryPedidos.eq('repartidor_id', rep['user_id']);
      }
    }

    final dataPedidos = await queryPedidos;
    for (var p in dataPedidos) {
      // BUG FIX #3: Leer precio real del pedido en lugar de hardcodear $45
      double montoPedido = 45.0; // Fallback si no hay precio
      if (p['precio'] != null) {
        final precioStr = p['precio'].toString().replaceAll(RegExp(r'[^0-9.]'), '');
        montoPedido = double.tryParse(precioStr) ?? 45.0;
      }
      combined.add({
        'id': p['id'],
        'repartidor_id': repartidorId,
        'descripcion': p['descripcion'] ?? 'Pedido Bot',
        'monto': montoPedido,
        'cliente_id': null,
        'restaurante_id': null,
        'tipo_servicio': 'cliente',
        'notas': p['direccion'],
        'creado_en': p['created_at'],
        'turno_fecha': fechaStr,
        'estado': 'completado',
        'es_bot': true,
        'repartidores': p['repartidores'],
      });
    }

    // ── Local Offline Queue ──
    try {
      final prefs = await SharedPreferences.getInstance();
      final queue = prefs.getStringList('offline_servicios') ?? [];
      for (var item in queue) {
        final payload = jsonDecode(item) as Map<String, dynamic>;
        if (repartidorId == null || payload['repartidor_id'] == repartidorId) {
          payload['es_offline'] = true;
          combined.insert(0, payload);
        }
      }
    } catch (_) {}

    combined.sort((a, b) => b['creado_en'].toString().compareTo(a['creado_en'].toString()));
    return combined;
  }

  /// Obtiene el historial completo de un repartidor (últimos 30 días o todos).
  Future<List<Map<String, dynamic>>> getHistorialServicios(String repartidorId) async {
    try {
      // 1. Fetch manual services
      final dataServicios = await supabase
          .from('servicios_repartidor')
          .select('*, clientes(nombre), restaurantes(nombre)')
          .eq('repartidor_id', repartidorId)
          .order('creado_en', ascending: false)
          .limit(100);
      
      final List<Map<String, dynamic>> combined = List<Map<String, dynamic>>.from(dataServicios);

      // 2. Fetch bot orders
      final rep = await supabase.from('repartidores').select('user_id').eq('id', repartidorId).maybeSingle();
      if (rep != null && rep['user_id'] != null) {
        final dataPedidos = await supabase
            .from('pedidos')
            .select('*')
            .eq('repartidor_id', rep['user_id'])
            .eq('estado', 'entregado')
            .order('created_at', ascending: false)
            .limit(100);
            
        for (var p in dataPedidos) {
          double montoPedido = 45.0;
          if (p['precio'] != null) {
            final precioStr = p['precio'].toString().replaceAll(RegExp(r'[^0-9.]'), '');
            montoPedido = double.tryParse(precioStr) ?? 45.0;
          }
          combined.add({
            'id': p['id'],
            'repartidor_id': repartidorId,
            'descripcion': p['descripcion'] ?? 'Pedido Bot',
            'monto': montoPedido,
            'cliente_id': null,
            'restaurante_id': null,
            'tipo_servicio': 'cliente',
            'notas': p['direccion'],
            'creado_en': p['created_at'],
            'turno_fecha': p['created_at'].toString().split('T')[0],
            'estado': 'completado',
            'es_bot': true,
          });
        }
      }

      combined.sort((a, b) => b['creado_en'].toString().compareTo(a['creado_en'].toString()));
      return combined;
    } catch (e) {
      debugPrint('Error getHistorialServicios: $e');
      return [];
    }
  }
  Future<bool> addServicio({
    required String repartidorId,
    required String descripcion,
    required double monto,
    String? clienteId,
    String? notas,
    String estado = 'pendiente',
    bool esAdmin = false,
    String? comprobanteUrl,
    String? restauranteId,
    String tipoServicio = 'cliente',
  }) async {
    try {
      final user = supabase.auth.currentUser;
      final payload = {
        'repartidor_id': repartidorId,
        'descripcion': descripcion,
        'monto': monto,
        'cliente_id': clienteId,
        'restaurante_id': restauranteId,
        'tipo_servicio': tipoServicio,
        'notas': notas,
        'asignado_por': esAdmin ? user?.id : null,
        'creado_por': !esAdmin ? user?.id : null,
        'turno_fecha': DateTime.now().toIso8601String().split('T')[0],
        'estado': 'completado',
        'comprobante_url': comprobanteUrl,
      };

      final connectivityResult = await Connectivity().checkConnectivity();
      if (connectivityResult.contains(ConnectivityResult.none) || connectivityResult.isEmpty) {
        await SyncService().queueServicio(payload);
        return true;
      }

      await supabase.from('servicios_repartidor').insert(payload);
      return true;
    } catch (e) {
      debugPrint('Error en addServicio: $e');
      return false;
    }
  }

  Future<bool> updateEstadoServicio(String id, String estado) async {
    try {
      await supabase.from('servicios_repartidor').update({'estado': estado}).eq('id', id);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> cerrarTurno(String repartidorId, String? fecha) async {
    try {
      final connectivityResult = await Connectivity().checkConnectivity();
      if (connectivityResult.contains(ConnectivityResult.none) || connectivityResult.isEmpty) {
        await SyncService().queueLiquidacion(repartidorId);
        return true;
      }

      await supabase.rpc('liquidar_turno_repartidor', params: {
        'p_repartidor_id': repartidorId
      });
      return true;
    } catch (e) {
      debugPrint('Error en cerrarTurno: $e');
      return false;
    }
  }

  Future<List<Map<String, dynamic>>> getResumenSemanal() async {
    try {
      // Usamos la vista que creamos
      final data = await supabase.from('resumen_semanal_negocio').select('*').limit(4);
      return List<Map<String, dynamic>>.from(data);
    } catch (e) {
      debugPrint('Error getResumenSemanal: $e');
      return [];
    }
  }

  // ── Cuadre / Corte ────────────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> getCuadre({DateTime? fecha}) async {
    final fechaStr = (fecha ?? DateTime.now()).toIso8601String().split('T')[0];
    final data = await supabase
        .from('cuadre_repartidores')
        .select('*')
        .eq('turno_fecha', fechaStr)
        .order('repartidor');
    return List<Map<String, dynamic>>.from(data);
  }

  /// Devuelve el cuadre del DÍA ACTUAL solo para un repartidor específico.
  Future<List<Map<String, dynamic>>> getCuadrePorRepartidor(String repartidorId, {DateTime? fecha}) async {
    final fechaStr = (fecha ?? DateTime.now()).toIso8601String().split('T')[0];
    final data = await supabase
        .from('cuadre_repartidores')
        .select('*')
        .eq('turno_fecha', fechaStr)
        .eq('repartidor_id', repartidorId)
        .order('repartidor');
    return List<Map<String, dynamic>>.from(data);
  }

  // ── Meta de Envíos ────────────────────────────────────────────────────
  /// Devuelve todos los repartidores con envios_hoy y meta_envios del día actual.
  Future<List<Map<String, dynamic>>> getMetaEnvios() async {
    final data = await supabase.from('envios_hoy_por_repartidor').select('*');
    return List<Map<String, dynamic>>.from(data);
  }

  /// Guarda la meta diaria de un repartidor (solo Admin).
  Future<bool> setMetaEnvios(String repartidorId, int meta) async {
    try {
      await supabase.rpc('set_meta_envios', params: {
        'p_repartidor_id': repartidorId,
        'p_meta': meta,
      });
      return true;
    } catch (e) {
      debugPrint('Error setMetaEnvios: $e');
      return false;
    }
  }

  // ── Leaderboard ───────────────────────────────────────────────────────
  /// Obtiene el ranking de repartidores basado en servicios completados.
  Future<List<Map<String, dynamic>>> getLeaderboard() async {
    try {
      final data = await supabase.from('leaderboard_repartidores').select('*');
      return List<Map<String, dynamic>>.from(data);
    } catch (e) {
      debugPrint('Error getLeaderboard: $e');
      return [];
    }
  }

  // ── Storage ───────────────────────────────────────────────────────────
  Future<String?> uploadComprobante(File file) async {
    try {
      final fileName = '${DateTime.now().millisecondsSinceEpoch}.jpg';
      final path = 'comprobantes/$fileName';
      
      await supabase.storage.from('admin_assets').upload(path, file);
      
      return supabase.storage.from('admin_assets').getPublicUrl(path);
    } catch (e) {
      debugPrint('Error uploading image: $e');
      return null;
    }
  }
}



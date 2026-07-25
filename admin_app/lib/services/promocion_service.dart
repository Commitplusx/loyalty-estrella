import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/supabase_config.dart';

final promocionServiceProvider = Provider((ref) => PromocionService());

/// Provider para listar TODOS los cupones de plataforma — para el Admin
final promocionesAdminProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  return ref.read(promocionServiceProvider).getCuponesAdmin();
});

/// Provider para obtener el cupón automático activo — para el flujo del Cliente
final promoActivaAutoProvider = FutureProvider.autoDispose<Map<String, dynamic>?>((ref) {
  return ref.read(promocionServiceProvider).getCuponActivoAutomatico();
});

class PromocionService {
  static const _tabla = 'cupones_plataforma';

  // ── ADMIN: Listar todos los cupones de plataforma ──
  Future<List<Map<String, dynamic>>> getCuponesAdmin() async {
    try {
      final res = await supabase
          .from(_tabla)
          .select()
          .order('created_at', ascending: false);
      return List<Map<String, dynamic>>.from(res);
    } catch (e) {
      debugPrint('❌ Error getCuponesAdmin: $e');
      return [];
    }
  }

  // ── ADMIN: Crear nuevo cupón de plataforma ──
  Future<String?> crearCupon({
    required String descripcion,
    required String tipoDescuento, // envio_fijo | porcentaje | monto_fijo
    required double valor,
    required int limiteUsos,       // 0 = ilimitado
    String? codigo,                // NULL = automático
    DateTime? fechaFin,
  }) async {
    try {
      final payload = <String, dynamic>{
        'descripcion': descripcion.trim(),
        'tipo': tipoDescuento,
        'valor': valor,
        'uso_maximo': limiteUsos > 0 ? limiteUsos : null,
        'usos_actuales': 0,
        'activo': true,
      };

      if (codigo != null && codigo.trim().isNotEmpty) {
        payload['codigo'] = codigo.trim().toUpperCase();
      }
      if (fechaFin != null) {
        payload['fecha_fin'] = fechaFin.toIso8601String().split('T').first;
      }

      await supabase.from(_tabla).insert(payload);
      return null;
    } catch (e) {
      debugPrint('❌ Error crearCupon: $e');
      if (e.toString().contains('unique') || e.toString().contains('duplicate')) {
        return 'Ya existe un cupón con ese código';
      }
      return e.toString();
    }
  }

  // ── ADMIN: Encender / Apagar ──
  Future<String?> toggleCupon(String id, bool nuevaActivo) async {
    try {
      await supabase.from(_tabla).update({'activo': nuevaActivo}).eq('id', id);
      return null;
    } catch (e) {
      debugPrint('❌ Error toggleCupon: $e');
      return e.toString();
    }
  }

  // ── ADMIN: Eliminar ──
  Future<String?> eliminarCupon(String id) async {
    try {
      await supabase.from(_tabla).delete().eq('id', id);
      return null;
    } catch (e) {
      debugPrint('❌ Error eliminarCupon: $e');
      return e.toString();
    }
  }

  // ── CLIENTE: Obtener cupón AUTOMÁTICO activo (sin código) ──
  Future<Map<String, dynamic>?> getCuponActivoAutomatico() async {
    try {
      final res = await supabase
          .from(_tabla)
          .select()
          .eq('activo', true)
          .isFilter('codigo', null)
          .order('created_at', ascending: false)
          .limit(1)
          .maybeSingle();

      if (res == null) return null;

      // Validar usos
      final int? usoMaximo = res['uso_maximo'];
      final int usosActuales = res['usos_actuales'] ?? 0;
      if (usoMaximo != null && usosActuales >= usoMaximo) return null;

      // Validar expiración
      if (res['fecha_fin'] != null) {
        final fechaFin = DateTime.tryParse('${res['fecha_fin']}T23:59:59');
        if (fechaFin != null && DateTime.now().isAfter(fechaFin)) return null;
      }

      return res;
    } catch (e) {
      debugPrint('❌ Error getCuponActivoAutomatico: $e');
      return null;
    }
  }

  // ── CLIENTE: Validar un código de cupón de plataforma ──
  Future<Map<String, dynamic>?> validarCodigo(String codigo) async {
    try {
      final res = await supabase
          .from(_tabla)
          .select()
          .eq('activo', true)
          .eq('codigo', codigo.trim().toUpperCase())
          .limit(1)
          .maybeSingle();

      if (res == null) return null;

      final int? usoMaximo = res['uso_maximo'];
      final int usosActuales = res['usos_actuales'] ?? 0;
      if (usoMaximo != null && usosActuales >= usoMaximo) return null;

      if (res['fecha_fin'] != null) {
        final fechaFin = DateTime.tryParse('${res['fecha_fin']}T23:59:59');
        if (fechaFin != null && DateTime.now().isAfter(fechaFin)) return null;
      }

      return res;
    } catch (e) {
      debugPrint('❌ Error validarCodigo: $e');
      return null;
    }
  }

  // ── SISTEMA: Registrar uso (atómico, a prueba de race conditions) ──
  Future<bool> registrarUso(String cuponId) async {
    try {
      await supabase.rpc('usar_cupon_plataforma', params: {'p_cupon_id': cuponId});
      return true;
    } catch (e) {
      debugPrint('❌ Error registrarUso: $e');
      return false;
    }
  }

  // ── ADMIN: Inversión total en descuentos de plataforma ──
  Future<double> getInversionCupones({DateTime? desde}) async {
    try {
      var query = supabase
          .from('pedidos')
          .select('descuento_plataforma');

      if (desde != null) {
        query = query.gte('created_at', desde.toIso8601String());
      }

      final res = await query;
      double total = 0;
      for (var row in res) {
        total += ((row['descuento_plataforma'] ?? 0) as num).toDouble();
      }
      return total;
    } catch (e) {
      debugPrint('❌ Error getInversionCupones: $e');
      return 0;
    }
  }
}

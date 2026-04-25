import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/supabase_config.dart';
import 'sync_service.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

final gastoServiceProvider = Provider((ref) => GastoService());

/// Provider único y canónico para la lista de motos.
/// Úsalo en cualquier pantalla importando gasto_service.dart.
final motosProvider = FutureProvider.autoDispose((ref) {
  return ref.read(gastoServiceProvider).getMotos();
});

class GastoService {
  Future<List<Map<String, dynamic>>> getGastos({String? repartidorId, DateTime? startDate, DateTime? endDate}) async {
    dynamic query = supabase
        .from('gastos_motos')
        .select('*, repartidores(nombre, alias), motos(placa, alias)');
        
    if (repartidorId != null) {
      query = query.eq('repartidor_id', repartidorId);
    }
    if (startDate != null && endDate != null) {
      query = query.gte('fecha', startDate.toIso8601String()).lt('fecha', endDate.add(const Duration(days: 1)).toIso8601String());
    }
    
    final act = await query.order('fecha', ascending: false);
    final remoteList = List<Map<String, dynamic>>.from(act);

    try {
      final prefs = await SharedPreferences.getInstance();
      final queue = prefs.getStringList('offline_gastos') ?? [];
      for (var item in queue) {
        final payload = jsonDecode(item) as Map<String, dynamic>;
        if (repartidorId == null || payload['repartidor_id'] == repartidorId) {
          payload['es_offline'] = true;
          remoteList.insert(0, payload);
        }
      }
    } catch (_) {}

    return remoteList;
  }

  Future<List<Map<String, dynamic>>> getMotos() async {
    final res = await supabase.from('motos').select().order('placa');
    return List<Map<String, dynamic>>.from(res);
  }

  Future<String?> addMoto(String placa, String alias) async {
    try {
      final user = supabase.auth.currentUser;
      if (user == null) return 'No hay sesión activa';

      await supabase.from('motos').insert({
        'admin_id': user.id,
        'placa': placa.trim().toUpperCase(),
        'alias': alias.trim(),
        'estado': 'activa'
      });
      return null;
    } catch (e) {
      debugPrint('Error adding moto: $e');
      if (e.toString().contains('unique_violation')) return 'Esa placa ya está registrada';
      return e.toString();
    }
  }

  Future<double> getConsumoGasolina(String motoId) async {
    final res = await supabase
        .from('gastos_motos')
        .select('monto')
        .eq('moto_id', motoId)
        .eq('tipo_gasto', 'gasolina')
        .eq('estado', 'aprobado');
    
    double total = 0;
    for (var row in res) {
      total += (row['monto'] as num).toDouble();
    }
    return total;
  }

  Future<List<Map<String, dynamic>>> getFleetHealthData() async {
    final motosList = await getMotos();
    final repRes = await supabase.from('repartidores').select('id, nombre, moto_id');
    final repsInfo = List<Map<String, dynamic>>.from(repRes);

    final List<Map<String, dynamic>> healthData = [];

    // Tomaremos datos de los últimos 7 días
    final unaSemanaAtras = DateTime.now().subtract(const Duration(days: 7)).toIso8601String().split('T')[0];

    for (var m in motosList) {
      final String motoId = m['id'].toString();
      
      // 1. Gasolina de la última semana:
      final gasRes = await supabase
          .from('gastos_motos')
          .select('monto')
          .eq('moto_id', motoId)
          .eq('tipo_gasto', 'gasolina')
          .gte('fecha', unaSemanaAtras);
      
      double totalGas = 0;
      for (var r in gasRes) totalGas += (r['monto'] as num).toDouble();

      // 2. ¿Quién la tiene asignada?
      final repActivo = repsInfo.firstWhere((r) => r['moto_id'].toString() == motoId, orElse: () => {});
      final repId = repActivo.isNotEmpty ? repActivo['id'].toString() : null;

      double totalProducido = 0;
      if (repId != null) {
        final prodRes = await supabase
            .from('servicios_repartidor')
            .select('monto')
            .eq('repartidor_id', repId)
            .eq('estado', 'completado')
            .gte('creado_en', unaSemanaAtras);
        for (var p in prodRes) totalProducido += (p['monto'] as num).toDouble();
      }

      double rentabilidad = 0;
      if (totalProducido > 0) {
        rentabilidad = (totalGas / totalProducido) * 100;
      }

      healthData.add({
        'moto_id': motoId,
        'placa': m['placa'],
        'alias': m['alias'] ?? 'Moto ${m['placa']}',
        'conductor_actual': repActivo['nombre'] ?? 'Sin conductor',
        'gasolina_7d': totalGas,
        'producido_7d': totalProducido,
        'ratio_costo': rentabilidad, // Ej. 15.0 = 15% del total producido quemado en gas
      });
    }
    
    // Sort worst efficiency to the top
    healthData.sort((a, b) => (b['ratio_costo'] as double).compareTo(a['ratio_costo'] as double));
    return healthData;
  }

  Future<bool> addGasto(String concepto, double monto, {required bool isAdmin, String? motoId, String? repartidorId, String tipoGasto = 'otro', String? comprobanteUrl, String categoria = 'flota'}) async {
    try {
      final payload = {
        'admin_id': supabase.auth.currentUser!.id,
        'concepto': concepto,
        'monto': monto,
        'estado': 'aprobado',
        'moto_id': motoId,
        'repartidor_id': repartidorId,
        'tipo_gasto': tipoGasto,
        'comprobante_url': comprobanteUrl,
        'categoria': categoria,
      };

      final connectivityResult = await Connectivity().checkConnectivity();
      if (connectivityResult.contains(ConnectivityResult.none) || connectivityResult.isEmpty) {
        await SyncService().queueGasto(payload);
        return true;
      }

      await supabase.from('gastos_motos').insert(payload);
      return true;
    } catch (e) {
      debugPrint('Error al agregar gasto: $e');
      return false;
    }
  }

  Future<bool> actGastoEstado(String id, String estado) async {
    try {
      await supabase.from('gastos_motos').update({'estado': estado}).eq('id', id);
      return true;
    } catch (e) {
      debugPrint('Error actGasto: $e');
      return false;
    }
  }

  Future<double> getTotalGastosDia() async {
    try {
      final now = DateTime.now();
      final start = DateTime(now.year, now.month, now.day).toIso8601String();
      
      final res = await supabase
          .from('gastos_motos')
          .select('monto')
          .eq('estado', 'aprobado')
          .gte('fecha', start)
          .eq('admin_id', supabase.auth.currentUser!.id);

      double total = 0;
      for (var row in res) {
        total += (row['monto'] as num).toDouble();
      }
      return total;
    } catch (e) {
      return 0;
    }
  }
}

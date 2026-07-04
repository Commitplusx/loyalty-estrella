import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/foundation.dart';
import '../core/supabase_config.dart';

class SyncService {
  static final SyncService _instance = SyncService._internal();

  factory SyncService() {
    return _instance;
  }

  SyncService._internal();

  void init() {
    Connectivity().onConnectivityChanged.listen((List<ConnectivityResult> results) {
      final result = results.first;
      if (result != ConnectivityResult.none) {
        _syncAll();
      }
    });
  }

  Future<void> _syncAll() async {
    debugPrint('Iniciando sincronización offline...');
    await syncGastos();
    await syncServicios();
    await syncScans();
    await syncLiquidaciones();
  }

  Future<void> queueGasto(Map<String, dynamic> gasto) async {
    final prefs = await SharedPreferences.getInstance();
    final queue = prefs.getStringList('offline_gastos') ?? [];
    queue.add(jsonEncode(gasto));
    await prefs.setStringList('offline_gastos', queue);
    debugPrint('Gasto encolado para sincronización offline.');
  }

  Future<void> syncGastos() async {
    final prefs = await SharedPreferences.getInstance();
    final queue = prefs.getStringList('offline_gastos') ?? [];
    if (queue.isEmpty) return;

    List<String> failed = [];
    for (String item in queue) {
      try {
        final payload = jsonDecode(item) as Map<String, dynamic>;
        await supabase.from('gastos_motos').insert(payload);
        debugPrint('Gasto sincronizado: \${payload["concepto"]}');
      } catch (e) {
        debugPrint('Error sincronizando gasto: $e');
        failed.add(item);
      }
    }
    await prefs.setStringList('offline_gastos', failed);
  }

  Future<void> queueServicio(Map<String, dynamic> servicio) async {
    final prefs = await SharedPreferences.getInstance();
    final queue = prefs.getStringList('offline_servicios') ?? [];
    queue.add(jsonEncode(servicio));
    await prefs.setStringList('offline_servicios', queue);
    debugPrint('Servicio encolado para sincronización offline.');
  }

  Future<void> syncServicios() async {
    final prefs = await SharedPreferences.getInstance();
    final queue = prefs.getStringList('offline_servicios') ?? [];
    if (queue.isEmpty) return;

    List<String> failed = [];
    for (String item in queue) {
      try {
        final payload = jsonDecode(item) as Map<String, dynamic>;
        await supabase.from('servicios_repartidor').insert(payload);
        debugPrint('Servicio sincronizado: \${payload["descripcion"]}');
      } catch (e) {
        debugPrint('Error sincronizando servicio: $e');
        failed.add(item);
      }
    }
    await prefs.setStringList('offline_servicios', failed);
  }

  Future<void> queueScan(Map<String, dynamic> scan) async {
    final prefs = await SharedPreferences.getInstance();
    final queue = prefs.getStringList('offline_scans') ?? [];
    queue.add(jsonEncode(scan));
    await prefs.setStringList('offline_scans', queue);
    debugPrint('Scan QR encolado para sincronización offline.');
  }

  Future<void> syncScans() async {
    final prefs = await SharedPreferences.getInstance();
    final queue = prefs.getStringList('offline_scans') ?? [];
    if (queue.isEmpty) return;

    List<String> failed = [];
    for (String item in queue) {
      try {
        final payload = jsonDecode(item) as Map<String, dynamic>;
        
        final response = await supabase
            .from('clientes')
            .select()
            .or('qr_code.eq.\${payload["codigo_qr"]},telefono.eq.\${payload["codigo_qr"]}')
            .maybeSingle();

        if (response != null) {
          await supabase.rpc('registrar_envio', params: {
            'p_cliente_id': response['id'],
            'p_latitud': payload['lat'],
            'p_longitud': payload['lng'],
          });
          debugPrint('QR Scan sincronizado para: \${payload["codigo_qr"]}');
        } else {
           debugPrint('QR Scan falló sinc: Cliente \${payload["codigo_qr"]} no existe');
        }
      } catch (e) {
        debugPrint('Error sincronizando escaneo: $e');
        failed.add(item);
      }
    }
    await prefs.setStringList('offline_scans', failed);
  }

  Future<void> queueLiquidacion(String repartidorId) async {
    final prefs = await SharedPreferences.getInstance();
    final queue = prefs.getStringList('offline_liquidaciones') ?? [];
    queue.add(repartidorId);
    await prefs.setStringList('offline_liquidaciones', queue);
    debugPrint('Liquidacion encolada para offline.');
  }

  Future<void> syncLiquidaciones() async {
    final prefs = await SharedPreferences.getInstance();
    final queue = prefs.getStringList('offline_liquidaciones') ?? [];
    if (queue.isEmpty) return;

    final uniqueIds = queue.toSet().toList();
    List<String> failed = [];

    for (String repId in uniqueIds) {
      try {
        await supabase.rpc('liquidar_turno_repartidor', params: {
          'p_repartidor_id': repId
        });
        debugPrint('Liquidación sincronizada para: $repId');
      } catch (e) {
        debugPrint('Error sincronizando liquidacion: $e');
        failed.add(repId);
      }
    }
    await prefs.setStringList('offline_liquidaciones', failed);
  }
}


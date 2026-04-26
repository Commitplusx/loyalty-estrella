import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../models/cliente_model.dart';
import '../core/supabase_config.dart';

final clienteServiceProvider = Provider((ref) => ClienteService());

class ClienteService {
  ClienteService() {
    _initConnectivity();
  }

  void _initConnectivity() {
    Connectivity().onConnectivityChanged.listen((List<ConnectivityResult> results) {
      final result = results.first;
      if (result != ConnectivityResult.none) {
        _syncOfflineScans();
      }
    });
  }

  Future<void> _syncOfflineScans() async {
    final prefs = await SharedPreferences.getInstance();
    final queue = prefs.getStringList('offline_scans') ?? [];
    if (queue.isEmpty) return;

    List<String> failed = [];

    for (String item in queue) {
      try {
        final payload = jsonDecode(item);
        // BUG FIX #6: Use codigo_qr to find cliente_id if not present
        String? clienteId = payload['cliente_id'];
        if (clienteId == null && payload['codigo_qr'] != null) {
          final response = await supabase
              .from('clientes')
              .select('id')
              .or('qr_code.eq.${payload['codigo_qr']},telefono.eq.${payload['codigo_qr']}')
              .maybeSingle();
          clienteId = response?['id'];
        }
        if (clienteId == null) {
          debugPrint('⚠️ Offline sync: No se encontró cliente para QR ${payload['codigo_qr']}');
          continue; // Skip this entry instead of failing forever
        }
        final adminId = payload['admin_id'];
        final lat = payload['lat'];
        final lng = payload['lng'];

        await supabase.rpc('registrar_envio', params: {
          'p_cliente_id': clienteId,
          'p_admin_id': adminId,
          'p_latitud': lat,
          'p_longitud': lng,
        });
      } catch (e) {
        // Falló de nuevo, vuelve a la cola
        failed.add(item);
      }
    }

    await prefs.setStringList('offline_scans', failed);
  }

  /// Activa o desactiva el status VIP de un cliente
  Future<bool> toggleVip(String clienteId, bool esVip) async {
    try {
      await supabase.from('clientes').update({'es_vip': esVip}).eq('id', clienteId);
      return true;
    } catch (e) {
      print('Error en toggleVip: $e');
      return false;
    }
  }

  /// Registra un envío escaneando el QR del cliente.
  Future<ScanResultModel> registrarEnvio(String codigoQr) async {
    try {
      // Check Connectivity FIRST
      final connectivityResult = await Connectivity().checkConnectivity();
      bool isOffline = connectivityResult.contains(ConnectivityResult.none) || connectivityResult.isEmpty;

      // Obtener ubicación GPS de forma silenciosa
      double? lat;
      double? lng;
      try {
        bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
        LocationPermission permission = await Geolocator.checkPermission();
        if (permission == LocationPermission.denied) {
          permission = await Geolocator.requestPermission();
        }
        if (serviceEnabled && (permission == LocationPermission.always || permission == LocationPermission.whileInUse)) {
          Position position = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.medium);
          lat = position.latitude;
          lng = position.longitude;
        }
      } catch (_) {}

      // Si no hay red, guardar en la cola global
      if (isOffline) {
        final prefs = await SharedPreferences.getInstance();
        final queue = prefs.getStringList('offline_scans') ?? [];
        
        queue.add(jsonEncode({
          'codigo_qr': codigoQr,
          'admin_id': supabase.auth.currentUser!.id,
          'lat': lat,
          'lng': lng,
          'timestamp': DateTime.now().toIso8601String(),
        }));
        
        await prefs.setStringList('offline_scans', queue);
        return const ScanResultModel(
          success: true,
          message: 'Guardado sin conexión ⏳. Se sincronizará automáticamente.',
          esGratis: false,
        );
      }

      // Con Red Activa: Buscar cliente
      final response = await supabase
          .from('clientes')
          .select()
          .or('qr_code.eq.$codigoQr,telefono.eq.$codigoQr')
          .maybeSingle();

      if (response == null) {
        return const ScanResultModel(
          success: false,
          message: 'Cliente no encontrado. QR inválido.',
        );
      }

      // Registrar el envío via RPC
      await supabase.rpc('registrar_envio', params: {
        'p_cliente_id': response['id'],
        'p_latitud': lat,
        'p_longitud': lng,
      });

      // Obtener datos actualizados
      final updated = await supabase
          .from('clientes')
          .select()
          .eq('id', response['id'])
          .single();

      final cliente = ClienteModel.fromMap(updated);
      final esGratis = cliente.enviosGratis > 0;

      return ScanResultModel(
        success: true,
        message: esGratis
            ? '¡ENVÍO GRATIS GANADO! 🎉 ${cliente.telefono}'
            : 'Envío registrado ✅ — Faltan ${cliente.enviosParaGratis} para gratis',
        cliente: cliente,
        esGratis: esGratis,
      );
    } on PostgrestException catch (e) {
      return ScanResultModel(success: false, message: 'Error DB: ${e.message}');
    } catch (e) {
      return ScanResultModel(success: false, message: 'Error: $e');
    }
  }

  /// Lista todos los clientes ordenados por total de envíos
  Future<List<ClienteModel>> getClientes({String? busqueda}) async {
    var query = supabase.from('clientes').select().order('envios_totales', ascending: false);

    final data = await query;
    final clientes = (data as List)
        .map((m) => ClienteModel.fromMap(m as Map<String, dynamic>))
        .toList();

    if (busqueda != null && busqueda.isNotEmpty) {
      final lower = busqueda.toLowerCase();
      return clientes.where((c) {
        return c.telefono.contains(busqueda) ||
            (c.nombre?.toLowerCase().contains(lower) ?? false);
      }).toList();
    }

    return clientes;
  }

  /// Estadísticas del dashboard
  Future<Map<String, int>> getStats() async {
    final clientes = await supabase.from('clientes').select('envios_totales, envios_gratis_disponibles');
    int totalClientes = clientes.length;
    int totalEnvios = 0;
    int totalGratis = 0;
    for (final c in clientes) {
      totalEnvios += (c['envios_totales'] as num?)?.toInt() ?? 0;
      totalGratis += (c['envios_gratis_disponibles'] as num?)?.toInt() ?? 0;
    }

    // Calcular "Tus envíos hoy" (Control de flota)
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, now.day).toIso8601String();
    final userId = supabase.auth.currentUser?.id;
    int misEnviosCount = 0;

    if (userId != null) {
      final misEnvios = await supabase
          .from('registros_puntos')
          .select('id')
          .eq('tipo', 'acumulacion')
          .gte('created_at', start)
          .eq('created_by', userId);
      misEnviosCount = misEnvios.length;
    }

    return {
      'clientes': totalClientes,
      'envios': totalEnvios,
      'gratis': totalGratis,
      'mis_envios_hoy': misEnviosCount,
    };
  }

  /// Obtiene los envíos de los últimos 7 días para la gráfica
  Future<List<int>> getWeeklyChartData() async {
    final now = DateTime.now();
    final startOf7DaysAgo = DateTime(now.year, now.month, now.day).subtract(const Duration(days: 6));
    
    // Traer todos los envios de los ultimos 7 dias
    final dateStr = startOf7DaysAgo.toIso8601String();
    final data = await supabase
        .from('registros_puntos')
        .select('created_at')
        .eq('tipo', 'acumulacion')
        .gte('created_at', dateStr);

    // Inicializar array de 7 dias con 0
    List<int> weekly = List.filled(7, 0);

    for (var row in data) {
      final dt = DateTime.parse(row['created_at']);
      // Calcular diferencia en dias desde startOf7DaysAgo
      final diff = dt.difference(startOf7DaysAgo).inDays;
      if (diff >= 0 && diff < 7) {
        weekly[diff]++;
      }
    }
    
    return weekly;
  }

  /// Registrar manualmente un envío gratis (redención)
  Future<void> redimirGratis(String clienteId) async {
    await supabase.rpc('redimir_envio_gratis', params: {
      'p_cliente_id': clienteId,
    });
  }

  /// Canjear saldo de la billetera VIP (descontar monto)
  Future<bool> canjearSaldo(String clienteId, double monto) async {
    try {
      // BUG FIX #2: Pass current user ID for audit trail
      final adminId = supabase.auth.currentUser?.id;
      await supabase.rpc('canjear_saldo', params: {
        'p_cliente_id': clienteId,
        'p_admin_id': adminId,
        'p_monto': monto,
      });
      return true;
    } catch (e) {
      debugPrint('Error en canjearSaldo: $e');
      return false;
    }
  }

  /// Registro Express de cliente (forzado)
  Future<Map<String, dynamic>> registroExpress(String telefono, String nombre) async {
    try {
      final res = await supabase.rpc('registro_express_cliente', params: {
        'p_telefono': telefono,
        'p_nombre': nombre,
      });
      return {
        'success': res['success'] as bool,
        'message': res['message'] as String,
        'cliente_id': res['cliente_id'],
        'qr_code': res['qr_code'],
      };
    } catch (e) {
      return {'success': false, 'message': 'Error: $e'};
    }
  }

  /// Eliminar un cliente por completo de la base de datos
  Future<bool> deleteCliente(String clienteId) async {
    try {
      await supabase.from('clientes').delete().eq('id', clienteId);
      return true;
    } catch (e) {
      debugPrint('Error en deleteCliente: $e');
      return false;
    }
  }

  /// Actualizar el costo de envío personalizado de un cliente
  Future<bool> updateCostoEnvio(String clienteId, double costo) async {
    try {
      await supabase.from('clientes').update({'costo_envio': costo}).eq('id', clienteId);
      return true;
    } catch (e) {
      debugPrint('Error en updateCosto: $e');
      return false;
    }
  }

  /// Actualizar las notas CRM del cliente
  Future<bool> updateNotasCrm(String clienteId, String notas) async {
    try {
      await supabase.from('clientes').update({'notas_crm': notas}).eq('id', clienteId);
      return true;
    } catch (e) {
      debugPrint('Error en updateNotas: $e');
      return false;
    }
  }
}

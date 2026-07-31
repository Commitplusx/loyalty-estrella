import 'dart:async';
import 'dart:convert';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES de Supabase (duplicadas aquí porque este handler corre en un
// Isolate separado y no tiene acceso al Supabase.instance normal)
// ─────────────────────────────────────────────────────────────────────────────
const _supabaseUrl   = 'https://jdrrkpvodnqoljycixbg.supabase.co';
const _supabaseAnon  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ';

// Callback obligatorio — punto de entrada del Isolate de segundo plano
@pragma('vm:entry-point')
void startCallback() {
  FlutterForegroundTask.setTaskHandler(OriginIslandTaskHandler());
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK HANDLER — corre en el Isolate de fondo cada 5 segundos
// ─────────────────────────────────────────────────────────────────────────────
class OriginIslandTaskHandler extends TaskHandler {

  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
//     print('🏝️ [BG] Servicio de fondo iniciado.');
  }

  static DateTime? _lastUpdate;

  @override
  void onRepeatEvent(DateTime timestamp) {
    // Lanzamos async sin bloquear el hilo del Isolate
    _sendLocationToSupabase();
  }

  Future<void> _sendLocationToSupabase() async {
    try {
      // 1. Leer el ID del repartidor guardado en preferencias por el login
      final prefs = await SharedPreferences.getInstance();
      await prefs.reload(); // Obligatorio para aislamientos en segundo plano
      final repartidorId = prefs.getString('repartidor_id');
      final isOnline = prefs.getBool('repartidor_online') ?? false;
      final estadoViaje = prefs.getString('repartidor_estado_viaje'); // null, asignado, en_cocina, llegada_restaurante, en_camino

      if (repartidorId == null || !isOnline) {
//         print('🏝️ [BG] Repartidor offline o sin ID — omitiendo update.');
        return;
      }

      // 1.5 Lógica de estrangulamiento (Throttling) dinámico
      int intervalSeconds = 60; // Por defecto: Sin viaje o esperando comida
      if (estadoViaje == 'asignado' || estadoViaje == 'preparando' || estadoViaje == 'en_camino') {
        intervalSeconds = 1; // Viaje activo (hacia rest o hacia cliente)
      } else if (estadoViaje == 'en_cocina' || estadoViaje == 'llegada_restaurante') {
        intervalSeconds = 60; // Llegó al rest pero sigue esperando comida
      }

      final now = DateTime.now();
      if (_lastUpdate != null && now.difference(_lastUpdate!).inSeconds < intervalSeconds) {
        return; // Aún no es tiempo de actualizar
      }
      _lastUpdate = now;

      // 2. Obtener GPS
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
//         print('🏝️ [BG] Sin permiso de GPS — omitiendo update.');
        return;
      }

      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 4),
        ),
      );

      // 3. Construir payload
      final body = <String, dynamic>{
        'lat': pos.latitude,
        'lng': pos.longitude,
      };

      // 4. Leer access token
      final accessToken = _prefs_getAccessToken(prefs);

      // 5. Enviar a Supabase REST (funciona desde cualquier Isolate)
      final url = Uri.parse('$_supabaseUrl/rest/v1/repartidores?id=eq.$repartidorId');
      final resp = await http.patch(
        url,
        headers: {
          'Content-Type': 'application/json',
          'apikey': _supabaseAnon,
          'Authorization': 'Bearer $accessToken',
          'Prefer': 'return=minimal',
        },
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 5));

      if (resp.statusCode >= 200 && resp.statusCode < 300) {
//         print('🏝️ [BG] 📍 GPS enviado → (${pos.latitude.toStringAsFixed(4)}, ${pos.longitude.toStringAsFixed(4)}) | HTTP ${resp.statusCode}');
      } else {
        print('🏝️ [BG] ❌ Error GPS → HTTP ${resp.statusCode}: ${resp.body}');
      }
    } catch (e) {
      print('🏝️ [BG] Error en _sendLocationToSupabase: $e');
    }
  }

  /// Lee el access token guardado por supabase_flutter en SharedPreferences
  String _prefs_getAccessToken(SharedPreferences prefs) {
    // supabase_flutter guarda la sesión como JSON en esta clave
    final raw = prefs.getString('sb-jdrrkpvodnqoljycixbg-auth-token');
    if (raw == null) return _supabaseAnon;
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      return decoded['access_token'] as String? ?? _supabaseAnon;
    } catch (_) {
      return _supabaseAnon;
    }
  }

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {
//     print('🏝️ [BG] Servicio de fondo detenido.');
  }

  void onButtonPressed(String id) {}

  @override
  void onNotificationPressed() {}
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICIO PÚBLICO — llamado desde la UI de Flutter
// ─────────────────────────────────────────────────────────────────────────────
class OriginIslandService {

  /// Inicializar la configuración del servicio de segundo plano
  static void initService() {
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'estrella_delivery_origin_island_v2',
        channelName: 'Estrella Delivery · GPS Activo',
        channelDescription: 'Transmite tu ubicación al panel de control en tiempo real',
        channelImportance: NotificationChannelImportance.LOW,
        priority: NotificationPriority.LOW,
      ),
      iosNotificationOptions: const IOSNotificationOptions(
        showNotification: true,
        playSound: false,
      ),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.repeat(1000), // cada 1 segundo (throttled internamente)
        autoRunOnBoot: true,
        allowWakeLock: true,
        allowWifiLock: true,
      ),
    );
  }

  /// Guardar en SharedPreferences los datos que necesita el Isolate
  static Future<void> saveDriverContext({
    required String repartidorId,
    required bool isOnline,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('repartidor_id', repartidorId);
    await prefs.setBool('repartidor_online', isOnline);
  }

  /// Arrancar la notificación persistente y el tracking de fondo
  static Future<void> startIsland(String title, String text) async {
//     print('🏝️ [ORIGIN ISLAND] startIsland: $title / $text');
    try {
      if (await FlutterForegroundTask.isRunningService) {
        await FlutterForegroundTask.updateService(
          notificationTitle: title,
          notificationText: text,
        );
      } else {
        await FlutterForegroundTask.startService(
          notificationTitle: title,
          notificationText: text,
          callback: startCallback,
        );
      }
    } catch (e) {
      print('🏝️ [ORIGIN ISLAND] startIsland error: $e');
    }
  }

  /// Actualizar el texto de la notificación en vivo
  static Future<void> updateIsland(String title, String text) async {
    if (await FlutterForegroundTask.isRunningService) {
      await FlutterForegroundTask.updateService(
        notificationTitle: title,
        notificationText: text,
      );
    } else {
      await startIsland(title, text);
    }
  }

  /// Apagar el servicio cuando el repartidor se ponga offline
  static Future<void> stopIsland() async {
    await FlutterForegroundTask.stopService();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('repartidor_online', false);
  }

  /// Encender o apagar el servicio según el estado online del repartidor
  static Future<void> toggleBackgroundService(bool isOnline, {String? repartidorId}) async {
//     print('🏝️ [ORIGIN ISLAND] toggleBackgroundService → isOnline=$isOnline');
    try {
      // Siempre guardar el contexto actualizado para el Isolate
      if (repartidorId != null) {
        await saveDriverContext(repartidorId: repartidorId, isOnline: isOnline);
      } else {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setBool('repartidor_online', isOnline);
      }

      if (isOnline) {
        if (await FlutterForegroundTask.isRunningService) {
          await FlutterForegroundTask.updateService(
            notificationTitle: '🛵 Estrella Delivery',
            notificationText: 'GPS activo · Buscando pedidos...',
          );
        } else {
          await FlutterForegroundTask.startService(
            notificationTitle: '🛵 Estrella Delivery',
            notificationText: 'GPS activo · Buscando pedidos...',
            callback: startCallback,
          );
        }
      } else {
        await stopIsland();
      }
    } catch (e) {
      print('🏝️ [ORIGIN ISLAND] ERROR en toggleBackgroundService: $e');
    }
  }
}

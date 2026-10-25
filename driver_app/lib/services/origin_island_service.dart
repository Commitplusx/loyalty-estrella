import 'dart:async';
import 'dart:convert';
import 'package:battery_plus/battery_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../core/supabase_config.dart' show supabaseUrl, supabaseAnonKey;
import 'driver_presence.dart';

@pragma('vm:entry-point')
void startCallback() {
  FlutterForegroundTask.setTaskHandler(OriginIslandTaskHandler());
}

class OriginIslandTaskHandler extends TaskHandler {
  DriverPresenceCoordinator? _presence;
  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    _presence = DriverPresenceCoordinator(_BackgroundPresencePort(),
        diagnostic: (code) => debugPrint(code));
    unawaited(_presence!.tick());
  }

  @override
  void onRepeatEvent(DateTime timestamp) {
    unawaited(_presence?.tick());
  }

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {
    _presence?.stop();
  }

  @override
  void onNotificationPressed() {}
}

class _BackgroundPresencePort implements DriverPresencePort {
  static final _uuid = RegExp(
      r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$');
  @override
  Future<DriverPresenceContext?> context() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.reload();
    final profile = prefs.getString('repartidor_id');
    final raw = prefs.getString('sb-jdrrkpvodnqoljycixbg-auth-token');
    if (profile == null || !_uuid.hasMatch(profile) || raw == null) return null;
    final Object? session = jsonDecode(raw);
    if (session is! Map<String, Object?>) return null;
    final token = session['access_token'];
    final user = session['user'];
    final expiry = session['expires_at'];
    if (token is! String ||
        token.isEmpty ||
        user is! Map<String, Object?> ||
        expiry is! int ||
        expiry * 1000 <= DateTime.now().millisecondsSinceEpoch) {
      return null;
    }
    final actor = user['id'];
    final device = prefs.getString('my_device_id');
    if (actor is! String ||
        !_uuid.hasMatch(actor) ||
        (device != null && !_uuid.hasMatch(device))) {
      return null;
    }
    return DriverPresenceContext(
        profileId: profile,
        actorId: actor,
        deviceId: device,
        accessToken: token,
        online: prefs.getBool('repartidor_online') ?? false);
  }

  @override
  Future<DriverGpsSample?> location() async {
    final permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return null;
    }
    Position? position;
    try {
      final last = await Geolocator.getLastKnownPosition();
      if (last != null &&
          DateTime.now().difference(last.timestamp).inSeconds >= 0 &&
          DateTime.now().difference(last.timestamp).inSeconds <= 30) {
        position = last;
      }
    } catch (_) {/* A fresh measurement is attempted below. */}
    position ??= await Geolocator.getCurrentPosition(
            locationSettings: AndroidSettings(
                accuracy: LocationAccuracy.high,
                timeLimit: const Duration(seconds: 6),
                intervalDuration: const Duration(seconds: 3)))
        .timeout(const Duration(seconds: 7));
    return DriverGpsSample(
        lat: position.latitude,
        lng: position.longitude,
        measuredAt: position.timestamp,
        accuracyMeters: position.accuracy,
        mocked: position.isMocked);
  }

  @override
  Future<int?> battery() =>
      Battery().batteryLevel.timeout(const Duration(seconds: 2));
  Future<Object?> _rpc(DriverPresenceContext context, String name,
      Map<String, Object?> body) async {
    final response = await http
        .post(Uri.parse('$supabaseUrl/rest/v1/rpc/$name'),
            headers: {
              'apikey': supabaseAnonKey,
              'Authorization': 'Bearer ${context.accessToken}',
              'Content-Type': 'application/json'
            },
            body: jsonEncode(body))
        .timeout(const Duration(seconds: 5));
    if (response.statusCode != 200 || response.bodyBytes.length > 16384) {
      throw StateError('Presence request unconfirmed');
    }
    final Object? value = jsonDecode(response.body);
    return value;
  }

  @override
  Future<bool> begin(DriverPresenceContext context, String sessionId) async {
    final result = await _rpc(context, 'driver_presence_begin', {
      'p_profile_id': context.profileId,
      'p_device_id': context.deviceId,
      'p_session_id': sessionId
    });
    if (result is! bool) {
      throw const FormatException('Invalid presence session receipt');
    }
    return result;
  }

  @override
  Future<PresenceReceipt> report(
          DriverPresenceContext context, DriverPresenceReport report) async =>
      PresenceReceipt.parse(await _rpc(context, 'driver_presence_report',
          report.arguments(context.profileId)));
}

class OriginIslandService {
  /// Inicializar la configuración del servicio de segundo plano
  static void initService() {
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'estrella_delivery_origin_island_v2',
        channelName: 'Estrella Delivery · GPS Activo',
        channelDescription:
            'Transmite tu ubicación al panel de control en tiempo real',
        channelImportance: NotificationChannelImportance.LOW,
        priority: NotificationPriority.LOW,
      ),
      iosNotificationOptions: const IOSNotificationOptions(
        showNotification: true,
        playSound: false,
      ),
      foregroundTaskOptions: ForegroundTaskOptions(
        // 5s es el sweet spot: frecuente para el GPS pero sin que Android lo mate.
        // El throttling interno en _sendLocationToSupabase controla la frecuencia real.
        eventAction: ForegroundTaskEventAction.repeat(5000),
        autoRunOnBoot: true,
        autoRunOnMyPackageReplaced:
            true, // Reiniciar después de updates de la app
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
      debugPrint('driver_foreground_service_start_failed');
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
  static Future<void> toggleBackgroundService(bool isOnline,
      {String? repartidorId}) async {
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
      debugPrint('driver_foreground_service_toggle_failed');
    }
  }
}

import 'dart:isolate';
import 'dart:io';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';

// Callback obligatorio para que el servicio corra en background aislado
@pragma('vm:entry-point')
void startCallback() {
  FlutterForegroundTask.setTaskHandler(OriginIslandTaskHandler());
}

class OriginIslandTaskHandler extends TaskHandler {
  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    // Aquí puedes iniciar una conexión WebSocket o Supabase Realtime si se requiere
  }

  @override
  void onRepeatEvent(DateTime timestamp) {
    // Este print garantiza que el servicio sigue corriendo en 2do plano
    // incluso si la notificación fue deslizada.
    print('🏝️ [ORIGIN ISLAND] Latido en 2do plano... el servicio sigue vivo (${timestamp.second}s)');
  }

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {}

  @override
  void onButtonPressed(String id) {}

  @override
  void onNotificationPressed() {}
}

class OriginIslandService {
  
  /// Inicializar la configuración del servicio de Origin Island
  static void initService() {
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'estrella_delivery_origin_island_v2',
        channelName: 'Estrella Delivery Tracking',
        channelDescription: 'Mantiene vivo el estatus del pedido',
        channelImportance: NotificationChannelImportance.LOW,
        priority: NotificationPriority.LOW,
      ),
      iosNotificationOptions: const IOSNotificationOptions(
        showNotification: true,
        playSound: false,
      ),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.repeat(5000),
        autoRunOnBoot: true,
        allowWakeLock: true,
        allowWifiLock: true,
      ),
    );
  }

  /// Arrancar la notificación persistente
  static Future<void> startIsland(String title, String text) async {
    print('🏝️ [ORIGIN ISLAND] startIsland invocado con: $title / $text');
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
      print('Foreground task start error: $e');
    }
  }

  /// Actualizar el texto en vivo (Ej. de "Preparando" a "En Camino")
  static Future<void> updateIsland(String title, String text) async {
    print('🏝️ [ORIGIN ISLAND] updateIsland invocado: $title / $text');
    if (await FlutterForegroundTask.isRunningService) {
      await FlutterForegroundTask.updateService(notificationTitle: title, notificationText: text);
    } else {
      await startIsland(title, text);
    }
  }

  /// Apagar el servicio cuando se entregue el pedido
  static Future<void> stopIsland() async {
    await FlutterForegroundTask.stopService();
  }

  /// Mantiene vivo al repartidor en background
  static Future<void> toggleBackgroundService(bool isOnline) async {
    print('🏝️ [ORIGIN ISLAND] toggleBackgroundService invocado con: isOnline=$isOnline');
    try {
      if (isOnline) {
        if (await FlutterForegroundTask.isRunningService) {
          print('🏝️ [ORIGIN ISLAND] Actualizando Foreground Service existente a Buscando pedidos...');
          await FlutterForegroundTask.updateService(
            notificationTitle: 'Estrella Delivery',
            notificationText: 'Buscando pedidos...',
          );
        } else {
          print('🏝️ [ORIGIN ISLAND] Iniciando nuevo Foreground Service (Buscando pedidos...)');
          final success = await FlutterForegroundTask.startService(
            notificationTitle: 'Estrella Delivery',
            notificationText: 'Buscando pedidos...',
            callback: startCallback,
          );
          print('🏝️ [ORIGIN ISLAND] Resultado de startService: $success');
        }
      } else {
        print('🏝️ [ORIGIN ISLAND] Deteniendo Foreground Service (Inactivo)');
        await FlutterForegroundTask.stopService();
      }
    } catch (e) {
      print('🏝️ [ORIGIN ISLAND] ERROR CRÍTICO en toggleBackgroundService: $e');
    }
  }
}


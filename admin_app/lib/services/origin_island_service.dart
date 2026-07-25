import 'dart:isolate';
import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:flutter_overlay_window/flutter_overlay_window.dart' as overlay;

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
  
  static bool? _isBBK;

  static Future<bool> isBBKDevice() async {
    if (_isBBK != null) return _isBBK!;
    if (!Platform.isAndroid) {
      _isBBK = false;
      return false;
    }
    
    try {
      final deviceInfo = DeviceInfoPlugin();
      final androidInfo = await deviceInfo.androidInfo;
      final manufacturer = androidInfo.manufacturer.toLowerCase();
      final brand = androidInfo.brand.toLowerCase();
      
      final bbkBrands = ['oppo', 'vivo', 'oneplus', 'realme', 'xiaomi', 'poco', 'redmi', 'iqoo'];
      _isBBK = bbkBrands.contains(manufacturer) || bbkBrands.contains(brand);
      return _isBBK!;
    } catch (e) {
      return false;
    }
  }

  /// Inicializar la configuración del servicio de Origin Island
  static void initService() {
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'estrella_delivery_origin_island_v2',
        channelName: 'Estrella Delivery Tracking',
        channelDescription: 'Mantiene vivo el estatus del pedido en la Origin Island',
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

  /// Arrancar la Isla Dinámica
  static Future<void> startIsland(String title, String text) async {
    print('🏝️ [ORIGIN ISLAND] startIsland invocado con: $title / $text');
    try {
      final isBBK = await isBBKDevice();

      if (!isBBK) {
        // 1. Mostrar el Overlay Nativo Falso (Solo para No-BBK)
        final bool isOverlayActive = await overlay.FlutterOverlayWindow.isActive();
        print('🏝️ [ORIGIN ISLAND] isOverlayActive: $isOverlayActive');
        
        if (!isOverlayActive) {
          bool isGranted = await overlay.FlutterOverlayWindow.isPermissionGranted();
          
          if (!isGranted) {
            print('🏝️ [ORIGIN ISLAND] Solicitando permisos de overlay...');
            final bool? requested = await overlay.FlutterOverlayWindow.requestPermission();
            isGranted = requested ?? false;
          }
          
          if (isGranted) {
            await overlay.FlutterOverlayWindow.showOverlay(
              alignment: overlay.OverlayAlignment.topCenter,
              visibility: overlay.NotificationVisibility.visibilityPublic,
              flag: overlay.OverlayFlag.defaultFlag,
              overlayTitle: "Seguimiento Estrella",
              overlayContent: "El pedido está activo",
              enableDrag: false,
            );
          } else {
            print('🏝️ [ORIGIN ISLAND] ERROR: No hay permisos para mostrar la isla overlay.');
          }
        }
        
        await overlay.FlutterOverlayWindow.shareData({'title': title, 'body': text});
      } else {
        print('🏝️ [ORIGIN ISLAND] BBK Detectado. Usando Notificación Persistente nativa.');
      }

      // 2. Iniciar el Foreground Service (Actúa como Notificación visible en BBK)
      if (await FlutterForegroundTask.isRunningService) {
        await FlutterForegroundTask.updateService(
          notificationTitle: isBBK ? title : 'Estrella Delivery',
          notificationText: isBBK ? text : 'Procesando entrega en 2do plano',
        );
      } else {
        await FlutterForegroundTask.startService(
          notificationTitle: isBBK ? title : 'Estrella Delivery',
          notificationText: isBBK ? text : 'Procesando entrega en 2do plano',
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
    
    final isBBK = await isBBKDevice();
    
    if (isBBK) {
       if (await FlutterForegroundTask.isRunningService) {
         await FlutterForegroundTask.updateService(notificationTitle: title, notificationText: text);
       } else {
         await startIsland(title, text);
       }
       return;
    }

    final bool isOverlayActive = await overlay.FlutterOverlayWindow.isActive();
    if (isOverlayActive) {
      await overlay.FlutterOverlayWindow.shareData({'title': title, 'body': text});
    } else {
      await startIsland(title, text);
    }
  }

  /// Apagar la Isla cuando se entregue el pedido
  static Future<void> stopIsland() async {
    final isBBK = await isBBKDevice();
    if (!isBBK) {
      await overlay.FlutterOverlayWindow.closeOverlay();
    }
    await FlutterForegroundTask.stopService();
  }

  /// Mantiene vivo al repartidor en background sin mostrar la burbuja flotante.
  /// Ideal para cuando está "Activo" esperando pedidos.
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

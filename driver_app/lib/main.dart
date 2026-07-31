import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'core/theme.dart';
import 'core/theme_provider.dart';
import 'router.dart';

import 'services/sync_service.dart';
import 'services/notification_service.dart';
import 'services/origin_island_service.dart';
import 'services/order_queue_service.dart';
import 'widgets/incoming_order_sheet.dart';

import 'package:audioplayers/audioplayers.dart';

import 'package:intl/date_symbol_data_local.dart';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';

// Instancia global para que no sea recolectada por el recolector de basura (Garbage Collector)
final AudioPlayer alarmPlayer = AudioPlayer();

// Método global para detener la alarma desde cualquier pantalla
void stopAlarm() {
  alarmPlayer.stop();
  try {
    NotificationService().flutterLocalNotificationsPlugin.cancelAll();
  } catch (_) {}
}

// Handler para notificaciones en segundo plano (App cerrada o minimizada)
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  debugPrint("🚨 [FCM BG] NOTIFICACIÓN RECIBIDA EN SEGUNDO PLANO");
  debugPrint("🚨 [FCM BG] Payload Data: ${message.data}");
  if (message.data['tipo'] == 'pedido_asignado') {
    // Validar que el push sea realmente para el usuario actual (aislar sesiones cruzadas)
    await Supabase.initialize(
      url: 'https://jdrrkpvodnqoljycixbg.supabase.co',
      anonKey:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ',
    );
    final currentUserId = Supabase.instance.client.auth.currentUser?.id;
    final targetDriverId = message.data['target_driver_id'];

    if (currentUserId == null || targetDriverId != currentUserId) {
//       debugPrint("Background push ignorado: Es para otro repartidor ($targetDriverId).");
      return;
    }

    final restaurante = message.data['restaurante'] ?? 'Estrella';
    final pedidoId = message.data['pedido_id'] ?? '';
    
    // Inicializamos el plugin en este Isolate (sin pedir permisos UI)
    await NotificationService().init(isBackground: true);
    
    // Iniciar Isla Dinámica para notificar el pedido entrante
    OriginIslandService.initService();
    OriginIslandService.startIsland('🛵 ¡NUEVO PEDIDO!', 'Recoger en: $restaurante');
    
    // Despertar la pantalla físicamente si el celular está bloqueado o apagado
    FlutterForegroundTask.wakeUpScreen();
    
    // Al ser un data-only push, disparamos la notificación local
    // (bajará como banner y la pantalla se encenderá sola)
    await NotificationService().showNotification(
      id: DateTime.now().millisecondsSinceEpoch.remainder(100000),
      title: '🚨 ¡VIAJE URGENTE ASIGNADO!',
      body: 'Recoger en: $restaurante\nToca aquí para aceptar el pedido ahora mismo.',
      payload: pedidoId,
    );
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  FlutterForegroundTask.requestIgnoreBatteryOptimization();
  debugPrint('[MAIN] 1. ensureInitialized OK');

  await initializeDateFormatting('es');
  debugPrint('[MAIN] 2. initializeDateFormatting OK');

  // Configurar audioplayers para que suene como ALARMA (salta el modo silencio/no molestar)
  final audioContext = AudioContext(
    android: const AudioContextAndroid(
      isSpeakerphoneOn: true,
      stayAwake: true,
      contentType: AndroidContentType.sonification,
      usageType: AndroidUsageType.alarm,
      audioFocus: AndroidAudioFocus.gainTransientExclusive,
    ),
    iOS: AudioContextIOS(
      category: AVAudioSessionCategory.playback,
      options: const {
        AVAudioSessionOptions.duckOthers,
      },
    ),
  );
  AudioPlayer.global.setAudioContext(audioContext);
  debugPrint('[MAIN] 3. AudioPlayer configurado OK');

  // Inicializar Firebase
  await Firebase.initializeApp();
  debugPrint('[MAIN] 4. Firebase OK');
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

  // ⚠️ IMPORTANTE: NO hacer await en requestPermission ni en topic operations
  // porque pueden bloquearse indefinidamente en algunos dispositivos antes de runApp().
  // Los ejecutamos en segundo plano sin bloquear.
  Future(() async {
    try {
      await FirebaseMessaging.instance.requestPermission(
        alert: true, badge: true, sound: true,
      );
    } catch (e) {
      debugPrint('[MAIN] FCM: error requestPermission: $e');
    }
  });

  GoogleFonts.config.allowRuntimeFetching = true;
  debugPrint('[MAIN] 5. GoogleFonts OK');

  await Supabase.initialize(
    url: 'https://jdrrkpvodnqoljycixbg.supabase.co',
    anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ',
  );
  debugPrint('[MAIN] 6. Supabase OK');

  await NotificationService().init();
  debugPrint('[MAIN] 7. NotificationService OK');

  MapboxOptions.setAccessToken('pk.eyJ1IjoiZGVpZmZ4ZCIsImEiOiJjbW9ha2UybG4wNzJiMnJwcHJteXFua3BmIn0.hASM0wsh3h4QYqnBNHwa1A');

  OriginIslandService.initService();
  debugPrint('[MAIN] 8. OriginIslandService OK → llamando runApp()');

  FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
    stopAlarm(); // Detener alarma al abrir notificación
    final String? pedidoId = message.data['pedido_id'] ?? message.data['id'];
    if (pedidoId != null) {
      Future.delayed(const Duration(milliseconds: 500), () {
        final context = rootNavigatorKey.currentContext;
        if (context != null) {
          if (message.data['tipo'] == 'pedido_asignado') {
             OrderQueueService().enqueue(context, message.data);
          } else {
             rootNavigatorKey.currentContext?.push('/pedidos/$pedidoId');
          }
        }
      });
    }
  });

  FirebaseMessaging.instance.getInitialMessage().then((RemoteMessage? message) {
    if (message != null) {
      final String? pedidoId = message.data['pedido_id'] ?? message.data['id'];
      if (pedidoId != null) {
        Future.delayed(const Duration(milliseconds: 1500), () {
          final context = rootNavigatorKey.currentContext;
          if (context != null) {
            if (message.data['tipo'] == 'pedido_asignado') {
               OrderQueueService().enqueue(context, message.data);
            } else {
               rootNavigatorKey.currentContext?.push('/pedidos/$pedidoId');
            }
          }
        });
      }
    }
  });

  NotificationService().flutterLocalNotificationsPlugin.getNotificationAppLaunchDetails().then((details) {
    if (details != null && details.didNotificationLaunchApp) {
      final String? payload = details.notificationResponse?.payload;
      if (payload != null) {
        Future.delayed(const Duration(milliseconds: 1500), () {
          final context = rootNavigatorKey.currentContext;
          if (context != null) {
            rootNavigatorKey.currentContext?.push('/pedidos/$payload');
          }
        });
      }
    }
  });

  RealtimeChannel? _alarmaChannel;

  // Escuchar cuando llega un push mientras la app ESTÁ ABIERTA (Foreground)
  FirebaseMessaging.onMessage.listen((RemoteMessage message) async {
    debugPrint("🚨 [FCM FOREGROUND] NOTIFICACIÓN RECIBIDA CON APP ABIERTA");
    debugPrint("🚨 [FCM FOREGROUND] Payload Data: ${message.data}");
    
    // Si la notificación trae texto (ej. push de Admin), forzamos que baje el banner 
    // incluso si la app está abierta (exactamente como WhatsApp)
    if (message.notification != null) {
      NotificationService().showNotification(
        id: DateTime.now().millisecondsSinceEpoch.remainder(100000),
        title: message.notification!.title ?? 'Nueva Alerta',
        body: message.notification!.body ?? '',
        payload: message.data['pedido_id'] ?? message.data['id'] ?? message.data['pedidoId'],
      );
    }
    
    final String? pedidoId = message.data['pedido_id'] ?? message.data['id'];
    if (pedidoId != null) {
      final context = rootNavigatorKey.currentState?.overlay?.context ?? rootNavigatorKey.currentContext;
      if (context != null) {
        // Lógica exclusiva de repartidor
        final targetDriverId = message.data['target_driver_id'];
        final currentUserId = Supabase.instance.client.auth.currentUser?.id;
        if (currentUserId != null && targetDriverId == currentUserId) {
          OriginIslandService.startIsland('🚨 ¡VIAJE URGENTE!', 'Tienes 15 segundos para aceptar');
          
          try {
            await alarmPlayer.stop();
            await alarmPlayer.setVolume(1.0);
            await alarmPlayer.setReleaseMode(ReleaseMode.loop);
            await alarmPlayer.play(AssetSource('sounds/rappi_alarm.mp3'));
          } catch (e) {
            debugPrint('Error reproduciendo alarma: $e');
          }

          // Inyectamos el pedido en la cola visual (BottomSheet) desde el Push Notification
          // Esto garantiza que el modal aparezca aunque falle el websocket de Supabase
          OrderQueueService().enqueue(context, message.data);

          // Eliminado el go('/pedidos/$pedidoId') para que lo vean en la lista/mapa principal.
        }
      }
    }
  });

  // Solo suscribirnos a Realtime cuando el usuario ya tiene sesión válida
  Supabase.instance.client.auth.onAuthStateChange.listen((data) {
    final event = data.event;
    final currentUser = Supabase.instance.client.auth.currentUser;

    // Suscribir al repartidor a su canal privado de Firebase para recibir Alertas de Pedidos.
    // Usamos try-catch para evitar que si Firebase falla, se congele toda la aplicación.
    if (currentUser != null) {
      try {
        FirebaseMessaging.instance.subscribeToTopic('driver_${currentUser.id}');
        debugPrint('✅ [FCM TOPIC] Éxito: Suscrito al tópico: driver_${currentUser.id}');
      } catch (e) {
        debugPrint('❌ [FCM TOPIC] Error: No se pudo suscribir al tópico del repartidor: $e');
      }
    }

    if (currentUser != null && _alarmaChannel == null) {
      _alarmaChannel = Supabase.instance.client.channel('repartidores_ping');
      
      _alarmaChannel!.onBroadcast(
        event: 'order_offered',
        callback: (payload) async {
          final data = payload['payload'] ?? {};
          final targetDriverId = data['target_driver_id'] as String?;
          if (targetDriverId == null) return;
          if (targetDriverId != currentUser.id) return; // No es para este repartidor

          final pedidoId = data['pedido_id'] as String? ?? '';
          final restaurante = data['restaurante'] as String? ?? 'Estrella';

//           debugPrint('🛵 [ALARMA] order_offered recibido para este repartidor. Pedido: $pedidoId');

          final context = rootNavigatorKey.currentState?.overlay?.context ?? rootNavigatorKey.currentContext;
          if (context != null) {
            OrderQueueService().enqueue(context, data);
          } else {
            debugPrint('⚠️ [ALARMA] Context nulo, no se pudo encolar el pedido.');
          }
        }
      ).onBroadcast(
        event: 'order_canceled',
        callback: (payload) {
          final data = payload['payload'] ?? {};
          if (data['target_driver_id'] == currentUser.id) {
            stopAlarm();
          }
        }
      ).subscribe();


    } else if (currentUser == null && _alarmaChannel != null) {
      Supabase.instance.client.removeChannel(_alarmaChannel!);
      _alarmaChannel = null;
    }
  });


  SyncService().init();

  runApp(
    const ProviderScope(
      child: EstrellaAdminApp(),
    ),
  );
}

class EstrellaAdminApp extends ConsumerWidget {
  const EstrellaAdminApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeProvider);

    ThemeData activeTheme;
    switch (themeMode) {
      case AppThemeMode.light:
        activeTheme = AppTheme.light();
        break;
      case AppThemeMode.dark:
        activeTheme = AppTheme.dark();
        break;
      case AppThemeMode.amoled:
        activeTheme = AppTheme.amoled();
        break;
    }

    return MaterialApp.router(
      title: 'Estrella Admin',
      debugShowCheckedModeBanner: false,
      theme: activeTheme,
      routerConfig: router,
    );
  }
}

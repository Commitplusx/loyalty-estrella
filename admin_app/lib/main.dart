import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'core/theme.dart';
import 'core/theme_provider.dart';
import 'router.dart';

import 'services/sync_service.dart';
import 'services/notification_service.dart';

import 'package:audioplayers/audioplayers.dart';

import 'package:intl/date_symbol_data_local.dart';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

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
  await Firebase.initializeApp();
  debugPrint("Handling a background message: ${message.messageId}");
  
  if (message.data['tipo'] == 'pedido_asignado') {
    final restaurante = message.data['restaurante'] ?? 'Estrella';
    final pedidoId = message.data['pedido_id'] ?? '';
    
    // Inicializamos el plugin en este Isolate (sin pedir permisos UI)
    await NotificationService().init(isBackground: true);
    
    // Al ser un data-only push, disparamos la notificación local
    // que tiene configurado el fullScreenIntent para encender la pantalla.
    await NotificationService().showNotification(
      id: DateTime.now().millisecondsSinceEpoch.remainder(100000),
      title: '🛵 ¡NUEVO VIAJE ASIGNADO!',
      body: 'Recoger en: $restaurante\nTienes 15 segundos para aceptar.',
      payload: pedidoId,
    );
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('es');

  // Configurar audioplayers para que suene como ALARMA (salta el modo silencio/no molestar)
  final audioContext = AudioContext(
    android: const AudioContextAndroid(
      isSpeakerphoneOn: true,
      stayAwake: true,
      contentType: AndroidContentType.sonification,
      usageType: AndroidUsageType.alarm, // <--- CLAVE PARA SALTAR EL MODO SILENCIO
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
  
  // Inicializar Firebase
  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

  // Solicitar permisos para notificaciones (Android 13+ / iOS)
  await FirebaseMessaging.instance.requestPermission(
    alert: true,
    badge: true,
    sound: true,
  );

  // La suscripción a tópicos (admins vs driver) ahora se maneja dinámicamente en onAuthStateChange

  // Evitar que Google Fonts intente descargar fuentes en runtime (crash en release)
  GoogleFonts.config.allowRuntimeFetching = true;

  await Supabase.initialize(
    url: 'https://jdrrkpvodnqoljycixbg.supabase.co',
    anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ',
  );

  await NotificationService().init();

  // Escuchar cuando el usuario toca una notificación push real de Firebase
  FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
    stopAlarm(); // Detener alarma al abrir notificación
    final String? pedidoId = message.data['pedido_id'] ?? message.data['id'];
    if (pedidoId != null) {
      Future.delayed(const Duration(milliseconds: 500), () {
        final context = rootNavigatorKey.currentContext;
        if (context != null) {
          rootNavigatorKey.currentContext?.go('/pedidos/$pedidoId');
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
            rootNavigatorKey.currentContext?.go('/pedidos/$pedidoId');
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
            rootNavigatorKey.currentContext?.go('/pedidos/$payload');
          }
        });
      }
    }
  });

  RealtimeChannel? _alarmaChannel;

  // Escuchar cuando llega un push mientras la app ESTÁ ABIERTA (Foreground)
  FirebaseMessaging.onMessage.listen((RemoteMessage message) async {
    debugPrint("==== FOREGROUND FIREBASE PUSH RECEIVED ====");
    debugPrint("Data: ${message.data}");
    
    final String? pedidoId = message.data['pedido_id'] ?? message.data['id'];
    if (pedidoId != null) {
      final context = rootNavigatorKey.currentState?.overlay?.context ?? rootNavigatorKey.currentContext;
      if (context != null) {
        final email = Supabase.instance.client.auth.currentUser?.email ?? '';
        final isAdmin = email.toLowerCase().endsWith('@admin.com');
        
        if (isAdmin) {
          try {
            await alarmPlayer.stop(); // Stop previous
            await alarmPlayer.setVolume(1.0);
            await alarmPlayer.setReleaseMode(ReleaseMode.loop);
            await alarmPlayer.play(AssetSource('sounds/rappi_alarm.mp3'));
          } catch (e) {
            debugPrint('Error reproduciendo sonido admin: $e');
          }
          // El Admin solo necesita saber que hay un nuevo pedido
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('🔔 ¡Nuevo Pedido Entrante: ${message.notification?.title ?? "Desconocido"}!'),
              backgroundColor: Colors.blueAccent,
              duration: const Duration(seconds: 5),
              action: SnackBarAction(
                label: 'Ver',
                textColor: Colors.white,
                onPressed: () {
                  stopAlarm();
                  rootNavigatorKey.currentContext?.go('/pedidos/$pedidoId');
                },
              ),
            ),
          );
        } else {
          // Si es repartidor, mostramos la pantalla de detalle directamente
          final targetDriverId = message.data['target_driver_id'];
          final currentUserId = Supabase.instance.client.auth.currentUser?.id;
          if (currentUserId != null && targetDriverId == currentUserId) {
            rootNavigatorKey.currentContext?.go('/pedidos/$pedidoId');
          }
        }
      }
    }
  });

  // Solo suscribirnos a Realtime cuando el usuario ya tiene sesión válida
  Supabase.instance.client.auth.onAuthStateChange.listen((data) {
    final event = data.event;
    final currentUser = Supabase.instance.client.auth.currentUser;
    
    // Gestionar tópicos de FCM según el rol
    if (currentUser != null) {
      final email = currentUser.email ?? '';
      final isAdmin = email.toLowerCase().endsWith('@admin.com');
      
      if (isAdmin) {
        debugPrint('🔔 [FCM] Usuario es ADMIN. Suscribiendo al tópico global "admins"...');
        FirebaseMessaging.instance.subscribeToTopic('admins');
        FirebaseMessaging.instance.unsubscribeFromTopic('driver_${currentUser.id}');
      } else {
        debugPrint('🔔 [FCM] Usuario es REPARTIDOR. Suscribiendo al tópico privado "driver_${currentUser.id}"...');
        FirebaseMessaging.instance.subscribeToTopic('driver_${currentUser.id}');
        FirebaseMessaging.instance.unsubscribeFromTopic('admins');
      }
    } else {
      // Si cierra sesión, se desuscribe
      debugPrint('🔔 [FCM] Sesión cerrada. Limpiando suscripciones a tópicos FCM...');
      FirebaseMessaging.instance.unsubscribeFromTopic('admins');
    }

    if (currentUser != null && _alarmaChannel == null) {
      _alarmaChannel = Supabase.instance.client.channel('repartidores_ping');
      
      _alarmaChannel!.onBroadcast(
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

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
}

// Handler para notificaciones en segundo plano (App cerrada o minimizada)
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint("Handling a background message: ${message.messageId}");
  
  // Opcional: Reproducir sonido si es posible en este entorno aislado
  try {
    final player = AudioPlayer();
    player.setVolume(1.0);
    player.setReleaseMode(ReleaseMode.loop);
    await player.play(AssetSource('sounds/rappi_alarm.mp3'));
  } catch (e) {
    debugPrint('Error reproduciendo sonido en background: $e');
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

  // Suscribirse al canal de administradores para recibir los pushes globales
  await FirebaseMessaging.instance.subscribeToTopic('admins');

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
      final context = rootNavigatorKey.currentContext;
      if (context != null) {
        context.go('/pedidos/$pedidoId');
      }
    }
  });

  // Escuchar inserts (efectivo) y updates para ADMINS (opcional)
  Supabase.instance.client.channel('public:pedidos').onPostgresChanges(
    event: PostgresChangeEvent.all,
    schema: 'public',
    table: 'pedidos',
    callback: (payload) {
      // Los administradores o la tabla general pueden seguir reaccionando a esto si lo desean
      // Pero quitaremos la alarma global de aquí para los repartidores.
    },
  ).subscribe();

  // ── SISTEMA ROUND-ROBIN (ESCUCHA DE BROADCAST) ──
  bool _isOrderDialogShowing = false;

  Supabase.instance.client.channel('repartidores_ping').onBroadcast(
    event: 'order_offered',
    callback: (payload) async {
      final targetDriverId = payload['target_driver_id'];
      final pedidoId = payload['pedido_id'];
      final currentUser = Supabase.instance.client.auth.currentUser;
      
      // Si el ping es para MÍ
      if (currentUser != null && targetDriverId == currentUser.id) {
        NotificationService().showNotification(
          id: DateTime.now().millisecondsSinceEpoch.remainder(100000),
          title: '🛵 ¡Nuevo Viaje Asignado a ti!',
          body: 'Tienes 30 segundos para aceptar el pedido.',
        );

        try {
          alarmPlayer.setVolume(1.0);
          alarmPlayer.setReleaseMode(ReleaseMode.loop);
          alarmPlayer.play(AssetSource('sounds/rappi_alarm.mp3'));
        } catch (e) {
          debugPrint('Error reproduciendo sonido: $e');
        }

        // Mostrar Auto-Popup Gigante en la pantalla
        final context = rootNavigatorKey.currentContext;
        if (context != null && !_isOrderDialogShowing) {
          _isOrderDialogShowing = true;
          showDialog(
            context: context,
            barrierDismissible: false,
            builder: (ctx) => AlertDialog(
              backgroundColor: const Color(0xFF11998E),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
              title: const Column(
                children: [
                  Icon(Icons.electric_moped_rounded, size: 64, color: Colors.white),
                  SizedBox(height: 16),
                  Text('¡NUEVO PEDIDO!', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 28)),
                ],
              ),
              content: const Text(
                'Tienes 30 segundos para aceptar este viaje antes de que pase al siguiente repartidor.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white, fontSize: 16),
              ),
              actionsAlignment: MainAxisAlignment.center,
              actions: [
                TextButton(
                  onPressed: () async {
                    _isOrderDialogShowing = false;
                    stopAlarm();
                    Navigator.pop(ctx);
                    
                    // Fast Reject: Avisar al backend instantáneamente
                    try {
                      await Supabase.instance.client
                          .from('pedidos')
                          .update({'estado': 'rechazado'})
                          .eq('wb_message_id', pedidoId);
                    } catch (e) {
                      debugPrint('Error en Fast Reject: $e');
                    }
                  },
                  style: TextButton.styleFrom(foregroundColor: Colors.white70),
                  child: const Text('RECHAZAR', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
                ElevatedButton(
                  onPressed: () {
                    _isOrderDialogShowing = false;
                    stopAlarm();
                    Navigator.pop(ctx);
                    // Redirigir a la pestaña de pedidos para aceptarlo
                    context.go('/pedidos');
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: const Color(0xFF11998E),
                    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                    textStyle: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20),
                  ),
                  child: const Text('VER PEDIDO'),
                ),
              ],
            ),
          );
        }
      }
    }
  ).onBroadcast(
    event: 'order_canceled',
    callback: (payload) async {
      final targetDriverId = payload['target_driver_id'];
      final currentUser = Supabase.instance.client.auth.currentUser;
      // Si el tiempo se acabó o rechazó, apagamos la alarma remotamente
      if (currentUser != null && targetDriverId == currentUser.id) {
        stopAlarm();
        final context = rootNavigatorKey.currentContext;
        if (context != null && _isOrderDialogShowing) {
          _isOrderDialogShowing = false;
          Navigator.pop(context);
        }
      }
    }
  ).subscribe();

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

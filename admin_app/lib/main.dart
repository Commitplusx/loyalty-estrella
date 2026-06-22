import 'package:flutter/material.dart';
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
final AudioPlayer _alarmPlayer = AudioPlayer();

// Handler para notificaciones en segundo plano (App cerrada o minimizada)
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint("Handling a background message: ${message.messageId}");
  
  // Opcional: Reproducir sonido si es posible en este entorno aislado
  try {
    final player = AudioPlayer();
    player.setVolume(1.0);
    await player.play(AssetSource('sounds/alarm.ogg'));
  } catch (e) {
    debugPrint('Error reproduciendo sonido en background: $e');
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('es');
  
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
  GoogleFonts.config.allowRuntimeFetching = false;

  await Supabase.initialize(
    url: 'https://jdrrkpvodnqoljycixbg.supabase.co',
    anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ',
  );

  await NotificationService().init();

  // Escuchar inserts (efectivo) y updates (cuando pagan con tarjeta y pasa a pendiente)
  Supabase.instance.client.channel('public:pedidos').onPostgresChanges(
    event: PostgresChangeEvent.all,
    schema: 'public',
    table: 'pedidos',
    callback: (payload) {
      final newRecord = payload.newRecord;
      final oldRecord = payload.oldRecord;
      final eventType = payload.eventType;

      // Nos interesa si es un nuevo pedido en efectivo (insert -> pendiente)
      // O si es un pedido con tarjeta que acaba de ser pagado (update -> de pendiente_pago a pendiente)
      bool isNewOrder = false;
      if (eventType == 'INSERT' && newRecord['estado'] == 'pendiente') {
        isNewOrder = true;
      } else if (eventType == 'UPDATE' && newRecord['estado'] == 'pendiente' && oldRecord['estado'] != 'pendiente') {
        isNewOrder = true;
      }

      if (isNewOrder) {
        NotificationService().showNotification(
          id: DateTime.now().millisecondsSinceEpoch.remainder(100000),
          title: '🔔 ¡Nuevo Pedido!',
          body: 'De: ${newRecord['restaurante'] ?? 'Estrella'} - \$${newRecord['total'] ?? '0.0'}',
        );

        // ¡Reproducir alarma fuerte dentro de la app!
        try {
          _alarmPlayer.setVolume(1.0);
          _alarmPlayer.play(AssetSource('sounds/alarm.ogg'));
        } catch (e) {
          debugPrint('Error reproduciendo sonido: $e');
        }
      }
    },
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

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:go_router/go_router.dart';
import 'dart:typed_data';
import '../router.dart';

class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin = FlutterLocalNotificationsPlugin();

  Future<void> init({bool isBackground = false}) async {
    // Solicitar permiso POST_NOTIFICATIONS en Android 13+ (Solo si estamos en Foreground)
    if (!isBackground) {
      await Permission.notification.request();
    }

    // El ícono debe coincidir con el nombre de tu launcher_icon o agregar un ícono pequeño específico en drawable
    const AndroidInitializationSettings initializationSettingsAndroid =
        AndroidInitializationSettings('@mipmap/launcher_icon');

    const InitializationSettings initializationSettings = InitializationSettings(
      android: initializationSettingsAndroid,
    );

    await flutterLocalNotificationsPlugin.initialize(
      settings: initializationSettings,
      onDidReceiveNotificationResponse: (NotificationResponse notificationResponse) async {
        // Al tocar la notificación, apagar la alarma
        await flutterLocalNotificationsPlugin.cancelAll();
        
        if (notificationResponse.payload != null) {
          print('Notificación tocada con payload: ${notificationResponse.payload}');
          final context = rootNavigatorKey.currentContext;
          if (context != null) {
            context.go('/pedidos/${notificationResponse.payload}');
          }
        }
      },
    );

    // Crear un canal de alta importancia para despertar la pantalla
    const AndroidNotificationChannel channel = AndroidNotificationChannel(
      'driver_alarm_channel', // id
      'Alarmas de Pedidos (Repartidores)', // title
      description: 'Canal usado para despertar el teléfono cuando te asignan un pedido.', // description
      importance: Importance.max,
      playSound: true,
      sound: RawResourceAndroidNotificationSound('alarm'),
      enableVibration: true,
      enableLights: true,
    );

    await flutterLocalNotificationsPlugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);
  }

  Future<void> showNotification({
    required int id,
    required String title,
    required String body,
    String? payload,
  }) async {
    final AndroidNotificationDetails androidNotificationDetails = AndroidNotificationDetails(
      'driver_alarm_channel',
      'Alarmas de Pedidos (Repartidores)',
      channelDescription: 'Canal usado para despertar el teléfono cuando te asignan un pedido.',
      importance: Importance.max,
      priority: Priority.high,
      fullScreenIntent: true, // Esto despierta la pantalla
      sound: const RawResourceAndroidNotificationSound('alarm'),
      playSound: true,
      enableVibration: true,
      ticker: 'ticker',
      icon: '@mipmap/launcher_icon',
      // FLAG_INSISTENT (4): Reproducir el sonido en bucle hasta que se cierre o toque
      additionalFlags: Int32List.fromList(<int>[4]),
    );

    final NotificationDetails notificationDetails = NotificationDetails(
      android: androidNotificationDetails,
    );

    await flutterLocalNotificationsPlugin.show(
      id: id,
      title: title,
      body: body,
      notificationDetails: notificationDetails,
      payload: payload,
    );
  }
}

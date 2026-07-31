import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/dashboard_service.dart';
import '../widgets/friendly_error_widget.dart';
import 'driver_dashboard_view.dart';
import '../models/pedido_model.dart';
import 'package:go_router/go_router.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart' as mapbox;
import 'package:animate_do/animate_do.dart';
import 'package:shimmer/shimmer.dart';
import '../widgets/radar_scanner.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator_android/geolocator_android.dart';
import 'dart:async';
import '../services/repartidor_service.dart';
import 'driver_pedidos_screen.dart' show pedidosActivosProvider;
import '../main.dart' show stopAlarm;
import '../widgets/order_list_card.dart';
import 'package:battery_plus/battery_plus.dart';
import 'package:volume_controller/volume_controller.dart';
import '../core/ui_helpers.dart';
import '../core/connectivity_provider.dart';
import '../services/origin_island_service.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' as ll;
import 'package:shared_preferences/shared_preferences.dart';
import 'driver_guide_sheet.dart';
import '../core/theme.dart';
import 'driver_shell.dart';
import 'package:flutter/rendering.dart';


final driverStatsProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final userId = Supabase.instance.client.auth.currentUser?.id;
  if (userId == null) return {'servicios': 0, 'ganancias': 0.0, 'gratis': 0};
  return ref.read(dashboardServiceProvider).getDriverDailyStats(userId);
});

// (Google Maps style removed)

class DriverDashboardScreen extends ConsumerStatefulWidget {
  const DriverDashboardScreen({super.key});

  @override
  ConsumerState<DriverDashboardScreen> createState() => _DriverDashboardScreenState();
}

class _DriverDashboardScreenState extends ConsumerState<DriverDashboardScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _isOnline = false;
  String? _repartidorId;
  String _driverName = Supabase.instance.client.auth.currentUser?.userMetadata?['nombre'] ?? 
      Supabase.instance.client.auth.currentUser?.email?.split('@')[0] ?? 
      'Repartidor';
  
  StreamSubscription<Position>? _positionSubscription;
  Timer? _smartAssistantTimer;
  mapbox.MapboxMap? _mapboxMap;
  
  String _lastNotificationTitle = '';
  String _lastNotificationText = '';
  double _scrollDelta = 0;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(_onTabChanged);
    _checkOnboarding();
    _loadStatus();
  }

  void _onTabChanged() {
    _smartAssistantTimer?.cancel();
    
    // Si estamos en Nuevos (0)
    if (_tabController.index == 0) {
      final pedidosAsync = ref.read(pedidosActivosProvider);
      final pedidos = pedidosAsync.valueOrNull;
      
      if (pedidos != null) {
        final activos = pedidos.where((p) => ['asignado', 'en_camino', 'recibido'].contains(p.estado)).toList();
        if (activos.isNotEmpty) {
           _smartAssistantTimer = Timer(const Duration(seconds: 10), () {
             if (mounted && _tabController.index == 0 && ModalRoute.of(context)?.isCurrent == true) {
                 PremiumToast.show(
                   context,
                   title: '💡 Consejo Inteligente',
                   description: 'Tienes viajes activos. Ve a tu Itinerario para seguir la ruta.',
                   isError: false,
                   icon: Icons.lightbulb_outline_rounded,
                 );
             }
           });
           return;
        }
      }
      
      // Detección 2: En la pantalla de nuevos pero offline por 15s
      if (!_isOnline) {
         _smartAssistantTimer = Timer(const Duration(seconds: 15), () {
             if (mounted && _tabController.index == 0 && !_isOnline && ModalRoute.of(context)?.isCurrent == true) {
                 PremiumToast.show(
                   context,
                   title: '💡 Consejo Inteligente',
                   description: 'Activa tu conexión arriba (Online) para que te caigan viajes.',
                   isError: false,
                   icon: Icons.toggle_off_outlined,
                 );
             }
           });
      }
    }
  }

  Future<void> _checkOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    final hasSeen = prefs.getBool('has_seen_onboarding') ?? false;
    if (!hasSeen && mounted) {
      context.go('/onboarding');
    }
  }

  Future<void> _loadStatus() async {
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) return;
    
    // Forzar auto-link si el usuario acaba de iniciar sesión y no está vinculado
    await ref.read(repartidorServiceProvider).getRepartidorIdByUserId(userId);
    
    final res = await Supabase.instance.client
        .from('repartidores')
        .select('id, activo, nombre')
        .eq('user_id', userId)
        .maybeSingle();
        
    if (res != null && mounted) {
      setState(() {
        _repartidorId = res['id'];
        _isOnline = res['activo'] == true;
        if (res['nombre'] != null && res['nombre'].toString().trim().isNotEmpty) {
          _driverName = res['nombre'].toString().split(' ').first; // Solo el primer nombre
        }
      });
      if (_isOnline) {
        _startLocationTracking();
        OriginIslandService.toggleBackgroundService(true, repartidorId: _repartidorId);
      } else {
        OriginIslandService.toggleBackgroundService(false);
      }
    }
  }

  Future<bool> _startLocationTracking() async {
    bool serviceEnabled;
    LocationPermission permission;

    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return false;

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return false;
    }
    if (permission == LocationPermission.deniedForever) return false;

    try {
      Position? pos;
      try {
        pos = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
          timeLimit: const Duration(seconds: 4),
        );
      } catch (e) {
        debugPrint("Timeout o error al obtener GPS, usando fallback... $e");
        pos = await Geolocator.getLastKnownPosition();
      }

      int bat = 100;
      try { bat = await Battery().batteryLevel; } catch (_) {}
      
      if (_isOnline && _repartidorId != null && mounted) {
        ref.read(repartidorServiceProvider).updateStatus(
          _repartidorId!,
          true,
          lat: pos?.latitude ?? 0.0,
          lng: pos?.longitude ?? 0.0,
          bateria: bat,
        );
      }
    } catch (e) {
      debugPrint("Error GPS inicial crítico: $e");
    }

    _positionSubscription?.cancel();
    
    late LocationSettings locationSettings;
    if (defaultTargetPlatform == TargetPlatform.android) {
      locationSettings = AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
        forceLocationManager: true,
        intervalDuration: const Duration(seconds: 10),
      );
    } else {
      locationSettings = const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      );
    }

    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: locationSettings,
    ).listen((Position position) async {
      if (_isOnline && _repartidorId != null) {
        int bat = 100;
        try { bat = await Battery().batteryLevel; } catch (_) {}
        
        if (mounted) {
          ref.read(repartidorServiceProvider).updateStatus(
            _repartidorId!,
            true,
            lat: position.latitude,
            lng: position.longitude,
            bateria: bat,
          );

          // Actualizar mapa del dashboard en vivo si existe
          if (_mapboxMap != null && _tabController.index == 0) { // Solo si estamos en la pestaña de radar
            _mapboxMap!.easeTo(
              mapbox.CameraOptions(
                center: mapbox.Point(coordinates: mapbox.Position(position.longitude, position.latitude)),
                zoom: 17.5,
                pitch: 50.0,
                bearing: position.heading >= 0 ? position.heading : 0.0,
              ),
              mapbox.MapAnimationOptions(duration: 1000, startDelay: 0),
            );
          }
        }
      }
    });

    return true;
  }

  void _stopLocationTracking() {
    _positionSubscription?.cancel();
    _positionSubscription = null;
  }

  @override
  void dispose() {
    _smartAssistantTimer?.cancel();
    _stopLocationTracking();
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Escuchar cambios en la lista de pedidos para detener la alarma si se vacía la cola
    ref.listen<AsyncValue<List<PedidoModel>>>(pedidosActivosProvider, (previous, next) {
      if (next.hasValue) {
        final nextPoolOrders = next.value!.where((p) => 
            (p.estado == 'pendiente' || p.estado == 'preparando') && 
            (p.repartidorId == null || p.repartidorId == '')
        ).toList();
        
        final prevPoolOrders = previous?.value?.where((p) => 
            (p.estado == 'pendiente' || p.estado == 'preparando') && 
            (p.repartidorId == null || p.repartidorId == '')
        ).toList() ?? [];

        if (prevPoolOrders.isNotEmpty && nextPoolOrders.isEmpty) {
          stopAlarm();
        }

        // ★ Actualizar notificación persistente cuando cambia el estado de pedidos
        if (_isOnline && _repartidorId != null) {
          _updatePersistentNotification(next.value!);
        }
      }
    });

    // ★ Detectar reconexion a internet y avisar al usuario
    ref.listen<AsyncValue<bool>>(connectivityProvider, (previous, next) {
      final wasConnected = previous?.valueOrNull ?? true;
      final isNowConnected = next.valueOrNull ?? true;
      if (!wasConnected && isNowConnected && mounted) {
        // Acaba de volver el internet: refrescar datos y notificar
        ref.invalidate(pedidosActivosProvider);
        PremiumToast.show(
          context,
          title: '✅ ¡Internet restaurado!',
          description: 'Actualizando pedidos en tiempo real...',
          isError: false,
          icon: Icons.wifi_rounded,
        );
      }
    });

    final statsAsync = ref.watch(driverStatsProvider);
    final theme = Theme.of(context);
    final userName = Supabase.instance.client.auth.currentUser?.userMetadata?['nombre'] ?? 'Repartidor';

    return Scaffold(
      backgroundColor: Colors.white, // Fondo claro como el diseño
      body: Column(
        children: [
          // ── HEADER AMARILLO ──
          Container(
            padding: EdgeInsets.only(
              top: MediaQuery.of(context).padding.top + 20,
              left: 20,
              right: 20,
              bottom: 20,
            ),
            decoration: const BoxDecoration(
              color: Color(0xFFFFD000), // Amarillo característico
              borderRadius: BorderRadius.only(
                bottomLeft: Radius.circular(30),
                bottomRight: Radius.circular(30),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                  // ── USER INFO (Animated for scroll) ──
                  AnimatedCrossFade(
                    duration: const Duration(milliseconds: 400),
                    firstCurve: Curves.easeOutCubic,
                    secondCurve: Curves.easeInCubic,
                    sizeCurve: Curves.fastLinearToSlowEaseIn,
                    crossFadeState: ref.watch(isUiHiddenProvider) 
                        ? CrossFadeState.showSecond 
                        : CrossFadeState.showFirst,
                    secondChild: const SizedBox(width: double.infinity, height: 0),
                    firstChild: Column(
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Hola, ${_driverName.split(' ').first}',
                                      style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 26, color: Colors.black87),
                                    ),
                                    Text(
                                      '¿Listo para entregar\ncon Estrella Eats?',
                                      style: TextStyle(fontSize: 14, color: Colors.black87.withOpacity(0.7), height: 1.2),
                                    )
                                  ],
                                ),
                                Row(
                                  children: [
                                    GestureDetector(
                                      onTap: () {
                                        PremiumBottomSheet.showConfirm(
                                          context,
                                          title: 'Ayuda',
                                          content: '1. Mantente conectado para recibir pedidos.\n2. Ve a "Nuevos" para ver solicitudes.\n3. En "Activos" gestionas lo que ya tomaste.\n4. Cumple tus rachas para ganar bonos.',
                                          confirmText: 'Entendido',
                                        );
                                      },
                                      child: const Icon(Icons.help_outline, color: Colors.black87),
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      _isOnline ? 'Online' : 'Offline',
                                      style: TextStyle(fontWeight: FontWeight.bold, color: _isOnline ? Colors.green.shade800 : Colors.red.shade800),
                                    ),
                                    const SizedBox(width: 8),
                                    Switch(
                                      value: _isOnline,
                                      activeColor: Colors.green,
                                      activeTrackColor: Colors.green.shade200,
                                      inactiveThumbColor: Colors.red,
                                      inactiveTrackColor: Colors.red.shade100,
                                      onChanged: (val) async {
                                        // Logging of the original toggle logica
                                        if (val) {
                                          if (_repartidorId == null) {
                                            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Error: repartidor_id no disponible')));
                                            return;
                                          }
                                          try {
                                            final currentVolume = await VolumeController.instance.getVolume();
                                            if (currentVolume < 0.2) {
                                              if (context.mounted) {
                                                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('⚠️ Sube el volumen de tu celular para escuchar los pedidos.')));
                                              }
                                              return;
                                            }
                                          } catch (e) {
                                            debugPrint("Error leyendo volumen: $e");
                                          }
                                          final confirm = await PremiumBottomSheet.showConfirm(
                                            context,
                                            title: 'Lista de Verificación',
                                            content: 'Verifica que tienes el GPS encendido, batería suficiente y el volumen arriba antes de conectarte.',
                                            confirmText: 'SÍ, ESTOY LISTO',
                                            cancelText: 'AÚN NO',
                                          );
                                          if (confirm != true) return;
                                          
                                          setState(() => _isOnline = true);
                                          final success = await _startLocationTracking();
                                          if (!success) {
                                            setState(() => _isOnline = false);
                                            return;
                                          }
                                          try {
                                            await ref.read(repartidorServiceProvider).toggleActivo(_repartidorId!, true);
                                            // ★ AQUI: Iniciar el background service y pasarle el ID explicitamente
                                            OriginIslandService.toggleBackgroundService(true, repartidorId: _repartidorId);
                                          } catch (e) {}
                                        } else {
                                          setState(() => _isOnline = false);
                                          try {
                                            await ref.read(repartidorServiceProvider).toggleActivo(_repartidorId!, false);
                                            _stopLocationTracking();
                                            OriginIslandService.stopIsland();
                                            OriginIslandService.toggleBackgroundService(false);
                                            if (context.mounted) {
                                              PremiumToast.show(context, title: '¡Desconectado!', description: 'Has finalizado tu turno exitosamente.', icon: Icons.power_settings_new);
                                            }
                                          } catch (e) {
                                            setState(() => _isOnline = true);
                                          }
                                        }
                                      },
                                    ),
                                  ],
                                )
                              ],
                            ),
                            // ── GAMIFICACIÓN (RACHAS) ──
                            Builder(
                              builder: (context) {
                                final stats = statsAsync.valueOrNull;
                                final streak = stats?['servicios'] as int? ?? 0;
                                final milestone = ((streak ~/ 5) + 1) * 5;
                                final isMilestoneHit = streak > 0 && (streak % 5 == 0);
                                final progress = isMilestoneHit ? 1.0 : (streak % 5) / 5.0;
                                final remaining = isMilestoneHit ? 0 : milestone - streak;
                                
                                return Container(
                                  margin: const EdgeInsets.only(top: 20),
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(20),
                                    boxShadow: [
                                      BoxShadow(color: const Color(0xFFFF6B35).withOpacity(0.15), blurRadius: 15, offset: const Offset(0, 8))
                                    ],
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Text(isMilestoneHit ? '🏆' : '🔥', style: const TextStyle(fontSize: 20)),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: Text(
                                              streak == 0 
                                                  ? '¡Inicia tu racha de hoy!' 
                                                  : (isMilestoneHit ? '¡Nivel Completado! ($streak entregas)' : '¡Racha de $streak entregas!'),
                                              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14, color: Colors.black87),
                                            ),
                                          ),
                                          if (remaining > 0)
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                              decoration: BoxDecoration(
                                                color: const Color(0xFFFF6B35).withOpacity(0.1),
                                                borderRadius: BorderRadius.circular(10),
                                              ),
                                              child: Text(
                                                '$remaining para bono',
                                                style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 11, color: Color(0xFFFF6B35)),
                                              ),
                                            ),
                                        ],
                                      ),
                                      const SizedBox(height: 12),
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(10),
                                        child: LinearProgressIndicator(
                                          value: progress,
                                          minHeight: 10,
                                          backgroundColor: Colors.grey.shade100,
                                          valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFFFF6B35)),
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              }
                            ),
                            const SizedBox(height: 20),
                          ],
                        ),
                  ),
                  // ── TABS (Siempre visibles) ──
                  Container(
                    height: 45,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.5),
                      borderRadius: BorderRadius.circular(25),
                    ),
                    child: TabBar(
                      controller: _tabController,
                      indicatorSize: TabBarIndicatorSize.tab,
                      indicator: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(25),
                        boxShadow: [
                          BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 4, offset: const Offset(0, 2))
                        ],
                      ),
                      labelColor: Colors.black,
                      unselectedLabelColor: Colors.black54,
                      labelStyle: const TextStyle(fontWeight: FontWeight.bold),
                      dividerColor: Colors.transparent,
                      tabs: const [
                        Tab(text: 'Nuevos'),
                        Tab(text: 'Activos'),
                        Tab(text: 'Itinerario'),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            
            // ── TAB VIEWS ──
            Expanded(
              child: NotificationListener<ScrollUpdateNotification>(
                onNotification: (notification) {
                  if (notification.metrics.axis == Axis.vertical && notification.scrollDelta != null) {
                    // Ignorar scrolls automáticos o de inercia/rebote. SOLO al tacto.
                    if (notification.dragDetails == null) return false;

                    final delta = notification.scrollDelta!;
                    
                    // Reiniciar acumulador si cambiamos de dirección
                    if ((_scrollDelta > 0 && delta < 0) || (_scrollDelta < 0 && delta > 0)) {
                      _scrollDelta = 0;
                    }
                    
                    _scrollDelta += delta;

                    // Si scrolleamos hacia abajo más de 60px
                    if (_scrollDelta > 60) {
                      if (!ref.read(isUiHiddenProvider)) {
                        ref.read(isUiHiddenProvider.notifier).state = true;
                      }
                    } 
                    // Si scrolleamos hacia arriba más de 60px
                    else if (_scrollDelta < -60) {
                      if (ref.read(isUiHiddenProvider)) {
                        ref.read(isUiHiddenProvider.notifier).state = false;
                      }
                    }
                  }
                  return false;
                },
                child: TabBarView(
                  controller: _tabController,
                  physics: const NeverScrollableScrollPhysics(), // Deshabilitar swipe para no chocar con el mapa
                  children: [
                    // TAB 1: NEW
                    _buildOrderList(context, ref, ['pendiente', 'ofrecido', 'buscando_repartidor']),
                    
                    // TAB 2: ACTIVE
                    _buildOrderList(context, ref, ['asignado', 'en_camino', 'recibido']),
                    
                    // TAB 3: ITINERARIO COMPLETO
                    const DriverDashboardView(),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// Actualiza el texto de la notificación persistente según el estado actual,
  /// siendo inteligente e indicando el siguiente paso.
  void _updatePersistentNotification(List<PedidoModel> pedidos) {
    final activos = pedidos.where((p) => ['asignado', 'en_camino', 'recibido'].contains(p.estado)).toList();
    final pendientes = pedidos.where((p) => ['pendiente', 'preparando', 'ofrecido'].contains(p.estado)).toList();

    String titulo;
    String texto;

    if (activos.isNotEmpty) {
      final porRecoger = activos.where((p) => p.estado == 'asignado' || p.estado == 'en_camino').toList();
      final enRutaCliente = activos.where((p) => p.estado == 'recibido').toList();

      if (activos.length == 1) {
        titulo = 'Viaje en curso (1 pedido)';
      } else {
        titulo = 'Ruta activa (${activos.length} pedidos)';
      }
      
      if (porRecoger.isNotEmpty) {
        final current = porRecoger.first;
        final restaurante = current.restaurante ?? 'Restaurante';
        texto = '📍 Dirígete a recoger a $restaurante';
      } else if (enRutaCliente.isNotEmpty) {
        final current = enRutaCliente.first;
        final destino = current.direccion ?? 'el destino';
        texto = '🚚 Entregando en $destino';
      } else {
        texto = '📦 Tienes ${activos.length} pedidos en curso';
      }
    } else if (pendientes.isNotEmpty) {
      titulo = 'Estrella Delivery';
      texto = '🔔 ${pendientes.length} viaje${pendientes.length != 1 ? 's' : ''} esperando repartidor';
    } else {
      titulo = 'Estrella Delivery';
      texto = '🟢 Buscando pedidos cercanos...';
    }

    // Evitar actualizaciones redundantes que hacen "parpadear" la notificación
    if (titulo == _lastNotificationTitle && texto == _lastNotificationText) {
      return;
    }
    
    _lastNotificationTitle = titulo;
    _lastNotificationText = texto;

    OriginIslandService.toggleBackgroundService(true, repartidorId: _repartidorId).then((_) {
      OriginIslandService.updateIsland(titulo, texto);
    });
  }

  Widget _buildOrderList(BuildContext context, WidgetRef ref, List<String> targetStates) {
    final pedidosAsync = ref.watch(pedidosActivosProvider);
    final isNew = targetStates.contains('ofrecido') || targetStates.contains('pendiente');

    Future<void> onRefresh() async {
      ref.invalidate(pedidosActivosProvider);
      // Esperar un momento para que el provider se actualice
      await Future.delayed(const Duration(milliseconds: 800));
    }

    final pedidos = pedidosAsync.valueOrNull;
    final allPedidos = pedidosAsync.valueOrNull ?? []; // Para extraer todos los hotspots reales

    if (pedidos != null) {
      final filtered = pedidos.where((p) => targetStates.contains(p.estado)).toList();
      
      if (filtered.isEmpty) {
        if (isNew) {
          if (!_isOnline) {
            return RefreshIndicator(
              onRefresh: onRefresh,
              color: const Color(0xFFFF6B35),
              child: ListView(
                children: const [
                  SizedBox(height: 200),
                  Center(child: Text('Estás desconectado.', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.black54))),
                ],
              ),
            );
          }
          // Radar State for "Nuevos" with Heatmap
          return RefreshIndicator(
            onRefresh: onRefresh,
            color: const Color(0xFFFF6B35),
            child: Stack(
              children: [
                // Mapbox Background
                mapbox.MapWidget(
                  key: const ValueKey('dashboardMap'),
                  cameraOptions: mapbox.CameraOptions(
                    center: mapbox.Point(coordinates: mapbox.Position(-92.1345, 16.2519)), // Comitán fallback
                    zoom: 17.5,
                    pitch: 50.0,
                  ),
                  styleUri: 'mapbox://styles/mapbox/streets-v12', // Estilo limpio sin líneas de tráfico verdes
                  onMapCreated: (mapboxMap) async {
                    // Activar el punto azul (Puck) con brújula
                    await mapboxMap.location.updateSettings(mapbox.LocationComponentSettings(
                      enabled: true,
                      pulsingEnabled: true,
                      puckBearingEnabled: true,
                      puckBearing: mapbox.PuckBearing.HEADING,
                    ));
                    
                    // Centrar cámara en la ubicación real del repartidor
                    try {
                      final pos = await Geolocator.getCurrentPosition(
                        desiredAccuracy: LocationAccuracy.high,
                        timeLimit: const Duration(seconds: 3),
                      );
                      // Transición cinemática y fluida hacia la ubicación
                      mapboxMap.flyTo(
                        mapbox.CameraOptions(
                          center: mapbox.Point(coordinates: mapbox.Position(pos.longitude, pos.latitude)),
                          zoom: 17.5, 
                          pitch: 50.0, 
                          bearing: pos.heading >= 0 ? pos.heading : 0.0,
                        ),
                        mapbox.MapAnimationOptions(duration: 2500),
                      );
                    } catch (_) {
                      // Si falla o tarda, intentamos con la última conocida
                      final lastPos = await Geolocator.getLastKnownPosition();
                      if (lastPos != null) {
                        mapboxMap.flyTo(
                          mapbox.CameraOptions(
                            center: mapbox.Point(coordinates: mapbox.Position(lastPos.longitude, lastPos.latitude)),
                            zoom: 17.5,
                            pitch: 50.0,
                            bearing: lastPos.heading >= 0 ? lastPos.heading : 0.0,
                          ),
                          mapbox.MapAnimationOptions(duration: 2500),
                        );
                      }
                    }
                  },
                ),
                // Capa para difuminar un poco el mapa y que el texto sea legible (ahora ignora toques)
                IgnorePointer(
                  child: Container(
                    color: Colors.white.withOpacity(0.2),
                  ),
                ),

                // Radar de búsqueda animado centrado en el mapa (ahora ignora toques)
                const IgnorePointer(
                  child: Center(
                    child: RadarScanner(size: 350.0),
                  ),
                ),
                
                // Radar Icon / Searching State (Sleek, Premium, Uber-like)
                Positioned(
                  top: 24,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: FadeInDown(
                      duration: const Duration(milliseconds: 500),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                        decoration: BoxDecoration(
                          color: Colors.black87,
                          borderRadius: BorderRadius.circular(30),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.2),
                              blurRadius: 15,
                              offset: const Offset(0, 5),
                            )
                          ],
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            // Elegant glowing dot (Radar indicator)
                            FadeIn(
                              duration: const Duration(milliseconds: 1000),
                              child: Container(
                                width: 10,
                                height: 10,
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFF6B35), // Naranja corporativo
                                  shape: BoxShape.circle,
                                  boxShadow: [
                                    BoxShadow(
                                      color: const Color(0xFFFF6B35).withOpacity(0.5),
                                      blurRadius: 6,
                                      spreadRadius: 2,
                                    )
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            const Text(
                              'Buscando viajes cercanos...',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                                letterSpacing: 0.2,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                
                // Overlay text at the bottom to instruct the driver
                Positioned(
                  bottom: 120,
                  left: 20,
                  right: 20,
                  child: FadeInUp(
                    delay: const Duration(milliseconds: 300),
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.95),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.grey.withOpacity(0.2)),
                        boxShadow: [
                          BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, -2))
                        ]
                      ),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFF6B35).withOpacity(0.1),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.local_fire_department_rounded, color: Color(0xFFFF6B35)),
                          ),
                          const SizedBox(width: 16),
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Muévete a zonas de alta demanda', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                                SizedBox(height: 2),
                                Text('Dirígete a las zonas naranjas para recibir pedidos más rápido.', style: TextStyle(color: Colors.black54, fontSize: 12)),
                              ],
                            ),
                          )
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: onRefresh,
          color: const Color(0xFFFF6B35),
          child: ListView(
            children: const [
              SizedBox(height: 200),
              Center(child: Text('No hay pedidos activos.', style: TextStyle(color: Colors.grey))),
            ],
          ),
        );
      }

      return RefreshIndicator(
        onRefresh: onRefresh,
        color: const Color(0xFFFF6B35),
        child: ListView.builder(
          padding: const EdgeInsets.only(top: 20, bottom: 100),
          itemCount: filtered.length,
          itemBuilder: (ctx, i) {
            final pedido = filtered[i];
            
            return FadeInUp(
              delay: Duration(milliseconds: i * 50),
              duration: const Duration(milliseconds: 400),
              child: OrderListCard(
                pedido: pedido,
                isActiveTab: !isNew,
              onAccept: () async {
                HapticFeedback.heavyImpact();
                stopAlarm();
                try {
                  final userId = Supabase.instance.client.auth.currentUser?.id;
                  
                  // FASE 2: Llamada RPC atómica al backend
                  final dynamic response = await Supabase.instance.client.rpc(
                    'aceptar_pedido_atomico', 
                    params: {
                      'p_pedido_id': pedido.id,
                      'p_repartidor_id': userId,
                    }
                  );
                  
                  final bool exito = response == true;
                  
                  if (context.mounted) {
                    if (exito) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('✅ Pedido Aceptado exitosamente'))
                      );
                      _tabController.animateTo(1);
                    } else {
                      // El backend nos rechazó la aceptación (QStash nos lo quitó o alguien más ganó)
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('⚠️ El pedido ya fue tomado o tu tiempo expiró.'),
                          backgroundColor: Colors.redAccent,
                          duration: Duration(seconds: 4),
                        )
                      );
                      // Forzamos el refresco para quitarlo de pantalla
                      ref.invalidate(pedidosActivosProvider);
                    }
                  }
                } catch (e) {
                  debugPrint('Error accept atómico: $e');
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Hubo un error de conexión, intenta de nuevo.'))
                    );
                  }
                }
              },
              onDecline: () async {
                HapticFeedback.lightImpact();
                stopAlarm();
                try {
                  await Supabase.instance.client
                      .from('pedidos')
                      .update({'estado': 'pendiente', 'repartidor_id': null})
                      .eq('id', pedido.id);
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pedido Rechazado')));
                  }
                } catch (e) {
                  debugPrint('Error decline: $e');
                }
              },
              onTap: () {
                HapticFeedback.selectionClick();
                context.push('/pedidos/${pedido.id}');
              },
            ),
          );
          },
        ),
      );
    } else if (pedidosAsync.hasError) {
      return RefreshIndicator(
        onRefresh: onRefresh,
        color: const Color(0xFFFF6B35),
        child: ListView(
          children: [
            const SizedBox(height: 120),
            Center(
              child: Column(
                children: [
                  Icon(Icons.wifi_off_rounded, size: 48, color: Colors.grey.shade400),
                  const SizedBox(height: 16),
                  const Text('Error al cargar', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.black54)),
                  const SizedBox(height: 8),
                  Text('${pedidosAsync.error}', style: const TextStyle(fontSize: 13, color: Colors.black38), textAlign: TextAlign.center),
                ],
              ),
            ),
          ],
        ),
      );
    } else {
      return ListView.builder(
        padding: const EdgeInsets.only(top: 20),
        itemCount: 4,
        itemBuilder: (_, __) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
          child: Shimmer.fromColors(
            baseColor: Colors.grey.shade200,
            highlightColor: Colors.white,
            child: Container(
              height: 140,
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
            ),
          ),
        ),
      );
    }
  }
}

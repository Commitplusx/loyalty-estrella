import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:battery_plus/battery_plus.dart';
import 'package:volume_controller/volume_controller.dart';
import '../services/repartidor_service.dart';
import '../core/supabase_config.dart';
import '../core/theme_provider.dart';

import 'package:geolocator/geolocator.dart';
import 'package:animate_do/animate_do.dart';
import 'package:shimmer/shimmer.dart';
import 'package:go_router/go_router.dart';

class DriverDashboardView extends ConsumerStatefulWidget {
  final Map<String, dynamic>? stats;
  const DriverDashboardView({super.key, this.stats});

  @override
  ConsumerState<DriverDashboardView> createState() => _DriverDashboardViewState();
}

class _DriverDashboardViewState extends ConsumerState<DriverDashboardView> with WidgetsBindingObserver, TickerProviderStateMixin {
  static bool? _cachedIsOnline;
  static LatLng? _cachedLocation;
  static String? _cachedRepartidorId;
  static String? _cachedNombre;

  late bool _isOnline;
  bool _isPressed = false;
  bool _sosSending = false;
  String? _repartidorId;
  String _repartidorNombre = '';
  late LatLng _currentLocation;
  
  // Novedades para el tracker e Inteligencia
  List<Map<String, dynamic>> _pedidosActivos = [];
  StreamSubscription<Position>? _positionStream;
  final MapController _mapController = MapController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _isOnline = _cachedIsOnline ?? false;
    _currentLocation = _cachedLocation ?? const LatLng(16.2519, -92.1345);
    _repartidorId = _cachedRepartidorId;
    // Pre-cargar nombre desde caché para que el SOS funcione aunque no haya terminado el fetch
    _repartidorNombre = _cachedNombre ??
        (supabase.auth.currentUser?.email?.split('@').first ?? '');
    _loadStatusSilently();
  }

  // Animación Suave del Mapa
  void _animatedMapMove(LatLng destLocation, double destZoom) {
    final latTween = Tween<double>(begin: _mapController.camera.center.latitude, end: destLocation.latitude);
    final lngTween = Tween<double>(begin: _mapController.camera.center.longitude, end: destLocation.longitude);
    final zoomTween = Tween<double>(begin: _mapController.camera.zoom, end: destZoom);

    final controller = AnimationController(duration: const Duration(milliseconds: 1000), vsync: this);
    final Animation<double> animation = CurvedAnimation(parent: controller, curve: Curves.fastOutSlowIn);

    controller.addListener(() {
      _mapController.move(
        LatLng(latTween.evaluate(animation), lngTween.evaluate(animation)),
        zoomTween.evaluate(animation),
      );
    });

    animation.addStatusListener((status) {
      if (status == AnimationStatus.completed || status == AnimationStatus.dismissed) {
        controller.dispose();
      }
    });

    controller.forward();
  }

  Future<void> _loadStatusSilently() async {
    final statusData = await ref.read(repartidorServiceProvider).getCurrentStatus();
    
    // Extracciones de seguridad
    final isOnlineBD = statusData['activo'] ?? false;
    final repIdBD = statusData['id'];
    
    // Attempt to get location and start stream
    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.whileInUse || permission == LocationPermission.always) {
        final pos = await Geolocator.getCurrentPosition();
        _currentLocation = LatLng(pos.latitude, pos.longitude);
        _cachedLocation = _currentLocation;
        
        // Sincronización inicial obligatoria si está en línea (para que funcione el algoritmo aunque no se mueva)
        if (isOnlineBD && repIdBD != null) {
          debugPrint('📍 Sincronizando ubicación inicial a Supabase: \${pos.latitude}, \${pos.longitude}');
          ref.read(repartidorServiceProvider).updateStatus(
            repIdBD,
            true,
            lat: pos.latitude,
            lng: pos.longitude,
          );
        }

        // Suscribirse a cambios de ubicación en vivo
        _positionStream = Geolocator.getPositionStream(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 5, // Notificar cada 5 metros
          ),
        ).listen((Position position) {
          if (mounted) {
            setState(() {
              _currentLocation = LatLng(position.latitude, position.longitude);
              _cachedLocation = _currentLocation;
            });
            _animatedMapMove(_currentLocation, 15);
            // Si está online, actualizamos silenciosamente en Supabase para que el RPC de asignación lo encuentre
            if (_isOnline && _repartidorId != null) {
              ref.read(repartidorServiceProvider).updateStatus(
                _repartidorId!,
                true,
                lat: position.latitude,
                lng: position.longitude,
              );
            }
          }
        });
      }
    } catch (e) {
      debugPrint("Could not get location: $e");
    }

      if (mounted) {
        setState(() {
          _isOnline = statusData['activo'] ?? false;
          _repartidorId = statusData['id'];
          // Usar nombre de la BD; si viene vacío, caer en el email del auth
          final nombreBD = statusData['nombre'] as String? ?? '';
          _repartidorNombre = nombreBD.isNotEmpty
              ? nombreBD
              : (supabase.auth.currentUser?.email?.split('@').first ?? 'Repartidor');
          _cachedIsOnline = _isOnline;
          _cachedRepartidorId = _repartidorId;
          _cachedNombre = _repartidorNombre; // guardar en caché estática
        });

        // 🚨 Inteligencia: Buscar si el repartidor tiene algún pedido activo pendiente
        if (_repartidorId != null) {
          await _checkPedidoActivo();
          
          // Ya no forzamos apagar el turno. Si el servidor dice que está en línea, se queda en línea.
        }
      }
    }

  Future<void> _checkPedidoActivo() async {
    try {
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) {
        debugPrint('🚨 Inteligencia: No hay usuario autenticado (auth.currentUser?.id es null).');
        return;
      }
      
      debugPrint('🚨 Inteligencia: Buscando pedidos activos para auth_id: $userId');

      final data = await supabase
          .from('pedidos')
          .select()
          .eq('repartidor_id', userId)
          .inFilter('estado', ['pendiente', 'asignado', 'aceptado', 'en_cocina', 'listo_para_recoger', 'recibido', 'en_camino'])
          .order('created_at', ascending: false)
          .limit(5); // Soporte para Stacked Orders (Cola de Trabajo)

      if (mounted && data != null) {
        final pedidosList = List<Map<String, dynamic>>.from(data as List<dynamic>);
        debugPrint('🚨 Inteligencia: ¡${pedidosList.length} pedidos activos en la cola!');
        setState(() {
          _pedidosActivos = pedidosList;
        });
        // AUTO-NAVEGACIÓN REMOVIDA
        // El repartidor ahora ve su cola de trabajo (Stacked Orders) en el Dashboard
        // y decide a cuál pedido entrar manualmente, dándole control total sobre su ruta.
      } else {
        if (mounted) {
          setState(() {
            _pedidosActivos = [];
          });
        }
        debugPrint('🚨 Inteligencia: Ningún pedido activo en curso.');
      }
    } catch (e) {
      debugPrint('🚨 Inteligencia: Error buscando pedido activo: $e');
    }
  }
  // === ESTADO DE MÁQUINA (NEXT STOP LOGIC) ===
  Map<String, dynamic>? _calcularProximaParada() {
    if (_pedidosActivos.isEmpty) return null;

    Map<String, dynamic>? bestStop;
    double minDistance = double.infinity;

    for (var pedido in _pedidosActivos) {
      final estado = pedido['estado'];
      final bool isPickup = ['asignado', 'aceptado', 'en_cocina', 'listo_para_recoger'].contains(estado);
      final bool isDropoff = estado == 'en_camino';

      if (!isPickup && !isDropoff) continue;

      double targetLat = 0.0;
      double targetLng = 0.0;
      String actionText = '';
      String title = '';
      String subtitle = '';

      if (isPickup) {
        // Datos del Restaurante
        final rest = pedido['restaurante'];
        if (rest is Map) {
          targetLat = (rest['lat'] ?? 0.0).toDouble();
          targetLng = (rest['lng'] ?? 0.0).toDouble();
          title = rest['nombre_comercial'] ?? 'Restaurante';
        } else {
          title = rest?.toString() ?? 'Restaurante';
        }
        subtitle = 'Recoger Pedido #${pedido['id'].toString().substring(0, 4)}';
        actionText = 'IR A RECOGER';
      } else if (isDropoff) {
        // Datos del Cliente (Privacidad: Se oculta el nombre)
        targetLat = (pedido['lat_cliente'] ?? pedido['lat'] ?? 0.0).toDouble();
        targetLng = (pedido['lng_cliente'] ?? pedido['lng'] ?? 0.0).toDouble();
        title = 'Cliente'; 
        subtitle = 'Entregar en: ${pedido['direccion'] ?? 'Ubicación'}';
        actionText = 'IR A ENTREGAR';
      }

      if (targetLat == 0.0 || targetLng == 0.0) {
         if (bestStop == null) {
            bestStop = {'pedido': pedido, 'action': actionText, 'title': title, 'subtitle': subtitle, 'targetLat': targetLat, 'targetLng': targetLng, 'isPickup': isPickup};
         }
         continue;
      }

      final distance = Geolocator.distanceBetween(_currentLocation.latitude, _currentLocation.longitude, targetLat, targetLng);

      if (distance < minDistance) {
        minDistance = distance;
        bestStop = {'pedido': pedido, 'action': actionText, 'title': title, 'subtitle': subtitle, 'targetLat': targetLat, 'targetLng': targetLng, 'distance': distance, 'isPickup': isPickup};
      }
    }
    return bestStop;
  }
  // ===========================================

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _positionStream?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _isOnline) {
      _syncLocationBackground();
    }
  }

  Future<void> _syncLocationBackground() async {
    try {
      final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
      final battery = await Battery().batteryLevel;
      if (_repartidorId != null) {
        await ref.read(repartidorServiceProvider).updateStatus(
          _repartidorId!,
          true,
          lat: pos.latitude,
          lng: pos.longitude,
          bateria: battery,
        );
      }
    } catch (e) {
      debugPrint("Fallo al sincronizar GPS/Batería en background: $e");
    }
  }

  Future<int?> _mostrarTipsInicio() async {
    return await showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Theme.of(context).cardColor,
        title: const Text('💡 ¿Cuánto dinero traes?', style: TextStyle(fontWeight: FontWeight.bold)),
        content: const Text('Para poder dar cambio, necesitamos saber con cuánto efectivo empiezas tu turno.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, 0), child: const Text('Nada', style: TextStyle(color: Colors.grey))),
          TextButton(onPressed: () => Navigator.pop(ctx, 200), child: Text('\$200', style: TextStyle(color: Theme.of(context).colorScheme.secondary))),
          TextButton(onPressed: () => Navigator.pop(ctx, 500), child: Text('\$500', style: TextStyle(color: Theme.of(context).colorScheme.secondary))),
        ],
      ),
    );
  }

  Future<int?> _checkInitialLocation() async {
    // 1. Obtener Batería
    final battery = Battery();
    int batteryLevel = 0;
    try {
      batteryLevel = await battery.batteryLevel;
    } catch (e) {
      debugPrint("Error battery: $e");
    }

    // 2. Obtener GPS
    bool gpsEnabled = false;
    try {
      gpsEnabled = await Geolocator.isLocationServiceEnabled();
      if (gpsEnabled) {
         LocationPermission permission = await Geolocator.checkPermission();
         gpsEnabled = permission == LocationPermission.whileInUse || permission == LocationPermission.always;
      }
    } catch (e) {
      debugPrint("Error GPS: $e");
    }

    // 3. Obtener Volumen
    double currentVolume = 0.0;
    try {
      currentVolume = await VolumeController.instance.getVolume();
    } catch (e) {
      debugPrint("Error volume: $e");
    }
    final isVolumeOk = currentVolume > 0.2; // Más de 20% de volumen

    if (!mounted) return null;

    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        bool isLoading = false;
        return StatefulBuilder(
          builder: (context, setStateDialog) {
            return Dialog(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Icono animado
                    Container(
                      width: 72, height: 72,
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withOpacity(0.12),
                        shape: BoxShape.circle,
                      ),
                      child: isLoading 
                        ? const CircularProgressIndicator(color: Color(0xFF10B981))
                        : const Icon(Icons.emoji_events_rounded, color: Color(0xFF10B981), size: 36),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      isLoading ? 'Conectando...' : '¡Listo para salir, ${_repartidorNombre.split(' ').first}! 🛵',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      isLoading ? 'Preparando tu GPS y perfil...' : 'Revisión antes del turno:',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                    ),
                    const SizedBox(height: 20),
                    _TipItem(
                      icon: Icons.battery_charging_full_rounded, 
                      color: batteryLevel >= 15 ? const Color(0xFF10B981) : Colors.red, 
                      text: 'Batería: $batteryLevel%',
                      isCheck: batteryLevel >= 15,
                    ),
                    _TipItem(
                      icon: Icons.location_on_rounded, 
                      color: gpsEnabled ? const Color(0xFF3B82F6) : Colors.red, 
                      text: gpsEnabled ? 'Ubicación GPS activada' : 'Falta activar GPS o permisos',
                      isCheck: gpsEnabled,
                    ),
                    _TipItem(
                      icon: Icons.volume_up_rounded, 
                      color: isVolumeOk ? const Color(0xFF8B5CF6) : Colors.red, 
                      text: isVolumeOk ? 'Volumen adecuado (${(currentVolume * 100).toInt()}%)' : 'Celular en silencio o volumen muy bajo',
                      isCheck: isVolumeOk,
                    ),
                    const _TipItem(icon: Icons.two_wheeler_rounded, color: Color(0xFFF59E0B), text: 'Vehículo con combustible'),
                    const _TipItem(icon: Icons.wallet_rounded, color: Color(0xFFF43F5E), text: 'Efectivo para pagos y vueltos'),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: isLoading ? null : () async {
                           if (!gpsEnabled) {
                              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Activa tu GPS y acepta los permisos primero.'), backgroundColor: Colors.red));
                              return;
                           }
                           if (!isVolumeOk) {
                              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Por favor, sube el volumen para escuchar los nuevos pedidos.'), backgroundColor: Colors.orange));
                              return;
                           }
                           
                           setStateDialog(() => isLoading = true);
                           // Simular tiempo de conexión para dar feedback visual (5 segundos)
                           await Future.delayed(const Duration(milliseconds: 5000));
                           if (ctx.mounted) {
                             Navigator.pop(ctx, true);
                           }
                        },
                        icon: isLoading 
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Icon(Icons.rocket_launch_rounded),
                        label: Text(
                          isLoading ? 'Iniciando turno...' : '¡Todo listo, iniciar turno!', 
                          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15)
                        ),
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF10B981),
                          disabledBackgroundColor: const Color(0xFF10B981).withOpacity(0.5),
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextButton(
                      onPressed: isLoading ? null : () => Navigator.pop(ctx, false),
                      child: Text('Cancelar', style: TextStyle(color: isLoading ? Colors.grey[400] : Colors.grey[500], fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ),
            );
          }
        );
      },
    );
    return result == true ? batteryLevel : null;
  }

  Future<void> _toggleStatus(bool value) async {
    if (_repartidorId == null) return;

    int? batteryLevel;
    // Si va a ponerse EN LÍNEA, mostrar tips de inicio de turno primero
    if (value) {
      // PERMISOS ANDROID 14
      try {
        const platform = MethodChannel('app.estrella.shop/permissions');
        final bool canUseFullScreen = await platform.invokeMethod('canUseFullScreenIntent');
        if (!canUseFullScreen) {
          final shouldRequest = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Permiso Requerido'),
              content: const Text('Para poder despertar la pantalla y avisarte de nuevos pedidos mientras la app está minimizada, necesitamos permiso de Pantalla Completa.\n\n¿Quieres activarlo ahora?'),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Ahora no')),
                ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Activar')),
              ],
            ),
          );
          
          if (shouldRequest == true) {
            await platform.invokeMethod('requestFullScreenIntent');
            return; // Detener flujo para que regresen y lo intenten de nuevo
          }
        }
      } catch (e) {
        debugPrint('Error chequeando fullScreenIntent: $e');
      }

      batteryLevel = await _mostrarTipsInicio();
      if (batteryLevel == null || !mounted) return;
      
      // Mostrar éxito PRIMERO
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: const [
              Icon(Icons.check_circle_rounded, color: Colors.white),
              SizedBox(width: 12),
              Expanded(child: Text('¡Estás en línea! Recibiendo pedidos...')),
            ],
          ),
          backgroundColor: const Color(0xFF10B981),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          margin: const EdgeInsets.all(16),
          duration: const Duration(seconds: 3),
        ),
      );

      // Esperar un segundo para que el usuario lea el snackbar antes de cambiar el botón
      await Future.delayed(const Duration(seconds: 1));
      if (!mounted) return;

    } else {
      // Si se apaga, opcionalmente mandar batería también
      try {
        batteryLevel = await Battery().batteryLevel;
      } catch (_) {}
    }

    setState(() {
      _isOnline = value;
      _cachedIsOnline = value;
    });
    final success = await ref.read(repartidorServiceProvider).updateStatus(
      _repartidorId!, 
      value,
      lat: _currentLocation.latitude,
      lng: _currentLocation.longitude,
      bateria: batteryLevel,
    );
    if (!success) {
      // Revert if failed
      if (mounted) {
        setState(() {
          _isOnline = !value;
          _cachedIsOnline = !value;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Error al actualizar estado')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final ganancias = widget.stats?['ganancias'] ?? 0.0;
    
    // Si está en línea, mostrar el MODO RADAR (Mapa completo + BottomSheet)
    if (_isOnline) {
      return _buildRadarMode(context, isDark, cs, ganancias);
    } else {
      return _buildOfflineDashboard(context, isDark, cs, ganancias);
    }
  }

  Widget _buildRadarMode(BuildContext context, bool isDark, ColorScheme cs, dynamic ganancias) {
    final nextStop = _calcularProximaParada();
    
    return Stack(
      children: [
        // Mapa 100% de fondo (sin mapController para evitar conflicto con el mapa del dashboard offline)
        Positioned.fill(
          child: FlutterMap(
            options: MapOptions(
              initialCenter: _currentLocation,
              initialZoom: 15,
              interactionOptions: const InteractionOptions(flags: InteractiveFlag.all),
            ),
            children: [
              TileLayer(
                urlTemplate: isDark
                    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                subdomains: const ['a', 'b', 'c', 'd'],
              ),
              MarkerLayer(
                markers: [
                  // Hotspot animado (Zonas de alta demanda)
                  if (_pedidosActivos.isEmpty)
                    Marker(
                      point: _currentLocation,
                      width: 250, height: 250,
                      child: SafePulse(
                        child: Container(
                          decoration: BoxDecoration(
                            color: Colors.red.withOpacity(0.15),
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.red.withOpacity(0.5), width: 2),
                          ),
                        ),
                      ),
                    ),
                  
                  // Marcador del repartidor animado
                  Marker(
                    point: _currentLocation,
                    width: 60, height: 60,
                    child: SafePulse(
                      child: Container(
                        decoration: BoxDecoration(
                          color: Colors.blueAccent,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 3),
                          boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 6, offset: Offset(0, 3))]
                        ),
                        child: const Icon(Icons.two_wheeler_rounded, color: Colors.white, size: 28),
                      ),
                    ),
                  ),

                  // Marcador de destino animado
                  if (nextStop != null)
                    Marker(
                      point: LatLng(nextStop['targetLat'], nextStop['targetLng']),
                      width: 50, height: 50,
                      child: SafePulse(
                        child: Icon(
                          nextStop['isPickup'] ? Icons.storefront_rounded : Icons.person_pin_circle_rounded,
                          color: nextStop['isPickup'] ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
                          size: 44,
                          shadows: const [Shadow(color: Colors.black38, blurRadius: 8)],
                        ),
                      ),
                    )
                ]
              )
            ]
          )
        ),
        
        // Cabecera: Ganancias
        Positioned(
          top: 16, left: 16, right: 16,
          child: SafeArea(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(
                    color: isDark ? Colors.black87 : Colors.white,
                    borderRadius: BorderRadius.circular(30),
                    boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 10)],
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.monetization_on_rounded, color: Color(0xFFF59E0B), size: 20),
                      const SizedBox(width: 8),
                      Text('\$${(ganancias as num).toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                    ]
                  )
                ),
                GestureDetector(
                  onTap: _sosSending ? null : () async {
                    final confirm = await showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                        title: const Text('🆘 Enviar Emergencia', style: TextStyle(fontWeight: FontWeight.bold)),
                        content: const Text('Se enviará una alerta de emergencia al Administrador con tu ubicación actual.\n\n¿Confirmas que estás en una situación de emergencia?'),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar', style: TextStyle(color: Colors.grey))),
                          FilledButton(
                            onPressed: () => Navigator.pop(ctx, true), 
                            style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
                            child: const Text('ENVIAR SOS', style: TextStyle(fontWeight: FontWeight.bold)),
                          ),
                        ],
                      ),
                    );
                      if (confirm == true) {
                        setState(() => _sosSending = true);
                        final success = await ref.read(repartidorServiceProvider).enviarSOS(
                          _repartidorNombre,
                          lat: _currentLocation.latitude,
                          lng: _currentLocation.longitude,
                        );
                      setState(() => _sosSending = false);
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                          content: Text(success ? 'ALERTA SOS ENVIADA' : 'Error al enviar alerta'),
                          backgroundColor: success ? Colors.redAccent : Colors.orange,
                        ));
                      }
                    }
                  },
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.redAccent,
                      shape: BoxShape.circle,
                      boxShadow: [BoxShadow(color: Colors.redAccent.withOpacity(0.5), blurRadius: 10)],
                    ),
                    child: _sosSending 
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Icon(Icons.shield_rounded, color: Colors.white, size: 20)
                  )
                )
              ]
            )
          )
        ),
        
        // Panel Inferior
        Align(
          alignment: Alignment.bottomCenter,
          child: nextStop != null 
             ? _buildActiveOrderCard(nextStop) 
             : _buildSearchingOrdersSheet(isDark),
        )
      ]
    );
  }

  Widget _buildSearchingOrdersSheet(bool isDark) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
        borderRadius: BorderRadius.circular(32),
        boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 20, offset: Offset(0, 10))]
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Autoaceptación', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              Switch(value: false, onChanged: (v) {}, activeColor: Colors.redAccent),
            ],
          ),
          const Divider(),
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(Icons.trending_up_rounded, color: Colors.grey),
              const SizedBox(width: 12),
              const Expanded(child: Text('Gana más en las zonas rojas', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600))),
            ]
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => _toggleStatus(false),
              icon: const Icon(Icons.power_settings_new_rounded, color: Colors.redAccent),
              label: const Text('APAGAR TURNO', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w900, letterSpacing: 1)),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                side: const BorderSide(color: Colors.redAccent, width: 2),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              )
            )
          )
        ]
      )
    );
  }

  Widget _buildActiveOrderCard(Map<String, dynamic> nextStop) {
    final pedido = nextStop['pedido'];
    final isPickup = nextStop['isPickup'];
    
    return Container(
      margin: const EdgeInsets.only(bottom: 16, left: 16, right: 16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isPickup ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: (isPickup ? const Color(0xFFF59E0B) : const Color(0xFF10B981)).withOpacity(0.4),
            blurRadius: 15,
            offset: const Offset(0, 8)
          )
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(isPickup ? Icons.storefront_rounded : Icons.person_pin_circle_rounded, color: Colors.white, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  nextStop['action'], 
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16, letterSpacing: 1)
                )
              ),
              if (_pedidosActivos.length > 1)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(12)),
                  child: Text('+${_pedidosActivos.length - 1} en cola', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                )
            ],
          ),
          const SizedBox(height: 12),
          Text(nextStop['title'], style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(nextStop['subtitle'], maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70, fontSize: 14)),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                 context.push('/pedidos/${pedido['id']}');
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: isPickup ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: const Text('VER DETALLES', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOfflineDashboard(BuildContext context, bool isDark, ColorScheme cs, dynamic ganancias) {
    final deuda = widget.stats?['deuda'] ?? 0.0;
    
    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      child: Padding(
        padding: const EdgeInsets.only(bottom: 120, top: 16, left: 16, right: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 500),
              curve: Curves.fastOutSlowIn,
              width: double.infinity,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(32),
                gradient: LinearGradient(
                  colors: [Colors.grey.shade300, Colors.grey.shade400],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 10, offset: const Offset(0, 5))],
              ),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () => _toggleStatus(true),
                  borderRadius: BorderRadius.circular(32),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.power_settings_new_rounded, color: cs.onSurfaceVariant, size: 36),
                        const SizedBox(width: 14),
                        Text(
                          'INICIAR TURNO',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            color: cs.onSurfaceVariant,
                            letterSpacing: 1.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 28),
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF1E293B), Color(0xFF0F172A)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(32),
                boxShadow: [
                  BoxShadow(color: const Color(0xFF0F172A).withOpacity(0.3), blurRadius: 20, offset: const Offset(0, 10))
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('MI BILLETERA', style: TextStyle(fontSize: 14, color: Colors.white70, fontWeight: FontWeight.w900, letterSpacing: 1.2)),
                      const Icon(Icons.account_balance_wallet_rounded, color: Color(0xFF38EF7D), size: 24),
                    ],
                  ),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Ganancias', style: TextStyle(fontSize: 13, color: Colors.white70, fontWeight: FontWeight.w600)),
                            const SizedBox(height: 4),
                            Text('\$${(ganancias as num).toStringAsFixed(2)}', style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Color(0xFF38EF7D), letterSpacing: -1)),
                          ],
                        ),
                      ),
                      Container(width: 1, height: 50, color: Colors.white24),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(left: 16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Efectivo a entregar', style: TextStyle(fontSize: 13, color: Colors.white70, fontWeight: FontWeight.w600)),
                              const SizedBox(height: 4),
                              Text('\$${(deuda as num).toStringAsFixed(2)}', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Color(0xFFF43F5E), letterSpacing: -1)),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatBadge extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _StatBadge({required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: isDark ? color.withOpacity(0.8) : color),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(fontWeight: FontWeight.w700, color: isDark ? color.withOpacity(0.8) : color, fontSize: 12)),
        ],
      ),
    );
  }
}

class SafePulse extends StatefulWidget {
  final Widget child;
  const SafePulse({super.key, required this.child});

  @override
  State<SafePulse> createState() => _SafePulseState();
}

class _SafePulseState extends State<SafePulse> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnim;
  late Animation<double> _opacityAnim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1500))..repeat(reverse: true);
    _scaleAnim = Tween<double>(begin: 0.85, end: 1.15).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
    _opacityAnim = Tween<double>(begin: 0.6, end: 1.0).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.scale(
          scale: _scaleAnim.value,
          child: Opacity(
            opacity: _opacityAnim.value,
            child: widget.child,
          ),
        );
      },
    );
  }
}

class _TipItem extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String text;
  final bool? isCheck;

  const _TipItem({required this.icon, required this.color, required this.text, this.isCheck});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 14, 
                fontWeight: FontWeight.w500,
                color: isCheck == false ? Colors.red : null,
              ),
            ),
          ),
          if (isCheck != null)
            Icon(
              isCheck! ? Icons.check_circle_rounded : Icons.cancel_rounded,
              color: isCheck! ? const Color(0xFF10B981) : Colors.red,
              size: 20,
            ),
        ],
      ),
    );
  }
}

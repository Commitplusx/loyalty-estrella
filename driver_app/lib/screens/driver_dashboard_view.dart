import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart' as fm;
import 'package:latlong2/latlong.dart' as latlng2;
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/ui_helpers.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../utils/top_toast.dart';
import 'package:flutter_polyline_points/flutter_polyline_points.dart';
import 'package:battery_plus/battery_plus.dart';
import 'package:volume_controller/volume_controller.dart';
import '../services/repartidor_service.dart';
import '../services/origin_island_service.dart';
import '../core/supabase_config.dart';
import '../core/theme_provider.dart';
import '../widgets/stacked_order_panel.dart';

import 'package:geolocator/geolocator.dart';
import 'package:animate_do/animate_do.dart';
import 'package:shimmer/shimmer.dart';
import 'package:go_router/go_router.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:action_slider/action_slider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../widgets/navigation_map.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'pedidos_screen.dart' show pedidosActivosProvider;
import '../models/pedido_model.dart';
import 'driver_pedidos_screen.dart' show pedidosActivosProvider, rejectedPedidosProvider;
import '../utils/routing_engine.dart';
import '../widgets/itinerary_stepper.dart';

const String _mapStyleLight = '''
[
  {"featureType": "all","elementType": "geometry.fill","stylers": [{"weight": "2.00"}]},
  {"featureType": "all","elementType": "geometry.stroke","stylers": [{"color": "#9c9c9c"}]},
  {"featureType": "all","elementType": "labels.text","stylers": [{"visibility": "on"}]},
  {"featureType": "landscape","elementType": "all","stylers": [{"color": "#f2f2f2"}]},
  {"featureType": "landscape","elementType": "geometry.fill","stylers": [{"color": "#ffffff"}]},
  {"featureType": "landscape.man_made","elementType": "geometry.fill","stylers": [{"color": "#ffffff"}]},
  {"featureType": "poi","elementType": "all","stylers": [{"visibility": "off"}]},
  {"featureType": "road","elementType": "all","stylers": [{"saturation": -100},{"lightness": 45}]},
  {"featureType": "road","elementType": "geometry.fill","stylers": [{"color": "#eeeeee"}]},
  {"featureType": "road","elementType": "labels.text.fill","stylers": [{"color": "#7b7b7b"}]},
  {"featureType": "road","elementType": "labels.text.stroke","stylers": [{"color": "#ffffff"}]},
  {"featureType": "road.highway","elementType": "all","stylers": [{"visibility": "simplified"}]},
  {"featureType": "road.arterial","elementType": "labels.icon","stylers": [{"visibility": "off"}]},
  {"featureType": "transit","elementType": "all","stylers": [{"visibility": "off"}]},
  {"featureType": "water","elementType": "all","stylers": [{"color": "#46bcec"},{"visibility": "on"}]},
  {"featureType": "water","elementType": "geometry.fill","stylers": [{"color": "#c8d7d4"}]},
  {"featureType": "water","elementType": "labels.text.fill","stylers": [{"color": "#070707"}]},
  {"featureType": "water","elementType": "labels.text.stroke","stylers": [{"color": "#ffffff"}]}
]
''';

const String _mapStyleDark = '''
[
  {"elementType": "geometry","stylers": [{"color": "#212121"}]},
  {"elementType": "labels.icon","stylers": [{"visibility": "off"}]},
  {"elementType": "labels.text.fill","stylers": [{"color": "#757575"}]},
  {"elementType": "labels.text.stroke","stylers": [{"color": "#212121"}]},
  {"featureType": "administrative","elementType": "geometry","stylers": [{"color": "#757575"}]},
  {"featureType": "administrative.country","elementType": "labels.text.fill","stylers": [{"color": "#9e9e9e"}]},
  {"featureType": "administrative.land_parcel","stylers": [{"visibility": "off"}]},
  {"featureType": "administrative.locality","elementType": "labels.text.fill","stylers": [{"color": "#bdbdbd"}]},
  {"featureType": "poi","elementType": "labels.text.fill","stylers": [{"color": "#757575"}]},
  {"featureType": "poi","stylers": [{"visibility": "off"}]},
  {"featureType": "poi.park","elementType": "geometry","stylers": [{"color": "#181818"}]},
  {"featureType": "poi.park","elementType": "labels.text.fill","stylers": [{"color": "#616161"}]},
  {"featureType": "poi.park","elementType": "labels.text.stroke","stylers": [{"color": "#1b1b1b"}]},
  {"featureType": "road","elementType": "geometry.fill","stylers": [{"color": "#2c2c2c"}]},
  {"featureType": "road","elementType": "labels.text.fill","stylers": [{"color": "#8a8a8a"}]},
  {"featureType": "road.arterial","elementType": "geometry","stylers": [{"color": "#373737"}]},
  {"featureType": "road.highway","elementType": "geometry","stylers": [{"color": "#3c3c3c"}]},
  {"featureType": "road.highway.controlled_access","elementType": "geometry","stylers": [{"color": "#4e4e4e"}]},
  {"featureType": "road.local","elementType": "labels.text.fill","stylers": [{"color": "#616161"}]},
  {"featureType": "transit","elementType": "labels.text.fill","stylers": [{"color": "#757575"}]},
  {"featureType": "water","elementType": "geometry","stylers": [{"color": "#000000"}]},
  {"featureType": "water","elementType": "labels.text.fill","stylers": [{"color": "#3d3d3d"}]}
]
''';

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
  bool _isSuccess = false;
  bool _sosSending = false;
  String? _repartidorId;
  String _repartidorNombre = '';
  late LatLng _currentLocation;
  
  // Novedades para el tracker e Inteligencia
  // Novedades para el tracker e Inteligencia
  List<Map<String, dynamic>> _pedidosActivos = [];
  StreamSubscription<Position>? _positionStream;
  GoogleMapController? _mapController;
  Set<Circle> _heatCircles = {};
  int _navButtonState = 0;
  final GlobalKey _mapKey = GlobalKey();
  Set<Marker> _markers = {};
  Set<Polyline> _polylines = {};
  Set<Circle> _circles = {};
  BitmapDescriptor? _deliveryIcon;
  Timer? _smartAssistantTimer;

  bool _cameraPositioned = false; // true una vez que la cámara apuntó a los pedidos
  List<String> _lastPedidoIds = []; // para detectar cuando llega un pedido nuevo
  String? _lastFocusedStopId; // para no re-enfocar si la próxima parada no cambió
  List<LatLng>? _cachedActiveRoute;
  String? _cachedActiveRouteId;
  int _lastRouteProgressIndex = 0; // Previene saltos bruscos si la ruta cruza sobre sí misma
  bool _isFollowingDriver = true; // Auto-follow mode
  DateTime? _lastRecalcTime; // Debounce para recálculo off-route
  
  BitmapDescriptor? _pickupIcon;
  BitmapDescriptor? _dropoffIcon;

  late AnimationController _radarPulseController;
  late Animation<double> _radarPulseAnimation;
  Timer? _routeDrawTimer;

  // Animación del card activo
  late AnimationController _cardPulseController;
  late Animation<double> _cardPulseAnimation;

  // Sonidos de Radar / Éxito
  final AudioPlayer _successPlayer = AudioPlayer();
  final AudioPlayer _radarPlayer = AudioPlayer();
  Timer? _radarTimer;
  Timer? _clearPedidosTimer; // Timer para evitar parpadeos al minimizar la app
  RealtimeChannel? _deviceSessionChannel; // Guardián de sesión única
  final Set<String> _ignoredStackedOrderIds = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _isOnline = _cachedIsOnline ?? false;
    _currentLocation = _cachedLocation ?? const LatLng(16.2519, -92.1345);
    _repartidorId = _cachedRepartidorId;
    _repartidorNombre = _cachedNombre ??
        (supabase.auth.currentUser?.email?.split('@').first ?? '');
    debugPrint('[MAPA] initState → _isOnline=$_isOnline, _currentLocation=$_currentLocation, _mapController=${_mapController != null ? "EXISTS" : "NULL"}');
    _loadStatusSilently();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initCustomIcons();
    });

    // Animación del Radar (Latido)
    _radarPulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: false);

    // Animación de la tarjeta activa (Pulse)
    _cardPulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
    _cardPulseAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _cardPulseController, curve: Curves.easeInOut),
    );

    _radarPulseAnimation = Tween<double>(begin: 0.0, end: 150.0).animate(
      CurvedAnimation(parent: _radarPulseController, curve: Curves.easeOut),
    );

    _radarPulseController.addListener(() {
      if (_currentLocation.latitude != 0.0 && mounted) {
        setState(() {
          _circles.removeWhere((c) => c.circleId.value == 'pulse');
          _circles.add(
            Circle(
              circleId: const CircleId('pulse'),
              center: _currentLocation,
              radius: _pedidosActivos.isEmpty ? (_radarPulseAnimation.value * 3.3) : _radarPulseAnimation.value,
              fillColor: _pedidosActivos.isEmpty 
                  ? Colors.redAccent.withOpacity((1 - _radarPulseController.value) * 0.4) 
                  : Colors.blueAccent.withOpacity((1 - _radarPulseController.value) * 0.4),
              strokeWidth: 2,
              strokeColor: _pedidosActivos.isEmpty 
                  ? Colors.redAccent.withOpacity((1 - _radarPulseController.value) * 0.8) 
                  : Colors.blueAccent.withOpacity((1 - _radarPulseController.value) * 0.8),
            )
          );
        });
      }
    });
  }

  Future<void> _initCustomIcons() async {
    try {
      _pickupIcon = await _getCustomIcon(Icons.storefront_rounded, const Color(0xFFF59E0B), size: 100);
      _dropoffIcon = await _getCustomIcon(Icons.person_rounded, const Color(0xFF3B82F6), size: 110, isCircle: true);
      if (mounted && _pedidosActivos.isNotEmpty) {
        _updateMapData(_calcularTodasLasParadas());
      }
    } catch (e) {
      debugPrint('[MAPA] Error generando iconos: $e');
    }
  }

  Future<BitmapDescriptor> _getCustomIcon(IconData iconData, Color color, {double size = 110, bool isCircle = false}) async {
    final pictureRecorder = ui.PictureRecorder();
    final canvas = Canvas(pictureRecorder);
    
    // Espacio para la sombra y la "cola" del pin
    const double padding = 25.0;
    const double tailHeight = 30.0;
    
    final double canvasWidth = size + (padding * 2);
    final double canvasHeight = size + tailHeight + padding; // Sin padding inferior para que la punta toque el fondo
    
    final center = Offset(canvasWidth / 2, padding + size / 2);
    
    // 1. Sombra base
    final shadowPath = Path();
    if (isCircle) {
      shadowPath.addOval(Rect.fromCircle(center: center, radius: size / 2));
    } else {
      shadowPath.addRRect(RRect.fromRectAndRadius(
        Rect.fromCenter(center: center, width: size, height: size),
        const Radius.circular(28)
      ));
    }
    
    // Cola para la sombra
    shadowPath.moveTo(center.dx - 18, padding + size - 10);
    shadowPath.lineTo(center.dx, canvasHeight);
    shadowPath.lineTo(center.dx + 18, padding + size - 10);
    shadowPath.close();
    
    canvas.drawShadow(shadowPath, Colors.black87, 16.0, false);
    
    // 2. Dibujar Cuerpo Principal y Cola
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
      
    final borderPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8.0;

    // Dibujar Cola
    final tailPath = Path();
    tailPath.moveTo(center.dx - 18, padding + size - 15);
    tailPath.lineTo(center.dx, canvasHeight - 2); // Un poco antes del borde absoluto
    tailPath.lineTo(center.dx + 18, padding + size - 15);
    tailPath.close();
    
    canvas.drawPath(tailPath, paint);
    canvas.drawPath(tailPath, borderPaint); // Borde de la cola
    
    // Dibujar Cuerpo
    if (isCircle) {
      canvas.drawCircle(center, size / 2, paint);
      canvas.drawCircle(center, size / 2, borderPaint);
    } else {
      final rrect = RRect.fromRectAndRadius(
        Rect.fromCenter(center: center, width: size, height: size),
        const Radius.circular(28)
      );
      canvas.drawRRect(rrect, paint);
      canvas.drawRRect(rrect, borderPaint);
    }

    // 3. Dibujar Ícono Interior
    TextPainter textPainter = TextPainter(textDirection: TextDirection.ltr);
    textPainter.text = TextSpan(
      text: String.fromCharCode(iconData.codePoint),
      style: TextStyle(
        fontSize: size * 0.55,
        fontFamily: iconData.fontFamily,
        package: iconData.fontPackage,
        color: Colors.white,
      ),
    );
    textPainter.layout();
    textPainter.paint(
      canvas,
      Offset(center.dx - (textPainter.width / 2), center.dy - (textPainter.height / 2)),
    );

    final picture = pictureRecorder.endRecording();
    final image = await picture.toImage(canvasWidth.toInt(), canvasHeight.toInt());
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    return BitmapDescriptor.fromBytes(bytes!.buffer.asUint8List());
  }

  // Animación Suave del Mapa
  void _animatedMapMove(LatLng destLocation, double destZoom) {
    _mapController?.animateCamera(CameraUpdate.newLatLngZoom(destLocation, destZoom));
  }

  /// Auto-enfoca el mapa para mostrar al conductor Y la próxima parada.
  /// Solo anima si la parada cambió — evita jitter en actualizaciones frecuentes.
  void _autoFocusNextStop({bool force = false}) {
    if (_mapController == null) return;
    // 🚀 EVITA BRINCOS: Si el chofer va manejando en modo 3D, no alejar la cámara
    if (_isFollowingDriver && !force) return; 
    
    final nextStop = _calcularProximaParada();
    if (nextStop == null) return;

    // ID único de la parada actual: pedidoId + acción
    final pedido = nextStop['pedido'] as Map<String, dynamic>?;
    final stopId = '${pedido?["id"] ?? ""}_${nextStop["action"] ?? ""}';

    if (!force && _lastFocusedStopId == stopId) return; // misma parada, no mover
    _lastFocusedStopId = stopId;

    final destLat = (nextStop['targetLat'] as num).toDouble();
    final destLng = (nextStop['targetLng'] as num).toDouble();

    if (destLat == 0.0 && destLng == 0.0) return;

    double minLat = _currentLocation.latitude < destLat ? _currentLocation.latitude : destLat;
    double maxLat = _currentLocation.latitude > destLat ? _currentLocation.latitude : destLat;
    double minLng = _currentLocation.longitude < destLng ? _currentLocation.longitude : destLng;
    double maxLng = _currentLocation.longitude > destLng ? _currentLocation.longitude : destLng;

    // Margen mínimo para que no sea un punto
    if ((maxLat - minLat) < 0.002) { minLat -= 0.001; maxLat += 0.001; }
    if ((maxLng - minLng) < 0.002) { minLng -= 0.001; maxLng += 0.001; }

    _lastProgrammaticCameraMove = DateTime.now();
    _mapController!.animateCamera(
      CameraUpdate.newLatLngBounds(
        LatLngBounds(
          southwest: LatLng(minLat - 0.001, minLng - 0.001),
          northeast: LatLng(maxLat + 0.001, maxLng + 0.001),
        ),
        80.0, // padding generoso para que la tarjeta no tape el destino
      ),
    );
  }

  void _updateDriverMarkerSilently() {
    if (_mapController == null) return;
    
    final newMarkers = Set<Marker>.from(_markers);
    newMarkers.removeWhere((m) => m.markerId == const MarkerId('driver'));
    newMarkers.add(
      Marker(
        markerId: const MarkerId('driver'),
        position: _currentLocation,
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueCyan), // CYAN PARA LA MOTO
        infoWindow: const InfoWindow(title: 'Tú'),
        zIndex: 100,
      )
    );
    _markers = newMarkers;

    final newCircles = Set<Circle>.from(_circles);
    newCircles.removeWhere((c) => c.circleId == const CircleId('driver_halo'));
    newCircles.add(
      Circle(
        circleId: const CircleId('driver_halo'),
        center: _currentLocation,
        radius: _pedidosActivos.isEmpty ? 500 : 150,
        fillColor: _pedidosActivos.isEmpty ? Colors.red.withOpacity(0.15) : Colors.blue.withOpacity(0.15),
        strokeColor: _pedidosActivos.isEmpty ? Colors.red.withOpacity(0.5) : Colors.blue.withOpacity(0.5),
        strokeWidth: 2,
      )
    );
    _circles = newCircles;
  }





  bool _showSuccessAnimation = false;
  DateTime _lastProgrammaticCameraMove = DateTime.now().subtract(const Duration(days: 1));

  Future<void> _updateOrderStatus(String pedidoId, String newStatus) async {
    try {
      // 1. UI Optimista REAL: Actualizamos la lista local inmediatamente antes de ir a DB
      if (mounted) {
        setState(() {
          final idx = _pedidosActivos.indexWhere((p) => p['id'] == pedidoId);
          if (idx != -1) {
            if (newStatus == 'entregado' || newStatus == 'cancelado') {
              // Si se entregó, lo quitamos de la vista activa
              _pedidosActivos.removeAt(idx);
            } else {
              // Si solo avanzó, le cambiamos el estado
              _pedidosActivos[idx]['estado'] = newStatus;
            }
          }
        });
      }

      await supabase.from('pedidos').update({'estado': newStatus}).eq('id', pedidoId);
      
      // Resetear el foco para que _autoFocusNextStop apunte a la nueva parada
      _lastFocusedStopId = null;

      if (newStatus == 'entregado' && mounted) {
        setState(() {
          _showSuccessAnimation = true;
        });
        _successPlayer.play(AssetSource('sounds/success.mp3')); // Opcional si hay sonido
        Future.delayed(const Duration(milliseconds: 2500), () {
          if (mounted) {
            setState(() {
              _showSuccessAnimation = false;
            });
          }
        });
      }

      if (mounted && newStatus != 'entregado') {
        _showTopToast('✅ Pedido actualizado a ${newStatus.replaceAll('_', ' ')}');
      }
      // El stream (ref.listen a pedidosActivosProvider) recibirá la confirmación oficial en unos ms/s
    } catch (e) {
      debugPrint('Error updating status: $e');
    }
  }

  /// Toast tipo banner que aparece desde arriba
  void _showTopToast(String message, {Color color = const Color(0xFF10B981), IconData icon = Icons.check_circle_rounded}) {
    final overlay = Overlay.of(context);
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (ctx) => _TopToastWidget(
        message: message,
        color: color,
        icon: icon,
        onDismiss: () => entry.remove(),
      ),
    );
    overlay.insert(entry);
  }

  Future<void> _enfocarRuta(Map<String, dynamic> stop) async {
    if (_mapController == null) return;
    final destLat = stop['targetLat'];
    final destLng = stop['targetLng'];

    if (destLat == 0.0 || destLng == 0.0) {
      if (mounted) {
        TopToast.show(context, 'Ubicación del destino no disponible', backgroundColor: Colors.orange);
      }
      return;
    }

    PolylinePoints polylinePoints = PolylinePoints();

    // Trazar ruta específica desde el conductor a la parada
    PolylineResult nextResult = await polylinePoints.getRouteBetweenCoordinates(
      googleApiKey: 'AIzaSyBOZkp595ze0Agwb7yPG5u7MD29EL9gHMw',
      request: PolylineRequest(
        origin: PointLatLng(_currentLocation.latitude, _currentLocation.longitude),
        destination: PointLatLng(destLat, destLng),
        mode: TravelMode.driving,
      ),
    );

    List<LatLng> specificRoute = [];
    if (nextResult.points.isNotEmpty) {
      specificRoute = nextResult.points.map((p) => LatLng(p.latitude, p.longitude)).toList();
    } else {
      // Fallback a línea recta si Google Maps no encuentra ruta pero hay coordenadas válidas
      specificRoute = [
        _currentLocation,
        LatLng(destLat, destLng),
      ];
    }
    
    if (mounted) {
      setState(() {
        _polylines.removeWhere((p) => p.polylineId == const PolylineId('focused_route'));
        _polylines.add(
          Polyline(
            polylineId: const PolylineId('focused_route'),
            points: specificRoute,
            color: const Color(0xFF10B981), // Verde esmeralda para destacar
            width: 8,
            jointType: JointType.round,
            endCap: Cap.roundCap,
            startCap: Cap.roundCap,
            zIndex: 50,
          )
        );
      });
    }

    // Encuadrar la cámara exactamente en ese trayecto
    double minLat = _currentLocation.latitude < destLat ? _currentLocation.latitude : destLat;
    double maxLat = _currentLocation.latitude > destLat ? _currentLocation.latitude : destLat;
    double minLng = _currentLocation.longitude < destLng ? _currentLocation.longitude : destLng;
    double maxLng = _currentLocation.longitude > destLng ? _currentLocation.longitude : destLng;

    final bounds = LatLngBounds(
      southwest: LatLng(minLat, minLng),
      northeast: LatLng(maxLat, maxLng),
    );
    
    _mapController!.animateCamera(CameraUpdate.newLatLngBounds(bounds, 60.0));
  }

  Future<void> _updateMapData(List<Map<String, dynamic>> allStops) async {
    debugPrint('[MAPA] _updateMapData → controller=${_mapController != null ? "OK" : "NULL"} | stops=${allStops.length} | _cameraPositioned=$_cameraPositioned');
    if (_mapController == null) {
      debugPrint('[MAPA] _updateMapData ❌ ABORTADO — controller es NULL');
      return;
    }
    
    Set<Marker> newMarkers = {};
    Set<Circle> newCircles = {};
    
    // 1. Marcador del repartidor (El halo animado se gestiona en el listener de _radarPulseController)
    
    newMarkers.add(
      Marker(
        markerId: const MarkerId('driver'),
        position: _currentLocation,
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueCyan), // CYAN PARA LA MOTO
        infoWindow: const InfoWindow(title: 'Tú'),
        zIndex: 100,
      )
    );

    // 2. Paradas
    int orderIndex = 1;
    LatLngBounds? bounds;
    
    if (allStops.isNotEmpty) {
      // Calcular bounds SOLO de las paradas (sin incluir el GPS del repartidor
      // para evitar que el encuadre sea demasiado grande si estamos lejos)
      final pendingOnly = allStops.where((s) => s['completado'] == false).toList();
      final stopsForBounds = pendingOnly.isNotEmpty ? pendingOnly : allStops;

      double minLat = math.min(stopsForBounds.first['targetLat'], _currentLocation.latitude);
      double maxLat = math.max(stopsForBounds.first['targetLat'], _currentLocation.latitude);
      double minLng = math.min(stopsForBounds.first['targetLng'], _currentLocation.longitude);
      double maxLng = math.max(stopsForBounds.first['targetLng'], _currentLocation.longitude);

      for (var stop in allStops) {
        final isPickup = stop['isPickup'];
        final lat = stop['targetLat'] as double;
        final lng = stop['targetLng'] as double;
        final pos = LatLng(lat, lng);

        if (!stop['completado']) {
          minLat = math.min(minLat, lat);
          maxLat = math.max(maxLat, lat);
          minLng = math.min(minLng, lng);
          maxLng = math.max(maxLng, lng);
        }

        newMarkers.add(
          Marker(
            markerId: MarkerId('stop_${stop['pedido']['id']}_$isPickup'),
            position: pos,
            anchor: const Offset(0.5, 1.0), // 🎯 Hace que la punta de la cola apunte a la coordenada exacta
            icon: isPickup
              ? (_pickupIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange))
              : (_dropoffIcon ?? BitmapDescriptor.defaultMarker), // Ícono de perfil personalizado 
            infoWindow: InfoWindow(
              title: stop['action'],
              snippet: stop['title'],
            ),
            zIndex: stop['completado'] ? 1.0 : 10.0,
            alpha: stop['completado'] ? 0.5 : 1.0,
          )
        );
        debugPrint('[MAPA-LOG] 📍 Marcador generado -> ID: stop_${stop['pedido']['id']}_$isPickup, esPickup: $isPickup, COLOR: ${isPickup ? "NARANJA" : "AZUL"}');
        orderIndex++;
      }

      // 🔑 PASO 1: Ir primero al punto central de los pedidos con zoom fijo
      // Esto garantiza que los tiles del mapa carguen de inmediato
      final centerLat = (minLat + maxLat) / 2;
      final centerLng = (minLng + maxLng) / 2;
      if (!_cameraPositioned) {
        _cameraPositioned = true;
        debugPrint('[MAPA] _updateMapData → 🎯 animateCamera center=(${centerLat.toStringAsFixed(4)}, ${centerLng.toStringAsFixed(4)})');
        try {
          await _mapController!.animateCamera(
            CameraUpdate.newCameraPosition(
              CameraPosition(target: LatLng(centerLat, centerLng), zoom: 14),
            ),
          );
          debugPrint('[MAPA] _updateMapData → animateCamera center ✅ OK');
        } catch (e) {
          debugPrint('[MAPA] _updateMapData → animateCamera center ❌ ERROR: $e');
        }

        // 🔑 PASO 2: Después de 600ms (los tiles ya cargaron), ajustar el encuadre
        bounds = LatLngBounds(
          southwest: LatLng(minLat, minLng),
          northeast: LatLng(maxLat, maxLng),
        );
        debugPrint('[MAPA-LOG] 📐 Encuadre Bounds -> SW: $minLat, $minLng | NE: $maxLat, $maxLng');
        Future.delayed(const Duration(milliseconds: 600), () {
          if (mounted && _mapController != null) {
            try {
              debugPrint('[MAPA-LOG] 🎥 Ajustando encuadre final con padding 150.0');
              _mapController!.animateCamera(CameraUpdate.newLatLngBounds(bounds!, 150.0));
            } catch (e) {
              debugPrint('[MAPA-LOG] Error animating bounds: $e');
            }
          }
        });
      }

      // 3. Trazar ruta
      await _fetchRealRoute(allStops);
    } else {
      try {
        _mapController!.animateCamera(CameraUpdate.newLatLngZoom(_currentLocation, 15));
      } catch (e) {
        debugPrint('Error animating to current location: $e');
      }
      if (mounted) {
        setState(() {
          _polylines = {};
        });
      }
    }

    if (mounted) {
      setState(() {
        _markers = newMarkers;
        _circles = newCircles;
      });
    }
  }

  // Paleta de colores por tramo — sin verde (reservado para completado)
  static const List<Color> _routeColors = [
    Color(0xFF3B82F6), // Azul (primer tramo: conductor → parada 1)
    Color(0xFFF97316), // Naranja
    Color(0xFFA855F7), // Morado
    Color(0xFFEC4899), // Rosa
    Color(0xFF06B6D4), // Cian
    Color(0xFFEAB308), // Amarillo
  ];

  Future<void> _fetchRealRoute(List<Map<String, dynamic>> allStops, {bool forceFetch = false}) async {
    try {
      final pendingStops = allStops.where((s) => s['completado'] == false).toList();
      if (pendingStops.isEmpty) return;

      final nextStop = pendingStops.first;
      final pedidoId = nextStop['pedido']['id'];
      final action = nextStop['action'];
      final routeId = '${pedidoId}_$action';

      // Si ya tenemos la ruta en RAM para este destino y no estamos forzando, solo actualizar
      if (!forceFetch && _cachedActiveRouteId == routeId && _cachedActiveRoute != null) {
        _updateDynamicRoute();
        return;
      }

      PolylinePoints polylinePoints = PolylinePoints();
      List<LatLng> segPoints = [];
      
      try {
        final result = await polylinePoints.getRouteBetweenCoordinates(
          googleApiKey: 'AIzaSyBOZkp595ze0Agwb7yPG5u7MD29EL9gHMw',
          request: PolylineRequest(
            origin: PointLatLng(_currentLocation.latitude, _currentLocation.longitude),
            destination: PointLatLng(nextStop['targetLat'], nextStop['targetLng']),
            mode: TravelMode.driving,
          ),
        );
        if (result.points.isNotEmpty) {
          segPoints = result.points.map((p) => LatLng(p.latitude, p.longitude)).toList();
        }
      } catch (e) {
        debugPrint('[MAPA] Error obteniendo ruta dinámica: $e');
      }

      // Fallback a línea recta si falla la API
      if (segPoints.isEmpty) {
        segPoints = [_currentLocation, LatLng(nextStop['targetLat'], nextStop['targetLng'])];
      }

      _cachedActiveRoute = segPoints;
      _cachedActiveRouteId = routeId;
      _lastRouteProgressIndex = 0; // Reiniciamos el progreso en la nueva ruta

      _updateDynamicRoute();
    } catch (globalError) {
      debugPrint('[MAPA] Error crítico en _fetchRealRoute: $globalError');
    }
  }

  void _updateDynamicRoute() {
    if (_cachedActiveRoute == null || _cachedActiveRoute!.isEmpty) return;

    // Encontrar el punto más cercano en la ruta pre-calculada a la ubicación actual
    // 🛡️ INTELIGENCIA DE RUTAS (Prevención de fallos):
    // Solo buscamos en una "ventana" de los siguientes 50 puntos desde donde nos quedamos.
    // Esto evita que si la calle hace un "loop" (circuito) o cruza por el mismo lado después, 
    // la línea azul se acorte repentinamente brincándose media ciudad por error.
    int lookaheadLimit = math.min(_cachedActiveRoute!.length, _lastRouteProgressIndex + 50);
    
    int closestIndex = _lastRouteProgressIndex;
    double minDistance = double.infinity;
    
    for (int i = _lastRouteProgressIndex; i < lookaheadLimit; i++) {
      final dist = _haversineKm(
        _currentLocation.latitude, _currentLocation.longitude,
        _cachedActiveRoute![i].latitude, _cachedActiveRoute![i].longitude
      );
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }

    // 🚀 NUEVA INTELIGENCIA: OFF-ROUTE RECALCULATION
    if (minDistance > 0.05) { // Más de 50 metros lejos de la ruta
      final now = DateTime.now();
      if (_lastRecalcTime == null || now.difference(_lastRecalcTime!).inSeconds > 15) {
        _lastRecalcTime = now;
        debugPrint('[MAPA-LOG] ⚠️ Desvío detectado (${(minDistance * 1000).toStringAsFixed(1)}m). Forzando recálculo...');
        _fetchRealRoute(_calcularTodasLasParadas(), forceFetch: true);
        return; // Terminamos aquí, la API volverá a dibujarlo cuando responda
      }
    }

    // Actualizamos nuestro progreso guardado para no retroceder en búsquedas futuras
    _lastRouteProgressIndex = closestIndex;

    // Dibujar la ruta dinámica: Desde el conductor uniendo con el resto del camino
    final dynamicPoints = [
      _currentLocation,
      ..._cachedActiveRoute!.sublist(closestIndex)
    ];

    final newPolyline = Polyline(
      polylineId: const PolylineId('dynamic_route'),
      points: dynamicPoints,
      color: const Color(0xFF3B82F6), // Azul sólido
      width: 9,
      jointType: JointType.round,
      endCap: Cap.roundCap,
      startCap: Cap.roundCap,
      zIndex: 20,
    );

    if (mounted) {
      setState(() {
        _polylines = {newPolyline};
      });
    }
  }

  Future<void> _loadStatusSilently() async {
    final statusData = await ref.read(repartidorServiceProvider).getCurrentStatus();
    
    // Extracciones de seguridad
    bool isOnlineBD = statusData['activo'] ?? false;
    final repIdBD = statusData['id'];
    
    if (mounted) {
      _repartidorId = repIdBD;
      final nombreBD = statusData['nombre'] as String? ?? '';
      _repartidorNombre = nombreBD.isNotEmpty
          ? nombreBD
          : (supabase.auth.currentUser?.email?.split('@').first ?? 'Repartidor');
      _cachedRepartidorId = _repartidorId;
      _cachedNombre = _repartidorNombre;

      // === GUARDIÁN DE SESIÓN ÚNICA ===
      if (_repartidorId != null && _deviceSessionChannel == null) {
        _deviceSessionChannel = supabase.channel('public:repartidores:$_repartidorId')
          .onPostgresChanges(
            event: PostgresChangeEvent.update,
            schema: 'public',
            table: 'repartidores',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'id',
              value: _repartidorId!
            ),
            callback: (payload) async {
              final newDeviceId = payload.newRecord['current_device_id'] as String?;
              final prefs = await SharedPreferences.getInstance();
              final localDeviceId = prefs.getString('my_device_id');
              
              if (newDeviceId != null && localDeviceId != null && newDeviceId != localDeviceId) {
                // Alguien mas inició sesión
                debugPrint('=== 🚨 SESIÓN FORZADA A CERRAR: OTRO DISPOSITIVO ===');
                await supabase.auth.signOut();
                await prefs.remove('my_device_id');
                if (mounted) {
                  _positionStream?.cancel();
                  context.go('/login');
                  TopToast.show(context, '⚠️ Tu sesión fue iniciada en otro dispositivo.', backgroundColor: Colors.red);
                }
              }
            }
          ).subscribe();
      }
    }

    // 🚨 Inteligencia: Ya no buscamos pedidos aquí. `ref.listen` en el método build 
    // inyectará los pedidos activos instantáneamente apenas cargue la vista.

    // === LÓGICA OPCIÓN A: RESPETAR SIEMPRE LA NUBE (BD) ===
    if (mounted) {
      setState(() {
        // Si acabamos de abrir la app (_cachedIsOnline == null), usamos la BD
        // Si ya estaba abierta, respetamos el caché temporal
        _isOnline = _cachedIsOnline ?? isOnlineBD;
        _cachedIsOnline = _isOnline;
      });
      
      // Si determinamos que está en línea al cargar, asegurarnos de que el servicio background esté corriendo
      if (_isOnline) {
        OriginIslandService.toggleBackgroundService(true);
      }
    }
    
    // Attempt to get location and start stream
    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.whileInUse || permission == LocationPermission.always) {
        final pos = await Geolocator.getCurrentPosition();
        debugPrint('[MAPA] 📍 getCurrentPosition OK → (${pos.latitude}, ${pos.longitude})');
        if (mounted) {
          setState(() {
            _currentLocation = LatLng(pos.latitude, pos.longitude);
            _cachedLocation = _currentLocation;
          });
          // Si el mapa ya está listo, moverlo a la ubicación real
          if (_mapController != null) {
            debugPrint('[MAPA-LOG] 📍 Ubicación real obtenida post-init: $pos. Recalculando mapa...');
            if (_pedidosActivos.isNotEmpty) {
              // Recalcular toda la ruta y el encuadre usando la coordenada real
              _cameraPositioned = false; // FORZAR ENCUADRE
              _updateMapData(_calcularTodasLasParadas());
            } else {
              debugPrint('[MAPA-LOG] 📍 No hay pedidos, moviendo a ubicación del conductor.');
              _mapController!.animateCamera(
                CameraUpdate.newCameraPosition(CameraPosition(target: _currentLocation, zoom: 15)),
              ).catchError((e) => debugPrint('[MAPA] animateCamera post-location ❌: $e'));
            }
          } else {
            debugPrint('[MAPA] ⚠️ _mapController es NULL cuando llegó la ubicación real');
          }
        }
        
        // Sincronización inicial obligatoria si decidimos estar en línea
        if (_isOnline && _repartidorId != null) {
          int? batteryLvl;
          try { batteryLvl = await Battery().batteryLevel; } catch (_) {}
          debugPrint('📍 Sincronizando ubicación inicial a Supabase: ${pos.latitude}, ${pos.longitude}');
          ref.read(repartidorServiceProvider).updateStatus(
            _repartidorId!,
            true,
            lat: pos.latitude,
            lng: pos.longitude,
            bateria: batteryLvl,
          );
        }

        // Suscribirse a cambios de ubicación en vivo
        debugPrint('[MAPA] 📡 Iniciando positionStream...');
        _positionStream = Geolocator.getPositionStream(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 5,
          ),
        ).listen((Position position) async {
          debugPrint('[MAPA] 📡 positionStream tick → (${position.latitude.toStringAsFixed(4)}, ${position.longitude.toStringAsFixed(4)}) | controller=${_mapController != null ? "OK" : "NULL"}');
          if (mounted) {
            setState(() {
              _currentLocation = LatLng(position.latitude, position.longitude);
              _cachedLocation = _currentLocation;
              _updateDriverMarkerSilently();
            });
            _updateDynamicRoute(); // 🚀 ACTUALIZACIÓN DINÁMICA DE LA RUTA EN VIVO

            // 🎥 AUTO-FOLLOW CAMERA EN NAVEGACIÓN
            if (_isFollowingDriver && _mapController != null && _pedidosActivos.isNotEmpty) {
              _lastProgrammaticCameraMove = DateTime.now();
              _mapController!.animateCamera(
                CameraUpdate.newCameraPosition(
                  CameraPosition(
                    target: _currentLocation,
                    zoom: 17,
                    tilt: 45,
                    bearing: (position.speed < 1.0) ? _calcularBearingHaciaDestino() : position.heading, // Enfoca al destino si está detenido
                  ),
                ),
              ).catchError((_) {});
            }

            if (_isOnline && !_isPressed && !_isSuccess && _repartidorId != null) {
              int? bat;
              try { bat = await Battery().batteryLevel; } catch (_) {}
              ref.read(repartidorServiceProvider).updateStatus(
                _repartidorId!,
                true,
                lat: position.latitude,
                lng: position.longitude,
                bateria: bat,
              );
            }
          }
        });
      }
    } catch (e) {
      debugPrint("Could not get location: $e");
    }
  }

  // 🚨 Función _checkPedidoActivo eliminada: Ahora usamos arquitectura reactiva con pedidosActivosProvider
  // === MOTOR DE INTELIGENCIA (Routing Engine) ===

  /// Distancia en km entre dos coordenadas usando la fórmula de Haversine.
  double _haversineKm(double lat1, double lng1, double lat2, double lng2) {
    const R = 6371.0; // Radio de la Tierra en km
    final dLat = _toRad(lat2 - lat1);
    final dLng = _toRad(lng2 - lng1);
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_toRad(lat1)) * math.cos(_toRad(lat2)) *
        math.sin(dLng / 2) * math.sin(dLng / 2);
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  double _toRad(double deg) => deg * math.pi / 180;
  /// ETA en minutos asumiendo 25 km/h promedio en ciudad.
  int _etaMin(double distKm) => (distKm / 25.0 * 60).ceil().clamp(1, 999);

  /// Calcula el ángulo hacia el destino para enfocar la cámara 3D correctamente.
  double _calcularBearingHaciaDestino() {
    final nextStop = _calcularProximaParada();
    if (nextStop == null) return 0.0;
    
    final lat1 = _currentLocation.latitude * math.pi / 180.0;
    final lng1 = _currentLocation.longitude * math.pi / 180.0;
    final lat2 = (nextStop['targetLat'] as num).toDouble() * math.pi / 180.0;
    final lng2 = (nextStop['targetLng'] as num).toDouble() * math.pi / 180.0;

    final dLng = lng2 - lng1;
    final y = math.sin(dLng) * math.cos(lat2);
    final x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dLng);
    final bearing = math.atan2(y, x);

    return (bearing * 180.0 / math.pi + 360.0) % 360.0;
  }


  // ==========================================================================
  // ALGORITMO DE ENRUTAMIENTO
  // La lógica ha sido extraída a RoutingEngine en lib/utils/routing_engine.dart
  // ==========================================================================
  List<Map<String, dynamic>> _calcularTodasLasParadas() {
    return RoutingEngine.calcularTodasLasParadas(
      _pedidosActivos, 
      _currentLocation.latitude, 
      _currentLocation.longitude
    );
  }
  // ==========================================================================


  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _positionStream?.cancel();
    _radarTimer?.cancel();
    _clearPedidosTimer?.cancel();
    _routeDrawTimer?.cancel();
    _radarPulseController.dispose();
    _cardPulseController.dispose();
    _successPlayer.dispose();
    _radarPlayer.dispose();
    _mapController = null;
    super.dispose();
  }

  void _playSuccessSound() async {
    try {
      await _successPlayer.play(AssetSource('sounds/success.mp3'));
    } catch (e) {
      debugPrint('No se pudo reproducir success sound: $e');
    }
  }

  void _startRadarSound() {
    _radarTimer?.cancel();
    // 🔕 El usuario pidió quitar el sonido del radar (estresante)
    // _radarTimer = Timer.periodic(const Duration(seconds: 5), (timer) async {
    //   if (_isOnline && _pedidosActivos.isEmpty) {
    //     try {
    //       await _radarPlayer.play(AssetSource('sounds/radar.mp3'));
    //     } catch (e) {
    //       debugPrint('No se pudo reproducir radar sound: $e');
    //     }
    //   } else {
    //     _stopRadarSound();
    //   }
    // });
  }

  void _stopRadarSound() {
    _radarTimer?.cancel();
    _radarTimer = null;
  }

  Future<void> _mostrarDeudaDetalle(bool isDark) async {
    if (_repartidorId == null) return;
    final detalle = await ref.read(repartidorServiceProvider).getDeudaDetalle(_repartidorId!);

    if (!mounted) return;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.0, end: 1.0),
        duration: const Duration(milliseconds: 450),
        curve: Curves.easeOutCubic,
        builder: (context, value, child) => Transform.translate(
          offset: Offset(0, 60 * (1 - value)),
          child: Opacity(opacity: value, child: child),
        ),
        child: Container(
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E293B) : Colors.white,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
          ),
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 40),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40, height: 4,
                  margin: const EdgeInsets.only(bottom: 24),
                  decoration: BoxDecoration(
                    color: isDark ? Colors.white24 : Colors.black12,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF43F5E).withOpacity(0.12),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(Icons.receipt_long_rounded, color: Color(0xFFF43F5E), size: 24),
                  ),
                  const SizedBox(width: 14),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Efectivo a Entregar', style: TextStyle(
                        fontSize: 20, fontWeight: FontWeight.w900,
                        color: isDark ? Colors.white : Colors.black,
                      )),
                      Text('Desglose por restaurante · Hoy', style: TextStyle(
                        fontSize: 13,
                        color: isDark ? Colors.white54 : Colors.black45,
                      )),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 28),
              if (detalle.isEmpty)
                Center(
                  child: Column(
                    children: [
                      const Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 48),
                      const SizedBox(height: 12),
                      Text('¡Sin deuda pendiente hoy!', style: TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w700,
                        color: isDark ? Colors.white70 : Colors.black54,
                      )),
                      const SizedBox(height: 12),
                    ],
                  ),
                )
              else
                ...detalle.map((item) {
                  final monto = (item['monto'] as num?)?.toDouble() ?? 0.0;
                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF43F5E).withOpacity(0.06),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0xFFF43F5E).withOpacity(0.15)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.storefront_rounded, color: Color(0xFFF43F5E), size: 22),
                            const SizedBox(width: 12),
                            Text(
                              item['restaurante']?.toString() ?? 'Restaurante',
                              style: TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w700,
                                color: isDark ? Colors.white : Colors.black87,
                              ),
                            ),
                          ],
                        ),
                        Text(
                          '\$${monto.toStringAsFixed(2)}',
                          style: const TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w900,
                            color: Color(0xFFF43F5E),
                          ),
                        ),
                      ],
                    ),
                  );
                }),
              if (detalle.isNotEmpty) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: isDark ? Colors.white.withOpacity(0.05) : Colors.black.withOpacity(0.04),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('TOTAL A ENTREGAR', style: TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 0.5,
                        color: isDark ? Colors.white70 : Colors.black54,
                      )),
                      Text(
                        '\$${detalle.fold(0.0, (s, e) => s + ((e['monto'] as num?)?.toDouble() ?? 0.0)).toStringAsFixed(2)}',
                        style: const TextStyle(
                          fontSize: 22, fontWeight: FontWeight.w900,
                          color: Color(0xFFF43F5E),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _isOnline) {
      _syncLocationBackground();
      _verificarSesionUnicaSilencioso();
    }
  }

  Future<void> _verificarSesionUnicaSilencioso() async {
    if (_repartidorId == null) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final localDeviceId = prefs.getString('my_device_id');
      if (localDeviceId == null) return;
      
      final dbData = await supabase.from('repartidores').select('current_device_id').eq('id', _repartidorId!).single();
      final dbDeviceId = dbData['current_device_id'] as String?;
      
      if (dbDeviceId != null && dbDeviceId != localDeviceId) {
        debugPrint('=== 🚨 SESIÓN FORZADA A CERRAR POR LIFECYCLE (BACKGROUND): OTRO DISPOSITIVO ===');
        await supabase.auth.signOut();
        await prefs.remove('my_device_id');
        if (mounted) {
          _positionStream?.cancel();
          context.go('/login');
          TopToast.show(context, '⚠️ Tu sesión fue iniciada en otro dispositivo.', backgroundColor: Colors.red);
        }
      }
    } catch (e) {
      debugPrint('Error verificando sesion unica en background: $e');
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
      builder: (ctx) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.0, end: 1.0),
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeOutBack,
        builder: (context, value, child) {
          return Transform.scale(
            scale: value,
            child: Opacity(
              opacity: value.clamp(0.0, 1.0),
              child: child,
            ),
          );
        },
        child: Dialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF59E0B).withOpacity(0.15),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.monetization_on_rounded, color: Color(0xFFF59E0B), size: 40),
                ),
                const SizedBox(height: 20),
                const Text(
                  '¿Cuánto dinero traes?',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Para dar un mejor servicio y calcular tu cambio, selecciona con cuánto efectivo empiezas tu turno.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 14, color: Colors.grey),
                ),
                const SizedBox(height: 28),
                Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: () => Navigator.pop(ctx, 200),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 20),
                          decoration: BoxDecoration(
                            color: const Color(0xFF10B981).withOpacity(0.1),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: const Color(0xFF10B981).withOpacity(0.3)),
                          ),
                          child: const Column(
                            children: [
                              Text('\$200', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Color(0xFF10B981))),
                              SizedBox(height: 4),
                              Text('Pesos', style: TextStyle(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: GestureDetector(
                        onTap: () => Navigator.pop(ctx, 500),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 20),
                          decoration: BoxDecoration(
                            color: const Color(0xFF3B82F6).withOpacity(0.1),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: const Color(0xFF3B82F6).withOpacity(0.3)),
                          ),
                          child: const Column(
                            children: [
                              Text('\$500', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Color(0xFF3B82F6))),
                              SizedBox(height: 4),
                              Text('Pesos', style: TextStyle(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                TextButton(
                  onPressed: () => Navigator.pop(ctx, 0),
                  child: const Text('No traigo efectivo', style: TextStyle(color: Colors.grey, fontWeight: FontWeight.w600, fontSize: 16)),
                ),
              ],
            ),
          ),
        ),
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
                      isLoading ? 'Conectando...' : '¡Hola ${_repartidorNombre.isNotEmpty ? _repartidorNombre.split(' ').first : ''}!\nSocio Repartidor 🚀',
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
                              TopToast.show(context, 'Activa tu GPS y acepta los permisos primero.', backgroundColor: Colors.red);
                              return;
                           }
                           if (!isVolumeOk) {
                              TopToast.show(context, 'Por favor, sube el volumen para escuchar los nuevos pedidos.', backgroundColor: Colors.orange);
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
        const platform = MethodChannel('estrellaeats.driver.app/permissions');
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

      // 1. Mostrar pantalla de revisión de GPS, Batería, Volumen
      batteryLevel = await _checkInitialLocation();
      if (batteryLevel == null || !mounted) return;
      
      // Mostrar éxito PRIMERO
      TopToast.show(
        context,
        '¡Estás en línea! Recibiendo pedidos...',
        icon: Icons.check_circle_rounded,
        backgroundColor: const Color(0xFF10B981),
      );
      
      // 2. Preguntar cantidad de efectivo
      final money = await _mostrarTipsInicio();
      if (money == null || !mounted) return;


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
      _isPressed = true;
    });

    final success = await ref.read(repartidorServiceProvider).updateStatus(
      _repartidorId!, 
      value,
      lat: _currentLocation.latitude,
      lng: _currentLocation.longitude,
      bateria: batteryLevel,
    );

    if (mounted) {
      if (success && !value) {
        _stopRadarSound();
        setState(() {
          _isPressed = false;
          _isSuccess = false;
          _isOnline = false;
          _cachedIsOnline = false;
          _mapController = null;
        });
      } else {
        setState(() {
          _isPressed = false;
          if (success) {
            _isOnline = value;
            _cachedIsOnline = value;
            _playSuccessSound();
            _startRadarSound();
          }
        });
      }

      if (!success) {
        TopToast.show(context, 'Error al actualizar estado', backgroundColor: Colors.redAccent);
      } else {
        OriginIslandService.toggleBackgroundService(value);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // ══════════════════════════════════════════════════════════════
    // 🛡️ GUARDIAN PERMANENTE: ref.watch garantiza que cada vez que
    // Supabase actualiza la lista de pedidos, este widget se
    // reconstruye SIEMPRE con los datos más recientes.
    // ══════════════════════════════════════════════════════════════
    final providerPedidos = ref.watch(pedidosActivosProvider).valueOrNull ?? [];
    
    // 🔒 SINCRONIZACIÓN INMEDIATA: Si el provider tiene pedidos ACTIVOS pero el
    // estado local está vacío (glitch de reconexión), restauramos ahora.
    // Filtramos solo pedidos activos para no restaurar los entregados/cancelados.
    final activeProviderPedidos = providerPedidos.where((p) => 
      !['entregado', 'cancelado'].contains(p.estado)
    ).toList();
    if (activeProviderPedidos.isNotEmpty && _pedidosActivos.isEmpty) {
      // Usar addPostFrameCallback para no llamar setState durante build
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _pedidosActivos.isEmpty && activeProviderPedidos.isNotEmpty) {
          debugPrint('[GUARDIAN] 🛡️ pedidosActivos local vacío pero provider tiene ${activeProviderPedidos.length} pedidos activos. Restaurando...');
          // Cancelar cualquier timer de borrado pendiente
          _clearPedidosTimer?.cancel();
          _clearPedidosTimer = null;
          final mappedList = activeProviderPedidos.map((p) => p.toMap()).toList();
          setState(() {
            _pedidosActivos = mappedList;
            _lastPedidoIds = mappedList.map((p) => p['id'].toString()).toList();
          });
          if (_mapController != null) {
            _updateMapData(_calcularTodasLasParadas());
          }
        }
      });
    }
    
    // Escuchar el provider de forma reactiva (Única Fuente de Verdad)
    ref.listen(pedidosActivosProvider, (previous, next) {
      next.whenData((pedidosList) {
        // Filtrar solo los pedidos activos para el dashboard
        final mappedList = pedidosList
            .where((p) => !['entregado', 'cancelado'].contains(p.estado))
            .map((p) => p.toMap())
            .toList();
        
        // PROTECCIÓN CONTRA GLITCH DE RECONEXIÓN (Cuando se minimiza y maximiza la app)
        if (mappedList.isEmpty && _pedidosActivos.isNotEmpty) {
          debugPrint('[MAPA-LOG] ⚠️ Supabase mandó lista vacía. Esperando 8s por si es un glitch de reconexión...');
          _clearPedidosTimer ??= Timer(const Duration(seconds: 8), () {
            if (mounted) {
              debugPrint('[MAPA-LOG] 🗑️ Han pasado 3s y sigue vacío. Limpiando UI.');
              setState(() {
                _pedidosActivos = [];
                _lastPedidoIds = [];
                _polylines = {};
                _clearPedidosTimer = null;
                if (_isOnline && _radarTimer == null) _startRadarSound();
              });
            }
          });
          return; // Abortar actualización visual
        }

        // Si llegó data real o ya estaba vacío de por sí, cancelar el timer de borrado
        if (_clearPedidosTimer != null) {
          debugPrint('[MAPA-LOG] ✅ Data real recibida. Cancelando borrado fantasma.');
          _clearPedidosTimer?.cancel();
          _clearPedidosTimer = null;
        }

        final newIds = mappedList.map((p) => p['id'].toString()).toList();
        final pedidosChanged = !_lastPedidoIds.toSet().containsAll(newIds) || !newIds.toSet().containsAll(_lastPedidoIds.toSet());
        
        setState(() {
          _pedidosActivos = mappedList;
          _lastPedidoIds = newIds;
          if (pedidosChanged) _cameraPositioned = false; // reposicionar cámara si cambió la lista
        });
        
        // Mantener el mapa sincronizado con la realidad
        if (_mapController != null) {
          if (mappedList.isEmpty) {
            setState(() { _polylines = {}; });
          } else {
            _updateMapData(_calcularTodasLasParadas());
            // Auto-enfocar si la próxima parada cambió
            Future.delayed(const Duration(milliseconds: 400), () {
              if (mounted) _autoFocusNextStop();
            });
          }
        }

        if (mappedList.isNotEmpty) {
          _stopRadarSound();
          
          _smartAssistantTimer?.cancel();
          _smartAssistantTimer = Timer(const Duration(seconds: 20), () {
            if (mounted && _pedidosActivos.isNotEmpty && ModalRoute.of(context)?.isCurrent == true) {
               PremiumToast.show(
                 context,
                 title: '💡 Consejo Inteligente',
                 description: 'Revisa las paradas y desliza el botón cuando completes una recolección o entrega.',
                 isError: false,
                 icon: Icons.lightbulb_outline_rounded,
               );
            }
          });
          
        } else if (_isOnline && _radarTimer == null) {
          _smartAssistantTimer?.cancel();
          _startRadarSound();
        }
      });
    });

    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    // Actualizar estilo del mapa de forma dinámica si ya existe el controlador
    if (_mapController != null) {
      _mapController!.setMapStyle(isDark ? _mapStyleDark : _mapStyleLight);
    }
    
    final ganancias = widget.stats?['ganancias'] ?? 0.0;
    
    return _buildRadarMode(context, isDark, cs, ganancias, providerPedidos);
  }

  Map<String, dynamic>? _calcularProximaParada() {
    if (_pedidosActivos.isEmpty) return null;
    
    // Obtener la ruta óptima calculada (TSP logic/Proximidad)
    final allStops = _calcularTodasLasParadas();
    if (allStops.isEmpty) return null;

    // La próxima parada es la primera de la lista que no esté completada
    final uncompletedStops = allStops.where((stop) => stop['completado'] == false).toList();
    
    if (uncompletedStops.isEmpty) return null;

    final nextStop = uncompletedStops.first;
    // Agregamos metadata para la UI
    nextStop['indexParada'] = allStops.indexWhere((s) => s == nextStop) + 1;
    nextStop['totalParadas'] = allStops.length;
    nextStop['isApilado'] = _pedidosActivos.length > 1;

    return nextStop;
  }

  void _recenterRadarMap(BuildContext context, Map<String, dynamic> nextStop) {
    if (_mapController == null) return;
    
    // Reactivar seguimiento de cámara al tocar Radar
    _isFollowingDriver = true;
    
    debugPrint('[MAPA-LOG] 🧭 Botón Radar presionado, estado actual: $_navButtonState');
    if (_navButtonState == 0) {
      debugPrint('[MAPA-LOG] 🎥 Zooming a destino (zoom 16.0)');
      // Forzamos recálculo de la ruta desde Google Maps al presionar el radar en estado 0
      _fetchRealRoute(_calcularTodasLasParadas(), forceFetch: true);
      
      _mapController!.animateCamera(CameraUpdate.newCameraPosition(
        CameraPosition(target: LatLng(nextStop['targetLat'], nextStop['targetLng']), zoom: 16.0, tilt: 45.0),
      ));
      TopToast.show(context, '📍 Ruta recalculada hacia: ${nextStop['title']}', backgroundColor: const Color(0xFF10B981));
      _navButtonState = 1;
    } else if (_navButtonState == 1) {
      debugPrint('[MAPA-LOG] 🎥 Zooming a conductor (zoom 16.0)');
      _mapController!.animateCamera(CameraUpdate.newCameraPosition(
        CameraPosition(target: _currentLocation, zoom: 16.0, tilt: 50.0),
      ));
      TopToast.show(context, '🚗 Esta es tu ubicación', backgroundColor: Colors.blueAccent);
      _navButtonState = 2;
    } else {
      double x0 = _currentLocation.latitude;
      double x1 = nextStop['targetLat'];
      double y0 = _currentLocation.longitude;
      double y1 = nextStop['targetLng'];
      
      if (x0 > x1) { final t = x0; x0 = x1; x1 = t; }
      if (y0 > y1) { final t = y0; y0 = y1; y1 = t; }
      
      // Añadimos un micro-margen mínimo por si ambos puntos son idénticos
      final bounds = LatLngBounds(
        southwest: LatLng(x0 - 0.0001, y0 - 0.0001),
        northeast: LatLng(x1 + 0.0001, y1 + 0.0001),
      );
      
      debugPrint('[MAPA-LOG] 🎥 Zooming a vista panorámica (bounds padding 150.0)');
      _mapController!.animateCamera(CameraUpdate.newLatLngBounds(bounds, 150.0));
      TopToast.show(context, '🗺️ Panorama completo de tu ruta', backgroundColor: Colors.black87);
      _navButtonState = 0;
    }
  }

  Widget _buildRadarMode(BuildContext context, bool isDark, ColorScheme cs, dynamic ganancias, List<PedidoModel> providerPedidos) {
    final nextStop = _calcularProximaParada();
    final greeting = DateTime.now().hour < 12 ? 'Buenos días' : (DateTime.now().hour < 19 ? 'Buenas tardes' : 'Buenas noches');
    
    // Filtrar solo pedidos realmente activos (no entregados, no cancelados)
    final estadosActivos = ['asignado', 'recibido', 'en_camino', 'preparando', 'ofrecido'];
    final activePedidos = providerPedidos.where((p) => estadosActivos.contains(p.estado)).toList();
    final hasHistory = providerPedidos.any((p) => p.estado == 'entregado');
    
    // Buscar pedido apilado pendiente
    final stackedOrder = providerPedidos.firstWhereOrNull(
      (p) => p.estado == 'ofrecido' && !_ignoredStackedOrderIds.contains(p.id)
    );

    return Stack(
      children: [
        // Itinerario como fondo principal
        Positioned.fill(
          child: Container(
            color: isDark ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC),
            child: activePedidos.isNotEmpty 
              ? SingleChildScrollView(
                  padding: const EdgeInsets.only(top: 16, bottom: 160, left: 16, right: 16),
                  physics: const BouncingScrollPhysics(),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header de la sección
                      Row(
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Tu Itinerario', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: isDark ? Colors.white : Colors.black, letterSpacing: -0.5)),
                              Text('${activePedidos.length} pedido${activePedidos.length != 1 ? 's' : ''} activo${activePedidos.length != 1 ? 's' : ''}', style: TextStyle(fontSize: 13, color: isDark ? Colors.white38 : Colors.black38, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      // Stepper vertical de paradas
                      ItineraryStepper(
                        paradas: _calcularTodasLasParadas(),
                        currentIndex: nextStop != null ? (nextStop['indexParada'] as int) - 1 : 0,
                        isDark: isDark,
                      ),
                    ],
                  ),
                )
              : Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(28),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF1E293B) : Colors.white,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.05),
                              blurRadius: 20,
                              spreadRadius: 5,
                            )
                          ]
                        ),
                        child: Icon(Icons.coffee_rounded, size: 56, color: isDark ? Colors.amber : const Color(0xFFFF6B35)),
                      ),
                      const SizedBox(height: 32),
                      Text('Tu ruta está libre', style: TextStyle(color: isDark ? Colors.white70 : Colors.black87, fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
                      const SizedBox(height: 8),
                      Text('Relájate un momento.\nAcepta un pedido en la pestaña de "Nuevos"\npara comenzar tu recorrido.', textAlign: TextAlign.center, style: TextStyle(color: isDark ? Colors.white38 : Colors.black45, fontSize: 14, fontWeight: FontWeight.w500, height: 1.5)),
                    ],
                  ),
                ),
          ),
        ),
        
        // Botones flotantes (Billetera, Luna, SOS) removidos para dejar la vista limpia.
        
        // Panel Inferior
        Align(
          alignment: Alignment.bottomCenter,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [

              AnimatedSwitcher(
                duration: const Duration(milliseconds: 900),
                switchInCurve: Curves.easeOutCubic,
                switchOutCurve: Curves.easeInCubic,
                transitionBuilder: (child, animation) {
                  return FadeTransition(
                    opacity: animation,
                    child: SlideTransition(
                      position: Tween<Offset>(begin: const Offset(0.0, 0.4), end: Offset.zero).animate(animation),
                      child: child,
                    ),
                  );
                },
                child: nextStop != null 
                   ? KeyedSubtree(
                       key: ValueKey(nextStop['pedido']['id']),
                       child: const SizedBox.shrink(),
                     )
                   // 🛡️ SECOND GUARDIAN: Solo activamos el fallback si hay pedidos
                   // ACTIVOS (no entregados) en el provider.
                   : (activePedidos.isNotEmpty
                       ? KeyedSubtree(
                           key: ValueKey('provider_fallback_${activePedidos.first.id}'),
                           child: _buildProviderFallbackCard(activePedidos, isDark),
                         )
                       : const SizedBox.shrink()),
              ),
            ],
          ),
        ),
        
        if (stackedOrder != null)
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: StackedOrderPanel(
              pedido: stackedOrder,
              onAccepted: () {
                // El panel ya actualizó Supabase, la UI se actualizará automáticamente.
              },
              onTimeout: () {
                // Si el tiempo se acaba, simplemente lo ocultamos visualmente
                // hasta que el backend lo reasigne o si el repartidor decide ir a la pestaña 'Nuevos'
                if (mounted) {
                  setState(() {
                    _ignoredStackedOrderIds.add(stackedOrder.id.toString());
                  });
                }
              },
            ),
          )
      ]
    );
  }

  Widget _buildSearchingOrdersSheet(bool isDark, {bool hasHistory = false}) {
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
          // Mostrar "Ver historial" si hay pedidos anteriores, o el tip de zonas rojas
          if (hasHistory)
            GestureDetector(
              onTap: () => context.push('/ganancias'),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: isDark ? Colors.white.withOpacity(0.05) : Colors.black.withOpacity(0.04),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: isDark ? Colors.white12 : Colors.black12),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF6366F1).withOpacity(0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.history_rounded, color: Color(0xFF6366F1), size: 20),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Ver historial de entregas', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: isDark ? Colors.white : Colors.black)),
                          Text('Revisa tus pedidos anteriores', style: TextStyle(fontSize: 12, color: isDark ? Colors.white38 : Colors.black38)),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded, color: isDark ? Colors.white38 : Colors.black38),
                  ],
                ),
              ),
            )
          else
            Row(
              children: [
                const Icon(Icons.trending_up_rounded, color: Colors.grey),
                const SizedBox(width: 12),
                const Expanded(child: Text('Gana más en las zonas rojas', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600))),
              ]
            ),
          const SizedBox(height: 24),

          AnimatedScale(
            scale: _isSuccess ? 1.05 : 1.0,
            duration: const Duration(milliseconds: 400),
            curve: Curves.elasticOut,
            child: GestureDetector(
              onTap: (_isPressed || _isSuccess) ? null : () => _toggleStatus(false),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                width: double.infinity,
                height: 56,
                decoration: BoxDecoration(
                  color: _isSuccess
                      ? const Color(0xFF10B981)
                      : _isPressed
                          ? Colors.grey.withOpacity(0.1)
                          : Colors.transparent,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: _isSuccess
                        ? const Color(0xFF10B981)
                        : _isPressed
                            ? Colors.grey
                            : Colors.redAccent,
                    width: 2,
                  ),
                ),
                alignment: Alignment.center,
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 300),
                  child: _isSuccess
                      ? Row(
                          mainAxisSize: MainAxisSize.min,
                          key: const ValueKey('success'),
                          children: const [
                            Icon(Icons.check_circle_rounded, color: Colors.white),
                            SizedBox(width: 8),
                            Text(
                              '¡DESCONECTADO!',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1,
                              ),
                            ),
                          ],
                        )
                      : _isPressed
                          ? Row(
                              mainAxisSize: MainAxisSize.min,
                              key: const ValueKey('loading'),
                              children: const [
                                SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.grey, strokeWidth: 2)),
                                SizedBox(width: 8),
                                Text(
                                  'DESCONECTANDO...',
                                  style: TextStyle(
                                    color: Colors.grey,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 1,
                                  ),
                                ),
                              ],
                            )
                          : Row(
                              mainAxisSize: MainAxisSize.min,
                              key: const ValueKey('idle'),
                              children: const [
                                Icon(Icons.power_settings_new_rounded, color: Colors.redAccent),
                                SizedBox(width: 8),
                                Text(
                                  'APAGAR TURNO',
                                  style: TextStyle(
                                    color: Colors.redAccent,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 1,
                                  ),
                                ),
                              ],
                            ),
                ),
              ),
            ),
          )
        ]
      )
    );
  }

  // 🛡️ GUARDIAN CARD: Se muestra cuando el estado local se vació pero el
  // provider de Supabase sigue teniendo pedidos. Siempre garantiza visibilidad.
  Widget _buildProviderFallbackCard(List<PedidoModel> pedidos, bool isDark) {
    final pedido = pedidos.first;
    final nombre = pedido.restaurante ?? 'Restaurante';
    final direccion = pedido.direccion ?? 'Sin dirección';
    final estado = pedido.estado ?? 'asignado';
    
    // Mapa de estados a etiquetas
    final estadoLabel = {
      'asignado': 'Ve al restaurante',
      'recibido': 'Lleva el pedido',
      'en_camino': 'Entregando...',
      'entregado': 'Entregado ✓',
    }[estado] ?? 'Pedido activo';
    
    final isPickup = !['recibido', 'en_camino', 'entregado'].contains(estado);
    final themeColor = isPickup ? const Color(0xFFF59E0B) : const Color(0xFF10B981);

    return Container(
      margin: const EdgeInsets.only(bottom: 16, left: 12, right: 12),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: themeColor.withOpacity(0.4), width: 1.5),
        boxShadow: [
          BoxShadow(color: themeColor.withOpacity(0.15), blurRadius: 20, offset: const Offset(0, 10))
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(color: themeColor, borderRadius: BorderRadius.circular(16)),
                child: Row(
                  children: [
                    Icon(isPickup ? Icons.storefront_rounded : Icons.person_pin_circle_rounded, color: Colors.white, size: 14),
                    const SizedBox(width: 4),
                    Text(estadoLabel.toUpperCase(), style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900)),
                  ],
                ),
              ),
              const Spacer(),
              if (pedidos.length > 1)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(color: Colors.grey.withOpacity(0.15), borderRadius: BorderRadius.circular(16)),
                  child: Text('${pedidos.length} PEDIDOS', style: TextStyle(color: isDark ? Colors.white70 : Colors.black54, fontSize: 10, fontWeight: FontWeight.w900)),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            isPickup ? nombre : (pedido.clienteNombre ?? 'Cliente'),
            style: TextStyle(color: isDark ? Colors.white : Colors.black, fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          Text(
            isPickup ? 'Recoge el pedido en el restaurante' : direccion,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: isDark ? Colors.white54 : Colors.grey[600], fontSize: 14),
          ),
          const SizedBox(height: 16),
          // Botones de acción rápidos
          Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () {
                    final lat = isPickup ? (pedido.restauranteLat ?? pedido.lat) : pedido.lat;
                    final lng = isPickup ? (pedido.restauranteLng ?? pedido.lng) : pedido.lng;
                    if (lat != null && lng != null) {
                      final uri = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving');
                      launchUrl(uri, mode: LaunchMode.externalApplication);
                    }
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(
                      color: themeColor,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.navigation_rounded, color: Colors.white, size: 18),
                        SizedBox(width: 8),
                        Text('Navegar', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 15)),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              GestureDetector(
                onTap: () => context.push('/pedidos/${pedido.id}'),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    color: isDark ? Colors.white10 : Colors.black.withOpacity(0.06),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(Icons.receipt_long_rounded, size: 20, color: isDark ? Colors.white70 : Colors.black54),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }


  Widget _buildStepConnector(int index, int currentIndex, bool isDark) {
    final isDone = index < currentIndex - 1;
    final isActive = index == currentIndex - 1;

    return SizedBox(
      width: 24,
      child: Column(
        children: [
          const SizedBox(height: 4), // Alinea con el centro del círculo (40/2 = 20, pero el Column de StepNode tiene padding)
          AnimatedContainer(
            duration: const Duration(milliseconds: 350),
            height: 2,
            width: 24,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(2),
              color: isDone || isActive
                  ? const Color(0xFF10B981)
                  : (isDark ? Colors.white12 : const Color(0xFFE2E8F0)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResumenPill({
    required IconData icon,
    required String label,
    required Color color,
    required bool isDark,
    required bool done,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: color.withOpacity(done ? 0.08 : 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActiveOrderCard(Map<String, dynamic> nextStop, bool isDark) {
    final pedido = nextStop['pedido'];
    final isPickup = nextStop['isPickup'];
    
    // Utilizar los datos reales de ruteo
    final isApilado = nextStop['isApilado'] ?? false;
    final indexParada = nextStop['indexParada'] ?? 1;
    final totalParadas = nextStop['totalParadas'] ?? 2;
    
    // Distancia y ETA calculados inteligentemente
    final double distKm = (nextStop['distanciaKm'] as num?)?.toDouble() ?? 0.0;
    final dist = distKm.toStringAsFixed(1);
    final eta = nextStop['etaMin']?.toString() ?? '5';
    final hasArrived = distKm < 0.15; // 150 metros
    
    final themeColor = isPickup ? const Color(0xFFF59E0B) : const Color(0xFF10B981);
    final phone = nextStop['telefono']?.toString();

    return AnimatedBuilder(
      animation: _cardPulseAnimation,
      builder: (context, child) {
        return Container(
          margin: const EdgeInsets.only(bottom: 16, left: 12, right: 12),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E293B) : Colors.white,
            borderRadius: BorderRadius.circular(32),
            boxShadow: [
              BoxShadow(
                color: (hasArrived ? const Color(0xFF10B981) : themeColor).withOpacity(0.1 + (_cardPulseAnimation.value * 0.15)),
                blurRadius: 20 + (_cardPulseAnimation.value * 10),
                spreadRadius: _cardPulseAnimation.value * 4,
                offset: const Offset(0, 10),
              ),
              const BoxShadow(color: Colors.black12, blurRadius: 20, offset: Offset(0, 10)),
            ],
            border: Border.all(
              color: (hasArrived ? const Color(0xFF10B981) : themeColor).withOpacity(0.2 + (_cardPulseAnimation.value * 0.3)),
              width: 1.5,
            )
          ),
          child: child,
        );
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (isApilado)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(color: Colors.grey.withOpacity(0.15), borderRadius: BorderRadius.circular(16)),
                  child: Text('VIAJE APILADO', style: TextStyle(color: isDark ? Colors.white70 : Colors.black54, fontSize: 10, fontWeight: FontWeight.w900)),
                )
            ],
          ),
          if (isApilado) const SizedBox(height: 16),


          Text(
            hasArrived ? '📍 YA ESTÁS AQUÍ' : nextStop['action'], 
            style: TextStyle(
              color: hasArrived ? const Color(0xFF10B981) : themeColor, 
              fontWeight: FontWeight.w900, 
              fontSize: 13, 
              letterSpacing: 1
            )
          ),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      nextStop['title'], 
                      style: TextStyle(
                        color: hasArrived ? const Color(0xFF10B981) : (isDark ? Colors.white : Colors.black), 
                        fontSize: 24, 
                        fontWeight: FontWeight.bold
                      )
                    ),
                    const SizedBox(height: 4),
                    Text(nextStop['subtitle'], maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: isDark ? Colors.white54 : Colors.grey[600], fontSize: 14)),
                  ],
                ),
              ),
              if (phone != null && phone.isNotEmpty) ...[
                const SizedBox(width: 8),
                Column(
                  children: [
                    GestureDetector(
                      onTap: () async {
                        HapticFeedback.lightImpact();
                        final url = Uri.parse('tel:$phone');
                        if (await canLaunchUrl(url)) await launchUrl(url);
                      },
                      child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.green.withOpacity(0.1),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.green.withOpacity(0.3)),
                        ),
                        child: const Icon(Icons.phone_rounded, color: Colors.green, size: 20),
                      ),
                    ),
                    const SizedBox(height: 8),
                    GestureDetector(
                      onTap: () async {
                        HapticFeedback.lightImpact();
                        final url = Uri.parse('whatsapp://send?phone=+52$phone'); 
                        if (await canLaunchUrl(url)) {
                           await launchUrl(url);
                        } else {
                           _showTopToast('WhatsApp no está instalado', color: Colors.orange, icon: Icons.warning_rounded);
                        }
                      },
                      child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFF25D366).withOpacity(0.1),
                          shape: BoxShape.circle,
                          border: Border.all(color: const Color(0xFF25D366).withOpacity(0.3)),
                        ),
                        child: const Icon(Icons.chat_rounded, color: Color(0xFF25D366), size: 20),
                      ),
                    ),
                  ],
                ),
              ]
            ],
          ),
          const SizedBox(height: 12),
          Builder(
            builder: (context) {
              final productos = (pedido['productos'] ?? pedido['cart'] ?? pedido['items']) as List? ?? [];
              if (productos.isNotEmpty) {
                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: isDark ? Colors.white.withOpacity(0.05) : Colors.grey.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: isDark ? Colors.white10 : Colors.grey.withOpacity(0.2)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('🛒 REVISAR PRODUCTOS:', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: isDark ? Colors.white54 : Colors.grey)),
                      const SizedBox(height: 6),
                      ...productos.take(3).map((prod) => Padding(
                        padding: const EdgeInsets.only(bottom: 2),
                        child: Text('• ${prod['cantidad'] ?? 1}x ${prod['nombre'] ?? 'Producto'}', style: TextStyle(fontSize: 13, color: isDark ? Colors.white : Colors.black87), maxLines: 1, overflow: TextOverflow.ellipsis),
                      )),
                      if (productos.length > 3)
                        Text('  y ${productos.length - 3} más...', style: TextStyle(fontSize: 11, color: isDark ? Colors.white38 : Colors.grey, fontStyle: FontStyle.italic)),
                    ],
                  ),
                );
              }
              return const SizedBox.shrink();
            }
          ),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: isDark ? Colors.white10 : Colors.grey[200],
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      hasArrived ? Icons.directions_walk_rounded : Icons.directions_car_rounded, 
                      color: hasArrived ? const Color(0xFF10B981) : (isDark ? Colors.white70 : Colors.black87), 
                      size: 14
                    ),
                    const SizedBox(width: 6),
                    Text(
                      hasArrived ? '¡A unos metros!' : '$dist km • ~$eta min', 
                      style: TextStyle(
                        color: hasArrived ? const Color(0xFF10B981) : (isDark ? Colors.white70 : Colors.black87), 
                        fontSize: 13, 
                        fontWeight: FontWeight.w900
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Spacer(),

              GestureDetector(
                onTap: () async {
                  HapticFeedback.heavyImpact();
                  final url = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=${nextStop['targetLat']},${nextStop['targetLng']}');
                  if (await canLaunchUrl(url)) {
                    await launchUrl(url, mode: LaunchMode.externalApplication);
                  }
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFF3B82F6).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFF3B82F6).withOpacity(0.3)),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.map_rounded, color: Color(0xFF3B82F6), size: 16),
                      SizedBox(width: 6),
                      Text('GPS', style: TextStyle(color: Color(0xFF3B82F6), fontSize: 13, fontWeight: FontWeight.w900)),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [

              Expanded(
                child: SizedBox(
                  height: 56,
                  child: ActionSlider.standard(
                    sliderBehavior: SliderBehavior.stretch,
                    width: double.infinity,
                    backgroundColor: themeColor,
                    toggleColor: Colors.white,
                    action: (controller) async {
                      HapticFeedback.heavyImpact();
                      controller.loading(); 
                      
                      final currentEstado = pedido['estado'] as String? ?? '';
                      // Si la parada es de entrega, pero el estado actual es 'recibido'
                      // significa que el driver apenas va a salir del restaurante hacia el cliente.
                      // En este caso NO debemos validar la distancia al cliente.
                      final isStartingRouteToClient = !isPickup && currentEstado == 'recibido';
                      
                      final double distance = Geolocator.distanceBetween(
                        _currentLocation.latitude, _currentLocation.longitude,
                        nextStop['targetLat'], nextStop['targetLng']
                      );
                      
                      if (distance > 200 && !isStartingRouteToClient) {
                        controller.reset();
                        if (context.mounted) TopToast.show(context, '❌ Estás muy lejos del destino (${distance.toInt()}m)', backgroundColor: Colors.red);
                        return;
                      }

                      try {
                        controller.success();
                        if (context.mounted) HapticFeedback.vibrate();
                        
                        // Lanzamos la petición a Supabase en background para no atorar la UI
                        Future(() async {
                          if (isPickup) {
                            // Agrupar: actualizar TODOS los pedidos del grupo
                            final allPedidos = (nextStop['pedidos'] as List?)
                                ?.cast<Map<String, dynamic>>() ?? [pedido];
                            await Future.wait(allPedidos.map((p) async {
                              await _updateOrderStatus(p['id'], 'recibido');
                            }));
                          } else {
                            final currentEstado = pedido['estado'] as String? ?? '';
                            if (currentEstado == 'recibido') {
                              await _updateOrderStatus(pedido['id'], 'en_camino');
                            } else {
                              await _updateOrderStatus(pedido['id'], 'entregado');
                            }
                          }
                        });
                        
                        // Reseteamos visualmente casi de inmediato (400ms para ver la palomita)
                        Future.delayed(const Duration(milliseconds: 400), () {
                          controller.reset();
                          
                          if (mounted) {
                            final nStop = _calcularProximaParada();
                            if (nStop != null) {
                               _isFollowingDriver = true;
                               _navButtonState = 2; // Estado de seguimiento
                               
                               if (_mapController != null) {
                                 _lastProgrammaticCameraMove = DateTime.now();
                                 _mapController!.animateCamera(
                                   CameraUpdate.newCameraPosition(
                                     CameraPosition(
                                       target: _currentLocation,
                                       zoom: 17,
                                       tilt: 45,
                                       bearing: _calcularBearingHaciaDestino(),
                                     ),
                                   ),
                                 );
                               }
                            }
                          }
                        });
                      } catch (e) {
                        controller.reset();
                        if (context.mounted) _showTopToast('❌ Error al actualizar estado');
                      }
                    },
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.only(left: 48.0),
                        child: Builder(builder: (context) {
                          final currentEstado = pedido['estado'] as String? ?? '';
                          final isGrouped = nextStop['isGrouped'] as bool? ?? false;
                          final groupSize = nextStop['groupSize'] as int? ?? 1;
                          if (isPickup) {
                            final label = isGrouped
                              ? 'Recoger $groupSize pedidos'
                              : 'Desliza para Recoger';
                            return Text(
                              hasArrived ? '¡ENTRA A RECOGER!' : label, 
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13, letterSpacing: 0.2)
                            );
                          } else {
                            final isEnRestaurante = currentEstado == 'recibido';
                            final label = isEnRestaurante ? 'Desliza para Iniciar Ruta' : 'Desliza para Entregar';
                            return Text(
                              hasArrived && !isEnRestaurante ? '¡ENTREGA EL PEDIDO!' : label,
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13, letterSpacing: 0.2),
                            );
                          }
                        }),
                      ),
                    ),
                    icon: Builder(builder: (context) {
                      final currentEstado = pedido['estado'] as String? ?? '';
                      final isGrouped = nextStop['isGrouped'] as bool? ?? false;
                      if (isPickup) {
                        return Icon(
                          isGrouped ? Icons.inventory_2_rounded : Icons.storefront_rounded,
                          color: themeColor, size: 20,
                        );
                      } else {
                        final isEnRestaurante = currentEstado == 'recibido';
                        return Icon(
                          isEnRestaurante ? Icons.two_wheeler_rounded : Icons.check_circle_rounded,
                          color: themeColor,
                          size: 20,
                        );
                      }
                    }),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              GestureDetector(
                onTap: () {
                  HapticFeedback.lightImpact();
                  _mostrarItinerario(isDark);
                },
                child: Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: isDark ? Colors.white10 : Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: isDark ? [] : [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, 4))],
                  ),
                  child: Icon(Icons.format_list_bulleted_rounded, color: isDark ? Colors.white : Colors.black87),
                ),
              )
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _mostrarItinerario(bool isDark) async {
    final List<Map<String, dynamic>> paradasReal = [];
    int completadas = 0;
    
    for (var p in _pedidosActivos) {
      final estado = p['estado'];
      final shortId = p['id'].toString().length > 8 ? p['id'].toString().substring(0, 8).toUpperCase() : p['id'].toString();
      
      final bool pickupDone = !['asignado', 'aceptado', 'en_cocina', 'listo_para_recoger', 'recibido'].contains(estado);
      final bool dropoffDone = estado == 'entregado' || estado == 'finalizado';
      
      if (pickupDone) completadas++;
      if (dropoffDone) completadas++;

      final rawItems = p['items'];
      List<dynamic> productList = [];
      if (rawItems != null && rawItems is List) productList = rawItems;

      final notaRestaurante = p['descripcion']?.toString() ?? '';
      final notaCliente = p['referencias_entrega']?.toString() ?? '';
      
      // Resolver nombre real del restaurante igual que en _calcularTodasLasParadas
      final rest = p['restaurante'];
      String restNombre;
      double restLat, restLng;
      if (rest is Map) {
        restNombre = (rest['nombre_comercial'] ?? rest['nombre'] ?? p['restaurante_nombre'] ?? 'Restaurante') as String;
        restLat = ((rest['lat'] ?? p['restaurante_lat'] ?? p['lat'] ?? 16.2519) as num).toDouble();
        restLng = ((rest['lng'] ?? p['restaurante_lng'] ?? p['lng'] ?? -92.1345) as num).toDouble();
      } else {
        restNombre = (p['restaurante_nombre'] ?? p['origen_nombre'] ?? 'Restaurante') as String;
        restLat = ((p['restaurante_lat'] ?? p['lat'] ?? 16.2519) as num).toDouble();
        restLng = ((p['restaurante_lng'] ?? p['lng'] ?? -92.1345) as num).toDouble();
      }

      paradasReal.add({
        'id': p['id'],
        'isPickup': true,
        'action': 'RECOGER EN',
        'title': restNombre,
        'subtitle': 'Pedido #$shortId',
        'completado': pickupDone,
        'targetLat': restLat,
        'targetLng': restLng,
        'telefono': rest is Map ? rest['telefono'] : p['restaurante_telefono'],
        'productos': productList,
        'nota': notaRestaurante,
      });
      
      paradasReal.add({
        'id': p['id'],
        'isPickup': false,
        'action': 'ENTREGAR A',
        'title': p['cliente_nombre'] ?? p['nombre_cliente'] ?? 'Cliente',
        'subtitle': p['direccion'] ?? p['direccion_entrega'] ?? 'Dirección en detalle',
        'completado': dropoffDone,
        'targetLat': (p['cliente_lat'] as num?)?.toDouble() ?? 16.2519,
        'targetLng': (p['cliente_lng'] as num?)?.toDouble() ?? -92.1345,
        'telefono': p['cliente_tel'],
        'productos': productList,
        'nota': notaCliente,
      });
    }

    paradasReal.sort((a, b) {
      if (a['completado'] && !b['completado']) return -1;
      if (!a['completado'] && b['completado']) return 1;
      return 0;
    });

    final total = paradasReal.length;
    final etaTotal = (total - completadas) * 12;
    final pendingPickups = paradasReal.where((s) => s['isPickup'] && !s['completado']).length;
    final hasAgrupa = pendingPickups > 1;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        Set<int> expandedItems = {};

        return StatefulBuilder(
          builder: (context, setStateModal) {
            return BackdropFilter(
              filter: ui.ImageFilter.blur(sigmaX: 15, sigmaY: 15),
              child: Container(
                height: MediaQuery.of(context).size.height * 0.85,
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1E1E1E).withOpacity(0.85) : Colors.white.withOpacity(0.9),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
                  border: Border.all(color: Colors.white.withOpacity(0.1)),
                ),
                child: Column(
                  children: [
                    const SizedBox(height: 12),
                    Container(width: 40, height: 4, decoration: BoxDecoration(color: isDark ? Colors.white24 : Colors.grey[300], borderRadius: BorderRadius.circular(4))),
                    const SizedBox(height: 24),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(color: isDark ? Colors.white10 : Colors.grey[100], borderRadius: BorderRadius.circular(12)),
                            child: const Icon(Icons.route_rounded, color: Colors.grey),
                          ),
                          const SizedBox(width: 16),
                          const Text('Itinerario del Viaje', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('$completadas de $total paradas completadas', style: const TextStyle(color: Colors.grey, fontWeight: FontWeight.w600)),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              const Icon(Icons.flag_rounded, size: 16), const SizedBox(width: 4), Text('$total paradas', style: const TextStyle(fontWeight: FontWeight.w900)),
                              const SizedBox(width: 16),
                              const Icon(Icons.schedule_rounded, size: 16), const SizedBox(width: 4), Text('~$etaTotal min restantes', style: const TextStyle(fontWeight: FontWeight.w900)),
                            ],
                          ),
                          if (hasAgrupa) ...[
                            const SizedBox(height: 16),
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(color: isDark ? Colors.white10 : Colors.grey[100], borderRadius: BorderRadius.circular(16)),
                              child: Row(
                                children: [
                                  const Icon(Icons.lightbulb_circle_rounded, color: Colors.orange, size: 24),
                                  const SizedBox(width: 8),
                                  Expanded(child: Text('Tienes varios pedidos cerca — agrupa recolecciones para ahorrar tiempo.', style: TextStyle(color: isDark ? Colors.white70 : Colors.black87, fontSize: 13))),
                                ],
                              ),
                            )
                          ]
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                    Expanded(
                      child: ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        itemCount: paradasReal.length,
                        itemBuilder: (ctx, i) {
                          final p = paradasReal[i];
                          final isDone = p['completado'];
                          final isActive = !isDone && (i == 0 || paradasReal[i-1]['completado']);
                          final isExpanded = expandedItems.contains(i);
                          final iconColor = p['isPickup'] ? const Color(0xFF10B981) : const Color(0xFFF59E0B);
                          
                          double distToNext = 0;
                          if (i < paradasReal.length - 1) {
                            final nextP = paradasReal[i+1];
                            distToNext = Geolocator.distanceBetween(
                              p['targetLat'], p['targetLng'],
                              nextP['targetLat'], nextP['targetLng']
                            ) / 1000.0;
                          }
                          final etaNext = (distToNext / 25.0 * 60.0).ceil();

                          return Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Column(
                                children: [
                                  Container(
                                    width: 32, height: 32,
                                    decoration: BoxDecoration(
                                      color: isDone ? Colors.grey : (isActive ? iconColor : Colors.grey[300]),
                                      shape: BoxShape.circle,
                                      boxShadow: isActive ? [BoxShadow(color: iconColor.withOpacity(0.5), blurRadius: 10, spreadRadius: 2)] : [],
                                    ),
                                    alignment: Alignment.center,
                                    child: isDone 
                                      ? const Icon(Icons.check_rounded, color: Colors.white, size: 16)
                                      : Text('${i+1}', style: TextStyle(color: isActive ? Colors.white : Colors.black54, fontWeight: FontWeight.bold)),
                                  ),
                                  if (i < paradasReal.length - 1)
                                    Container(
                                      width: 40,
                                      padding: const EdgeInsets.symmetric(vertical: 4),
                                      child: Column(
                                        children: [
                                          Container(width: 2, height: 10, color: isDone ? Colors.grey : Colors.grey[300]),
                                          if (distToNext > 0.05) ...[
                                            const SizedBox(height: 4),
                                            Text('↓', style: TextStyle(fontSize: 10, color: isDone ? Colors.grey : Colors.grey[400])),
                                            Text('${distToNext.toStringAsFixed(1)}km', style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: isDone ? Colors.grey : Colors.grey[400])),
                                            Text('${etaNext}m', style: TextStyle(fontSize: 9, color: isDone ? Colors.grey : Colors.grey[400])),
                                            const SizedBox(height: 4),
                                          ],
                                          Container(width: 2, height: 10, color: isDone ? Colors.grey : Colors.grey[300]),
                                        ],
                                      ),
                                    )
                                ],
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: GestureDetector(
                                  onTap: () {
                                    Navigator.pop(context);
                                    context.push('/pedidos/${p['pedido']['id']}');
                                  },
                                  child: AnimatedContainer(
                                    duration: const Duration(milliseconds: 300),
                                    margin: const EdgeInsets.only(bottom: 16),
                                    padding: const EdgeInsets.all(16),
                                    decoration: BoxDecoration(
                                      color: isDark ? Colors.white.withOpacity(0.02) : Colors.white.withOpacity(0.5),
                                      border: Border.all(color: isActive ? iconColor : (isDark ? Colors.white10 : Colors.grey[300]!), width: isActive ? 1.5 : 1.0),
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Icon(p['isPickup'] ? Icons.storefront_rounded : Icons.person_pin_circle_rounded, size: 14, color: iconColor),
                                            const SizedBox(width: 6),
                                            Text(p['action'], style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: iconColor)),
                                            const Spacer(),
                                            Icon(Icons.arrow_forward_ios_rounded, size: 14, color: Colors.grey),
                                          ],
                                        ),
                                        const SizedBox(height: 8),
                                        Text(p['title'], style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, decoration: isDone ? TextDecoration.lineThrough : null)),
                                        const SizedBox(height: 4),
                                        Text(p['subtitle'], style: const TextStyle(color: Colors.grey)),
                                        
                                        if (p['nota'].toString().trim().isNotEmpty) ...[
                                          const SizedBox(height: 12),
                                          Container(
                                            padding: const EdgeInsets.all(8),
                                            decoration: BoxDecoration(color: Colors.orange.withOpacity(0.1), borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.orange.withOpacity(0.5))),
                                            child: Row(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                const Icon(Icons.warning_rounded, size: 14, color: Colors.orange),
                                                const SizedBox(width: 6),
                                                Expanded(child: Text(p['nota'], style: const TextStyle(fontSize: 12, color: Colors.orange, fontWeight: FontWeight.bold))),
                                              ],
                                            ),
                                          )
                                        ],
                                        
                                        if (isExpanded && (p['productos'] as List).isNotEmpty) ...[
                                          const SizedBox(height: 16),
                                          const Divider(height: 1),
                                          const SizedBox(height: 12),
                                          const Text('PRODUCTOS DEL PEDIDO', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey)),
                                          const SizedBox(height: 8),
                                          ...(p['productos'] as List).map((prod) => Padding(
                                            padding: const EdgeInsets.only(bottom: 4),
                                            child: Row(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text('${prod['cantidad'] ?? 1}x ', style: const TextStyle(fontWeight: FontWeight.bold)),
                                                Expanded(child: Text('${prod['nombre'] ?? 'Producto'}')),
                                              ],
                                            ),
                                          )),
                                        ],
                                        
                                        if (isActive) ...[
                                          const SizedBox(height: 16),
                                          Row(
                                            children: [
                                              if (p['telefono'] != null && p['telefono'].toString().isNotEmpty)
                                                GestureDetector(
                                                  onTap: () {
                                                    launchUrl(Uri.parse('tel:${p['telefono']}'));
                                                  },
                                                  child: Container(
                                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                                    decoration: BoxDecoration(color: isDark ? Colors.white10 : Colors.grey[200], borderRadius: BorderRadius.circular(12)),
                                                    child: Row(
                                                      children: [
                                                        Icon(Icons.call_rounded, size: 14, color: isDark ? Colors.white : Colors.black),
                                                        const SizedBox(width: 4),
                                                        Text('Llamar', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: isDark ? Colors.white : Colors.black)),
                                                      ],
                                                    ),
                                                  ),
                                                ),
                                              const SizedBox(width: 8),
                                              GestureDetector(
                                                onTap: () async {
                                                  final url = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=${p['targetLat']},${p['targetLng']}');
                                                  if (await canLaunchUrl(url)) launchUrl(url, mode: LaunchMode.externalApplication);
                                                },
                                                child: Container(
                                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                                  decoration: BoxDecoration(color: iconColor.withOpacity(0.15), borderRadius: BorderRadius.circular(12)),
                                                  child: Row(
                                                    children: [
                                                      Icon(Icons.navigation_rounded, size: 14, color: iconColor),
                                                      const SizedBox(width: 4),
                                                      Text('Ir con GPS', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: iconColor)),
                                                    ],
                                                  ),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                ),
                              )
                            ],
                          );
                        },
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(24),
                      child: SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: () => Navigator.pop(ctx),
                          style: FilledButton.styleFrom(
                            backgroundColor: Colors.black,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          ),
                          child: const Text('CERRAR', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
                        ),
                      ),
                    )
                  ],
                ),
              ),
            );
          }
        );
      },
    );
  }

  Widget _buildOfflineDashboard(BuildContext context, bool isDark, ColorScheme cs, dynamic ganancias) {
    final deuda = widget.stats?['deuda'] ?? 0.0;
    
    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      child: Padding(
        padding: const EdgeInsets.only(bottom: 120, top: 40, left: 16, right: 16),
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0.0, end: 1.0),
          duration: const Duration(milliseconds: 700),
          curve: Curves.easeOutCubic,
          builder: (context, value, child) {
            return Transform.translate(
              offset: Offset(0, 40 * (1 - value)),
              child: Opacity(
                opacity: value,
                child: child,
              ),
            );
          },
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Texto de Estado
              Center(
                child: Text(
                  'Estás desconectado',
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.5,
                    color: cs.onSurface,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Center(
                child: Text(
                  'Conéctate para empezar a recibir\npedidos y generar ganancias.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 15,
                    color: cs.onSurfaceVariant.withOpacity(0.7),
                    fontWeight: FontWeight.w500,
                    height: 1.4,
                  ),
                ),
              ),
              const SizedBox(height: 64),
              // Botón Circular "INICIAR"
              Center(
                child: GestureDetector(
                  onTap: () => _toggleStatus(true),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    width: 160,
                    height: 160,
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: isDark ? Colors.white10 : Colors.black12,
                        width: 2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: isDark ? Colors.black54 : Colors.black12,
                          blurRadius: 30,
                          spreadRadius: 5,
                          offset: const Offset(0, 10),
                        ),
                      ],
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.power_settings_new_rounded, color: isDark ? Colors.white : Colors.black, size: 48),
                        const SizedBox(height: 8),
                        Text(
                          'INICIAR',
                          style: TextStyle(
                            color: isDark ? Colors.white : Colors.black,
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 2,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 72),
              // Tarjeta de Billetera (Rediseñada)
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1E293B) : Colors.white,
                  borderRadius: BorderRadius.circular(32),
                  border: Border.all(color: isDark ? Colors.white10 : Colors.black.withOpacity(0.05)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(isDark ? 0.3 : 0.05),
                      blurRadius: 20,
                      offset: const Offset(0, 10),
                    )
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: const Color(0xFF10B981).withOpacity(0.15),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(Icons.account_balance_wallet_rounded, color: Color(0xFF10B981), size: 20),
                            ),
                            const SizedBox(width: 12),
                            Text(
                              'MI BILLETERA',
                              style: TextStyle(
                                fontSize: 14,
                                color: isDark ? Colors.white70 : Colors.black54,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.2,
                              ),
                            ),
                          ],
                        ),
                        GestureDetector(
                          onTap: () => context.push('/ganancias'),
                          child: Icon(Icons.chevron_right_rounded, color: isDark ? Colors.white38 : Colors.black38, size: 24),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    Row(
                      children: [
                        // Ganancias (tap a /ganancias)
                        Expanded(
                          child: GestureDetector(
                            onTap: () => context.push('/ganancias'),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Ganancias', style: TextStyle(fontSize: 13, color: isDark ? Colors.white70 : Colors.black54, fontWeight: FontWeight.w600)),
                                const SizedBox(height: 4),
                                Text('\$${(ganancias as num).toStringAsFixed(2)}', style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Color(0xFF10B981), letterSpacing: -1)),
                              ],
                            ),
                          ),
                        ),
                        Container(width: 1, height: 50, color: isDark ? Colors.white12 : Colors.black12),
                        // Efectivo a entregar (tap abre desglose)
                        Expanded(
                          child: GestureDetector(
                            onTap: (deuda as num) > 0 ? () => _mostrarDeudaDetalleLocal(context, isDark) : null,
                            child: Padding(
                              padding: const EdgeInsets.only(left: 16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Text('Efectivo a entregar', style: TextStyle(fontSize: 13, color: isDark ? Colors.white70 : Colors.black54, fontWeight: FontWeight.w600)),
                                      if ((deuda as num) > 0) ...[
                                        const SizedBox(width: 4),
                                        const Icon(Icons.info_outline_rounded, size: 14, color: Color(0xFFF43F5E)),
                                      ],
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  Text('\$${(deuda as num).toStringAsFixed(2)}', style: TextStyle(
                                    fontSize: 24, fontWeight: FontWeight.w900,
                                    color: (deuda as num) > 0 ? const Color(0xFFF43F5E) : (isDark ? Colors.white54 : Colors.black38),
                                    letterSpacing: -1,
                                    decoration: (deuda as num) > 0 ? TextDecoration.underline : null,
                                    decorationColor: const Color(0xFFF43F5E),
                                  )),
                                ],
                              ),
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
      ),
    );
  }

  void _mostrarDeudaDetalleLocal(BuildContext context, bool isDark) {
    final deuda = widget.stats?['deuda'] ?? 0.0;
    
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 24),
                decoration: BoxDecoration(
                  color: isDark ? Colors.white24 : Colors.grey[300],
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              const Row(
                children: [
                  Icon(Icons.info_outline_rounded, color: Color(0xFFF43F5E), size: 28),
                  SizedBox(width: 12),
                  Text(
                    'Efectivo a Entregar',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Text(
                'Este es el monto total en efectivo que has cobrado de los pedidos en efectivo y que debes liquidar con la administración o restaurantes.',
                style: TextStyle(fontSize: 14, color: Colors.grey),
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: const Color(0xFFF43F5E).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFF43F5E).withOpacity(0.3)),
                ),
                child: Column(
                  children: [
                    const Text('Deuda Total Acumulada', style: TextStyle(color: Color(0xFFF43F5E), fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Text(
                      '\$${(deuda as num).toStringAsFixed(2)}',
                      style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w900, color: Color(0xFFF43F5E), letterSpacing: -1),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),
              FilledButton(
                onPressed: () => Navigator.pop(ctx),
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                child: const Text('ENTENDIDO', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(height: 24),
            ],
          ),
        );
      },
    );
  }

}

class _TopToastWidget extends StatefulWidget {
  final String message;
  final Color color;
  final IconData icon;
  final VoidCallback onDismiss;

  const _TopToastWidget({
    Key? key,
    required this.message,
    required this.color,
    required this.icon,
    required this.onDismiss,
  }) : super(key: key);

  @override
  State<_TopToastWidget> createState() => _TopToastWidgetState();
}

class _TopToastWidgetState extends State<_TopToastWidget> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 300));
    _slideAnimation = Tween<Offset>(begin: const Offset(0, -1.5), end: Offset.zero).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutBack)
    );
    _controller.forward();

    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) {
        _controller.reverse().then((_) => widget.onDismiss());
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: 50,
      left: 16,
      right: 16,
      child: Material(
        color: Colors.transparent,
        child: SlideTransition(
          position: _slideAnimation,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: widget.color,
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(color: widget.color.withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4))
              ],
            ),
            child: Row(
              children: [
                Icon(widget.icon, color: Colors.white),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    widget.message,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TipItem extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String text;
  final bool? isCheck;

  const _TipItem({Key? key, required this.icon, required this.color, required this.text, this.isCheck}) : super(key: key);

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

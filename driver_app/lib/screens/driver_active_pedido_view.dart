import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/pedido_model.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;
import 'package:http/http.dart' as http;
import 'package:geolocator/geolocator.dart';
import 'dart:io';
import '../services/local_database.dart';
import 'driver_pedidos_screen.dart' show pedidosActivosProvider;
import '../providers/route_optimizer_provider.dart';
import '../models/route_stop.dart';
import '../core/theme.dart';
import 'package:action_slider/action_slider.dart';
import 'package:latlong2/latlong.dart';
import '../widgets/mapbox_navigation_map.dart';
import '../services/mapbox_directions_service.dart';

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
class DriverActivePedidoView extends ConsumerStatefulWidget {
  final PedidoModel pedido;
  final VoidCallback? onRefresh;

  const DriverActivePedidoView({
    super.key,
    required this.pedido,
    this.onRefresh,
  });

  @override
  ConsumerState<DriverActivePedidoView> createState() => _DriverActivePedidoViewState();
}

class _DriverActivePedidoViewState extends ConsumerState<DriverActivePedidoView> with TickerProviderStateMixin {
  bool _isLoadingAction = false;
  String? _overrideEstado; // Congela la UI para mostrar animaciones de éxito

  // Estado local para simular la confirmación de recolección en el paso "Llegaste"
  bool _itemsConfirmed = false;

  // ── MAPA ──────────────────────────────────────────────────────────────────
  LatLng? _driverPosition;
  double? _driverHeading;
  StreamSubscription<Position>? _positionStream;

  bool _isNavigating = false; // Modo seguimiento activo
  bool _isFullScreenMap = false; // Modo mapa completo

  // Navegación UI
  String _etaString = '';
  String _distanceString = '';
  int? _etaSeconds;
  
  int _frameRouteTrigger = 0;
  Map<String, dynamic>? _routeGeometry;
  List<List<double>>? _trafficSignals;

  @override
  void initState() {
    super.initState();
    _initGpsStream();
  }





  @override
  void didUpdateWidget(covariant DriverActivePedidoView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.pedido.estado != widget.pedido.estado) {
      _itemsConfirmed = false;
      _fetchETA(); // Actualizar ruta y ETA
    }
  }

  @override
  void dispose() {
    _positionStream?.cancel();
    super.dispose();
  }

  // ── GPS Stream ────────────────────────────────────────────────────────────
  Future<void> _initGpsStream() async {
    try {
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) return;

      bool hasFetchedETA = false;
      DateTime? lastEtaFetch;
      final lastPos = await Geolocator.getLastKnownPosition();
      if (lastPos != null && mounted) {
        setState(() {
          _driverPosition = LatLng(lastPos.latitude, lastPos.longitude);
        });
      }
      
      hasFetchedETA = true;
      lastEtaFetch = DateTime.now();
      _fetchETA();

      _positionStream = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 2, // Bajamos el filtro a 2 metros para actualizaciones mucho más fluidas
        ),
      ).listen((Position pos) {
        if (!mounted) return;
        final newLatLng = LatLng(pos.latitude, pos.longitude);
        
        setState(() {
          _driverPosition = newLatLng;
          // ROTACIÓN MAGICA:
          // Si va a más de 1.5 m/s, usamos el rumbo real del GPS (conduciendo).
          // Si está parado o caminando muy lento, apuntamos la cámara hacia el destino
          // para que la ruta siempre se dibuje hacia ARRIBA por defecto.
          if (pos.speed > 1.5 && pos.heading >= 0) {
            _driverHeading = pos.heading;
          } else {
            final dest = _getDestinationLatLng();
            if (dest != null) {
              double brng = Geolocator.bearingBetween(
                pos.latitude, pos.longitude,
                dest.latitude, dest.longitude,
              );
              if (brng < 0) brng += 360;
              _driverHeading = brng;
            }
          }
        });
        
        final now = DateTime.now();
        if (!hasFetchedETA || (lastEtaFetch != null && now.difference(lastEtaFetch!).inSeconds >= 15)) {
          hasFetchedETA = true;
          lastEtaFetch = now;
          _fetchETA();
        }
      });
    } catch (e) {
      debugPrint('Error iniciando GPS stream en mapa: $e');
    }
  }



  /// Devuelve la coordenada destino según el estado actual del pedido
  LatLng? _getDestinationLatLng() {
    final p = widget.pedido;
    switch (p.estado) {
      case 'asignado':
        if (p.restauranteLat != null && p.restauranteLng != null) {
          return LatLng(p.restauranteLat!, p.restauranteLng!);
        }
        if (p.lat != null && p.lng != null) return LatLng(p.lat!, p.lng!);
        return null;
      case 'recibido':
        // El repartidor ya llegó al restaurante. Ahora quiere ver a dónde va a ir (el cliente).
        if (p.latEntrega != null && p.lngEntrega != null) {
          return LatLng(p.latEntrega!, p.lngEntrega!);
        }
        if (p.lat != null && p.lng != null) return LatLng(p.lat!, p.lng!);
        return null;
      case 'en_camino':
        if (p.latEntrega != null && p.lngEntrega != null) {
          return LatLng(p.latEntrega!, p.lngEntrega!);
        }
        if (p.lat != null && p.lng != null) return LatLng(p.lat!, p.lng!);
        return null;
      default:
        return null;
    }
  }

  // ── ETA ──────────────────────────────────────────────────────────────────
  Future<void> _fetchETA() async {
    if (!mounted) return;
    try {
      final pos = await Geolocator.getLastKnownPosition() ?? await Geolocator.getCurrentPosition();
      final dest = _getDestinationLatLng();
      if (dest == null) return;

      final routeData = await MapboxDirectionsService.getRoute(
        originLat: pos.latitude,
        originLng: pos.longitude,
        destLat: dest.latitude,
        destLng: dest.longitude,
      );

      if (routeData != null && mounted) {
        setState(() {
          _routeGeometry = routeData['geometry'];
          _trafficSignals = routeData['traffic_signals'] as List<List<double>>?;
          _etaSeconds = routeData['duration_seconds'];
          _etaString = routeData['eta_string'];
          _distanceString = routeData['distance_string'];
        });
      }
    } catch (e) {
      debugPrint('📍 [ETA] Error fetchETA: $e');
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  String _getArrivalTime() {
    if (_etaSeconds == null) {
//       debugPrint('📍 [ETA] _getArrivalTime: _etaSeconds is null');
      return '--:--';
    }
    final now = DateTime.now();
    final arrival = now.add(Duration(seconds: _etaSeconds!));
    final hour = arrival.hour > 12 ? arrival.hour - 12 : (arrival.hour == 0 ? 12 : arrival.hour);
    final minute = arrival.minute.toString().padLeft(2, '0');
    final formattedTime = '$hour:$minute';
    
//     debugPrint('📍 [ETA] _getArrivalTime: now=$now, seconds=$_etaSeconds, result=$formattedTime');
    
    return formattedTime;
  }

  Future<void> _launchMaps(double lat, double lng) async {
    final url = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng');
    try {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } catch (e) {
//       debugPrint('No se pudo abrir Maps: $e');
    }
  }

  Future<void> _callPhone(String phone) async {
    final url = Uri.parse('tel:$phone');
    try {
      await launchUrl(url);
    } catch (e) {
//       debugPrint('No se pudo llamar: $e');
    }
  }

  Future<void> _openWhatsApp(String phone, String? name, String estado) async {
    final cleanPhone = phone.replaceAll(RegExp(r'\D'), '');
    final nombreStr = name != null && name.trim().isNotEmpty ? ' $name' : '';
    String mensaje;
    if (estado == 'asignado' || estado == 'recibido') {
      mensaje = 'Hola$nombreStr, soy tu repartidor de Estrella 🛵. Ya estoy atendiendo tu pedido.';
    } else if (estado == 'en_camino') {
      mensaje = 'Hola$nombreStr, soy tu repartidor de Estrella 🛵. ¡Voy en camino a tu ubicación!';
    } else {
      mensaje = 'Hola$nombreStr, soy tu repartidor de Estrella 🛵. Te contacto sobre tu pedido.';
    }
    final encodedMessage = Uri.encodeComponent(mensaje);
    final url = Uri.parse('https://wa.me/52$cleanPhone?text=$encodedMessage');
    try {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } catch (e) {
//       debugPrint('No se pudo abrir WhatsApp: $e');
    }
  }

  // ── Build Principal ───────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
//     print('DEBUG DriverActivePedidoView build() -> ID: ${widget.pedido.id}, Estado: ${widget.pedido.estado}, Tipo: ${widget.pedido.tipoPedido}');
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bgColor = isDark ? const Color(0xFF0F0F0F) : const Color(0xFFF3F4F6);
    final pedido = widget.pedido;
    final isMandadito = pedido.tipoPedido == 'mandadito' || pedido.tipoPedido == 'compra';

    // Mostrar mapa en asignado, recibido y en_camino
    final showMap = ['asignado', 'recibido', 'en_camino'].contains(pedido.estado);

    return WillPopScope(
      onWillPop: () async {
        if (_isFullScreenMap) {
          setState(() {
            _isFullScreenMap = false;
          });

          return false; // Prevent pop
        }
        
        if (!context.canPop()) {
          context.go('/dashboard');
          return false; // Evita que se cierre la app si venimos de una push
        }
        
        return true; // Allow pop (vuelve a la pantalla anterior)
      },
      child: Container(
        color: bgColor,
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final maxH = constraints.maxHeight;
              // Hacemos que el panel inferior sea más pequeño y el mapa más grande
              // Si la pantalla es alta, dejamos 380px fijos para el panel inferior, el resto es mapa.
              final normalMapHeight = (maxH > 600 ? maxH - 380.0 : maxH * 0.5);
              // Si está en pantalla completa, dejamos 40px para el "Drag Handle" y evitar overflow.
              final mapHeight = _isFullScreenMap ? maxH - 40.0 : normalMapHeight;
              final bottomPanelHeight = maxH - normalMapHeight;
//               print('DEBUG LAYOUT: maxH=$maxH, mapHeight=$mapHeight, bottomPanelHeight=$bottomPanelHeight, showMap=$showMap, isFullScreen=$_isFullScreenMap');

              return Stack(
                children: [
                  // NUEVO LAYOUT: Columna para evitar bugs de Z-Index con PlatformViews (Google Maps)
                  Column(
                    children: [
                      // 1. MAPA
                      if (showMap)
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 350), // Snappy para evitar el lag del PlatformView
                          curve: Curves.fastOutSlowIn, // Sigue siendo potente pero fluido
                          height: mapHeight,
                          width: double.infinity,
                          child: _buildLiveMap(isDark),
                        ),
                        
                      // 2. CONTENIDO INFERIOR (SCROLL + BOTONES)
                      Expanded(
                        child: Container(
                          decoration: BoxDecoration(
                            color: bgColor,
                            borderRadius: const BorderRadius.vertical(top: Radius.circular(36)),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.08),
                                blurRadius: 40,
                                offset: const Offset(0, -10),
                              )
                            ],
                          ),
                          child: Column(
                            children: [
                              // Drag Handle
                              Center(
                                child: Container(
                                  margin: const EdgeInsets.only(top: 12, bottom: 8),
                                  width: 48,
                                  height: 6,
                                  decoration: BoxDecoration(
                                    color: isDark ? Colors.white24 : Colors.black12,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                ),
                              ),
                              // CONTENIDO SCROLL
                              Expanded(
                                child: AnimatedSwitcher(
                                  duration: const Duration(milliseconds: 350),
                                  switchInCurve: Curves.easeOutCubic,
                                  switchOutCurve: Curves.easeInCubic,
                                  transitionBuilder: (Widget child, Animation<double> animation) {
                                    return FadeTransition(
                                      opacity: animation,
                                      child: SlideTransition(
                                        position: Tween<Offset>(
                                          begin: const Offset(0.02, 0),
                                          end: Offset.zero,
                                        ).animate(animation),
                                        child: child,
                                      ),
                                    );
                                  },
                                  child: SingleChildScrollView(
                                    key: ValueKey<String>(_overrideEstado ?? pedido.estado),
                                    physics: const ClampingScrollPhysics(),
                                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                                    child: isMandadito
                                        ? _buildMandaditoContent(isDark, _overrideEstado ?? pedido.estado)
                                        : _buildRestaurantContent(isDark, _overrideEstado ?? pedido.estado),
                                  ),
                                ),
                              ),
                              // BOTTOM ACTION BAR
                              AnimatedSwitcher(
                                duration: const Duration(milliseconds: 350),
                                transitionBuilder: (child, animation) => FadeTransition(opacity: animation, child: child),
                                child: _buildBottomActionBar(isDark, isMandadito, _overrideEstado ?? pedido.estado),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),

                  // 3. TOP BAR FLOTANTE
                  Positioned(
                    top: 0,
                    left: 0,
                    right: 0,
                    child: _buildTopBar(isDark),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIVE MAP WIDGET
  // ─────────────────────────────────────────────────────────────────────────
  Widget _buildLiveMap(bool isDark) {
    final pedido = widget.pedido;
    final isActive = pedido.estado != 'recibido'; // recibido = mapa estático
    final dest = _getDestinationLatLng();
    final bool isPickup = pedido.estado == 'asignado';

    return Stack(
        children: [
          // ── Mapa ──
          MapboxNavigationMap(
            driverLat: _driverPosition?.latitude,
            driverLng: _driverPosition?.longitude,
            driverHeading: _driverHeading,
            isPickup: isPickup,
            destLat: dest?.latitude,
            destLng: dest?.longitude,
            routeGeometry: _routeGeometry,
            trafficSignals: _trafficSignals,
            followMode: _isNavigating,
            frameRouteTrigger: _frameRouteTrigger,
            onPanMap: () {
              if (_isNavigating) {
                setState(() {
                  _isNavigating = false;
                });
              }
            },
          ),

          // ── Pill de estado (arriba centro/izquierda) ──
          Positioned(
            top: 24,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 10, offset: const Offset(0, 4))],
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.bolt_rounded, size: 20, color: Colors.orange),
                    SizedBox(width: 6),
                    Text('Pedido Activo', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: Colors.black87)),
                  ],
                ),
              ),
            ),
          ),

          // ── Botones de acción arriba derecha ──
          Positioned(
            top: 40,
            right: 12,
            child: Column(
              children: [
                // Zoom In
                GestureDetector(
                  onTap: () {},
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 8, offset: const Offset(0, 2))],
                    ),
                    child: const Icon(Icons.add, size: 20, color: Colors.black87),
                  ),
                ),
                // Zoom Out
                GestureDetector(
                  onTap: () {},
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 8, offset: const Offset(0, 2))],
                    ),
                    child: const Icon(Icons.remove, size: 20, color: Colors.black87),
                  ),
                ),
                // Re-centrar
                GestureDetector(
                  onTap: () {
                    setState(() => _isNavigating = true);
                  },
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 8, offset: const Offset(0, 2))],
                    ),
                    child: const Icon(Icons.my_location_rounded, size: 20, color: Colors.blue),
                  ),
                ),
                  const SizedBox(height: 12),
                  // Botón de navegación / centrar mapa
                  if (isActive)
                    GestureDetector(
                      onTap: () {
                        setState(() => _isNavigating = !_isNavigating);
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 250),
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: _isNavigating ? AppColors.brandRed : Colors.white,
                          shape: BoxShape.circle,
                          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 8, offset: const Offset(0, 2))],
                        ),
                        child: Icon(
                          _isNavigating ? Icons.navigation_rounded : Icons.my_location_rounded,
                          size: 18,
                          color: _isNavigating ? Colors.white : Colors.black87,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          
          // Indicador "Mapa estático" cuando está en recibido
          if (pedido.estado == 'recibido')
            Positioned(
              bottom: 10,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text('Recolectando pedido...', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              ),
            ),
            
          // ── Panel Inferior (Estilo Navegación Google Maps) ──
          if (_isFullScreenMap)
            Positioned(
              bottom: 24,
              left: 16,
              right: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF2C2C2E) : Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 10, offset: const Offset(0, 4)),
                  ],
                ),
                child: Row(
                  children: [
                    // Texto ETA y distancia
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _etaString.isEmpty ? '-- min' : _etaString,
                            style: TextStyle(
                              fontSize: 34,
                              fontWeight: FontWeight.w900,
                              color: isDark ? Colors.white : Colors.black87,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _distanceString.isEmpty ? '-- km' : _distanceString,
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: isDark ? Colors.white70 : Colors.black54,
                            ),
                          ),
                        ],
                      ),
                    ),
                    // Botón Alerta / Peligro
                    GestureDetector(
                      onTap: () {
                        // TODO: Implementar reporte de incidencia
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Función de reporte en desarrollo')),
                        );
                      },
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: const BoxDecoration(
                          color: Color(0xFFFFCC00),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.warning_rounded, color: Colors.black, size: 28),
                      ),
                    ),
                    const SizedBox(width: 12),
                    // Botón Salir de pantalla completa
                    GestureDetector(
                      onTap: () {
                        setState(() {
                          _isFullScreenMap = false;
                          _frameRouteTrigger++;
                        });
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                        decoration: BoxDecoration(
                          color: AppColors.brandRed,
                          borderRadius: BorderRadius.circular(24),
                        ),
                        child: const Text('Salir', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UI COMPONENTS - MAIN LAYOUT
  // ─────────────────────────────────────────────────────────────────────────
  Widget _buildTopBar(bool isDark) {
    final textColor = isDark ? Colors.white : Colors.black;
    String title = '';

    switch (widget.pedido.estado) {
      case 'ofrecido':
      case 'pendiente':
      case 'pendiente_pago':
        title = 'Nuevo Servicio';
        break;
      case 'asignado':
        title = 'Dirígete al Origen';
        break;
      case 'recibido':
        title = 'Llegaste';
        break;
      case 'en_camino':
        title = 'En Camino';
        break;
      case 'entregado':
        title = 'Completado';
        break;
    }

    return ClipRect(
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
          color: isDark ? Colors.black.withValues(alpha: 0.7) : Colors.white.withValues(alpha: 0.7),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  GestureDetector(
                    onTap: () {
                      if (context.canPop()) {
                        context.pop();
                      } else {
                        context.go('/dashboard');
                      }
                    },
                    child: Container(
                      width: 44,
                      height: 44,
                      margin: const EdgeInsets.only(right: 12),
                      decoration: BoxDecoration(
                        color: isDark ? Colors.grey[800] : Colors.black,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 18),
                    ),
                  ),
                  Container(
                    width: 44,
                    height: 44,
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(colors: [Colors.indigo, Colors.purple]),
                      shape: BoxShape.circle,
                      boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 4, offset: Offset(0, 2))],
                    ),
                    child: const Center(child: Text('JC', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold))),
                  ),
                ],
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: textColor,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.green.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      'Ganancia est: \$${(widget.pedido.precioEntrega ?? widget.pedido.costoEnvioCalculado).toStringAsFixed(2)}', 
                      style: const TextStyle(color: Colors.green, fontSize: 12, fontWeight: FontWeight.bold)
                    ),
                  ),
                ],
              ),
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: isDark ? Colors.grey[800] : Colors.grey[100],
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.more_horiz_rounded, color: textColor.withValues(alpha: 0.6)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showItineraryBottomSheet(BuildContext context, bool isDark) {
    final parentContext = this.context; // Guardamos el contexto del padre
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Consumer(
          builder: (context, ref, child) {
            final routeAsync = ref.watch(optimizedRouteProvider);
            final stops = routeAsync.valueOrNull ?? [];
            
            return Container(
              height: MediaQuery.of(context).size.height * 0.7,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1C1C1E) : Colors.white,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 5,
                      margin: const EdgeInsets.only(bottom: 24),
                      decoration: BoxDecoration(
                        color: isDark ? Colors.white24 : Colors.black12,
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),
                  Text(
                    'Itinerario Inteligente',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: isDark ? Colors.white : Colors.black87),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Ruta optimizada para ahorrar tiempo y gasolina.',
                    style: TextStyle(fontSize: 14, color: isDark ? Colors.white70 : Colors.black54),
                  ),
                  const SizedBox(height: 24),
                  
                  if (routeAsync.isLoading)
                    const Expanded(child: Center(child: CircularProgressIndicator(color: Color(0xFF5038ED))))
                  else if (stops.isEmpty)
                    const Expanded(child: Center(child: Text('No hay paradas pendientes.')))
                  else
                    Expanded(
                      child: ListView.builder(
                        itemCount: stops.length,
                        itemBuilder: (context, index) {
                          final stop = stops[index];
                          final isPickup = stop.type == StopType.pickup;
                          
                          return InkWell(
                            onTap: () {
                              Navigator.pop(context); // Close bottom sheet
                              if (stop.pedido.id != widget.pedido.id) {
                                // Navigate to the selected order usando el contexto del padre
                                parentContext.pushReplacement('/pedidos/${stop.pedido.id}');
                              }
                            },
                            child: Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Timeline line and dot
                                  Column(
                                    children: [
                                      Container(
                                        width: 32,
                                        height: 32,
                                        decoration: BoxDecoration(
                                          color: isPickup ? const Color(0xFFF9F5FF) : const Color(0xFFF3E8FF),
                                          shape: BoxShape.circle,
                                          border: Border.all(
                                            color: stop.pedido.id == widget.pedido.id ? const Color(0xFF7C3AED) : Colors.transparent,
                                            width: 2,
                                          )
                                        ),
                                        child: Icon(
                                          isPickup ? Icons.storefront_rounded : Icons.person_pin_circle_rounded,
                                          size: 16,
                                          color: const Color(0xFF7C3AED),
                                        ),
                                      ),
                                      if (index < stops.length - 1)
                                        Container(
                                          width: 2,
                                          height: 40,
                                          color: isDark ? Colors.white12 : Colors.black12,
                                          margin: const EdgeInsets.symmetric(vertical: 4),
                                        )
                                    ],
                                  ),
                                  const SizedBox(width: 16),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Parada ${index + 1}',
                                          style: const TextStyle(color: Color(0xFF7C3AED), fontSize: 12, fontWeight: FontWeight.bold),
                                        ),
                                        Text(
                                          stop.title,
                                          style: TextStyle(
                                            fontSize: 16, 
                                            fontWeight: FontWeight.bold,
                                            color: isDark ? Colors.white : Colors.black87,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          stop.address,
                                          style: const TextStyle(color: Colors.grey, fontSize: 13),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ],
                                    ),
                                  ),
                                  if (stop.pedido.id == widget.pedido.id)
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF7C3AED),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: const Text('ACTUAL', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                                    )
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                ],
              ),
            );
          }
        );
      },
    );
  }

  Widget _buildRestaurantContent(bool isDark, String estadoActual) {
    final pedido = widget.pedido;

    // Widget del panel de ETA y Distancia
    Widget buildETAPanel() {
      if (_etaString.isEmpty) return const SizedBox.shrink();
      return Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF2C2C2E) : const Color(0xFFF3F4F6),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.schedule_rounded, size: 18, color: isDark ? Colors.white70 : Colors.black87),
            const SizedBox(width: 8),
            Text(
              _etaString,
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: Text('•', style: TextStyle(color: Colors.grey, fontSize: 16)),
            ),
            Icon(Icons.route_rounded, size: 18, color: isDark ? Colors.white70 : Colors.black87),
            const SizedBox(width: 8),
            Text(
              _distanceString,
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
          ],
        ),
      );
    }

    switch (estadoActual) {
      case 'ofrecido':
      case 'pendiente':
      case 'pendiente_pago':
        return Column(
          children: [
            _InfoCard(
              isDark: isDark,
              title: 'Ganancia Estimada',
              content: Text(
                '\$${(pedido.precioEntrega ?? pedido.costoEnvioCalculado).toStringAsFixed(2)}',
                style: const TextStyle(fontSize: 42, fontWeight: FontWeight.w900),
              ),
            ),
            const SizedBox(height: 12),
            _InfoCard(
              isDark: isDark,
              title: 'Restaurante',
              subtitle: pedido.restaurante ?? 'Restaurante',
              body: pedido.direccion,
              icon: Icons.storefront_rounded,
            ),
            const SizedBox(height: 12),
            _InfoCard(
              isDark: isDark,
              title: 'Entrega',
              subtitle: pedido.clienteNombre ?? 'Cliente',
              body: pedido.direccion,
              icon: Icons.location_on_rounded,
            ),
          ],
        );

      case 'preparando':
      case 'asignado':
        return Column(
          children: [
            buildETAPanel(),
            const SizedBox(height: 16),
            
            Builder(
              builder: (context) {
                final activos = ref.watch(pedidosActivosProvider).value ?? [];
                final hasMultiple = activos.length > 1;
                final routeAsync = ref.watch(optimizedRouteProvider);
                final route = routeAsync.valueOrNull ?? [];
                
                String titleRecoleccion = 'Recoger pedido';
                if (hasMultiple && route.isNotEmpty) {
                  int stopIndex = route.indexWhere((s) => s.id == '${pedido.id}_pickup');
                  if (stopIndex != -1) {
                    titleRecoleccion = 'Parada ${stopIndex + 1} de ${route.length}: Recoger';
                  }
                }

                return Column(
                  children: [
                    // NUEVO DISEÑO (Header Restaurante)
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Icono tienda
                        Container(
                          width: 56,
                          height: 56,
                          decoration: BoxDecoration(
                            color: const Color(0xFFF9F5FF), // Light purple
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: const Icon(Icons.storefront_outlined, color: Color(0xFF7C3AED), size: 28), // Purple
                        ),
                        const SizedBox(width: 16),
                        // Textos
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Pill recolección
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFF9F5FF),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: const Text(
                                      'RECOLECCIÓN',
                                      style: TextStyle(
                                        color: Color(0xFF7C3AED),
                                        fontSize: 10,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: 0.5,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    '#${pedido.id.toString().length > 4 ? pedido.id.toString().substring(0, 4).toUpperCase() : pedido.id.toString()}',
                                    style: const TextStyle(color: Colors.grey, fontSize: 12, fontWeight: FontWeight.bold),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Text(
                                titleRecoleccion,
                                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: isDark ? Colors.white : const Color(0xFF111827)),
                              ),
                      const SizedBox(height: 2),
                      Text(
                        pedido.restaurante ?? 'Restaurante',
                        style: const TextStyle(fontSize: 15, color: Colors.grey, fontWeight: FontWeight.w500),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 24),
            
            // NUEVO DISEÑO (Botones acción)
            Row(
              children: [
                // Botón navegar
                GestureDetector(
                  onTap: () {
                    setState(() {
                      _isNavigating = true;
                      _isFullScreenMap = true;
                    });
                  },
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF2C2C2E) : Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.08)),
                      boxShadow: [
                        BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 10, offset: const Offset(0, 4)),
                      ],
                    ),
                    child: Transform.rotate(
                      angle: 0.5, // Tilted near_me
                      child: Icon(Icons.near_me_outlined, color: isDark ? Colors.white : Colors.black87, size: 24),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                
                // Botón confirmar llegada (Slider REAL)
                Expanded(
                  child: ActionSlider.standard(
                    rolling: true,
                    height: 56,
                    backgroundColor: const Color(0xFF5038ED),
                    toggleColor: Colors.white,
                    icon: const Icon(Icons.chevron_right_rounded, color: Color(0xFF5038ED), size: 28),
                    successIcon: const Icon(Icons.check_rounded, color: Color(0xFF5038ED), size: 28),
                    action: (controller) async {
                      setState(() { _overrideEstado = widget.pedido.estado; });
                      controller.loading(); // Muestra loader nativo
                      await _avanzarEstado(context, 'recibido', 'Llegaste al origen');
                      controller.success(); // Muestra check de éxito
                      await Future.delayed(const Duration(milliseconds: 1500));
                      if (mounted) setState(() { _overrideEstado = null; });
                    },
                    child: const Text('Confirmar Llegada', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                  ),
                ),
              ],
            ),
            
                    const SizedBox(height: 16),
                    
                    // Botón Detalles de la orden
                    GestureDetector(
                      onTap: () {
                        _showOrderDetailsBottomSheet(context, isDark);
                      },
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF2C2C2E) : Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.08)),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.inventory_2_rounded, size: 20, color: Color(0xFF5038ED)),
                            const SizedBox(width: 8),
                            const Text(
                              'Ver detalles de la orden', 
                              style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF5038ED), fontSize: 15)
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (hasMultiple) ...[
                      const SizedBox(height: 12),
                      GestureDetector(
                        onTap: () {
                          _showItineraryBottomSheet(context, isDark);
                        },
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF1C1C1E) : const Color(0xFFF3F4F6),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.05)),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.map_rounded, size: 20, color: Colors.grey),
                              const SizedBox(width: 8),
                              Text(
                                'Ver itinerario (${route.length} paradas)', 
                                style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.grey, fontSize: 15)
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ],
                );
              }
            ),
          ],
        );

      case 'en_camino':
        return Column(
          children: [
            buildETAPanel(),
            const SizedBox(height: 16),
            
            // NUEVO DISEÑO PREMIUM
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF3E8FF), // Light purple
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(Icons.person_pin_circle_rounded, color: Color(0xFF7C3AED), size: 28),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF3E8FF),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text(
                              'ENTREGA',
                              style: TextStyle(color: Color(0xFF7C3AED), fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 0.5),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '#${pedido.id.toString().length > 4 ? pedido.id.toString().substring(0, 4).toUpperCase() : pedido.id.toString()}',
                            style: const TextStyle(color: Colors.grey, fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Builder(
                        builder: (context) {
                          final activos = ref.watch(pedidosActivosProvider).value ?? [];
                          final hasMultiple = activos.length > 1;
                          final route = ref.watch(optimizedRouteProvider).valueOrNull ?? [];
                          
                          String titleEntrega = 'Entregar a ${pedido.clienteNombre ?? "Cliente"}';
                          if (hasMultiple && route.isNotEmpty) {
                            int stopIndex = route.indexWhere((s) => s.id == '${pedido.id}_dropoff');
                            if (stopIndex != -1) {
                              titleEntrega = 'Parada ${stopIndex + 1} de ${route.length}: Entregar a ${pedido.clienteNombre ?? "Cliente"}';
                            }
                          }
                          
                          return Text(
                            titleEntrega,
                            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: isDark ? Colors.white : const Color(0xFF111827)),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          );
                        }
                      ),
                      const SizedBox(height: 2),
                      Text(
                        pedido.direccion ?? "Sin dirección",
                        style: const TextStyle(fontSize: 15, color: Colors.grey, fontWeight: FontWeight.w500),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 24),
            
            Row(
              children: [
                // Chat Button
                GestureDetector(
                  onTap: () {
                    _openWhatsApp(pedido.clienteTel, pedido.clienteNombre, pedido.estado);
                  },
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF2C2C2E) : Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.08)),
                      boxShadow: [
                        BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 10, offset: const Offset(0, 4)),
                      ],
                    ),
                    child: Icon(Icons.chat_bubble_rounded, color: isDark ? Colors.white : const Color(0xFF7C3AED), size: 24),
                  ),
                ),
                const SizedBox(width: 12),
                
                // Map Navigation Button
                GestureDetector(
                  onTap: () {
                    setState(() {
                      _isNavigating = true;
                      _isFullScreenMap = true;
                    });
                  },
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF2C2C2E) : Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.08)),
                      boxShadow: [
                        BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 10, offset: const Offset(0, 4)),
                      ],
                    ),
                    child: Icon(Icons.navigation_rounded, color: isDark ? Colors.white : const Color(0xFF2563EB), size: 24),
                  ),
                ),
                const SizedBox(width: 12),
                
                // Confirm Delivery Button (Slider REAL)
                Expanded(
                  child: ActionSlider.standard(
                    rolling: true,
                    height: 56,
                    backgroundColor: const Color(0xFF10B981),
                    toggleColor: Colors.white,
                    icon: const Icon(Icons.chevron_right_rounded, color: Color(0xFF10B981), size: 28),
                    successIcon: const Icon(Icons.check_rounded, color: Color(0xFF10B981), size: 28),
                    action: (controller) async {
                      setState(() { _overrideEstado = widget.pedido.estado; });
                      controller.loading();
                      await _avanzarEstado(context, 'entregado', 'Pedido entregado');
                      controller.success();
                      await Future.delayed(const Duration(milliseconds: 1500));
                      if (mounted) setState(() { _overrideEstado = null; });
                    },
                    child: const Text('Entregar', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 16),
            
            Builder(
              builder: (context) {
                final activos = ref.watch(pedidosActivosProvider).value ?? [];
                final hasMultiple = activos.length > 1;
                final stopsCount = activos.length * 2;
                
                return Column(
                  children: [
                    GestureDetector(
                      onTap: () {
                        _showOrderDetailsBottomSheet(context, isDark);
                      },
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF2C2C2E) : Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.08)),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.inventory_2_rounded, size: 20, color: Color(0xFF7C3AED)),
                            const SizedBox(width: 8),
                            const Text(
                              'Ver detalles de la orden', 
                              style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF7C3AED), fontSize: 15)
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (hasMultiple) ...[
                      const SizedBox(height: 12),
                      GestureDetector(
                        onTap: () {
                          if (Navigator.canPop(context)) Navigator.pop(context);
                        },
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF1C1C1E) : const Color(0xFFF3F4F6),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.05)),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.map_rounded, size: 20, color: Colors.grey),
                              const SizedBox(width: 8),
                              Text(
                                'Ver itinerario ($stopsCount paradas)', 
                                style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.grey, fontSize: 15)
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ],
                );
              }
            ),
          ],
        );

      case 'listo_para_recoger':
      case 'recibido':
        return Column(
          children: [
            // NUEVO DISEÑO PREMIUM
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF7ED), // Orange light
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(Icons.shopping_bag_rounded, color: Color(0xFFF97316), size: 28), // Orange
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFFF7ED),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text(
                              'EN RESTAURANTE',
                              style: TextStyle(color: Color(0xFFF97316), fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 0.5),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '#${pedido.id.toString().length > 4 ? pedido.id.toString().substring(0, 4).toUpperCase() : pedido.id.toString()}',
                            style: const TextStyle(color: Colors.grey, fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Recoger pedido',
                        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: isDark ? Colors.white : const Color(0xFF111827)),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'Verifica que el pedido esté completo',
                        style: TextStyle(fontSize: 15, color: Colors.grey, fontWeight: FontWeight.w500),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                GestureDetector(
                  onTap: () {
                    // Acción secundaria si es necesario (ej. llamar al restaurante)
                  },
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF2C2C2E) : Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.08)),
                      boxShadow: [
                        BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 10, offset: const Offset(0, 4)),
                      ],
                    ),
                    child: Icon(Icons.storefront_rounded, color: isDark ? Colors.white : const Color(0xFFF97316), size: 24),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ActionSlider.standard(
                    rolling: true,
                    height: 56,
                    backgroundColor: const Color(0xFFF97316), // Orange
                    toggleColor: Colors.white,
                    icon: const Icon(Icons.chevron_right_rounded, color: Color(0xFFF97316), size: 28),
                    successIcon: const Icon(Icons.check_rounded, color: Color(0xFFF97316), size: 28),
                    action: (controller) async {
                      if (pedido.pickupPin != null && pedido.pickupPin!.isNotEmpty) {
                        controller.reset(); // Regresamos el slider ya que el modal toma control
                        await _mostrarDialogoPin(context, pedido.pickupPin!);
                      } else {
                        setState(() { _overrideEstado = widget.pedido.estado; });
                        controller.loading();
                        await _avanzarEstado(context, 'en_camino', 'Recolección confirmada');
                        controller.success();
                        await Future.delayed(const Duration(milliseconds: 1500));
                        if (mounted) setState(() { _overrideEstado = null; });
                      }
                    },
                    child: const Text('Confirmar recolección', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Builder(
              builder: (context) {
                final activos = ref.watch(pedidosActivosProvider).value ?? [];
                final hasMultiple = activos.length > 1;
                final stopsCount = activos.length * 2;
                
                return Column(
                  children: [
                    GestureDetector(
                      onTap: () {
                        _showOrderDetailsBottomSheet(context, isDark);
                      },
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF2C2C2E) : Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.08)),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.inventory_2_rounded, size: 20, color: Color(0xFFF97316)),
                            const SizedBox(width: 8),
                            const Text(
                              'Ver detalles de la orden', 
                              style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFFF97316), fontSize: 15)
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (hasMultiple) ...[
                      const SizedBox(height: 12),
                      GestureDetector(
                        onTap: () {
                          if (Navigator.canPop(context)) Navigator.pop(context);
                        },
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF1C1C1E) : const Color(0xFFF3F4F6),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.05)),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.map_rounded, size: 20, color: Colors.grey),
                              const SizedBox(width: 8),
                              Text(
                                'Ver itinerario ($stopsCount paradas)', 
                                style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.grey, fontSize: 15)
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ],
                );
              }
            ),
          ],
        );

      case 'entregado':
        return const Center(
          child: Padding(
            padding: EdgeInsets.all(32.0),
            child: Column(
              children: [
                Icon(Icons.check_circle_rounded, size: 80, color: AppColors.success),
                SizedBox(height: 16),
                Text('¡Pedido entregado con éxito!', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        );

      default:
//         print('DriverActivePedidoView (Restaurante): Estado no manejado -> ${pedido.estado}');
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(32.0),
            child: Text(
              'ESTADO NO MANEJADO (REST): ${pedido.estado}', 
              style: const TextStyle(color: Colors.red, fontSize: 18, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
          ),
        );
    }
  }

  Widget _buildMandaditoContent(bool isDark, String estadoActual) {
    final pedido = widget.pedido;
    final isCompra = pedido.tipoPedido == 'compra';

    switch (estadoActual) {
      case 'ofrecido':
      case 'pendiente':
      case 'pendiente_pago':
        return Column(
          children: [
            _InfoCard(
              isDark: isDark,
              title: 'Ganancia Estimada',
              content: Text(
                '\$${(pedido.precioEntrega ?? pedido.costoEnvioCalculado).toStringAsFixed(2)}',
                style: const TextStyle(fontSize: 42, fontWeight: FontWeight.w900),
              ),
            ),
            const SizedBox(height: 12),
            _InfoCard(
              isDark: isDark,
              title: 'Origen',
              body: pedido.direccion,
              icon: Icons.my_location_rounded,
            ),
            const SizedBox(height: 12),
            _InfoCard(
              isDark: isDark,
              title: 'Destino',
              body: pedido.destino ?? pedido.notas,
              icon: Icons.location_on_rounded,
            ),
          ],
        );

      case 'asignado':
        return Column(
          children: [
            _InfoCard(
              isDark: isDark,
              title: isCompra ? 'Tienda' : 'Punto de Origen',
              body: pedido.direccion,
              rightWidget: IconButton(
                onPressed: () {
                  if (pedido.lat != null) {
                    _launchMaps(pedido.lat!, pedido.lng!);
                  }
                },
                icon: const Icon(Icons.navigation_rounded, color: Colors.blue),
                style: IconButton.styleFrom(backgroundColor: Colors.blue.withValues(alpha: 0.1)),
              ),
            ),
          ],
        );

      case 'recibido':
        return Column(
          children: [
            _InfoCard(
              isDark: isDark,
              title: 'Instrucciones / Lista',
              body: pedido.descripcion,
            ),
            const SizedBox(height: 12),
            _InfoCard(
              isDark: isDark,
              title: isCompra ? 'Realiza las compras' : 'Recolecta el paquete',
              child: Container(
                margin: const EdgeInsets.only(top: 12),
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _itemsConfirmed ? null : () {
                    setState(() { _itemsConfirmed = true; });
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _itemsConfirmed ? Colors.grey : (isDark ? Colors.white : Colors.black),
                    foregroundColor: isDark ? Colors.black : Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  child: Text(_itemsConfirmed ? 'Confirmado' : 'Confirmar recolección', style: const TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
            ),
          ],
        );

      case 'en_camino':
        return Column(
          children: [
            // NUEVO DISEÑO PREMIUM PARA MANDADITOS
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF3E8FF), // Light purple
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(Icons.person_pin_circle_rounded, color: Color(0xFF7C3AED), size: 28),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF3E8FF),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text(
                              'ENTREGA',
                              style: TextStyle(color: Color(0xFF7C3AED), fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 0.5),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '#${pedido.id.toString().length > 4 ? pedido.id.toString().substring(0, 4).toUpperCase() : pedido.id.toString()}',
                            style: const TextStyle(color: Colors.grey, fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Entregar a ${pedido.clienteNombre ?? "Cliente"}',
                        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: isDark ? Colors.white : const Color(0xFF111827)),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        pedido.destino ?? pedido.notas ?? 'Sin dirección',
                        style: const TextStyle(fontSize: 15, color: Colors.grey, fontWeight: FontWeight.w500),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 24),
            
            Row(
              children: [
                // Chat Button
                GestureDetector(
                  onTap: () {
                    _openWhatsApp(pedido.clienteTel, pedido.clienteNombre, pedido.estado);
                  },
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF2C2C2E) : Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.08)),
                      boxShadow: [
                        BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 10, offset: const Offset(0, 4)),
                      ],
                    ),
                    child: Icon(Icons.chat_bubble_rounded, color: isDark ? Colors.white : const Color(0xFF7C3AED), size: 24),
                  ),
                ),
                const SizedBox(width: 12),
                
                // Map Navigation Button
                GestureDetector(
                  onTap: () {
                    if (pedido.latEntrega != null) {
                      _launchMaps(pedido.latEntrega!, pedido.lngEntrega!);
                    } else if (pedido.lat != null) {
                      _launchMaps(pedido.lat!, pedido.lng!);
                    }
                  },
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF2C2C2E) : Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.08)),
                      boxShadow: [
                        BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 10, offset: const Offset(0, 4)),
                      ],
                    ),
                    child: Icon(Icons.navigation_rounded, color: isDark ? Colors.white : const Color(0xFF2563EB), size: 24),
                  ),
                ),
                const SizedBox(width: 12),
                
                // Confirm Delivery Button
                Expanded(
                  child: GestureDetector(
                    onTap: () => _avanzarEstado(context, 'entregado', 'Pedido entregado'),
                    child: Container(
                      height: 56,
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981), // Emerald green for completion
                        borderRadius: BorderRadius.circular(28),
                        boxShadow: [
                          BoxShadow(color: const Color(0xFF10B981).withValues(alpha: 0.3), blurRadius: 12, offset: const Offset(0, 4)),
                        ],
                      ),
                      padding: const EdgeInsets.all(6),
                      child: Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                            child: const Icon(Icons.check_rounded, color: Color(0xFF10B981), size: 28),
                          ),
                          const Expanded(
                            child: Center(
                              child: Text(
                                'Entregar', 
                                style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        );

      default:
//         print('DriverActivePedidoView (Mandadito): Estado no manejado -> ${pedido.estado}');
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(32.0),
            child: Text(
              'ESTADO NO MANEJADO (MAND): ${pedido.estado}', 
              style: const TextStyle(color: Colors.red, fontSize: 18, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
          ),
        );
    }
  }

  Widget _buildBottomActionBar(bool isDark, bool isMandadito, String estadoActual) {
    String label = '';
    String nextState = '';
    bool isEnabled = true;
    Color btnColor = isDark ? const Color(0xFF2C2C2E) : const Color(0xFFE5E7EB);
    Color textColor = isDark ? Colors.white54 : Colors.black54;

    switch (estadoActual) {
      case 'ofrecido':
      case 'pendiente':
      case 'pendiente_pago':
        label = 'Aceptar Servicio';
        nextState = 'asignado';
        btnColor = AppColors.brandRed;
        textColor = Colors.white;
        break;
      case 'asignado':
      case 'recibido':
      case 'en_camino':
      case 'entregado':
        // Los botones de acción ahora están integrados directamente en la UI de _buildRestaurantContent
        return const SizedBox.shrink();
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      color: isDark ? const Color(0xFF1C1C1E) : Colors.white,
      child: ElevatedButton(
        onPressed: (isEnabled && !_isLoadingAction) ? () {
          if (widget.pedido.estado == 'recibido' && widget.pedido.pickupPin != null && widget.pedido.pickupPin!.isNotEmpty) {
            _mostrarDialogoPin(context, widget.pedido.pickupPin!);
          } else {
            _avanzarEstado(context, nextState, 'Actualizado correctamente');
          }
        } : null,
        style: ElevatedButton.styleFrom(
          backgroundColor: btnColor,
          foregroundColor: textColor,
          disabledBackgroundColor: isDark ? const Color(0xFF2C2C2E) : const Color(0xFFE5E7EB),
          disabledForegroundColor: isDark ? Colors.white38 : Colors.black38,
          padding: const EdgeInsets.symmetric(vertical: 20),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          elevation: 0,
        ),
        child: _isLoadingAction
            ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(width: 8),
                  const Icon(Icons.arrow_forward_rounded, size: 20),
                ],
              ),
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LÓGICA DE NEGOCIO
  // ─────────────────────────────────────────────────────────────────────────
  Future<void> _avanzarEstado(BuildContext context, String nuevoEstado, String successMsg) async {
    setState(() { _isLoadingAction = true; });
    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      final updateData = <String, dynamic>{'estado': nuevoEstado};

      if (nuevoEstado == 'asignado' && userId != null) {
        updateData['repartidor_id'] = userId;
      }

      try {
        final response = await Supabase.instance.client
            .from('pedidos')
            .update(updateData)
            .eq('id', widget.pedido.id)
            .select();

        if (response.isEmpty) {
          throw Exception('El pedido ya no está disponible (quizás expiró el tiempo de 25s).');
        }
      } catch (networkError) {
        final isNetworkIssue = networkError is SocketException ||
            networkError.toString().contains('Failed host lookup') ||
            networkError.toString().contains('Connection refused') ||
            networkError.toString().contains('Timeout') ||
            networkError.toString().contains('ClientException');

        if (isNetworkIssue) {
//           debugPrint('Falla de red detectada. Encolando mutación offline...');
          await LocalDatabase.instance.encolarMutacion(
            tabla: 'pedidos',
            id: widget.pedido.id,
            payload: updateData,
          );
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Sin conexión. Sincronizando en segundo plano...')));
          }
        } else {
          rethrow;
        }
      }

      widget.onRefresh?.call();

      if (context.mounted) {
        if (nuevoEstado == 'entregado') {
          final activos = ref.read(pedidosActivosProvider).value ?? [];
          final remaining = activos
              .where((p) => p.id != widget.pedido.id && p.estado != 'entregado' && p.estado != 'cancelado')
              .toList();
          if (remaining.isNotEmpty) {
            context.replace('/pedidos/${remaining.first.id}');
          } else {
            if (Navigator.canPop(context)) Navigator.pop(context);
          }
        } else if (nuevoEstado == 'en_camino') {
          final activos = ref.read(pedidosActivosProvider).value ?? [];
          final otherPickups = activos
              .where((p) => p.id != widget.pedido.id && (p.estado == 'asignado' || p.estado == 'recibido'))
              .toList();
          if (otherPickups.isNotEmpty) {
            context.replace('/pedidos/${otherPickups.first.id}');
          }
        }
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
          backgroundColor: Colors.redAccent,
        ));
        if (e.toString().contains('ya no está disponible')) {
          Future.delayed(const Duration(seconds: 2), () {
            if (context.mounted) {
              if (Navigator.canPop(context)) Navigator.pop(context);
            }
          });
        }
      }
    } finally {
      if (mounted) {
        setState(() { _isLoadingAction = false; });
      }
    }
  }

  Future<void> _mostrarDialogoPin(BuildContext context, String expectedPin) async {
    final TextEditingController pinController = TextEditingController();
    String? errorMessage;
    bool isSuccess = false;

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return StatefulBuilder(builder: (context, setState) {
          return AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: Text(isSuccess ? '¡Correcto!' : 'PIN de Seguridad', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18), textAlign: TextAlign.center),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (isSuccess)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Icon(Icons.check_circle_rounded, color: Colors.green, size: 80),
                  )
                else ...[
                  const Text('Solicita al restaurante el PIN de 4 dígitos para llevarte el pedido.', style: TextStyle(fontSize: 14)),
                  const SizedBox(height: 16),
                  TextField(
                    controller: pinController,
                    keyboardType: TextInputType.number,
                    maxLength: 4,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, letterSpacing: 8),
                    decoration: InputDecoration(
                      hintText: '----',
                      errorText: errorMessage,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      contentPadding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                    onChanged: (val) {
                      if (val.length == 4) {
                        if (val == expectedPin) {
                          setState(() {
                            errorMessage = null;
                            isSuccess = true;
                          });
                          Future.delayed(const Duration(milliseconds: 1000), () {
                            if (ctx.mounted) Navigator.pop(ctx, true);
                          });
                        } else {
                          setState(() => errorMessage = 'PIN Incorrecto.');
                        }
                      } else {
                        if (errorMessage != null) setState(() => errorMessage = null);
                      }
                    },
                  ),
                ],
              ],
            ),
            actions: [
              if (!isSuccess)
                TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('Cancelar', style: TextStyle(color: Colors.grey)),
                ),
            ],
          );
        });
      },
    ).then((success) async {
      if (success == true && mounted) {
        setState(() { _overrideEstado = widget.pedido.estado; });
        await _avanzarEstado(context, 'en_camino', 'PIN Correcto');
        await Future.delayed(const Duration(milliseconds: 1500));
        if (mounted) setState(() { _overrideEstado = null; });
      }
    });
  }
  void _showOrderDetailsBottomSheet(BuildContext context, bool isDark) {
    Widget buildPaymentBox() {
      if (widget.pedido.metodoPago == 'efectivo' && widget.pedido.total != null) {
        return Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF2C2C2E) : Colors.white,
                borderRadius: BorderRadius.circular(24),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 10, offset: const Offset(0, 4))],
                border: Border.all(color: isDark ? Colors.white10 : Colors.black.withValues(alpha: 0.05)),
              ),
              child: Column(
                children: [
                  Text('A COBRAR', style: TextStyle(color: Colors.grey[500], fontWeight: FontWeight.w900, letterSpacing: 1.2)),
                  const SizedBox(height: 8),
                  Text(
                    '\$${widget.pedido.total!.toStringAsFixed(2)}',
                    style: const TextStyle(fontSize: 42, fontWeight: FontWeight.w900, color: Colors.green),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(color: Colors.green.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                    child: const Text('Cobro en Efectivo', style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ),
          ],
        );
      } else if (widget.pedido.metodoPago == 'tarjeta') {
        return Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.blue.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.credit_card_rounded, color: Colors.blue),
              SizedBox(width: 8),
              Text('Pagado con Tarjeta. No cobrar.', style: TextStyle(color: Colors.blue, fontWeight: FontWeight.bold)),
            ],
          ),
        );
      }
      return const SizedBox.shrink();
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) {
          final bgColor = isDark ? const Color(0xFF1C1C1E) : Colors.white;
          final textColor = isDark ? Colors.white : Colors.black87;
          final subtitleColor = isDark ? Colors.white54 : Colors.black54;

          return Scaffold(
            backgroundColor: isDark ? const Color(0xFF121212) : const Color(0xFFF3F4F6),
            appBar: AppBar(
              backgroundColor: isDark ? const Color(0xFF121212) : const Color(0xFFF3F4F6),
              elevation: 0,
              leading: IconButton(
                icon: Icon(Icons.arrow_back, color: textColor),
                onPressed: () => Navigator.pop(context),
              ),
              title: Text('Detalles de la Orden', style: TextStyle(color: textColor, fontWeight: FontWeight.bold)),
              centerTitle: true,
            ),
            body: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              children: [
                buildPaymentBox(),
                const SizedBox(height: 16),
                // Client Info Card
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: bgColor,
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Column(
                            children: [
                              Row(
                                children: [
                                  CircleAvatar(
                                    radius: 24,
                                    backgroundColor: Colors.grey.withValues(alpha: 0.2),
                                    child: Icon(Icons.person, color: subtitleColor),
                                  ),
                                  const SizedBox(width: 16),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(widget.pedido.clienteNombre ?? 'Cliente', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: textColor)),
                                        const SizedBox(height: 4),
                                        Text('Cliente', style: TextStyle(color: subtitleColor, fontSize: 14)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              Row(
                                children: [
                                  Expanded(
                                    child: GestureDetector(
                                      onTap: () => _callPhone(widget.pedido.clienteTel),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(vertical: 12),
                                        decoration: BoxDecoration(
                                          color: Colors.green.withValues(alpha: 0.1),
                                          borderRadius: BorderRadius.circular(12),
                                        ),
                                        child: Row(
                                          mainAxisAlignment: MainAxisAlignment.center,
                                          children: [
                                            const Icon(Icons.phone, color: Colors.green, size: 20),
                                            const SizedBox(width: 8),
                                            const Text('Llamar', style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: GestureDetector(
                                      onTap: () => _openWhatsApp(widget.pedido.clienteTel, widget.pedido.clienteNombre, widget.pedido.estado),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(vertical: 12),
                                        decoration: BoxDecoration(
                                          color: Colors.blue.withValues(alpha: 0.1),
                                          borderRadius: BorderRadius.circular(12),
                                        ),
                                        child: Row(
                                          mainAxisAlignment: MainAxisAlignment.center,
                                          children: [
                                            const Icon(Icons.chat_bubble_outline, color: Colors.blue, size: 20),
                                            const SizedBox(width: 8),
                                            const Text('Chat', style: TextStyle(color: Colors.blue, fontWeight: FontWeight.bold)),
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
                        const SizedBox(height: 16),

                        // Artículos
                        Container(
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: bgColor,
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Artículos', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: textColor)),
                              const SizedBox(height: 16),
                              Text(widget.pedido.descripcion, style: TextStyle(fontSize: 16, color: textColor)),
                            ],
                          ),
                        ),
                        const SizedBox(height: 32),
                      ],
            ),
          );
        },
      ),
    );
  }

}

// ─────────────────────────────────────────────────────────────────────────────
// WIDGETS AUXILIARES
// ─────────────────────────────────────────────────────────────────────────────
class _InfoCard extends StatelessWidget {
  final bool isDark;
  final String title;
  final String? subtitle;
  final String? body;
  final Widget? content;
  final Widget? child;
  final IconData? icon;
  final Widget? rightWidget;

  const _InfoCard({
    required this.isDark,
    required this.title,
    this.subtitle,
    this.body,
    this.content,
    this.child,
    this.icon,
    this.rightWidget,
  });

  @override
  Widget build(BuildContext context) {
    final bgColor = isDark ? const Color(0xFF1C1C1E) : Colors.white;
    final titleColor = isDark ? Colors.white70 : Colors.black87;
    final subtitleColor = isDark ? Colors.white : Colors.black;
    final bodyColor = isDark ? Colors.white54 : Colors.black54;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: titleColor)),
          if (subtitle != null || body != null || content != null) const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 20, color: Colors.grey),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (subtitle != null) Text(subtitle!, style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: subtitleColor)),
                    if (subtitle != null && body != null) const SizedBox(height: 4),
                    if (body != null) Text(body!, style: TextStyle(fontSize: 14, color: bodyColor)),
                    if (content != null) content!,
                  ],
                ),
              ),
              if (rightWidget != null) rightWidget!,
            ],
          ),
          if (child != null) child!,
        ],
      ),
    );
  }
}

class _ActionBox extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isDark;
  final VoidCallback onTap;

  const _ActionBox({
    required this.icon,
    required this.label,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final bgColor = isDark ? const Color(0xFF1C1C1E) : Colors.white;
    final textColor = isDark ? Colors.white : Colors.black87;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 8, offset: const Offset(0, 2)),
          ],
        ),
        child: Column(
          children: [
            Icon(icon, size: 24, color: textColor),
            const SizedBox(height: 8),
            Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: textColor)),
          ],
        ),
      ),
    );
  }
}

import 'dart:async';
import 'dart:ui' as ui;
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_polyline_points/flutter_polyline_points.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:audioplayers/audioplayers.dart';
import '../models/pedido_model.dart';
import '../main.dart' show alarmPlayer, stopAlarm;

class IncomingOrderOverlay extends ConsumerStatefulWidget {
  final PedidoModel pedido;
  final VoidCallback? onAccept;
  final VoidCallback? onReject;

  const IncomingOrderOverlay({
    super.key, 
    required this.pedido,
    this.onAccept,
    this.onReject,
  });

  @override
  ConsumerState<IncomingOrderOverlay> createState() => _IncomingOrderOverlayState();
}

class _IncomingOrderOverlayState extends ConsumerState<IncomingOrderOverlay> {
  bool _isStacked = false;
  GoogleMapController? _mapController;
  Position? _currentPosition;
  Set<Polyline> _polylines = {};
  Set<Marker> _markers = {};
  bool _isAccepting = false;
  final String _googleMapsKey = 'AIzaSyBOZkp595ze0Agwb7yPG5u7MD29EL9gHMw';
  BitmapDescriptor? _blackMarkerIcon;
  double _routeDistanceKm = 0.0;

  Future<BitmapDescriptor> _createBlackMarker() async {
    final ui.PictureRecorder pictureRecorder = ui.PictureRecorder();
    final Canvas canvas = Canvas(pictureRecorder);
    final Paint paint = Paint()..color = Colors.black;
    final double radius = 12.0;
    
    canvas.drawCircle(Offset(radius, radius), radius, paint);
    
    final Paint borderPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0;
    canvas.drawCircle(Offset(radius, radius), radius, borderPaint);
    
    final ui.Image image = await pictureRecorder.endRecording().toImage(
          (radius * 2).toInt(),
          (radius * 2).toInt(),
        );
    final ByteData? byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    final Uint8List uint8List = byteData!.buffer.asUint8List();
    return BitmapDescriptor.fromBytes(uint8List);
  }

  @override
  void initState() {
    super.initState();
    _playAlarm();
    _createBlackMarker().then((icon) {
      if (mounted) {
        setState(() => _blackMarkerIcon = icon);
        if (_currentPosition != null) {
          _updateRoute();
        }
      }
    });
    _startTracking();
    _verificarSiEsApilado();
  }

  double _totalGananciaRuta = 0.0;

  Future<void> _verificarSiEsApilado() async {
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) return;
    
    // Contar pedidos activos del repartidor (excluyendo este que está pendiente)
    final response = await Supabase.instance.client
        .from('pedidos')
        .select('id, precio_entrega')
        .eq('repartidor_id', userId)
        .inFilter('estado', ['asignado', 'aceptado', 'en_cocina', 'listo_para_recoger', 'en_camino']);
        
    final pedidosActivos = response as List;
    if (mounted && pedidosActivos.isNotEmpty) {
      double sum = 0.0;
      for (var p in pedidosActivos) {
         final val = p['precio_entrega'];
         if (val != null) {
            sum += double.tryParse(val.toString()) ?? 0.0;
         }
      }
      setState(() {
        _isStacked = true;
        _totalGananciaRuta = sum + (widget.pedido.precioEntrega ?? 0.0);
      });
    }
  }

  Future<void> _playAlarm() async {
    try {
      await alarmPlayer.stop(); // Stop any previous glitchy instance
      await alarmPlayer.setVolume(1.0);
      await alarmPlayer.setReleaseMode(ReleaseMode.loop);
      await alarmPlayer.play(AssetSource('sounds/rappi_alarm.mp3'));
    } catch (e) {
      debugPrint('Error en playAlarm: $e');
    }
  }

  @override
  void dispose() {
    try {
      stopAlarm();
    } catch (_) {}
    _mapController?.dispose();
    super.dispose();
  }

  void _startTracking() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return;
    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return;
    }
    Position? lastPos = await Geolocator.getLastKnownPosition();
    if (lastPos != null && mounted) {
      setState(() => _currentPosition = lastPos);
      _updateRoute();
    }
    Geolocator.getPositionStream(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 10),
    ).listen((Position position) {
      if (!mounted) return;
      setState(() => _currentPosition = position);
      _updateRoute();
    });
  }

  Future<void> _updateRoute() async {
    if (_currentPosition == null) return;
    double? destLat = widget.pedido.restauranteLat ?? widget.pedido.lat;
    double? destLng = widget.pedido.restauranteLng ?? widget.pedido.lng;

    if (!mounted) return;
    setState(() {
      _markers = {
        Marker(
          markerId: const MarkerId('driver'),
          position: LatLng(_currentPosition!.latitude, _currentPosition!.longitude),
          icon: _blackMarkerIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
          infoWindow: const InfoWindow(title: 'Tú'),
        ),
        if (destLat != null && destLng != null)
          Marker(
            markerId: const MarkerId('destination'),
            position: LatLng(destLat, destLng),
            icon: _blackMarkerIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
            infoWindow: const InfoWindow(title: 'Restaurante'),
          ),
      };
    });

    if (destLat == null || destLng == null) return;
    PolylinePoints polylinePoints = PolylinePoints();
    PolylineResult result = await polylinePoints.getRouteBetweenCoordinates(
      googleApiKey: _googleMapsKey,
      request: PolylineRequest(
        origin: PointLatLng(_currentPosition!.latitude, _currentPosition!.longitude),
        destination: PointLatLng(destLat, destLng),
        mode: TravelMode.driving,
      ),
    );

    if (result.points.isNotEmpty) {
      List<LatLng> polylineCoordinates = result.points.map((p) => LatLng(p.latitude, p.longitude)).toList();
      
      double totalDistance = 0;
      for (int i = 0; i < polylineCoordinates.length - 1; i++) {
        totalDistance += Geolocator.distanceBetween(
          polylineCoordinates[i].latitude, polylineCoordinates[i].longitude,
          polylineCoordinates[i+1].latitude, polylineCoordinates[i+1].longitude,
        );
      }

      if (!mounted) return;
      setState(() {
        _routeDistanceKm = totalDistance / 1000.0;
        _polylines = {
          Polyline(
            polylineId: const PolylineId('route'),
            color: Colors.black87,
            width: 4,
            points: polylineCoordinates,
          )
        };
      });
      LatLngBounds bounds = _boundsFromLatLngList(polylineCoordinates);
      _mapController?.animateCamera(CameraUpdate.newLatLngBounds(bounds, 120));
    }
  }

  LatLngBounds _boundsFromLatLngList(List<LatLng> list) {
    double? x0, x1, y0, y1;
    for (LatLng latLng in list) {
      if (x0 == null) {
        x0 = x1 = latLng.latitude;
        y0 = y1 = latLng.longitude;
      } else {
        if (latLng.latitude > x1!) x1 = latLng.latitude;
        if (latLng.latitude < x0) x0 = latLng.latitude;
        if (latLng.longitude > y1!) y1 = latLng.longitude;
        if (latLng.longitude < y0!) y0 = latLng.longitude;
      }
    }
    return LatLngBounds(northeast: LatLng(x1!, y1!), southwest: LatLng(x0!, y0!));
  }

  Future<void> _aceptarViaje() async {
    if (_isAccepting) return;
    setState(() => _isAccepting = true);
    
    // Parar alarma inmediatamente de forma robusta
    try {
      stopAlarm();
    } catch (_) {}

    try {
      final response = await Supabase.instance.client
          .from('pedidos')
          .update({'estado': 'asignado', 'repartidor_id': Supabase.instance.client.auth.currentUser!.id})
          .eq('id', widget.pedido.id)
          .eq('estado', 'ofrecido') // Asegurar que el pedido está en estado 'ofrecido' (lock atómico)
          .select();
      
      final data = response as List<dynamic>;
      
      if (data.isEmpty) {
        // El pedido ya no estaba pendiente o hubo un error de concurrencia
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Este viaje ya no está disponible o expiró.'),
              backgroundColor: Colors.redAccent,
              behavior: SnackBarBehavior.floating,
              duration: Duration(seconds: 3),
            ),
          );
          // Cerramos la pantalla silenciosamente
          if (widget.onReject != null) {
            widget.onReject!();
          } else {
            context.go('/dashboard');
          }
        }
        return;
      }
      
      if (widget.onAccept != null) {
        widget.onAccept!();
      } else if (mounted) {
        context.go('/pedidos/${widget.pedido.id}');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error de conexión: $e'),
            backgroundColor: Colors.redAccent,
            behavior: SnackBarBehavior.floating,
          ),
        );
        setState(() => _isAccepting = false);
      }
    }
  }

  Future<void> _rechazarViaje() async {
    if (_isAccepting) return;
    setState(() => _isAccepting = true);
    
    try {
      stopAlarm();
    } catch (_) {}

    try {
      await Supabase.instance.client
          .from('pedidos')
          .update({'estado': 'pendiente', 'repartidor_id': null})
          .eq('id', widget.pedido.id);
          
      // ZERO-WAIT REASSIGNMENT: Disparar la Edge Function para buscar otro repartidor inmediatamente,
      // excluyendo al usuario actual para que no se le vuelva a asignar en este ciclo.
      try {
        final userId = Supabase.instance.client.auth.currentUser?.id;
        await Supabase.instance.client.functions.invoke(
          'asignar-repartidor',
          body: {
            'id': widget.pedido.id,
            'excluir': userId,
          },
        );
      } catch (e) {
        debugPrint('Error en zero-wait reassignment: $e');
      }
          
      if (widget.onReject != null) {
        widget.onReject!();
      } else if (mounted) {
        context.go('/dashboard');
      }
    } catch (_) {
      if (mounted) setState(() => _isAccepting = false);
    }
  }

  String _getMapStyle(bool isDark) {
    if (isDark) {
      return '''[{"elementType":"geometry","stylers":[{"color":"#212121"}]},{"elementType":"labels.icon","stylers":[{"visibility":"off"}]},{"elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"elementType":"labels.text.stroke","stylers":[{"color":"#212121"}]},{"featureType":"administrative","elementType":"geometry","stylers":[{"color":"#757575"}]},{"featureType":"administrative.country","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]},{"featureType":"administrative.land_parcel","stylers":[{"visibility":"off"}]},{"featureType":"administrative.locality","elementType":"labels.text.fill","stylers":[{"color":"#bdbdbd"}]},{"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#181818"}]},{"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"featureType":"poi.park","elementType":"labels.text.stroke","stylers":[{"color":"#1b1b1b"}]},{"featureType":"road","elementType":"geometry.fill","stylers":[{"color":"#2c2c2c"}]},{"featureType":"road","elementType":"labels.text.fill","stylers":[{"color":"#8a8a8a"}]},{"featureType":"road.arterial","elementType":"geometry","stylers":[{"color":"#373737"}]},{"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#3c3c3c"}]},{"featureType":"road.highway.controlled_access","elementType":"geometry","stylers":[{"color":"#4e4e4e"}]},{"featureType":"road.local","elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"featureType":"transit","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"water","elementType":"geometry","stylers":[{"color":"#000000"}]},{"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#3d3d3d"}]}]''';
    }
    return '''[{"elementType":"geometry","stylers":[{"color":"#f5f5f5"}]},{"elementType":"labels.icon","stylers":[{"visibility":"off"}]},{"elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"elementType":"labels.text.stroke","stylers":[{"color":"#f5f5f5"}]},{"featureType":"administrative.land_parcel","elementType":"labels.text.fill","stylers":[{"color":"#bdbdbd"}]},{"featureType":"poi","elementType":"geometry","stylers":[{"color":"#eeeeee"}]},{"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#e5e5e5"}]},{"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]},{"featureType":"road","elementType":"geometry","stylers":[{"color":"#ffffff"}]},{"featureType":"road.arterial","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#dadada"}]},{"featureType":"road.highway","elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"featureType":"road.local","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]},{"featureType":"transit.line","elementType":"geometry","stylers":[{"color":"#e5e5e5"}]},{"featureType":"transit.station","elementType":"geometry","stylers":[{"color":"#eeeeee"}]},{"featureType":"water","elementType":"geometry","stylers":[{"color":"#c9c9c9"}]},{"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]}]''';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return PopScope(
      canPop: false, // BLOQUEO 1: Anula el botón "Atrás" de Android
      onPopInvokedWithResult: (didPop, result) {
        // No hace nada, ignoramos el intento de salida.
      },
      child: Material(
        color: isDark ? Colors.black : Colors.white,
        child: Stack(
        children: [
          Positioned.fill(
            child: _currentPosition == null
                ? Container(
                    color: isDark ? Colors.black : const Color(0xFFF3F4F6),
                    child: const Center(child: CircularProgressIndicator(color: Color(0xFF00897B))))
                : GoogleMap(
                    padding: const EdgeInsets.only(bottom: 250),
                    initialCameraPosition: CameraPosition(
                        target: LatLng(_currentPosition!.latitude, _currentPosition!.longitude),
                        zoom: 15),
                    polylines: _polylines,
                    markers: _markers,
                    myLocationEnabled: true,
                    myLocationButtonEnabled: true,
                    zoomControlsEnabled: false,
                    onMapCreated: (controller) {
                      _mapController = controller;
                      _mapController!.setMapStyle(_getMapStyle(isDark));
                    },
                  ),
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Container(
              padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top, bottom: 12),
              color: isDark ? const Color(0xFF1E1E28) : Colors.white,
              child: Row(
                children: [
                  const SizedBox(width: 8),
                  IconButton(
                    icon: Icon(Icons.arrow_back, color: isDark ? Colors.white : Colors.black),
                    onPressed: () {
                      if (!_isAccepting) _rechazarViaje();
                    },
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Detalle del Pedido',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      color: isDark ? Colors.white : const Color(0xFF1B233A),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              margin: const EdgeInsets.only(left: 12, right: 12, bottom: 24),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E1E28) : const Color(0xFFF3F4F6),
                borderRadius: BorderRadius.circular(32),
                boxShadow: [
                  BoxShadow(color: Colors.black.withOpacity(0.2), blurRadius: 20, offset: const Offset(0, 10))
                ],
              ),
              child: Padding(
                padding: const EdgeInsets.all(20.0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: isDark ? Colors.white : Colors.black,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            _isStacked ? '🚀 VIAJE APILADO' : '🌟 NUEVO PEDIDO',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w900,
                              color: isDark ? Colors.black : Colors.white,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ),
                        GestureDetector(
                          onTap: () {
                            if (!_isAccepting) _rechazarViaje();
                          },
                          child: Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: isDark ? Colors.white10 : Colors.black.withOpacity(0.05),
                              shape: BoxShape.circle,
                            ),
                            child: Icon(Icons.close_rounded, size: 20, color: isDark ? Colors.white70 : Colors.black54),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: isDark ? Colors.white.withOpacity(0.05) : Colors.white,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: const BoxDecoration(color: Color(0xFFE8F5E9), shape: BoxShape.circle),
                            child: const Icon(Icons.fastfood_rounded, color: Color(0xFF4CAF50), size: 18),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  widget.pedido.restaurante ?? 'Restaurante',
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w800,
                                    color: isDark ? Colors.white : Colors.black87,
                                  ),
                                ),
                                Text(
                                  _routeDistanceKm > 0 ? '${_isStacked ? "2 pedidos" : "1 pedido"} en la ruta • ${_routeDistanceKm.toStringAsFixed(1)} km' : 'Calculando ruta...',
                                  style: TextStyle(fontSize: 12, color: isDark ? Colors.white54 : Colors.black54),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: isDark ? Colors.white10 : const Color(0xFFE5E7EB),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              'Nuevo',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: isDark ? Colors.white : Colors.black87,
                              ),
                            ),
                          )
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Text(
                          '\$${widget.pedido.precioEntrega?.toStringAsFixed(2) ?? "45.50"}',
                          style: TextStyle(
                            fontSize: 48,
                            fontWeight: FontWeight.w900,
                            color: isDark ? Colors.white : Colors.black,
                            height: 1.1,
                            letterSpacing: -1.5,
                          ),
                        ),
                        if (_isStacked)
                          Container(
                            margin: const EdgeInsets.only(left: 12.0),
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: isDark ? Colors.white : Colors.black,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              '+ EXTRA',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w900,
                                color: isDark ? Colors.black : Colors.white,
                              ),
                            ),
                          ),
                      ],
                    ),
                    if (_isStacked && _totalGananciaRuta > 0)
                      Padding(
                        padding: const EdgeInsets.only(top: 8.0, bottom: 4.0),
                        child: Text(
                          'En total por tu ruta ganarás \$${_totalGananciaRuta.toStringAsFixed(2)}',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: isDark ? Colors.white70 : Colors.black87,
                          ),
                        ),
                      ),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: widget.pedido.metodoPago == 'efectivo' ? const Color(0xFFE0F2F1) : const Color(0xFFF3E5F5),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            widget.pedido.metodoPago == 'efectivo' ? Icons.payments_rounded : Icons.credit_card_rounded,
                            color: widget.pedido.metodoPago == 'efectivo' ? const Color(0xFF00897B) : const Color(0xFF8E24AA),
                            size: 22,
                          ),
                          const SizedBox(width: 8),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.pedido.metodoPago == 'efectivo' ? 'Pago en Efectivo' : 'Pago en Línea',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: widget.pedido.metodoPago == 'efectivo' ? const Color(0xFF00897B) : const Color(0xFF8E24AA),
                                ),
                              ),
                              Text(
                                widget.pedido.metodoPago == 'efectivo' ? 'Debes cobrar el total al entregar' : 'Viaje ya pagado, no cobres',
                                style: TextStyle(
                                  fontSize: 9,
                                  color: widget.pedido.metodoPago == 'efectivo' ? const Color(0xFF00695C) : const Color(0xFF6A1B9A),
                                ),
                              ),
                            ],
                          )
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.storefront_rounded, color: Colors.grey, size: 20),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(widget.pedido.restaurante ?? 'Restaurante', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: isDark ? Colors.white70 : Colors.black87)),
                              const Text('Recoger en establecimiento', style: TextStyle(fontSize: 12, color: Colors.grey)),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.person_outline_rounded, color: Colors.grey, size: 20),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Entrega a ${widget.pedido.clienteNombre ?? "Cliente"}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: isDark ? Colors.white70 : Colors.black87)),
                              Text(widget.pedido.direccion ?? 'Sin dirección', style: TextStyle(fontSize: 12, color: Colors.grey), maxLines: 1, overflow: TextOverflow.ellipsis),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      height: 56,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(28),
                        child: Stack(
                          children: [
                            // ── FEEDBACK VISUAL: Barra de progreso en el fondo ──
                            Positioned.fill(
                              child: TweenAnimationBuilder<double>(
                                tween: Tween<double>(begin: 1.0, end: 0.0),
                                duration: const Duration(milliseconds: 23500), // 23.5s (Grace Period)
                                onEnd: () {
                                  if (!_isAccepting && mounted) {
                                    _rechazarViaje();
                                  }
                                },
                                builder: (context, value, child) {
                                  // Color psychology: Green -> Orange -> Red
                                  Color bgColor = const Color(0xFF0C625D);
                                  if (value < 0.3) {
                                    bgColor = Colors.redAccent.shade700;
                                  } else if (value < 0.6) {
                                    bgColor = Colors.orange.shade700;
                                  }

                                  return Stack(
                                    children: [
                                      Container(color: Colors.grey.withOpacity(isDark ? 0.2 : 0.1)),
                                      FractionallySizedBox(
                                        alignment: Alignment.centerLeft,
                                        widthFactor: value,
                                        child: AnimatedContainer(
                                          duration: const Duration(milliseconds: 300),
                                          color: bgColor,
                                        ),
                                      ),
                                    ],
                                  );
                                },
                              ),
                            ),
                            
                            // ── CONTENIDO DEL BOTÓN ──
                            Positioned.fill(
                              child: Material(
                                color: Colors.transparent,
                                child: InkWell(
                                  onTap: _isAccepting ? null : _aceptarViaje,
                                  child: Center(
                                    child: _isAccepting
                                        ? const SizedBox(
                                            width: 24,
                                            height: 24,
                                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 3),
                                          )
                                        : Row(
                                            mainAxisAlignment: MainAxisAlignment.center,
                                            children: const [
                                              Text(
                                                'Aceptar pedido',
                                                style: TextStyle(
                                                  fontSize: 18,
                                                  fontWeight: FontWeight.w900,
                                                  color: Colors.white,
                                                  letterSpacing: -0.5,
                                                ),
                                              ),
                                              SizedBox(width: 8),
                                              Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 20),
                                            ],
                                          ),
                                  ),
                                ),
                              ),
                            ),
                          ],
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
    ));
  }
}

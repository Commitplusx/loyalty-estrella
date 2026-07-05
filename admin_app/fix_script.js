const fs = require('fs');
const path = 'C:/Users/Kaleb/Desktop/loyalty-estrella/admin_app/lib/screens/pedido_detail_screen.dart';
let content = fs.readFileSync(path, 'utf8');

const targetIdx = content.indexOf('class _DriverRouteMode extends ConsumerStatefulWidget');
if (targetIdx !== -1) {
    const before = content.substring(0, targetIdx);
    const newClass = `class _DriverRouteMode extends ConsumerStatefulWidget {
  final PedidoModel pedido;
  final VoidCallback onEstadoActualizado;

  const _DriverRouteMode({required this.pedido, required this.onEstadoActualizado});

  @override
  ConsumerState<_DriverRouteMode> createState() => _DriverRouteModeState();
}

class _DriverRouteModeState extends ConsumerState<_DriverRouteMode> {
  bool _loading = false;
  GoogleMapController? _mapController;
  StreamSubscription<Position>? _positionStream;
  Position? _currentPosition;
  Set<Polyline> _polylines = {};
  Set<Marker> _markers = {};
  
  // API Key leída del AndroidManifest
  final String _googleMapsKey = 'AIzaSyBOZkp595ze0Agwb7yPG5u7MD29EL9gHMw';

  @override
  void initState() {
    super.initState();
    _startTracking();
  }

  @override
  void dispose() {
    _positionStream?.cancel();
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

    // Instantly load map using last known position to eliminate loading delay
    Position? lastPos = await Geolocator.getLastKnownPosition();
    if (lastPos != null && mounted) {
      setState(() => _currentPosition = lastPos);
      _updateRoute(); 
    }

    _positionStream = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 5),
    ).listen((Position position) {
      if (!mounted) return;
      setState(() => _currentPosition = position);
      _updateRoute();
      if (_mapController != null && _currentPosition != null) {
        _mapController!.animateCamera(CameraUpdate.newLatLng(LatLng(position.latitude, position.longitude)));
      }
    });
  }

  Future<void> _updateRoute() async {
    if (_currentPosition == null) return;
    
    final estado = widget.pedido.estado;
    bool haciaRestaurante = estado == 'asignado' || estado == 'aceptado' || estado == 'en_cocina' || estado == 'listo_para_recoger';
    
    double? destLat = haciaRestaurante ? widget.pedido.restauranteLat : widget.pedido.lat;
    double? destLng = haciaRestaurante ? widget.pedido.restauranteLng : widget.pedido.lng;
    
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
      if (!mounted) return;
      setState(() {
        _polylines = {
          Polyline(
            polylineId: const PolylineId('route'),
            color: Colors.blue,
            width: 5,
            points: polylineCoordinates,
          )
        };
        _markers = {
          Marker(
            markerId: const MarkerId('driver'),
            position: LatLng(_currentPosition!.latitude, _currentPosition!.longitude),
            icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
            infoWindow: const InfoWindow(title: 'Tú'),
          ),
          Marker(
            markerId: const MarkerId('destination'),
            position: LatLng(destLat, destLng),
            icon: BitmapDescriptor.defaultMarkerWithHue(haciaRestaurante ? BitmapDescriptor.hueOrange : BitmapDescriptor.hueGreen),
            infoWindow: InfoWindow(title: haciaRestaurante ? 'Restaurante' : 'Cliente'),
          )
        };
      });
    }
  }

  Future<void> _cambiarEstado(String nuevoEstado) async {
    setState(() => _loading = true);
    
    if (nuevoEstado == 'aceptado') {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId != null) {
        try {
           await Supabase.instance.client.from('pedidos').update({
             'estado': 'aceptado',
             'repartidor_id': userId
           }).eq('id', widget.pedido.id);
        } catch (_) {}
      }
    }

    try {
      final errorMsg = await ref.read(pedidoServiceProvider).actualizarEstado(widget.pedido.id, nuevoEstado);
      setState(() => _loading = false);

      if (errorMsg == null) {
        widget.onEstadoActualizado();
        _updateRoute();
      } else {
        if (mounted) {
          PremiumToast.show(context, title: 'Error', description: errorMsg, isError: true);
        }
      }
    } catch (e) {
      setState(() => _loading = false);
      String errMsg = e.toString();
      if (errMsg.contains('FRAUDE')) {
        errMsg = 'Rechazado por DB: Repartidor demasiado lejos del destino para entregar.';
      }
      if (mounted) {
        PremiumToast.show(context, title: 'Fraude de Geocerca', description: errMsg, isError: true);
      }
    }
  }

  void _abrirMaps(double lat, double lng) async {
    final url = Uri.parse('google.navigation:q=' + lat.toString() + ',' + lng.toString() + '&mode=d');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
    } else {
      final webUrl = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=' + lat.toString() + ',' + lng.toString());
      if (await canLaunchUrl(webUrl)) {
        await launchUrl(webUrl, mode: LaunchMode.externalApplication);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cs = Theme.of(context).colorScheme;
    final estado = widget.pedido.estado;

    String swipeText = 'Desliza';
    String? nextState;
    Color swipeColor = Colors.orange;

    if (estado == 'asignado' || estado == 'en_cocina' || estado == 'listo_para_recoger') {
      swipeText = 'Llegué al Restaurante';
      nextState = 'recibido';
      swipeColor = Colors.orange;
    } else if (estado == 'recibido') {
      swipeText = 'En Camino al Cliente';
      nextState = 'en_camino';
      swipeColor = Colors.blue;
    } else if (estado == 'en_camino') {
      swipeText = 'Entregar Pedido';
      nextState = 'entregado';
      swipeColor = Colors.green;
    } else if (estado == 'pendiente') {
      swipeText = 'Aceptar Pedido';
      nextState = 'aceptado';
      swipeColor = Colors.orange;
    }

    return Column(
      children: [
        // Top 40% Map
        SizedBox(
          height: MediaQuery.of(context).size.height * 0.40,
          child: _currentPosition == null
              ? Container(color: isDark ? Colors.black : Colors.grey[200], child: const Center(child: CircularProgressIndicator()))
              : GoogleMap(
                  initialCameraPosition: CameraPosition(target: LatLng(_currentPosition!.latitude, _currentPosition!.longitude), zoom: 15),
                  polylines: _polylines,
                  markers: _markers,
                  myLocationEnabled: true,
                  myLocationButtonEnabled: true,
                  zoomControlsEnabled: false,
                  onMapCreated: (controller) => _mapController = controller,
                ),
        ),

        // Bottom 60% Content
        Expanded(
          child: Stack(
            children: [
              Container(
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF0F0F16) : const Color(0xFFF8F9FA),
                  borderRadius: const BorderRadius.only(topLeft: Radius.circular(32), topRight: Radius.circular(32)),
                  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 20, offset: const Offset(0, -5))]
                ),
                child: ListView(
                  controller: ScrollController(),
                  padding: const EdgeInsets.only(top: 16, bottom: 120),
                  children: [
                    // Handle bar
                    Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey.withOpacity(0.5), borderRadius: BorderRadius.circular(2)))),
                    const SizedBox(height: 24),
                    
                    // Restaurante Info
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF161622) : Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, 4))]
                        ),
                        child: Column(
                          children: [
                            const Icon(Icons.storefront_rounded, size: 40, color: Colors.orange),
                            const SizedBox(height: 8),
                            Text(
                              widget.pedido.restaurante ?? 'Restaurante',
                              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: cs.onSurface),
                              textAlign: TextAlign.center,
                            ),
                            if (widget.pedido.tipoPedido != 'domicilio')
                              Container(
                                margin: const EdgeInsets.only(top: 8),
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                                decoration: BoxDecoration(color: Colors.red.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
                                child: Text(widget.pedido.tipoPedido!.toUpperCase(), style: const TextStyle(color: Colors.red, fontWeight: FontWeight.bold, fontSize: 12)),
                              ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    
                    // Cliente Info
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF161622) : Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, 4))]
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                CircleAvatar(backgroundColor: Colors.blue.withOpacity(0.1), child: const Icon(Icons.person, color: Colors.blue)),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(widget.pedido.clienteNombre ?? 'Cliente', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: cs.onSurface)),
                                      Text(widget.pedido.clienteTel, style: TextStyle(color: cs.onSurfaceVariant)),
                                    ],
                                  ),
                                ),
                                IconButton(
                                  onPressed: () => launchUrl(Uri.parse('tel:' + widget.pedido.clienteTel)),
                                  icon: const Icon(Icons.phone_in_talk_rounded, color: Colors.green),
                                  style: IconButton.styleFrom(backgroundColor: Colors.green.withOpacity(0.1)),
                                ),
                              ],
                            ),
                            const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Divider()),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(Icons.location_on_rounded, color: cs.onSurfaceVariant, size: 20),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    widget.pedido.direccion ?? 'Sin dirección',
                                    style: TextStyle(fontSize: 14, height: 1.4, color: cs.onSurface),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 16),
                            // Botón de navegación (Waze)
                            if (widget.pedido.lat != null && widget.pedido.lng != null)
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton.icon(
                                  onPressed: () => _abrirMaps(widget.pedido.lat!, widget.pedido.lng!),
                                  icon: const Icon(Icons.navigation_rounded),
                                  label: const Text('Navegar en Waze/Maps'),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.blue.shade600,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(vertical: 12),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    
                    const SizedBox(height: 16),
                    // Pedido Detalle (Cobro)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF161622) : Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, 4))]
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Detalles del Pedido', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: cs.onSurfaceVariant)),
                            const SizedBox(height: 8),
                            Text(widget.pedido.descripcion, style: TextStyle(fontSize: 14, color: cs.onSurface)),
                            const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Divider()),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text('A COBRAR', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: cs.onSurfaceVariant)),
                                Text(
                                  '\\$' + (widget.pedido.total?.toStringAsFixed(2) ?? '0.00'),
                                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: widget.pedido.metodoPago == 'efectivo' ? Colors.green : cs.onSurface),
                                ),
                              ],
                            ),
                            if (widget.pedido.metodoPago == 'tarjeta')
                              Container(
                                margin: const EdgeInsets.only(top: 8),
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                decoration: BoxDecoration(color: Colors.blue.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                                child: const Row(
                                  children: [
                                    Icon(Icons.credit_card_rounded, color: Colors.blue, size: 20),
                                    SizedBox(width: 8),
                                    Text('Pagado con Tarjeta. No cobrar.', style: TextStyle(color: Colors.blue, fontWeight: FontWeight.bold)),
                                  ],
                                ),
                              )
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              
              // Swipe to Action Bar (Sticky Bottom)
              if (nextState != null && !widget.pedido.isTerminado)
                Positioned(
                  left: 24, right: 24, bottom: 24,
                  child: _loading
                      ? Center(child: CircularProgressIndicator(color: swipeColor))
                      : SwipeButton(
                          text: swipeText,
                          activeColor: swipeColor,
                          onSwipe: () => _cambiarEstado(nextState!),
                        ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
`;

    fs.writeFileSync(path, before + newClass, 'utf8');
    console.log('Fixed syntax and updated layout perfectly.');
} else {
    console.log('Class not found!');
}

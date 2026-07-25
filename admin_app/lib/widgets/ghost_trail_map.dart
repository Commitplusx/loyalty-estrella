import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../core/supabase_config.dart';

class GhostTrailMap extends StatefulWidget {
  final String repartidorId;
  final DateTime startTime;
  final DateTime endTime;
  
  const GhostTrailMap({
    super.key,
    required this.repartidorId,
    required this.startTime,
    required this.endTime,
  });

  @override
  State<GhostTrailMap> createState() => _GhostTrailMapState();
}

class _GhostTrailMapState extends State<GhostTrailMap> {
  List<LatLng> _routePoints = [];
  bool _isLoading = true;
  GoogleMapController? _mapController;

  final String _mapStyle = '''
  [
    {"elementType": "geometry", "stylers": [{"color": "#f5f5f5"}]},
    {"elementType": "labels.icon", "stylers": [{"visibility": "off"}]},
    {"elementType": "labels.text.fill", "stylers": [{"color": "#616161"}]},
    {"elementType": "labels.text.stroke", "stylers": [{"color": "#f5f5f5"}]},
    {"featureType": "administrative.land_parcel", "elementType": "labels.text.fill", "stylers": [{"color": "#bdbdbd"}]},
    {"featureType": "poi", "elementType": "geometry", "stylers": [{"color": "#eeeeee"}]},
    {"featureType": "poi", "elementType": "labels.text.fill", "stylers": [{"color": "#757575"}]},
    {"featureType": "poi.park", "elementType": "geometry", "stylers": [{"color": "#e5e5e5"}]},
    {"featureType": "road", "elementType": "geometry", "stylers": [{"color": "#ffffff"}]},
    {"featureType": "road.arterial", "elementType": "labels.text.fill", "stylers": [{"color": "#757575"}]},
    {"featureType": "road.highway", "elementType": "geometry", "stylers": [{"color": "#dadada"}]},
    {"featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{"color": "#616161"}]},
    {"featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{"color": "#9e9e9e"}]},
    {"featureType": "transit.line", "elementType": "geometry", "stylers": [{"color": "#e5e5e5"}]},
    {"featureType": "transit.station", "elementType": "geometry", "stylers": [{"color": "#eeeeee"}]},
    {"featureType": "water", "elementType": "geometry", "stylers": [{"color": "#c9c9c9"}]},
    {"featureType": "water", "elementType": "labels.text.fill", "stylers": [{"color": "#9e9e9e"}]}
  ]
  ''';

  @override
  void initState() {
    super.initState();
    _loadTrail();
  }

  Future<void> _loadTrail() async {
    try {
      final data = await supabase
          .from('historial_ubicaciones')
          .select('lat, lng')
          .eq('repartidor_id', widget.repartidorId)
          .gte('created_at', widget.startTime.toUtc().toIso8601String())
          .lte('created_at', widget.endTime.toUtc().toIso8601String())
          .order('created_at', ascending: true);

      final points = (data as List).map((row) {
        return LatLng(row['lat'] as double, row['lng'] as double);
      }).toList();

      setState(() {
        _routePoints = points;
        _isLoading = false;
      });

      if (points.isNotEmpty && _mapController != null) {
        _fitBounds(points);
      }
    } catch (e) {
      print('Error al cargar historial: $e');
      setState(() => _isLoading = false);
    }
  }

  void _onMapCreated(GoogleMapController controller) {
    _mapController = controller;
    _mapController?.setMapStyle(_mapStyle);
    if (_routePoints.isNotEmpty) {
      _fitBounds(_routePoints);
    }
  }

  void _fitBounds(List<LatLng> points) {
    if (points.isEmpty) return;
    
    final lats = points.map((p) => p.latitude).toList();
    final lngs = points.map((p) => p.longitude).toList();
    lats.sort();
    lngs.sort();

    final bounds = LatLngBounds(
      southwest: LatLng(lats.first, lngs.first),
      northeast: LatLng(lats.last, lngs.last),
    );
    _mapController?.animateCamera(CameraUpdate.newLatLngBounds(bounds, 50));
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const SizedBox(
        height: 250,
        child: Center(child: CircularProgressIndicator(color: Colors.black26)),
      );
    }

    if (_routePoints.isEmpty) {
      return Container(
        height: 100,
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.grey.withValues(alpha: 0.2)),
        ),
        child: Center(
          child: Text(
            'Rastro no disponible para este pedido.',
            style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5)),
          ),
        ),
      );
    }

    final polylines = {
      Polyline(
        polylineId: const PolylineId('ghost_trail'),
        points: _routePoints,
        color: const Color(0xFF6366F1), // Indigo Premium
        width: 5,
        jointType: JointType.round,
        startCap: Cap.roundCap,
        endCap: Cap.roundCap,
      ),
    };

    final markers = {
      Marker(
        markerId: const MarkerId('start'),
        position: _routePoints.first,
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
        infoWindow: const InfoWindow(title: 'Inicio'),
      ),
      Marker(
        markerId: const MarkerId('end'),
        position: _routePoints.last,
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
        infoWindow: const InfoWindow(title: 'Entrega'),
      ),
    };

    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: SizedBox(
        height: 250,
        child: Stack(
          children: [
            GoogleMap(
              initialCameraPosition: CameraPosition(target: _routePoints.first, zoom: 15),
              polylines: polylines,
              markers: markers,
              zoomControlsEnabled: true,
              myLocationButtonEnabled: false,
              mapToolbarEnabled: false,
              onMapCreated: _onMapCreated,
            ),
            Positioned(
              top: 12,
              left: 12,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.9),
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 4),
                  ]
                ),
                child: const Row(
                  children: [
                    Icon(Icons.route_rounded, size: 14, color: Color(0xFF6366F1)),
                    SizedBox(width: 6),
                    Text('Rastro GPS (Auditoría)', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.black)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:go_router/go_router.dart';
import '../widgets/live_fleet_map.dart'; // Para reutilizar el provider

class AdminMapScreen extends ConsumerStatefulWidget {
  const AdminMapScreen({super.key});

  @override
  ConsumerState<AdminMapScreen> createState() => _AdminMapScreenState();
}

class _AdminMapScreenState extends ConsumerState<AdminMapScreen> {
  GoogleMapController? _mapController;
  final LatLng _defaultCenter = const LatLng(16.2326, -92.1285);

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

  void _onMapCreated(GoogleMapController controller) {
    _mapController = controller;
    _mapController?.setMapStyle(_mapStyle);
  }

  bool _isFirstLoad = true;

  void _updateCamera(List<Map<String, dynamic>> repartidores) {
    if (_mapController == null || repartidores.isEmpty) return;

    final lats = <double>[];
    final lngs = <double>[];

    for (var rep in repartidores) {
      if (rep['lat'] != null && rep['lng'] != null) {
        lats.add(rep['lat']);
        lngs.add(rep['lng']);
      }
    }

    if (lats.isEmpty) return;

    lats.sort();
    lngs.sort();

    final bounds = LatLngBounds(
      southwest: LatLng(lats.first, lngs.first),
      northeast: LatLng(lats.last, lngs.last),
    );

    _mapController!.animateCamera(CameraUpdate.newLatLngBounds(bounds, 100.0));
  }

  @override
  Widget build(BuildContext context) {
    final liveDataAsync = ref.watch(liveRepartidoresProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: isDark ? Colors.black.withValues(alpha: 0.7) : Colors.white.withValues(alpha: 0.8),
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: Text('Flota en Vivo', style: TextStyle(
          color: isDark ? Colors.white : Colors.black,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.5,
        )),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: isDark ? Colors.white : Colors.black),
          onPressed: () => context.pop(),
        ),
      ),
      body: liveDataAsync.when(
        loading: () => Center(child: CircularProgressIndicator(color: isDark ? Colors.white : Colors.black)),
        error: (err, _) => Center(child: Text('Error: $err')),
        data: (repartidores) {
          
          if (_isFirstLoad) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              _updateCamera(repartidores);
              _isFirstLoad = false;
            });
          }

          final markers = <Marker>{};
          for (var rep in repartidores) {
            final lat = rep['lat'];
            final lng = rep['lng'];
            if (lat != null && lng != null) {
              final nombre = rep['nombre'] ?? 'Repartidor';
              markers.add(
                Marker(
                  markerId: MarkerId(rep['id'].toString()),
                  position: LatLng(lat, lng),
                  infoWindow: InfoWindow(title: nombre),
                  icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
                ),
              );
            }
          }

          return GoogleMap(
            initialCameraPosition: CameraPosition(
              target: _defaultCenter,
              zoom: 14.5,
            ),
            markers: markers,
            zoomControlsEnabled: true, // Aquí SÍ permitimos controles
            mapToolbarEnabled: true,
            myLocationButtonEnabled: true,
            compassEnabled: true,
            liteModeEnabled: false,
            onMapCreated: _onMapCreated,
          );
        },
      ),
    );
  }
}

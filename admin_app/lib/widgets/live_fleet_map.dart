import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../core/supabase_config.dart';

import 'package:go_router/go_router.dart';

final liveRepartidoresProvider = StreamProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  return supabase
      .from('repartidores')
      .stream(primaryKey: ['id'])
      .eq('activo', true)
      .map((data) => List<Map<String, dynamic>>.from(data));
});

class LiveFleetMap extends ConsumerStatefulWidget {
  const LiveFleetMap({super.key});

  @override
  ConsumerState<LiveFleetMap> createState() => _LiveFleetMapState();
}

class _LiveFleetMapState extends ConsumerState<LiveFleetMap> {
  GoogleMapController? _mapController;
  final LatLng _defaultCenter = const LatLng(16.2326, -92.1285); // Comitán

  // Estilo Silver limpio (sin ser oscuro) para que encaje con la estética blanca minimalista
  final String _mapStyle = '''
  [
    {
      "elementType": "geometry",
      "stylers": [{"color": "#f5f5f5"}]
    },
    {
      "elementType": "labels.icon",
      "stylers": [{"visibility": "off"}]
    },
    {
      "elementType": "labels.text.fill",
      "stylers": [{"color": "#616161"}]
    },
    {
      "elementType": "labels.text.stroke",
      "stylers": [{"color": "#f5f5f5"}]
    },
    {
      "featureType": "administrative.land_parcel",
      "elementType": "labels.text.fill",
      "stylers": [{"color": "#bdbdbd"}]
    },
    {
      "featureType": "poi",
      "elementType": "geometry",
      "stylers": [{"color": "#eeeeee"}]
    },
    {
      "featureType": "poi",
      "elementType": "labels.text.fill",
      "stylers": [{"color": "#757575"}]
    },
    {
      "featureType": "poi.park",
      "elementType": "geometry",
      "stylers": [{"color": "#e5e5e5"}]
    },
    {
      "featureType": "road",
      "elementType": "geometry",
      "stylers": [{"color": "#ffffff"}]
    },
    {
      "featureType": "road.arterial",
      "elementType": "labels.text.fill",
      "stylers": [{"color": "#757575"}]
    },
    {
      "featureType": "road.highway",
      "elementType": "geometry",
      "stylers": [{"color": "#dadada"}]
    },
    {
      "featureType": "road.highway",
      "elementType": "labels.text.fill",
      "stylers": [{"color": "#616161"}]
    },
    {
      "featureType": "road.local",
      "elementType": "labels.text.fill",
      "stylers": [{"color": "#9e9e9e"}]
    },
    {
      "featureType": "transit.line",
      "elementType": "geometry",
      "stylers": [{"color": "#e5e5e5"}]
    },
    {
      "featureType": "transit.station",
      "elementType": "geometry",
      "stylers": [{"color": "#eeeeee"}]
    },
    {
      "featureType": "water",
      "elementType": "geometry",
      "stylers": [{"color": "#c9c9c9"}]
    },
    {
      "featureType": "water",
      "elementType": "labels.text.fill",
      "stylers": [{"color": "#9e9e9e"}]
    }
  ]
  ''';

  void _onMapCreated(GoogleMapController controller) {
    _mapController = controller;
    _mapController?.setMapStyle(_mapStyle);
  }

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

    // Animamos la cámara de forma fluida para enfocar a todos los repartidores
    _mapController!.animateCamera(CameraUpdate.newLatLngBounds(bounds, 50.0));
  }

  @override
  Widget build(BuildContext context) {
    final liveDataAsync = ref.watch(liveRepartidoresProvider);

    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: liveDataAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Colors.black26)),
        error: (err, _) => Center(child: Text('Error: $err')),
        data: (repartidores) {
          
          // Actualizar encuadre de la cámara automáticamente si hay movimientos
          WidgetsBinding.instance.addPostFrameCallback((_) {
            _updateCamera(repartidores);
          });

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
                  icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed), // Rojo clásico y limpio
                ),
              );
            }
          }

          return GestureDetector(
            onTap: () => context.push('/live-map'),
            child: IgnorePointer(
              child: GoogleMap(
                initialCameraPosition: CameraPosition(
                  target: _defaultCenter,
                  zoom: 14.5,
                ),
                markers: markers,
                zoomControlsEnabled: false,
                mapToolbarEnabled: false,
                myLocationButtonEnabled: false,
                compassEnabled: false,
                liteModeEnabled: false,
                onMapCreated: _onMapCreated,
              ),
            ),
          );
        },
      ),
    );
  }
}

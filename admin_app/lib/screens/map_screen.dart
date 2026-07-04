import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:go_router/go_router.dart';
import '../core/supabase_config.dart';

final mapPointsProvider = FutureProvider.autoDispose<List<Marker>>((ref) async {
  final now = DateTime.now();
  final start = DateTime(now.year, now.month, now.day).toIso8601String();

  final data = await supabase
      .from('registros_puntos')
      .select('latitud, longitud, clientes(nombre, telefono)')
      .eq('tipo', 'acumulacion')
      .not('latitud', 'is', null)
      .not('longitud', 'is', null)
      .gte('created_at', start);

  final List<Marker> markers = [];
  for (var row in data) {
    if (row['latitud'] != null && row['longitud'] != null) {
      final lat = (row['latitud'] as num).toDouble();
      final lng = (row['longitud'] as num).toDouble();
      
      final cl = row['clientes'];
      final nombre = cl != null ? (cl['nombre'] ?? cl['telefono'] ?? 'Cliente') : 'Cliente';

      markers.add(
        Marker(
          point: LatLng(lat, lng),
          width: 60,
          height: 60,
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: const Color(0xFF1A2332),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(nombre, style: const TextStyle(color: Colors.white, fontSize: 8)),
              ),
              const Icon(Icons.location_on, color: Color(0xFFFF6B35), size: 30),
            ],
          ),
        )
      );
    }
  }

  return markers;
});

class MapScreen extends ConsumerWidget {
  const MapScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final markersAsync = ref.watch(mapPointsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text('Mapa en Vivo (Hoy)'),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
        actions: [
          IconButton(
            icon: Icon(Icons.refresh),
            onPressed: () => ref.refresh(mapPointsProvider),
          )
        ],
      ),
      body: markersAsync.when(
        loading: () => Center(child: CircularProgressIndicator(color: Color(0xFFFF6B35))),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (markers) {
          if (markers.isEmpty) {
            return Center(child: Text('No hay entregas con coordenadas registradas hoy.', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))));
          }

          // Compute average bounds or center
          double avgLat = 0;
          double avgLng = 0;
          for (var m in markers) {
            avgLat += m.point.latitude;
            avgLng += m.point.longitude;
          }
          avgLat /= markers.length;
          avgLng /= markers.length;

          return FlutterMap(
            options: MapOptions(
              initialCenter: LatLng(avgLat, avgLng),
              initialZoom: 13.0,
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.estrelladelivery.admin',
              ),
              MarkerLayer(markers: markers),
            ],
          );
        },
      ),
    );
  }
}

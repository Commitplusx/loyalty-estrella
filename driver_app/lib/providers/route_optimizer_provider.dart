import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:estrella_admin/models/lat_lng.dart';
import '../models/route_stop.dart';
import '../services/route_optimizer_service.dart';
import '../screens/driver_pedidos_screen.dart'; // To access pedidosActivosProvider

final routeOptimizerServiceProvider = Provider<RouteOptimizerService>((ref) {
  return RouteOptimizerService();
});

/// A FutureProvider that recalculates the optimal route only when the active orders change.
final optimizedRouteProvider = FutureProvider<List<RouteStop>>((ref) async {
  final activeOrders = ref.watch(pedidosActivosProvider).value ?? [];
  final optimizer = ref.read(routeOptimizerServiceProvider);

  if (activeOrders.isEmpty) {
    return [];
  }

  // Get current location (fallback to a central default if permissions are denied)
  LatLng driverLocation = const LatLng(16.2516, -92.1332); // Default
  try {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (serviceEnabled) {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.whileInUse || permission == LocationPermission.always) {
        Position pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            timeLimit: Duration(seconds: 5),
          )
        );
        driverLocation = LatLng(pos.latitude, pos.longitude);
      }
    }
  } catch (e) {
    print('Failed to get location for optimizer: $e');
  }

  return await optimizer.optimizeRoute(driverLocation, activeOrders);
});

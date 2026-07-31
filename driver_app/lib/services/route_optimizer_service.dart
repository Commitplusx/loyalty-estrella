import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:geolocator/geolocator.dart';
import 'package:estrella_admin/models/lat_lng.dart';
import '../models/pedido_model.dart';
import '../models/route_stop.dart';

class RouteOptimizerService {
  static const String _apiKey = 'AIzaSyBOZkp595ze0Agwb7yPG5u7MD29EL9gHMw';
  
  /// Calculates the optimal sequence of stops for a driver to visit.
  /// Enforces that a dropoff cannot be visited before its corresponding pickup.
  Future<List<RouteStop>> optimizeRoute(LatLng driverLocation, List<PedidoModel> activeOrders) async {
    // 1. Generate all pending stops from the active orders.
    List<RouteStop> pendingStops = [];
    for (var p in activeOrders) {
      pendingStops.addAll(RouteStop.getStopsForPedido(p));
    }
    
    if (pendingStops.isEmpty) return [];
    if (pendingStops.length == 1) return pendingStops;

    // 2. Prepare coordinates for Distance Matrix API
    // Origins: Driver Location + All Stop Locations
    List<LatLng> origins = [driverLocation];
    origins.addAll(pendingStops.map((s) => s.location));
    
    // Destinations: All Stop Locations
    List<LatLng> destinations = pendingStops.map((s) => s.location).toList();

    String originsStr = origins.map((l) => '${l.latitude},${l.longitude}').join('|');
    String destinationsStr = destinations.map((l) => '${l.latitude},${l.longitude}').join('|');

    final url = Uri.parse('https://maps.googleapis.com/maps/api/distancematrix/json?origins=$originsStr&destinations=$destinationsStr&key=$_apiKey');
    
    try {
      final response = await http.get(url);
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['status'] == 'OK') {
          return _solveTSPWithConstraints(origins, pendingStops, data['rows']);
        }
      }
    } catch (e) {
      // Fallback to Haversine distance if API fails
      print('RouteOptimizerService API Error: $e');
    }
    
    // Fallback: Haversine distance
    return _solveTSPWithHaversine(driverLocation, pendingStops);
  }

  List<RouteStop> _solveTSPWithConstraints(List<LatLng> origins, List<RouteStop> pendingStops, List<dynamic> distanceMatrixRows) {
    List<RouteStop> orderedRoute = [];
    List<RouteStop> unvisited = List.from(pendingStops);
    Set<String> visitedPickups = {};
    
    // The driver is at index 0 in the distance matrix rows
    int currentNodeIndex = 0; 
    
    while (unvisited.isNotEmpty) {
      double minDistance = double.infinity;
      RouteStop? bestNextStop;
      int bestStopIndexInDestinations = -1;
      
      // Look at all unvisited stops to find the closest valid one
      for (int i = 0; i < unvisited.length; i++) {
        final candidateStop = unvisited[i];
        
        // Validation constraint: Can we visit this stop?
        bool isValid = true;
        if (candidateStop.type == StopType.dropoff) {
          // It's a dropoff. We can only visit it if its pickup is already visited, 
          // OR if the order is already 'en_camino' (meaning the pickup stop was never added to unvisited in the first place).
          bool pickupPending = unvisited.any((s) => s.id == '${candidateStop.pedido.id}_pickup');
          if (pickupPending) {
            isValid = false;
          }
        }
        
        if (isValid) {
          // Find the index of this candidate in the original pendingStops (destinations)
          int destIndex = pendingStops.indexOf(candidateStop);
          
          // Distance from currentNode to candidateStop
          var cell = distanceMatrixRows[currentNodeIndex]['elements'][destIndex];
          if (cell['status'] == 'OK') {
            double dist = (cell['distance']['value'] as num).toDouble();
            if (dist < minDistance) {
              minDistance = dist;
              bestNextStop = candidateStop;
              bestStopIndexInDestinations = destIndex;
            }
          }
        }
      }
      
      if (bestNextStop != null) {
        orderedRoute.add(bestNextStop);
        unvisited.remove(bestNextStop);
        if (bestNextStop.type == StopType.pickup) {
          visitedPickups.add(bestNextStop.pedido.id);
        }
        // The new current node index in the origins array is (destIndex + 1) because driver was at 0
        currentNodeIndex = bestStopIndexInDestinations + 1;
      } else {
        // Fallback to prevent infinite loop (should never happen logically)
        orderedRoute.addAll(unvisited);
        break;
      }
    }
    
    return orderedRoute;
  }
  
  List<RouteStop> _solveTSPWithHaversine(LatLng driverLocation, List<RouteStop> pendingStops) {
    List<RouteStop> orderedRoute = [];
    List<RouteStop> unvisited = List.from(pendingStops);
    LatLng currentLoc = driverLocation;
    
    while (unvisited.isNotEmpty) {
      double minDistance = double.infinity;
      RouteStop? bestNextStop;
      
      for (var candidateStop in unvisited) {
        bool isValid = true;
        if (candidateStop.type == StopType.dropoff) {
          bool pickupPending = unvisited.any((s) => s.id == '${candidateStop.pedido.id}_pickup');
          if (pickupPending) {
            isValid = false;
          }
        }
        
        if (isValid) {
          double dist = Geolocator.distanceBetween(
            currentLoc.latitude, currentLoc.longitude,
            candidateStop.location.latitude, candidateStop.location.longitude,
          );
          if (dist < minDistance) {
            minDistance = dist;
            bestNextStop = candidateStop;
          }
        }
      }
      
      if (bestNextStop != null) {
        orderedRoute.add(bestNextStop);
        unvisited.remove(bestNextStop);
        currentLoc = bestNextStop.location;
      } else {
        orderedRoute.addAll(unvisited);
        break;
      }
    }
    
    return orderedRoute;
  }
}

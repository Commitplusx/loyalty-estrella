import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter/foundation.dart';

class MapboxDirectionsService {
  // Token Público de Mapbox
  static const String _publicToken = 'pk.eyJ1IjoiZGVpZmZ4ZCIsImEiOiJjbW9ha2UybG4wNzJiMnJwcHJteXFua3BmIn0.hASM0wsh3h4QYqnBNHwa1A';
  
  static Future<Map<String, dynamic>?> getRoute({
    required double originLat,
    required double originLng,
    required double destLat,
    required double destLng,
  }) async {
    try {
      // Mapbox Directions API requiere el formato {longitude},{latitude}
      final origin = '$originLng,$originLat';
      final destination = '$destLng,$destLat';
      
      final url = Uri.parse(
        'https://api.mapbox.com/directions/v5/mapbox/driving/$origin;$destination'
        '?geometries=geojson&overview=full&steps=true&access_token=$_publicToken'
      );
      
      final response = await http.get(url);
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['routes'] != null && data['routes'].isNotEmpty) {
          final route = data['routes'][0];
          final geometry = route['geometry'];
          final duration = route['duration'] as num; // segundos
          final distance = route['distance'] as num; // metros
          
          // Extraer semáforos de las intersecciones
          List<List<double>> trafficSignals = [];
          if (route['legs'] != null) {
            for (var leg in route['legs']) {
              if (leg['steps'] != null) {
                for (var step in leg['steps']) {
                  if (step['intersections'] != null) {
                    for (var intersection in step['intersections']) {
                      if (intersection['traffic_signal'] == true && intersection['location'] != null) {
                        final loc = intersection['location'];
                        // Mapbox devuelve [lng, lat]
                        trafficSignals.add([loc[1].toDouble(), loc[0].toDouble()]);
                      }
                    }
                  }
                }
              }
            }
          }
          
          // Formatear ETA
          final minutes = (duration / 60).ceil();
          final etaString = '$minutes min';
          
          // Formatear Distancia
          String distanceString = '';
          if (distance > 1000) {
            distanceString = '${(distance / 1000).toStringAsFixed(1)} km';
          } else {
            distanceString = '${distance.round()} m';
          }
          
          return {
            'geometry': geometry,
            'duration_seconds': duration.toInt(),
            'eta_string': etaString,
            'distance_string': distanceString,
            'traffic_signals': trafficSignals,
          };
        }
      } else {
        debugPrint('📍 [Mapbox API] Error ${response.statusCode}: ${response.body}');
      }
    } catch (e) {
      debugPrint('📍 [Mapbox API] Exception: $e');
    }
    return null;
  }
}

import 'package:estrella_admin/models/lat_lng.dart';
import 'pedido_model.dart';

enum StopType { pickup, dropoff }

class RouteStop {
  final String id;
  final PedidoModel pedido;
  final StopType type;
  final LatLng location;
  final String title;
  final String address;

  RouteStop({
    required this.id,
    required this.pedido,
    required this.type,
    required this.location,
    required this.title,
    required this.address,
  });

  /// Factory helper to generate the pending stops for a given order based on its state.
  static List<RouteStop> getStopsForPedido(PedidoModel p) {
    List<RouteStop> stops = [];
    
    // Determine coordinates based on the type of order
    LatLng? pickupLocation;
    LatLng? dropoffLocation;
    
    // Pickup logic
    if (p.restauranteLat != null && p.restauranteLng != null) {
      pickupLocation = LatLng(p.restauranteLat!, p.restauranteLng!);
    } else if (p.lat != null && p.lng != null && (p.tipoPedido == 'mandadito' || p.tipoPedido == 'compra')) {
      pickupLocation = LatLng(p.lat!, p.lng!);
    }

    // Dropoff logic
    if (p.latEntrega != null && p.lngEntrega != null) {
      dropoffLocation = LatLng(p.latEntrega!, p.lngEntrega!);
    } else if (p.lat != null && p.lng != null && p.tipoPedido != 'mandadito' && p.tipoPedido != 'compra') {
      dropoffLocation = LatLng(p.lat!, p.lng!);
    }

    // If order hasn't been picked up yet, we need to visit the pickup location first.
    if (['asignado', 'preparando', 'listo_para_recoger', 'recibido'].contains(p.estado)) {
      if (pickupLocation != null) {
        stops.add(RouteStop(
          id: '${p.id}_pickup',
          pedido: p,
          type: StopType.pickup,
          location: pickupLocation,
          title: p.restaurante ?? 'Lugar de recolección',
          address: p.origen ?? p.direccion ?? 'Sin dirección de origen',
        ));
      }
    }
    
    // If it's not delivered yet, we need to visit the dropoff location.
    if (['asignado', 'preparando', 'listo_para_recoger', 'recibido', 'en_camino'].contains(p.estado)) {
      if (dropoffLocation != null) {
        stops.add(RouteStop(
          id: '${p.id}_dropoff',
          pedido: p,
          type: StopType.dropoff,
          location: dropoffLocation,
          title: p.clienteNombre ?? 'Cliente',
          address: p.destino ?? p.direccion ?? 'Sin dirección de entrega',
        ));
      }
    }
    
    return stops;
  }
}

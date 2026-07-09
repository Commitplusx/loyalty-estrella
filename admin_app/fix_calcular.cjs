const fs = require('fs');

let dashPath = 'C:\\Users\\Kaleb\\Desktop\\loyalty-estrella\\admin_app\\lib\\screens\\driver_dashboard_view.dart';
let dashContent = fs.readFileSync(dashPath, 'utf-8');

// The function starts at Map<String, dynamic>? _calcularProximaParada() {
// and ends at return bestStop; }

const startIndex = dashContent.indexOf('  Map<String, dynamic>? _calcularProximaParada() {');
const endIndex = dashContent.indexOf('  // ===========================================', startIndex);

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find bounds of _calcularProximaParada");
    process.exit(1);
}

const newMethod = `  List<Map<String, dynamic>> _calcularTodasLasParadas() {
    if (_pedidosActivos.isEmpty) return [];

    List<Map<String, dynamic>> stops = [];

    for (var pedido in _pedidosActivos) {
      final estado = pedido['estado'];
      final bool isPickup = ['asignado', 'aceptado', 'en_cocina', 'listo_para_recoger'].contains(estado);
      final bool isDropoff = estado == 'en_camino';

      if (!isPickup && !isDropoff) continue;

      double targetLat = 0.0;
      double targetLng = 0.0;
      String actionText = '';
      String title = '';
      String subtitle = '';

      if (isPickup) {
        final rest = pedido['restaurante'];
        if (rest is Map) {
          targetLat = (rest['lat'] ?? 0.0).toDouble();
          targetLng = (rest['lng'] ?? 0.0).toDouble();
          title = rest['nombre_comercial'] ?? 'Restaurante';
        } else {
          title = rest?.toString() ?? 'Restaurante';
        }
        subtitle = 'Recoger Pedido #\${pedido['id'].toString().substring(0, 4)}';
        actionText = 'IR A RECOGER';
      } else if (isDropoff) {
        targetLat = (pedido['lat_cliente'] ?? pedido['lat_entrega'] ?? pedido['lat'] ?? 0.0).toDouble();
        targetLng = (pedido['lng_cliente'] ?? pedido['lng_entrega'] ?? pedido['lng'] ?? 0.0).toDouble();
        title = 'Cliente'; 
        subtitle = 'Entregar en: \${pedido['direccion'] ?? 'Ubicación'}';
        actionText = 'IR A ENTREGAR';
      }

      stops.add({
        'pedido': pedido,
        'action': actionText,
        'title': title,
        'subtitle': subtitle,
        'targetLat': targetLat,
        'targetLng': targetLng,
        'isPickup': isPickup
      });
    }
    return stops;
  }
`;

dashContent = dashContent.substring(0, startIndex) + newMethod + dashContent.substring(endIndex);

fs.writeFileSync(dashPath, dashContent, 'utf-8');
console.log("Successfully replaced _calcularProximaParada with _calcularTodasLasParadas");

import re
import os

file_path = r"C:\Users\Kaleb\Desktop\loyalty-estrella\admin_app\lib\screens\driver_dashboard_view.dart"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Replace _calcularProximaParada with _calcularTodasLasParadas
old_calcular = """  Map<String, dynamic>? _calcularProximaParada() {
    if (_pedidosActivos.isEmpty) return null;

    Map<String, dynamic>? bestStop;
    double minDistance = double.infinity;

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
        // Datos del Restaurante
        final rest = pedido['restaurante'];
        if (rest is Map) {
          targetLat = (rest['lat'] ?? 0.0).toDouble();
          targetLng = (rest['lng'] ?? 0.0).toDouble();
          title = rest['nombre_comercial'] ?? 'Restaurante';
        } else {
          title = rest?.toString() ?? 'Restaurante';
        }
        subtitle = 'Recoger Pedido #${pedido['id'].toString().substring(0, 4)}';
        actionText = 'IR A RECOGER';
      } else if (isDropoff) {
        // Datos del Cliente (Privacidad: Se oculta el nombre)
        targetLat = (pedido['lat_cliente'] ?? pedido['lat'] ?? 0.0).toDouble();
        targetLng = (pedido['lng_cliente'] ?? pedido['lng'] ?? 0.0).toDouble();
        title = 'Cliente'; 
        subtitle = 'Entregar en: ${pedido['direccion'] ?? 'Ubicacin'}';
        actionText = 'IR A ENTREGAR';
      }

      if (targetLat == 0.0 || targetLng == 0.0) {
         if (bestStop == null) {
            bestStop = {'pedido': pedido, 'action': actionText, 'title': title, 'subtitle': subtitle, 'targetLat': targetLat, 'targetLng': targetLng, 'isPickup': isPickup};
         }
         continue;
      }

      final distance = Geolocator.distanceBetween(_currentLocation.latitude, _currentLocation.longitude, targetLat, targetLng);

      if (distance < minDistance) {
        minDistance = distance;
        bestStop = {'pedido': pedido, 'action': actionText, 'title': title, 'subtitle': subtitle, 'targetLat': targetLat, 'targetLng': targetLng, 'distance': distance, 'isPickup': isPickup};
      }
    }
    return bestStop;
  }"""

new_calcular = """  List<Map<String, dynamic>> _calcularTodasLasParadas() {
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
        subtitle = 'Recoger Pedido #${pedido['id'].toString().substring(0, 4)}';
        actionText = 'IR A RECOGER';
      } else if (isDropoff) {
        targetLat = (pedido['lat_cliente'] ?? pedido['lat_entrega'] ?? pedido['lat'] ?? 0.0).toDouble();
        targetLng = (pedido['lng_cliente'] ?? pedido['lng_entrega'] ?? pedido['lng'] ?? 0.0).toDouble();
        title = 'Cliente'; 
        subtitle = 'Entregar en: ${pedido['direccion'] ?? 'Ubicación'}';
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
  }"""

content = content.replace(old_calcular, new_calcular)

# 2. Update _buildRadarMode
old_build_radar = """  Widget _buildRadarMode(BuildContext context, bool isDark, ColorScheme cs, dynamic ganancias) {
    final nextStop = _calcularProximaParada();"""

new_build_radar = """  Widget _buildRadarMode(BuildContext context, bool isDark, ColorScheme cs, dynamic ganancias) {
    final allStops = _calcularTodasLasParadas();
    final nextStop = allStops.isNotEmpty ? allStops.first : null;"""

content = content.replace(old_build_radar, new_build_radar)

old_bottom = """        // Panel Inferior
        Align(
          alignment: Alignment.bottomCenter,
          child: nextStop != null 
             ? _buildActiveOrderCard(nextStop) 
             : _buildSearchingOrdersSheet(isDark),
        )"""

new_bottom = """        // Panel Inferior
        Align(
          alignment: Alignment.bottomCenter,
          child: allStops.isNotEmpty 
             ? SizedBox(
                 height: 195,
                 child: PageView.builder(
                   controller: PageController(viewportFraction: 0.95),
                   itemCount: allStops.length,
                   itemBuilder: (context, index) {
                     return _buildActiveOrderCard(allStops[index], index + 1, allStops.length);
                   },
                 ),
               )
             : _buildSearchingOrdersSheet(isDark),
        )"""

content = content.replace(old_bottom, new_bottom)

# 3. Update _buildActiveOrderCard signature and UI
old_card_sig = """  Widget _buildActiveOrderCard(Map<String, dynamic> nextStop) {"""
new_card_sig = """  Widget _buildActiveOrderCard(Map<String, dynamic> nextStop, int currentIndex, int totalOrders) {"""

content = content.replace(old_card_sig, new_card_sig)

old_card_badge = """              if (_pedidosActivos.length > 1)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(12)),
                  child: Text('+${_pedidosActivos.length - 1} en cola', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                )"""

new_card_badge = """              if (totalOrders > 1)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(12)),
                  child: Text('$currentIndex de $totalOrders', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                )"""

content = content.replace(old_card_badge, new_card_badge)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Flutter UI updated for stacking.")

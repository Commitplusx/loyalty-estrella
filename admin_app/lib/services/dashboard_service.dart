import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/supabase_config.dart';

final dashboardServiceProvider = Provider<DashboardService>((ref) {
  return DashboardService();
});

class DashboardService {
  /// Obtiene las estadísticas operativas estrictamente de HOY.
  /// Mide el esfuerzo logístico real cruzando la tabla de pedidos.
  Future<Map<String, dynamic>> getDailyStats() async {
    final now = DateTime.now();
    final startOfDay = DateTime(now.year, now.month, now.day).toUtc().toIso8601String();
    
    // Obtenemos todos los pedidos que se crearon hoy y que NO están cancelados.
    final response = await supabase
        .from('pedidos')
        .select('id, precio_entrega, metodo_pago, estado')
        .gte('created_at', startOfDay)
        .neq('estado', 'cancelado');

    final pedidos = response as List<dynamic>;

    int serviciosHoy = pedidos.length;
    double gananciasHoy = 0.0;
    int enviosGratisHoy = 0;

    for (var p in pedidos) {
      final precio = (p['precio_entrega'] as num?)?.toDouble() ?? 0.0;
      final metodoPago = p['metodo_pago'] as String? ?? '';
      
      // Contar envíos gratis: precio 0, o pagados con billetera/cupon
      if (precio == 0 || metodoPago.toLowerCase() == 'billetera') {
        enviosGratisHoy++;
      } else {
        // Solo sumar a las ganancias si se completaron o están en curso, y no son gratis.
        gananciasHoy += precio;
      }
    }

    return {
      'servicios': serviciosHoy,
      'ganancias': gananciasHoy,
      'gratis': enviosGratisHoy,
    };
  }

  /// Obtiene las estadísticas para un repartidor específico en el día actual
  Future<Map<String, dynamic>> getDriverDailyStats(String repartidorId) async {
    final now = DateTime.now();
    final startOfDay = DateTime(now.year, now.month, now.day).toUtc().toIso8601String();
    
    final response = await supabase
        .from('pedidos')
        .select('id, precio_entrega, estado')
        .eq('repartidor_id', repartidorId)
        .gte('created_at', startOfDay)
        .neq('estado', 'cancelado');

    final pedidos = response as List<dynamic>;
    return {
      'servicios': pedidos.length,
    };
  }
}

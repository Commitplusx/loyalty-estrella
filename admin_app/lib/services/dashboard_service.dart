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
    
    // Obtenemos todos los pedidos que se actualizaron hoy y que NO están cancelados.
    final response = await supabase
        .from('pedidos')
        .select('id, precio_entrega, metodo_pago, estado, updated_at')
        .gte('updated_at', startOfDay)
        .neq('estado', 'cancelado');

    final pedidos = response as List<dynamic>;

    int serviciosHoy = 0;
    double gananciasHoy = 0.0;
    int enviosGratisHoy = 0;

    for (var p in pedidos) {
      final estado = p['estado'] as String? ?? '';
      
      // Solo contar en el dashboard los pedidos que ya fueron entregados.
      if (estado != 'entregado') continue;

      serviciosHoy++;

      final precio = (p['precio_entrega'] as num?)?.toDouble() ?? 0.0;
      final metodoPago = p['metodo_pago'] as String? ?? '';
      
      // Contar envíos gratis: precio 0, o pagados con billetera/cupon
      if (precio == 0 || metodoPago.toLowerCase() == 'billetera') {
        enviosGratisHoy++;
      } else {
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
        .select('id, precio_entrega, estado, updated_at')
        .eq('repartidor_id', repartidorId)
        .gte('updated_at', startOfDay)
        .neq('estado', 'cancelado');

    final pedidos = response as List<dynamic>;
    int servicios = 0;
    
    for (var p in pedidos) {
      if (p['estado'] == 'entregado') {
        servicios++;
      }
    }
    
    return {
      'servicios': servicios,
    };
  }

  /// Obtiene estadísticas de ganancias de los últimos 7 días
  Future<List<Map<String, dynamic>>> getWeeklyStats({String? repartidorId}) async {
    final now = DateTime.now();
    // 6 days ago + today = 7 days
    final startOf7DaysAgo = DateTime(now.year, now.month, now.day).subtract(const Duration(days: 6)).toUtc().toIso8601String();
    
    var query = supabase
        .from('pedidos')
        .select('precio_entrega, metodo_pago, estado, updated_at')
        .gte('updated_at', startOf7DaysAgo)
        .eq('estado', 'entregado');
        
    if (repartidorId != null) {
      query = query.eq('repartidor_id', repartidorId);
    }

    final response = await query;
    final pedidos = response as List<dynamic>;

    // Prepare exactly 7 days
    final List<Map<String, dynamic>> result = [];
    final weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    for (int i = 6; i >= 0; i--) {
      final date = now.subtract(Duration(days: i));
      result.add({
        'day': weekDays[date.weekday - 1],
        'date': '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
        'ganancias': 0.0,
      });
    }

    for (var p in pedidos) {
      final dt = DateTime.tryParse(p['updated_at'] ?? '')?.toLocal();
      if (dt == null) continue;
      
      final dateStr = '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
      
      final precio = (p['precio_entrega'] as num?)?.toDouble() ?? 0.0;
      final metodoPago = p['metodo_pago'] as String? ?? '';
      
      if (precio > 0 && metodoPago.toLowerCase() != 'billetera') {
        final dayIndex = result.indexWhere((element) => element['date'] == dateStr);
        if (dayIndex != -1) {
          result[dayIndex]['ganancias'] = (result[dayIndex]['ganancias'] as double) + precio;
        }
      }
    }
    
    return result;
  }

  /// Obtiene los restaurantes más pedidos de la última semana (Top 5)
  Future<List<Map<String, dynamic>>> getTopRestaurantes() async {
    final now = DateTime.now();
    final sevenDaysAgo = now.subtract(const Duration(days: 7)).toUtc().toIso8601String();

    final response = await supabase
        .from('pedidos')
        .select('restaurante')
        .gte('created_at', sevenDaysAgo)
        .neq('estado', 'cancelado')
        .not('restaurante', 'is', 'null');

    final pedidos = response as List<dynamic>;
    final map = <String, int>{};

    for (var p in pedidos) {
      final rest = (p['restaurante'] as String).trim();
      if (rest.isEmpty) continue;
      map[rest] = (map[rest] ?? 0) + 1;
    }

    final sorted = map.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    
    return sorted.take(5).map((e) => {
      'nombre': e.key,
      'pedidos': e.value,
    }).toList();
  }
}

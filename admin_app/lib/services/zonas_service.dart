import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/supabase_config.dart';

class ZonasService {
  Future<List<Map<String, dynamic>>> getRestaurantes() async {
    final data = await supabase
        .from('restaurantes')
        .select('id, nombre, telefono')
        .order('nombre');
    return List<Map<String, dynamic>>.from(data);
  }

  Future<List<Map<String, dynamic>>> getColonias() async {
    final data = await supabase
        .from('colonias')
        .select()
        .order('nombre');
    return List<Map<String, dynamic>>.from(data);
  }

  Future<List<Map<String, dynamic>>> getZonasPorRestaurante(String telefono) async {
    final data = await supabase
        .from('restaurante_colonias')
        .select('*, colonias(nombre)')
        .eq('restaurante_telefono', telefono);
    return List<Map<String, dynamic>>.from(data);
  }

  Future<void> upsertZona({
    required String restauranteTelefono,
    required String coloniaId,
    required bool aplicaHoraFeliz,
    double? precioEstandar,
  }) async {
    await supabase.from('restaurante_colonias').upsert({
      'restaurante_telefono': restauranteTelefono,
      'colonia_id': coloniaId,
      'aplica_hora_feliz': aplicaHoraFeliz,
      'precio_estandar': precioEstandar,
    }, onConflict: 'restaurante_telefono, colonia_id');
  }

  Future<void> deleteZona(String id) async {
    await supabase.from('restaurante_colonias').delete().eq('id', id);
  }

  Future<String> createColonia(String nombre) async {
    final data = await supabase.from('colonias').insert({
      'nombre': nombre,
    }).select().single();
    return data['id'];
  }

  Stream<List<Map<String, dynamic>>> streamRestaurantes() {
    return supabase
        .from('restaurantes')
        .stream(primaryKey: ['id'])
        .order('nombre')
        .map((data) => List<Map<String, dynamic>>.from(data));
  }

  Stream<List<Map<String, dynamic>>> streamColonias() {
    return supabase
        .from('colonias')
        .stream(primaryKey: ['id'])
        .order('nombre')
        .map((data) => List<Map<String, dynamic>>.from(data));
  }

  Stream<List<Map<String, dynamic>>> streamZonasPorRestaurante(String telefono) {
    // Note: Suapbase realtime stream on joined tables is not directly supported via primaryKey streams in the same way,
    // so we listen to restaurante_colonias and then we might need to fetch the colonias name, 
    // but a simpler approach for now is basic fetching or using the standard stream if we don't strictly need the join live, 
    // or manually trigger a refresh. Let's keep the Future for the nested join for now, to ensure stability, or implement a manual stream.
    // We will leave getZonasPorRestaurante as a Future, since the UI can just pull it when needed, or we implement a standard listener.
    return Stream.empty(); // Placeholder
  }
}

final zonasServiceProvider = Provider((ref) => ZonasService());

final restaurantesConfigProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  return await ref.watch(zonasServiceProvider).getRestaurantes();
});

final coloniasMasterProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  return await ref.watch(zonasServiceProvider).getColonias();
});

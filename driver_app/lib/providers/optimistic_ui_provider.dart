import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../services/local_database.dart';

/// Provider que expone el StateNotifier de mutaciones optimistas
final optimisticMutationsProvider = StateNotifierProvider<OptimisticMutationsNotifier, Map<String, String>>((ref) {
  return OptimisticMutationsNotifier();
});

class OptimisticMutationsNotifier extends StateNotifier<Map<String, String>> {
  OptimisticMutationsNotifier() : super({}) {
    _init();
  }

  Future<void> _init() async {
    // 1. Al arrancar, recuperar mutaciones que se quedaron en la BD local (ej. la app se cerró sin internet)
    final pending = await LocalDatabase.instance.getPendingOrderStates();
    if (pending.isNotEmpty) {
      state = {...state, ...pending};
    }

    // 2. Escuchar cambios de conectividad. Si regresa el internet, drenar la cola.
    Connectivity().onConnectivityChanged.listen((List<ConnectivityResult> results) async {
      final result = results.first;
      if (result != ConnectivityResult.none && state.isNotEmpty) {
        // Regresó el internet, intentamos limpiar la cola
        await LocalDatabase.instance.flushOrderMutations();
        
        // Revisamos qué quedó en la cola después del flush
        final stillPending = await LocalDatabase.instance.getPendingOrderStates();
        
        // Actualizamos nuestro mapa en memoria (si el flush fue exitoso al 100%, stillPending estará vacío)
        state = stillPending;
      }
    });
  }

  /// Aplica el estado optimista a la UI inmediatamente y lo encola en SQLite
  Future<void> mutateOrder(String pedidoId, Map<String, dynamic> updateData) async {
    // 1. Ocultar/Cambiar en UI instantáneamente
    if (updateData.containsKey('estado')) {
      state = {
        ...state,
        pedidoId: updateData['estado'] as String,
      };
    }

    // 2. Guardar en disco para tolerancia a fallos
    await LocalDatabase.instance.enqueueOrderMutation(pedidoId, updateData);

    // 3. Intentar sincronizar inmediatamente (el Worker detectará si no hay red y parará)
    await LocalDatabase.instance.flushOrderMutations();

    // 4. Limpiar el estado de este pedido en memoria si el flush fue exitoso
    final stillPending = await LocalDatabase.instance.getPendingOrderStates();
    if (!stillPending.containsKey(pedidoId)) {
      final newState = Map<String, String>.from(state);
      newState.remove(pedidoId);
      state = newState;
    }
  }
}

import 'dart:math' as math;

class RoutingEngine {
  static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
    const R = 6371.0;
    final dLat = (lat2 - lat1) * math.pi / 180.0;
    final dLon = (lon2 - lon1) * math.pi / 180.0;
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1 * math.pi / 180.0) *
            math.cos(lat2 * math.pi / 180.0) *
            math.sin(dLon / 2) *
            math.sin(dLon / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return R * c;
  }

  static int etaMin(double distKm) {
    return (distKm / 25.0 * 60).ceil().clamp(2, 999);
  }

  static List<Map<String, dynamic>> groupPickupsByProximity(
    List<Map<String, dynamic>> pickups, {
    double radiusKm = 0.2,
  }) {
    final result = <Map<String, dynamic>>[];
    final processed = List.filled(pickups.length, false);

    for (int i = 0; i < pickups.length; i++) {
      if (processed[i]) continue;
      final base = pickups[i];
      final grupo = <Map<String, dynamic>>[base];
      var urgenteGrupo = base['urgente'] as bool;

      for (int j = i + 1; j < pickups.length; j++) {
        if (processed[j]) continue;
        final otro = pickups[j];
        final dist = haversineKm(
          (base['targetLat'] as num).toDouble(),
          (base['targetLng'] as num).toDouble(),
          (otro['targetLat'] as num).toDouble(),
          (otro['targetLng'] as num).toDouble(),
        );
        if (dist < radiusKm) {
          grupo.add(otro);
          processed[j] = true;
          if (otro['urgente'] as bool) urgenteGrupo = true;
        }
      }
      processed[i] = true;

      if (grupo.length == 1) {
        result.add(base);
      } else {
        final allPedidos = grupo
            .map((s) => s['pedido'] as Map<String, dynamic>)
            .toList();
        final ids = allPedidos
            .map((p) => '#${(p["id"] as String).substring(0, 6).toUpperCase()}')
            .join(' · ');
        result.add({
          'pedido': allPedidos.first,
          'pedidos': allPedidos,
          'action': 'RECOGER EN',
          'title': base['title'],
          'subtitle': '${grupo.length} pedidos · $ids',
          'targetLat': base['targetLat'],
          'targetLng': base['targetLng'],
          'isPickup': true,
          'isGrouped': grupo.length > 1,
          'groupSize': grupo.length,
          'completado': false,
          'urgente': urgenteGrupo,
          'distanciaKm': base['distanciaKm'],
          'etaMin': base['etaMin'],
          'zonaCompartida': grupo.length > 1,
        });
      }
    }
    return result;
  }

  static List<Map<String, dynamic>> tspNearestNeighbor(
    List<Map<String, dynamic>> nodes,
    double startLat,
    double startLng, {
    bool usePrepTime = false,
  }) {
    if (nodes.isEmpty) return [];

    final now = DateTime.now();
    final result = <Map<String, dynamic>>[];
    final remaining = List<Map<String, dynamic>>.from(nodes);
    var curLat = startLat;
    var curLng = startLng;

    while (remaining.isNotEmpty) {
      double bestScore = double.infinity;
      int bestIdx = 0;

      for (int i = 0; i < remaining.length; i++) {
        final node = remaining[i];
        final tLat = (node['targetLat'] as num).toDouble();
        final tLng = (node['targetLng'] as num).toDouble();
        final dist = haversineKm(curLat, curLng, tLat, tLng);
        double score = dist;

        if (usePrepTime) {
          final etaTime = dist / 25.0 * 60;
          int prepMin = 0;

          try {
            final pedidos = (node['pedidos'] as List?)
                    ?.cast<Map<String, dynamic>>() ??
                [node['pedido'] as Map<String, dynamic>];

            for (final p in pedidos) {
              final tp = p['tiempo_preparacion'] ??
                  (p['restaurante'] is Map
                      ? (p['restaurante'] as Map)['tiempo_preparacion']
                      : null);
              if (tp != null) {
                prepMin = prepMin < (tp as num).toInt()
                    ? (tp).toInt()
                    : prepMin;
              }
              final listoEn = p['listo_en'];
              if (listoEn != null) {
                try {
                  final readyAt =
                      DateTime.parse(listoEn.toString()).toLocal();
                  final minUntilReady =
                      readyAt.difference(now).inSeconds / 60;
                  if (minUntilReady > prepMin) prepMin = minUntilReady.ceil();
                } catch (_) {}
              }
            }
          } catch (_) {}

          final waitMin = (prepMin - etaTime).clamp(0.0, double.infinity);
          score += waitMin / 60.0 * 25.0;
        }

        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      final best = remaining.removeAt(bestIdx);
      final tLat = (best['targetLat'] as num).toDouble();
      final tLng = (best['targetLng'] as num).toDouble();
      final distFromHere = haversineKm(curLat, curLng, tLat, tLng);
      best['distanciaKm'] = distFromHere;
      
      int totalEta = etaMin(distFromHere);
      
      if (usePrepTime) {
        int prepMin = 0;
        try {
          final pedidos = (best['pedidos'] as List?)?.cast<Map<String, dynamic>>() ?? [best['pedido'] as Map<String, dynamic>];
          for (final p in pedidos) {
            final tp = p['tiempo_preparacion'] ?? (p['restaurante'] is Map ? (p['restaurante'] as Map)['tiempo_preparacion'] : null);
            if (tp != null) {
              prepMin = prepMin < (tp as num).toInt() ? (tp).toInt() : prepMin;
            }
          }
        } catch (_) {}
        final waitMin = (prepMin - totalEta).clamp(0, 999).toInt();
        if (waitMin > 0) totalEta += waitMin;
      }
      
      best['etaMin'] = totalEta;

      result.add(best);
      curLat = tLat;
      curLng = tLng;
    }

    return result;
  }

  static List<Map<String, dynamic>> calcularTodasLasParadas(
    List<dynamic> pedidosActivos, 
    double currentLat, 
    double currentLng
  ) {
    if (pedidosActivos.isEmpty) return [];

    final now = DateTime.now();
    final pickupsPendientes = <Map<String, dynamic>>[];
    final dropoffsRaw = <Map<String, dynamic>>[];
    final pickupsCompletos = <Map<String, dynamic>>[];

    for (final rawPedido in pedidosActivos) {
      final pedido = rawPedido is Map<String, dynamic> 
          ? rawPedido 
          : (rawPedido as dynamic).toMap(); // Handle if it's a Model object or Map
          
      final estado = pedido['estado'] as String? ?? '';
      final pickupCompleto =
          ['recibido', 'en_camino', 'entregado'].contains(estado);
      final pedidoActivo = !['cancelado', 'entregado'].contains(estado);
      if (!pedidoActivo) continue;

      final rest = pedido['restaurante'];
      double restLat, restLng;
      String restNombre;
      if (rest is Map) {
        restLat = ((rest['lat'] ?? pedido['lat'] ?? 16.2519) as num).toDouble();
        restLng = ((rest['lng'] ?? pedido['lng'] ?? -92.1345) as num).toDouble();
        if (restLat == 0.0) restLat = ((pedido['lat'] ?? 16.2519) as num).toDouble();
        if (restLng == 0.0) restLng = ((pedido['lng'] ?? -92.1345) as num).toDouble();
        restNombre = (rest['nombre_comercial'] ?? rest['nombre'] ?? 'Recolección') as String;
      } else {
        restLat = ((pedido['lat'] ?? 16.2519) as num).toDouble();
        restLng = ((pedido['lng'] ?? -92.1345) as num).toDouble();
        if (restLat == 0.0) restLat = 16.2519;
        if (restLng == 0.0) restLng = -92.1345;
        restNombre = (pedido['origen_nombre'] ?? (rest is String ? rest : 'Recolección')) as String;
      }

      var urgente = false;
      if (!pickupCompleto) {
        try {
          final at = pedido['aceptado_at'] ?? pedido['updated_at'] ?? pedido['created_at'];
          if (at != null) {
            urgente = now.difference(DateTime.parse(at.toString()).toLocal()).inMinutes > 25;
          }
        } catch (_) {}
      }

      final distRest = (currentLat != 0.0)
          ? haversineKm(currentLat, currentLng, restLat, restLng)
          : 0.0;

      final pickupStop = {
        'pedido': pedido,
        'pedidos': <Map<String, dynamic>>[pedido],
        'action': 'RECOGER EN',
        'title': restNombre,
        'subtitle': 'Pedido #${(pedido["id"] as String).substring(0, 6).toUpperCase()}',
        'targetLat': restLat,
        'targetLng': restLng,
        'isPickup': true,
        'isGrouped': false,
        'groupSize': 1,
        'completado': pickupCompleto,
        'urgente': urgente,
        'distanciaKm': distRest,
        'etaMin': etaMin(distRest),
        'zonaCompartida': false,
      };

      if (pickupCompleto) {
        pickupsCompletos.add(pickupStop);
      } else {
        pickupsPendientes.add(pickupStop);
      }

      if (pickupCompleto) {
        final cLat = ((pedido['lat_cliente'] ?? pedido['lat_entrega'] ?? pedido['lat'] ?? 0.0) as num).toDouble();
        final cLng = ((pedido['lng_cliente'] ?? pedido['lng_entrega'] ?? pedido['lng'] ?? 0.0) as num).toDouble();
        final distCliente = (cLat != 0.0 && currentLat != 0.0)
            ? haversineKm(currentLat, currentLng, cLat, cLng)
            : 0.0;
        dropoffsRaw.add({
          'pedido': pedido,
          'pedidos': <Map<String, dynamic>>[pedido],
          'action': 'ENTREGAR A CLIENTE',
          'title': (pedido['cliente_nombre'] ?? pedido['nombre_cliente'] ?? 'Cliente') as String,
          'subtitle': (pedido['direccion'] ?? pedido['direccion_entrega'] ?? 'Ver dirección en detalle') as String,
          'telefono': pedido['cliente_telefono'] ?? pedido['telefono'] ?? pedido['telefono_cliente'],
          'targetLat': cLat,
          'targetLng': cLng,
          'isPickup': false,
          'isGrouped': false,
          'groupSize': 1,
          'completado': false,
          'urgente': urgente,
          'distanciaKm': distCliente,
          'etaMin': etaMin(distCliente),
          'zonaCompartida': false,
        });
      }
    }

    final gruposPickup = groupPickupsByProximity(pickupsPendientes);
    final pickupsOrdenados = tspNearestNeighbor(
      gruposPickup,
      currentLat,
      currentLng,
      usePrepTime: true,
    );

    double dropStartLat = currentLat;
    double dropStartLng = currentLng;
    if (pickupsOrdenados.isNotEmpty) {
      dropStartLat = (pickupsOrdenados.last['targetLat'] as num).toDouble();
      dropStartLng = (pickupsOrdenados.last['targetLng'] as num).toDouble();
    } else if (pickupsCompletos.isNotEmpty) {
      dropStartLat = (pickupsCompletos.last['targetLat'] as num).toDouble();
      dropStartLng = (pickupsCompletos.last['targetLng'] as num).toDouble();
    }
    final dropoffsOrdenados = tspNearestNeighbor(
      dropoffsRaw,
      dropStartLat,
      dropStartLng,
      usePrepTime: false,
    );

    return [
      ...pickupsCompletos,
      ...pickupsOrdenados,
      ...dropoffsOrdenados,
    ];
  }
}

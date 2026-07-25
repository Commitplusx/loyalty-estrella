// lib/models/pedido_model.dart

class PedidoModel {
  final String id;
  final String clienteTel;
  final String? clienteNombre;
  final String? restaurante;
  final String? repartidorId;
  final String descripcion;
  final String? direccion;
  final double? lat;                 // GPS — latitud cliente
  final double? lng;                 // GPS — longitud cliente
  final double? restauranteLat;      // GPS — latitud restaurante
  final double? restauranteLng;      // GPS — longitud restaurante
  final String? restauranteLogoUrl;  // Imagen del restaurante
  final String estado;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? repartidorNombre;
  
  // Nuevos campos para Mandaditos / Billetera
  final String? tipoPedido;
  final String? metodoPago;
  final String? origen;
  final String? destino;
  final double? precioEntrega;
  final double? total;               // Nuevo
  final String? notas;               // Nuevo
  final bool? pagoPendienteRestaurante; // Para control de deuda efectivo
  final int? tiempoPreparacion;      // Nuevo: Minutos de preparación del restaurante
  final String? pickupPin;           // Nuevo: PIN de validación para el restaurante

  const PedidoModel({
    required this.id,
    required this.clienteTel,
    this.clienteNombre,
    this.restaurante,
    this.repartidorId,
    required this.descripcion,
    this.direccion,
    this.lat,
    this.lng,
    this.restauranteLat,
    this.restauranteLng,
    this.restauranteLogoUrl,
    required this.estado,
    required this.createdAt,
    required this.updatedAt,
    this.repartidorNombre,
    this.tipoPedido,
    this.metodoPago,
    this.origen,
    this.destino,
    this.precioEntrega,
    this.total,
    this.notas,
    this.pagoPendienteRestaurante,
    this.tiempoPreparacion,
    this.pickupPin,
  });

  factory PedidoModel.fromMap(Map<String, dynamic> map) {
    return PedidoModel(
      id: map['id'] as String,
      clienteTel: map['cliente_tel'] as String,
      clienteNombre: map['cliente_nombre'] as String?,
      restaurante: map['restaurante'] is Map 
          ? (map['restaurante'] as Map)['nombre_comercial'] as String? ?? (map['restaurante'] as Map)['nombre'] as String?
          : map['restaurante'] as String?,
      repartidorId: map['repartidor_id'] as String?,
      descripcion: map['descripcion'] as String? ?? '',
      direccion: map['direccion'] as String?,
      lat: (map['lat'] as num?)?.toDouble(),
      lng: (map['lng'] as num?)?.toDouble(),
      restauranteLat: map['restaurante_lat'] != null 
          ? (map['restaurante_lat'] as num).toDouble() 
          : (map['restaurantes'] != null 
              ? (map['restaurantes']['lat'] as num?)?.toDouble() 
              : (map['restaurante'] is Map ? (map['restaurante']['lat'] as num?)?.toDouble() : null)),
      restauranteLng: map['restaurante_lng'] != null 
          ? (map['restaurante_lng'] as num).toDouble() 
          : (map['restaurantes'] != null 
              ? (map['restaurantes']['lng'] as num?)?.toDouble() 
              : (map['restaurante'] is Map ? (map['restaurante']['lng'] as num?)?.toDouble() : null)),
      restauranteLogoUrl: map['restaurantes'] != null 
          ? map['restaurantes']['foto_fachada_url'] as String? 
          : (map['restaurante'] is Map ? map['restaurante']['foto_fachada_url'] as String? : null),
      estado: map['estado'] as String? ?? 'asignado',
      createdAt: DateTime.parse(map['created_at'] as String).toLocal(),
      updatedAt: DateTime.parse(map['updated_at'] as String).toLocal(),
      repartidorNombre: map['repartidores'] != null
          ? (map['repartidores'] as Map<String, dynamic>)['nombre'] as String?
          : null,
      tipoPedido: map['tipo_pedido'] as String? ?? 'domicilio',
      metodoPago: map['metodo_pago'] as String? ?? 'efectivo',
      origen: map['origen'] as String?,
      destino: map['destino'] as String?,
      precioEntrega: (map['precio_entrega'] as num?)?.toDouble(),
      total: (map['total'] as num?)?.toDouble(),
      notas: map['notas'] as String?,
      pagoPendienteRestaurante: map['pago_pendiente_restaurante'] as bool?,
      tiempoPreparacion: map['tiempo_preparacion_minutos'] as int? ?? map['tiempo_preparacion'] as int?,
      pickupPin: map['pickup_pin'] as String?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'cliente_tel': clienteTel,
      'cliente_nombre': clienteNombre,
      'restaurante': (restaurante != null || restauranteLat != null) ? {
        'nombre_comercial': restaurante,
        'lat': restauranteLat,
        'lng': restauranteLng,
        'foto_fachada_url': restauranteLogoUrl,
      } : null,
      'repartidor_id': repartidorId,
      'descripcion': descripcion,
      'direccion': direccion,
      'lat': lat,
      'lng': lng,
      'estado': estado,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
      'repartidores': repartidorNombre != null ? {'nombre': repartidorNombre} : null,
      'tipo_pedido': tipoPedido,
      'metodo_pago': metodoPago,
      'origen': origen,
      'destino': destino,
      'precio_entrega': precioEntrega,
      'total': total,
      'notas': notas,
      'pago_pendiente_restaurante': pagoPendienteRestaurante,
      'tiempo_preparacion': tiempoPreparacion,
      'pickup_pin': pickupPin,
    };
  }

  double get costoEnvioCalculado {
    double fee = precioEntrega ?? 0.0;
    if (fee <= 0.0 && descripcion.isNotEmpty) {
      final RegExp costRegex = RegExp(r'Costo Envío.*?\$\s*([0-9.]+)', caseSensitive: false, dotAll: true);
      final match = costRegex.firstMatch(descripcion);
      if (match != null && match.groupCount >= 1) {
        fee = double.tryParse(match.group(1)!) ?? 0.0;
      }
    }
    // Fallback de Tarifa Mínima Garantizada si todo falla (Evita ver $0.00)
    if (fee <= 0.0) {
      return 25.0; 
    }
    return fee;
  }

  double get costoRestauranteCalculado {
    final double totalAmount = total ?? 0.0;
    return (totalAmount - costoEnvioCalculado) > 0 ? (totalAmount - costoEnvioCalculado) : 0.0;
  }

  String get estadoLabel {
    switch (estado) {
      case 'pendiente_pago': return 'Pendiente de Pago';
      case 'pendiente':  return repartidorId != null ? 'Esperando Repartidor' : 'Buscando Repartidor';
      case 'preparando': return 'Preparando / Asignado';
      case 'listo_para_recoger': return 'Listo para Recoger';
      case 'en_camino':  return 'En Camino';
      case 'entregado':  return 'Entregado';
      case 'cancelado':  return 'Cancelado';
      case 'rechazado':  return 'Rechazado';
      default:           return estado;
    }
  }

  bool get isTerminado => estado == 'entregado' || estado == 'cancelado';

  String? get siguienteEstado {
    if (tipoPedido == 'tienda') {
      switch (estado) {
        case 'pendiente_pago': return 'pendiente';
        case 'pendiente': return 'preparando';
        case 'preparando': return 'listo_para_recoger';
        case 'listo_para_recoger': return 'entregado';
        default: return null;
      }
    }
    switch (estado) {
      case 'pendiente_pago': return 'pendiente';
      case 'pendiente': return 'asignado';
      case 'asignado': return 'recibido'; // O en_camino
      case 'recibido': return 'en_camino';
      case 'en_camino': return 'entregado';
      default:          return null;
    }
  }

  String? get siguienteEstadoLabel {
    if (tipoPedido == 'tienda') {
      switch (siguienteEstado) {
        case 'pendiente': return 'Marcar como Pagado';
        case 'preparando': return 'Aceptar Pedido';
        case 'listo_para_recoger': return 'Marcar Listo para Recoger';
        case 'entregado': return 'Entregar al Cliente';
        default: return null;
      }
    }
    switch (siguienteEstado) {
      case 'pendiente': return 'Marcar como Pagado';
      case 'asignado': return 'Aceptar Pedido';
      case 'recibido': return 'Ya tengo el pedido';
      case 'en_camino': return 'Iniciar Ruta a Entrega';
      case 'entregado': return 'Marcar como Entregado';
      default:          return null;
    }
  }

  PedidoModel copyWith({
    String? id,
    String? clienteTel,
    String? clienteNombre,
    String? restaurante,
    String? repartidorId,
    String? descripcion,
    String? direccion,
    double? lat,
    double? lng,
    double? restauranteLat,
    double? restauranteLng,
    String? restauranteLogoUrl,
    String? estado,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? repartidorNombre,
    String? tipoPedido,
    String? metodoPago,
    String? origen,
    String? destino,
    double? precioEntrega,
    double? total,
    String? notas,
    bool? pagoPendienteRestaurante,
    int? tiempoPreparacion,
    String? pickupPin,
  }) {
    return PedidoModel(
      id: id ?? this.id,
      clienteTel: clienteTel ?? this.clienteTel,
      clienteNombre: clienteNombre ?? this.clienteNombre,
      restaurante: restaurante ?? this.restaurante,
      repartidorId: repartidorId ?? this.repartidorId,
      descripcion: descripcion ?? this.descripcion,
      direccion: direccion ?? this.direccion,
      lat: lat ?? this.lat,
      lng: lng ?? this.lng,
      restauranteLat: restauranteLat ?? this.restauranteLat,
      restauranteLng: restauranteLng ?? this.restauranteLng,
      restauranteLogoUrl: restauranteLogoUrl ?? this.restauranteLogoUrl,
      estado: estado ?? this.estado,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      repartidorNombre: repartidorNombre ?? this.repartidorNombre,
      tipoPedido: tipoPedido ?? this.tipoPedido,
      metodoPago: metodoPago ?? this.metodoPago,
      origen: origen ?? this.origen,
      destino: destino ?? this.destino,
      precioEntrega: precioEntrega ?? this.precioEntrega,
      total: total ?? this.total,
      notas: notas ?? this.notas,
      pagoPendienteRestaurante: pagoPendienteRestaurante ?? this.pagoPendienteRestaurante,
      tiempoPreparacion: tiempoPreparacion ?? this.tiempoPreparacion,
      pickupPin: pickupPin ?? this.pickupPin,
    );
  }
}

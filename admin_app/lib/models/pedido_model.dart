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
  });

  factory PedidoModel.fromMap(Map<String, dynamic> map) {
    return PedidoModel(
      id: map['id'] as String,
      clienteTel: map['cliente_tel'] as String,
      clienteNombre: map['cliente_nombre'] as String?,
      restaurante: map['restaurante'] as String?,
      repartidorId: map['repartidor_id'] as String?,
      descripcion: map['descripcion'] as String? ?? '',
      direccion: map['direccion'] as String?,
      lat: (map['lat'] as num?)?.toDouble(),
      lng: (map['lng'] as num?)?.toDouble(),
      restauranteLat: map['restaurante_lat'] != null ? (map['restaurante_lat'] as num).toDouble() : (map['restaurantes'] != null ? (map['restaurantes']['lat'] as num?)?.toDouble() : null),
      restauranteLng: map['restaurante_lng'] != null ? (map['restaurante_lng'] as num).toDouble() : (map['restaurantes'] != null ? (map['restaurantes']['lng'] as num?)?.toDouble() : null),
      restauranteLogoUrl: map['restaurantes'] != null ? map['restaurantes']['foto_fachada_url'] as String? : null,
      estado: map['estado'] as String? ?? 'asignado',
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(map['updated_at'] as String),
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
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'cliente_tel': clienteTel,
      'cliente_nombre': clienteNombre,
      'restaurante': restaurante,
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
    };
  }

  double get costoEnvioCalculado {
    double fee = precioEntrega ?? 0.0;
    if (fee == 0.0 && descripcion.isNotEmpty) {
      final RegExp costRegex = RegExp(r'Costo Envío.*\$([0-9.]+)', caseSensitive: false, dotAll: true);
      final match = costRegex.firstMatch(descripcion);
      if (match != null && match.groupCount >= 1) {
        fee = double.tryParse(match.group(1)!) ?? 0.0;
      }
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
      case 'pendiente':  return 'Pendiente (Sin asignar)';
      case 'asignado':   return 'Asignado';
      case 'en_cocina':  return 'En Cocina';
      case 'listo_para_recoger': return 'Listo para Recoger';
      case 'recibido':   return 'Recibido';
      case 'en_camino':  return 'En Camino';
      case 'entregado':  return 'Entregado';
      case 'cancelado':  return 'Cancelado';
      default:           return estado;
    }
  }

  bool get isTerminado => estado == 'entregado' || estado == 'cancelado';

  String? get siguienteEstado {
    switch (estado) {
      case 'pendiente_pago': return 'pendiente';
      case 'pendiente': return 'asignado';
      case 'asignado':  return 'recibido';
      case 'en_cocina': return 'recibido';
      case 'listo_para_recoger': return 'recibido';
      case 'recibido':  return 'en_camino';
      case 'en_camino': return 'entregado';
      default:          return null;
    }
  }

  String? get siguienteEstadoLabel {
    switch (siguienteEstado) {
      case 'pendiente': return 'Marcar como Pagado';
      case 'asignado':  return 'Aceptar Pedido';
      case 'recibido':  return 'Llegué al Restaurante';
      case 'en_camino': return 'Iniciar Ruta a Entrega';
      case 'entregado': return 'Marcar como Entregado';
      default:          return null;
    }
  }
}

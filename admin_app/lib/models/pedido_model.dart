// lib/models/pedido_model.dart

class PedidoModel {
  final String id;
  final String clienteTel;
  final String? clienteNombre;
  final String? restaurante;
  final String? repartidorId;
  final String descripcion;
  final String? direccion;
  final double? lat;                 // GPS — latitud
  final double? lng;                 // GPS — longitud
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
    required this.estado,
    required this.createdAt,
    required this.updatedAt,
    this.repartidorNombre,
    this.tipoPedido,
    this.metodoPago,
    this.origen,
    this.destino,
    this.precioEntrega,
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
      estado: map['estado'] as String? ?? 'asignado',
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(map['updated_at'] as String),
      repartidorNombre: map['repartidores'] != null
          ? (map['repartidores'] as Map<String, dynamic>)['nombre'] as String?
          : null,
      tipoPedido: map['tipo_pedido'] as String? ?? 'comida',
      metodoPago: map['metodo_pago'] as String? ?? 'efectivo',
      origen: map['origen'] as String?,
      destino: map['destino'] as String?,
      precioEntrega: (map['precio_entrega'] as num?)?.toDouble(),
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
    };
  }

  String get estadoLabel {
    switch (estado) {
      case 'pendiente_pago': return 'Pendiente de Pago';
      case 'pendiente':  return 'Pendiente (Sin asignar)';
      case 'asignado':   return 'Asignado';
      case 'recibido':   return 'Recibido';
      case 'en_camino':  return 'En Camino';
      case 'entregado':  return 'Entregado';
      case 'cancelado':  return 'Cancelado'; // BUG 7 fix
      default:           return estado;
    }
  }

  bool get isTerminado => estado == 'entregado' || estado == 'cancelado';

  String? get siguienteEstado {
    switch (estado) {
      case 'pendiente_pago': return 'pendiente'; // Debería pasar a pendiente cuando se pague, pero por ahora permitimos avanzar manual
      case 'pendiente': return 'asignado';
      case 'asignado':  return 'recibido';
      case 'recibido':  return 'en_camino';
      case 'en_camino': return 'entregado';
      default:          return null;
    }
  }

  String? get siguienteEstadoLabel {
    switch (siguienteEstado) {
      case 'pendiente': return 'Marcar como Pagado';
      case 'asignado':  return 'Aceptar Pedido';
      case 'recibido':  return 'Marcar como Recibido';
      case 'en_camino': return 'Salir a Entregar';
      case 'entregado': return 'Marcar como Entregado';
      default:          return null;
    }
  }
}

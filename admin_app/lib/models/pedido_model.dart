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
  });

  factory PedidoModel.fromMap(Map<String, dynamic> map) {
    return PedidoModel(
      id: map['id'] as String,
      clienteTel: map['cliente_tel'] as String,
      clienteNombre: map['cliente_nombre'] as String?,
      restaurante: map['restaurante'] as String?,
      repartidorId: map['repartidor_id'] as String?,
      descripcion: map['descripcion'] as String,
      direccion: map['direccion'] as String?,
      lat: (map['lat'] as num?)?.toDouble(),
      lng: (map['lng'] as num?)?.toDouble(),
      estado: map['estado'] as String? ?? 'asignado',
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(map['updated_at'] as String),
      repartidorNombre: map['repartidores'] != null
          ? (map['repartidores'] as Map<String, dynamic>)['nombre'] as String?
          : null,
    );
  }

  String get estadoLabel {
    switch (estado) {
      case 'asignado':   return 'Asignado';
      case 'recibido':   return 'Recibido';
      case 'en_camino':  return 'En Camino';
      case 'entregado':  return 'Entregado';
      default:           return estado;
    }
  }

  bool get isTerminado => estado == 'entregado';

  /// Siguiente estado en el flujo del repartidor
  String? get siguienteEstado {
    switch (estado) {
      case 'asignado':  return 'recibido';
      case 'recibido':  return 'en_camino';
      case 'en_camino': return 'entregado';
      default:          return null;
    }
  }

  String? get siguienteEstadoLabel {
    switch (siguienteEstado) {
      case 'recibido':  return 'Marcar como Recibido';
      case 'en_camino': return 'Salir a Entregar';
      case 'entregado': return 'Marcar como Entregado';
      default:          return null;
    }
  }
}

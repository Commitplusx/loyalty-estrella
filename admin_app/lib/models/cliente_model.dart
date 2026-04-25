class ClienteModel {
  final String id;
  final String telefono;
  final String? nombre;
  final int puntos;
  final int totalEnvios;
  final int enviosGratis;
  final String codigoQr;
  final DateTime creadoEn;
  final bool esVip;
  final String? notasCrm;
  final double? costoEnvio;
  final String rango;
  final double saldoBilletera;

  const ClienteModel({
    required this.id,
    required this.telefono,
    this.nombre,
    required this.puntos,
    required this.totalEnvios,
    required this.enviosGratis,
    required this.codigoQr,
    required this.creadoEn,
    required this.esVip,
    this.notasCrm,
    this.costoEnvio,
    this.rango = 'bronce',
    this.saldoBilletera = 0.0,
  });

  int get enviosParaGratis {
    final meta = esVip ? 4 : 5;
    return meta - (puntos % meta);
  }
  bool get tieneGratisDisponible => enviosGratis > 0;

  factory ClienteModel.fromMap(Map<String, dynamic> map) {
    return ClienteModel(
      id: map['id'] as String,
      telefono: map['telefono'] as String,
      nombre: map['nombre'] as String?,
      puntos: (map['puntos'] as num?)?.toInt() ?? 0,
      totalEnvios: (map['envios_totales'] as num?)?.toInt() ?? 0,
      enviosGratis: (map['envios_gratis_disponibles'] as num?)?.toInt() ?? 0,
      codigoQr: map['qr_code'] as String,
      creadoEn: DateTime.parse(map['created_at'] as String),
      esVip: map['es_vip'] == true,
      notasCrm: map['notas_crm'] as String?,
      costoEnvio: map['costo_envio'] != null ? (map['costo_envio'] as num).toDouble() : null,
      rango: map['rango'] ?? 'bronce',
      saldoBilletera: map['saldo_billetera'] != null ? (map['saldo_billetera'] as num).toDouble() : 0.0,
    );
  }

  @override
  String toString() => 'Cliente($telefono, envios: $totalEnvios)';
}

class ScanResultModel {
  final bool success;
  final String message;
  final ClienteModel? cliente;
  final bool esGratis;

  const ScanResultModel({
    required this.success,
    required this.message,
    this.cliente,
    this.esGratis = false,
  });
}

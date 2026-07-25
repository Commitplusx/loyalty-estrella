import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../models/pedido_model.dart';

class DriverPedidoDetailView extends ConsumerWidget {
  final PedidoModel pedido;
  final VoidCallback onRefresh;

  const DriverPedidoDetailView({
    super.key,
    required this.pedido,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Forzamos un color oscuro porque al parecer el tema de la app está cruzado 
    // y el fondo siempre es claro aunque el brillo reporte oscuro.
    const onSurface = Color(0xFF1E293B);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    
    final double ganancia = pedido.costoEnvioCalculado > 0 
        ? pedido.costoEnvioCalculado 
        : 45.0;
        
    final date = pedido.updatedAt ?? pedido.createdAt;

    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // HEADER: Fecha y Ganancia
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
            child: Column(
              children: [
                Text(
                  DateFormat('EEEE, d MMM • HH:mm', 'es').format(date).toUpperCase(),
                  style: TextStyle(
                    color: onSurface.withOpacity(0.5),
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  '\$${ganancia.toStringAsFixed(2)}',
                  style: TextStyle(
                    color: onSurface,
                    fontSize: 56,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -2,
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981).withOpacity(isDark ? 0.2 : 0.1),
                    borderRadius: BorderRadius.circular(100),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 14),
                      const SizedBox(width: 6),
                      Text('Completado', style: TextStyle(color: isDark ? const Color(0xFF34D399) : const Color(0xFF10B981), fontSize: 12, fontWeight: FontWeight.bold)),
                    ],
                  ),
                )
              ],
            ),
          ),
          
          Divider(height: 1, color: onSurface.withOpacity(0.05)),
          
          // DETALLES DEL VIAJE (Timeline)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Detalles del viaje',
                  style: TextStyle(
                    color: onSurface,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 24),
                
                // Timeline
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Column(
                      children: [
                        Container(
                          width: 12,
                          height: 12,
                          decoration: BoxDecoration(color: isDark ? Colors.white : Colors.black, shape: BoxShape.circle),
                        ),
                        Container(
                          width: 2,
                          height: 40,
                          color: onSurface.withOpacity(0.1),
                        ),
                        Container(
                          width: 12,
                          height: 12,
                          decoration: BoxDecoration(color: const Color(0xFFFF6B35), shape: BoxShape.rectangle, borderRadius: BorderRadius.circular(3)),
                        ),
                      ],
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Origen
                          Row(
                            children: [
                              if (pedido.restauranteLogoUrl != null && pedido.restauranteLogoUrl!.isNotEmpty) ...[
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: Image.network(
                                    pedido.restauranteLogoUrl!,
                                    width: 36,
                                    height: 36,
                                    fit: BoxFit.cover,
                                    errorBuilder: (c,e,s) => Container(
                                      width: 36, height: 36, 
                                      color: onSurface.withOpacity(0.05),
                                      child: Icon(Icons.store, size: 20, color: onSurface.withOpacity(0.5))
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                              ],
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      pedido.restaurante?.isNotEmpty == true ? pedido.restaurante! : 'Restaurante / Origen',
                                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: onSurface),
                                    ),
                                    Text(
                                      'Recolección',
                                      style: TextStyle(fontSize: 13, color: onSurface.withOpacity(0.5)),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 20),
                          // Destino
                          Text(
                            pedido.direccion?.isNotEmpty == true ? pedido.direccion! : 'Dirección del cliente',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: onSurface),
                          ),
                          Text(
                            'Entrega',
                            style: TextStyle(fontSize: 13, color: onSurface.withOpacity(0.5)),
                          ),
                        ],
                      ),
                    )
                  ],
                ),
              ],
            ),
          ),

          Divider(height: 1, color: onSurface.withOpacity(0.05), thickness: 8),

          // DESGLOSE
          Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Desglose',
                  style: TextStyle(
                    color: onSurface,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 16),
                _buildDesgloseRow(context, 'Tarifa de entrega', '\$${ganancia.toStringAsFixed(2)}', onSurface),
                if (pedido.total != null && pedido.total! > 0) ...[
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Divider(height: 1),
                  ),
                  _buildDesgloseRow(context, 'Total cobrado (Efectivo)', '\$${pedido.total!.toStringAsFixed(2)}', onSurface, isTotal: true),
                ],
                
                const SizedBox(height: 24),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: onSurface.withOpacity(0.03),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.person_outline_rounded, color: onSurface.withOpacity(0.6)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          pedido.clienteNombre?.isNotEmpty == true ? 'Entregado a ${pedido.clienteNombre}' : 'Cliente anónimo',
                          style: TextStyle(color: onSurface.withOpacity(0.8), fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                )
              ],
            ),
          ),
          
          const SizedBox(height: 40),
        ],
      ),
    );
  }

  Widget _buildDesgloseRow(BuildContext context, String label, String amount, Color onSurface, {bool isTotal = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: isTotal ? 16 : 15,
            color: isTotal ? onSurface : onSurface.withOpacity(0.6),
            fontWeight: isTotal ? FontWeight.w800 : FontWeight.w500,
          ),
        ),
        Text(
          amount,
          style: TextStyle(
            fontSize: isTotal ? 16 : 15,
            color: onSurface,
            fontWeight: isTotal ? FontWeight.w900 : FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

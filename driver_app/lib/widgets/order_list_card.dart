import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/pedido_model.dart';
import 'dart:math' as math;
import '../core/theme.dart';
import '../core/ui_helpers.dart';

class OrderListCard extends StatefulWidget {
  final PedidoModel pedido;
  final bool isActiveTab;
  final VoidCallback onAccept;
  final VoidCallback onDecline;
  final VoidCallback onTap;

  const OrderListCard({
    super.key,
    required this.pedido,
    required this.isActiveTab,
    required this.onAccept,
    required this.onDecline,
    required this.onTap,
  });

  @override
  State<OrderListCard> createState() => _OrderListCardState();
}

class _OrderListCardState extends State<OrderListCard> {
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _refreshTimer = Timer.periodic(const Duration(minutes: 1), (timer) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pedido = widget.pedido;
    final isActiveTab = widget.isActiveTab;
    final timeFormat = DateFormat('hh:mm a');
    final createdAt = pedido.createdAt;
    
    return Container(
      margin: const EdgeInsets.only(bottom: 16, left: 20, right: 20),
      child: BouncingCard(
        onTap: widget.onTap,
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(28),
            border: !isActiveTab && DateTime.now().difference(createdAt).inMinutes > 5 
                ? Border.all(color: Colors.orange.withOpacity(0.5), width: 2) 
                : Border.all(color: Colors.black.withOpacity(0.04), width: 1.5),
            boxShadow: [
              BoxShadow(
                color: !isActiveTab && DateTime.now().difference(createdAt).inMinutes > 5 
                    ? Colors.orange.withOpacity(0.15) 
                    : Colors.black.withOpacity(0.03),
                blurRadius: 20,
                offset: const Offset(0, 8),
              )
            ]
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── TOP ROW: ID & TIME ──
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.brandRed.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '#${pedido.id.substring(0, 6).toUpperCase()}',
                      style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14, color: AppColors.brandRed),
                    ),
                  ),
                  Row(
                    children: [
                      if (!isActiveTab && DateTime.now().difference(createdAt).inMinutes > 5)
                        Container(
                          margin: const EdgeInsets.only(right: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.orange.shade50,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.orange.shade200),
                          ),
                          child: const Text('🔥 Urgente', style: TextStyle(color: Colors.deepOrange, fontSize: 11, fontWeight: FontWeight.bold)),
                        ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade100,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.access_time_filled_rounded, size: 12, color: Colors.grey.shade500),
                            const SizedBox(width: 4),
                            Text(
                              timeFormat.format(createdAt),
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: Colors.grey.shade700),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 20),
              
              // ── TIMELINE ──
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Premium Timeline Icons
                  Column(
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: Colors.orange.shade50,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.storefront_rounded, size: 16, color: Colors.orange),
                      ),
                      _buildDottedLine(),
                      Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: AppColors.brandRed.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.location_on_rounded, size: 16, color: AppColors.brandRed),
                      ),
                    ],
                  ),
                  const SizedBox(width: 16),
                  // Texts
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 4),
                        Text(
                          pedido.restaurante ?? 'Restaurante',
                          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: Colors.black, letterSpacing: -0.3),
                        ),
                        if (pedido.tiempoPreparacion != null && pedido.tiempoPreparacion! > 0 && !['recibido', 'en_camino', 'listo_para_recoger', 'entregado', 'cancelado'].contains(pedido.estado))
                          Builder(
                            builder: (context) {
                              int prepMinutes = pedido.tiempoPreparacion!;
                              int elapsed = DateTime.now().difference(pedido.createdAt).inMinutes;
                              int remainingPrep = math.max(0, prepMinutes - elapsed);
                              
                              return Padding(
                                padding: const EdgeInsets.only(top: 6.0),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: remainingPrep > 0 ? Colors.orange.shade50 : Colors.green.shade50,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(Icons.timer_rounded, size: 12, color: remainingPrep > 0 ? Colors.deepOrange : Colors.green),
                                      const SizedBox(width: 4),
                                      Text(
                                        remainingPrep > 0 ? 'Faltan $remainingPrep min' : 'Debe estar listo',
                                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: remainingPrep > 0 ? Colors.deepOrange : Colors.green),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            }
                          ),
                        const SizedBox(height: 32), // spacing for the line to match origin/destination
                        Text(
                          pedido.clienteNombre ?? 'Cliente',
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Colors.black, letterSpacing: -0.3),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          pedido.direccion ?? 'Dirección no especificada',
                          style: TextStyle(fontSize: 13, color: Colors.grey.shade600, height: 1.3),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  // Price / Earnings
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: const Color(0xFF10B981).withOpacity(0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          children: [
                            Text(
                              '+\$${pedido.costoEnvioCalculado.toStringAsFixed(0)}',
                              style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20, color: Color(0xFF059669), letterSpacing: -0.5),
                            ),
                            const Text(
                              'Ganancia',
                              style: TextStyle(fontSize: 10, color: Color(0xFF059669), fontWeight: FontWeight.bold, letterSpacing: 0.5),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: pedido.metodoPago == 'efectivo' ? Colors.red.shade50 : Colors.blue.shade50,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: pedido.metodoPago == 'efectivo' ? Colors.red.shade100 : Colors.blue.shade100,
                          )
                        ),
                        child: Row(
                          children: [
                            Icon(pedido.metodoPago == 'efectivo' ? Icons.payments_rounded : Icons.credit_card_rounded, 
                                 size: 12, 
                                 color: pedido.metodoPago == 'efectivo' ? Colors.red.shade700 : Colors.blue.shade700),
                            const SizedBox(width: 4),
                            Text(
                              pedido.metodoPago == 'efectivo' ? 'Efectivo' : 'Tarjeta',
                              style: TextStyle(
                                fontSize: 11, 
                                color: pedido.metodoPago == 'efectivo' ? Colors.red.shade700 : Colors.blue.shade700,
                                fontWeight: FontWeight.w800
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 24),
              
              // ── BOTTOM BUTTONS ──
              if (!isActiveTab)
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: widget.onDecline,
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          side: BorderSide(color: Colors.red.shade200, width: 2),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          foregroundColor: Colors.red.shade700,
                        ),
                        child: const Text('Rechazar', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2, // Make Accept button bigger
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: AppGradients.brand,
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [
                            BoxShadow(color: AppColors.brandRed.withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4))
                          ]
                        ),
                        child: ElevatedButton(
                          onPressed: widget.onAccept,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.transparent,
                            shadowColor: Colors.transparent,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          ),
                          child: const Text('Aceptar Pedido', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 15)),
                        ),
                      ),
                    ),
                  ],
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        decoration: BoxDecoration(
                          color: Colors.grey.shade50,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.grey.shade200, width: 2)
                        ),
                        child: TextButton(
                          onPressed: widget.onTap,
                          style: TextButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                            foregroundColor: Colors.black87,
                          ),
                          child: const Text('Detalles', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: AppGradients.brand,
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [
                            BoxShadow(color: AppColors.brandRed.withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4))
                          ]
                        ),
                        child: ElevatedButton(
                          onPressed: () async {
                            HapticFeedback.heavyImpact();
                            final isPickup = pedido.estado == 'asignado' || pedido.estado == 'en_camino';
                            final lat = isPickup ? (pedido.restauranteLat ?? 21.87982) : (pedido.lat ?? 0.0);
                            final lng = isPickup ? (pedido.restauranteLng ?? -102.29600) : (pedido.lng ?? 0.0);
                            
                            final url = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng');
                            if (await canLaunchUrl(url)) {
                              await launchUrl(url, mode: LaunchMode.externalApplication);
                            }
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.transparent,
                            shadowColor: Colors.transparent,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.near_me_rounded, color: Colors.white, size: 20),
                              const SizedBox(width: 8),
                              Text(pedido.estado == 'recibido' ? 'Al Cliente' : 'Al Local', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 15)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                )
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDottedLine() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(
          6,
          (index) => Container(
            width: 3,
            height: 3,
            margin: const EdgeInsets.symmetric(vertical: 2),
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              shape: BoxShape.circle,
            ),
          ),
        ),
      ),
    );
  }
}

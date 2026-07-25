// lib/screens/ganancias_screen.dart
// Pantalla de Historial de Ganancias del Repartidor — Rediseño Premium

import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../core/supabase_config.dart';
import 'pedido_detail_screen.dart';

// ─────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────
final gananciasPeriodoProvider =
    StateProvider<String>((ref) => 'hoy'); // 'hoy' | 'semana' | 'mes'

final gananciasDetalleProvider = FutureProvider.family
    .autoDispose<List<Map<String, dynamic>>, String>((ref, periodo) async {
  final userId = Supabase.instance.client.auth.currentUser?.id;
  if (userId == null) return [];

  final now = DateTime.now();
  DateTime startDate;
  switch (periodo) {
    case 'semana':
      startDate = DateTime(now.year, now.month, now.day).subtract(const Duration(days: 6));
      break;
    case 'mes':
      startDate = DateTime(now.year, now.month, 1);
      break;
    default:
      startDate = DateTime(now.year, now.month, now.day);
  }

  final response = await supabase
      .from('pedidos')
      .select('id, restaurante, cliente_nombre, direccion, precio_entrega, total, descripcion, updated_at, metodo_pago, tipo_pedido')
      .eq('repartidor_id', userId)
      .eq('estado', 'entregado')
      .gte('updated_at', startDate.toUtc().toIso8601String())
      .order('updated_at', ascending: false);

  final pedidos = (response as List<dynamic>).cast<Map<String, dynamic>>();

  return pedidos.map((p) {
    double envio = (p['precio_entrega'] as num?)?.toDouble() ?? 0.0;
    if (envio == 0.0) {
      final desc = p['descripcion'] as String? ?? '';
      final match = RegExp(r'Costo Envío.*\$([0-9.]+)').firstMatch(desc);
      if (match != null && match.groupCount >= 1) {
        envio = double.tryParse(match.group(1)!) ?? 0.0;
      }
    }
    return {...p, '_envio': envio};
  }).toList();
});

// ─────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────
class GananciasScreen extends ConsumerWidget {
  const GananciasScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final periodo = ref.watch(gananciasPeriodoProvider);
    final pedidosAsync = ref.watch(gananciasDetalleProvider(periodo));
    final topPad = MediaQuery.of(context).padding.top;

    return Scaffold(
      backgroundColor: Colors.white,
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          // ── Header ──
          SliverToBoxAdapter(
            child: pedidosAsync.when(
              data: (pedidos) {
                final total = pedidos.fold<double>(0.0, (s, p) => s + (p['_envio'] as double));
                final max = pedidos.isEmpty ? 1.0 : pedidos.map((p) => p['_envio'] as double).reduce((a, b) => a > b ? a : b);
                return _Header(total: total, count: pedidos.length, periodo: periodo, pedidos: pedidos, max: max, topPad: topPad);
              },
              loading: () => _Header(total: 0, count: 0, periodo: periodo, pedidos: const [], max: 1, topPad: topPad),
              error: (_, __) => _Header(total: 0, count: 0, periodo: periodo, pedidos: const [], max: 1, topPad: topPad),
            ),
          ),

          // ── Filtro de período ──
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: _PeriodoPicker(
                value: periodo,
                onChanged: (v) => ref.read(gananciasPeriodoProvider.notifier).state = v,
              ),
            ),
          ),

          // ── Lista de pedidos con separadores por día ──
          pedidosAsync.when(
            data: (pedidos) {
              if (pedidos.isEmpty) {
                return SliverFillRemaining(
                  hasScrollBody: false,
                  child: _EmptyState(periodo: periodo),
                );
              }

              // Construir lista plana: [header_día, card, card, header_día, card...]
              final List<Map<String, dynamic>> items = [];
              String? lastDay;
              final now = DateTime.now();
              for (final p in pedidos) {
                final dt = DateTime.tryParse(p['updated_at'] ?? '')?.toLocal();
                String dayKey;
                if (dt == null) {
                  dayKey = 'Sin fecha';
                } else if (dt.year == now.year && dt.month == now.month && dt.day == now.day) {
                  dayKey = 'Hoy';
                } else if (dt.year == now.year && dt.month == now.month && dt.day == now.day - 1) {
                  dayKey = 'Ayer';
                } else {
                  final raw = DateFormat("EEEE d 'de' MMMM", 'es_MX').format(dt);
                  dayKey = raw[0].toUpperCase() + raw.substring(1);
                }
                if (dayKey != lastDay) {
                  items.add({'_type': 'header', '_label': dayKey});
                  lastDay = dayKey;
                }
                items.add({...p, '_type': 'card'});
              }

              return SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 120),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (ctx, i) {
                      final item = items[i];
                      if (item['_type'] == 'header') {
                        return Padding(
                          padding: const EdgeInsets.only(top: 8, bottom: 12, left: 36),
                          child: Text(
                            item['_label'] as String,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: Colors.black45,
                              letterSpacing: 0.5,
                            ),
                          ),
                        );
                      }
                      final isLast = i == items.length - 1 || items[i + 1]['_type'] == 'header';
                      return FadeInUp(
                        delay: Duration(milliseconds: i * 40),
                        duration: const Duration(milliseconds: 300),
                        child: IntrinsicHeight(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              SizedBox(
                                width: 28,
                                child: Column(
                                  children: [
                                    Container(
                                      width: 12, height: 12,
                                      margin: const EdgeInsets.only(top: 22),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF10B981),
                                        shape: BoxShape.circle,
                                        border: Border.all(color: Colors.white, width: 2),
                                        boxShadow: [BoxShadow(color: const Color(0xFF10B981).withOpacity(0.4), blurRadius: 6)],
                                      ),
                                    ),
                                    if (!isLast)
                                      Expanded(child: Container(width: 1.5, color: Colors.black.withOpacity(0.08))),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(child: _PedidoCard(pedido: item, index: i)),
                            ],
                          ),
                        ),
                      );
                    },
                    childCount: items.length,
                  ),
                ),
              );
            },
            loading: () => SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: CircularProgressIndicator(color: Colors.black, strokeWidth: 2)),
            ),
            error: (e, _) => SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: Text('Error: $e', textAlign: TextAlign.center)),
            ),
          ),

        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────
class _Header extends StatelessWidget {
  final double total;
  final int count;
  final String periodo;
  final List<Map<String, dynamic>> pedidos;
  final double max;
  final double topPad;

  const _Header({required this.total, required this.count, required this.periodo, required this.pedidos, required this.max, required this.topPad});

  @override
  Widget build(BuildContext context) {
    final label = periodo == 'hoy' ? 'hoy' : periodo == 'semana' ? 'esta semana' : 'este mes';
    final fmt = NumberFormat('#,##0.00', 'es_MX');

    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Back + title row
          SizedBox(height: topPad + 12),
          Row(
            children: [
              GestureDetector(
                onTap: () => Navigator.of(context).pop(),
                child: Container(
                  width: 42, height: 42,
                  decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(14)),
                  child: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 16),
                ),
              ),
              const SizedBox(width: 16),
              const Text('Mis Ganancias', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Colors.black)),
            ],
          ),
          const SizedBox(height: 28),

          // Big earnings card
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(28),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: Colors.black.withOpacity(0.08)),
              boxShadow: [
                BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 20, offset: const Offset(0, 8)),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: const Color(0xFF10B981).withOpacity(0.3)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.trending_up_rounded, color: Color(0xFF10B981), size: 14),
                      const SizedBox(width: 6),
                      Text('$count servicio${count != 1 ? 's' : ''} $label',
                          style: const TextStyle(color: Color(0xFF10B981), fontSize: 12, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                FadeInLeft(
                  duration: const Duration(milliseconds: 500),
                  child: Text(
                    '\$${fmt.format(total)}',
                    style: const TextStyle(
                      color: Colors.black,
                      fontSize: 44,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -2,
                      height: 1,
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                const Text('ganado en envíos', style: TextStyle(color: Colors.black38, fontSize: 14, fontWeight: FontWeight.w500)),

                // Mini bar chart
                if (pedidos.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  SizedBox(
                    height: 48,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: pedidos.take(12).map((p) {
                        final val = (p['_envio'] as double);
                        final ratio = max > 0 ? val / max : 0.0;
                        return Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 1.5),
                            child: FractionallySizedBox(
                              alignment: Alignment.bottomCenter,
                              heightFactor: ratio.clamp(0.08, 1.0),
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 400),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF10B981),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 20),

        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────
// Period Picker
// ─────────────────────────────────────────────
class _PeriodoPicker extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;

  const _PeriodoPicker({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 48,
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.05),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          _Tab('Hoy', 'hoy', value, onChanged),
          _Tab('Semana', 'semana', value, onChanged),
          _Tab('Mes', 'mes', value, onChanged),
        ],
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  final String label;
  final String tabValue;
  final String currentValue;
  final ValueChanged<String> onChanged;

  const _Tab(this.label, this.tabValue, this.currentValue, this.onChanged);

  @override
  Widget build(BuildContext context) {
    final selected = tabValue == currentValue;
    return Expanded(
      child: GestureDetector(
        onTap: () => onChanged(tabValue),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          margin: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: selected ? Colors.black : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : Colors.black45,
              fontWeight: FontWeight.w700,
              fontSize: 14,
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────
// Pedido Card
// ─────────────────────────────────────────────
class _PedidoCard extends StatelessWidget {
  final Map<String, dynamic> pedido;
  final int index;

  const _PedidoCard({required this.pedido, required this.index});

  @override
  Widget build(BuildContext context) {
    final envio = pedido['_envio'] as double;
    final restaurante = pedido['restaurante'] as String? ?? 'Sin restaurante';
    final clienteNombre = pedido['cliente_nombre'] as String? ?? 'Cliente';
    final direccion = pedido['direccion'] as String? ?? '—';
    final metodo = pedido['metodo_pago'] as String? ?? 'efectivo';
    final tipoPedido = pedido['tipo_pedido'] as String? ?? 'domicilio';
    final updatedAt = DateTime.tryParse(pedido['updated_at'] ?? '')?.toLocal();
    final timeStr = updatedAt != null ? DateFormat('hh:mm a', 'es_MX').format(updatedAt) : '—';
    final dateStr = updatedAt != null ? DateFormat('d MMM', 'es_MX').format(updatedAt) : '';

    final Color metodoColor = metodo.toLowerCase() == 'billetera'
        ? const Color(0xFF8B5CF6)
        : metodo.toLowerCase() == 'online'
            ? const Color(0xFF3B82F6)
            : const Color(0xFF10B981);
    final String metodoLabel = metodo.toLowerCase() == 'billetera'
        ? 'Billetera'
        : metodo.toLowerCase() == 'online'
            ? 'Online'
            : 'Efectivo';
    final IconData metodoIcon = metodo.toLowerCase() == 'billetera'
        ? Icons.account_balance_wallet_rounded
        : metodo.toLowerCase() == 'online'
            ? Icons.credit_card_rounded
            : Icons.payments_rounded;

    return GestureDetector(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => PedidoDetailScreen(pedidoId: pedido['id'] as String)),
      ),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.black.withOpacity(0.07)),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header row
              Row(
                children: [
                  Container(
                    width: 42, height: 42,
                    decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(13)),
                    child: const Icon(Icons.storefront_rounded, color: Colors.white, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(restaurante,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Colors.black),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 2),
                        Text('$timeStr · $dateStr',
                            style: const TextStyle(fontSize: 12, color: Colors.black38, fontWeight: FontWeight.w500)),
                      ],
                    ),
                  ),
                  // Monto
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('+\$${envio.toStringAsFixed(0)}',
                          style: const TextStyle(
                            fontSize: 24, fontWeight: FontWeight.w900,
                            color: Color(0xFF10B981), letterSpacing: -0.5,
                          )),
                      const Text('envío', style: TextStyle(fontSize: 10, color: Colors.black38, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Divider(color: Colors.black.withOpacity(0.06), height: 1),
              const SizedBox(height: 10),

              // Cliente
              Row(
                children: [
                  const Icon(Icons.person_outline_rounded, size: 14, color: Colors.black38),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(clienteNombre,
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.black54),
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                ],
              ),
              if (tipoPedido != 'tienda') ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.location_on_outlined, size: 14, color: Colors.black38),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(direccion,
                          style: const TextStyle(fontSize: 12, color: Colors.black38),
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 10),

              // Chips
              Row(
                children: [
                  _Chip(icon: metodoIcon, label: metodoLabel, color: metodoColor),
                  const SizedBox(width: 8),
                  _Chip(
                    icon: tipoPedido == 'tienda' ? Icons.store_rounded : Icons.delivery_dining_rounded,
                    label: tipoPedido == 'tienda' ? 'Tienda' : 'Domicilio',
                    color: Colors.black,
                  ),
                  const Spacer(),
                  const Icon(Icons.chevron_right_rounded, size: 18, color: Colors.black26),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _Chip({required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.18)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: color),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────
// Empty State (Animado)
// ─────────────────────────────────────────────
class _EmptyState extends StatefulWidget {
  final String periodo;
  const _EmptyState({required this.periodo});

  @override
  State<_EmptyState> createState() => _EmptyStateState();
}

class _EmptyStateState extends State<_EmptyState> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _float;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 2200))
      ..repeat(reverse: true);
    _float = Tween<double>(begin: 0, end: -10).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final label = widget.periodo == 'hoy'
        ? 'hoy'
        : widget.periodo == 'semana'
            ? 'esta semana'
            : 'este mes';

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // Ícono flotante con halos
        AnimatedBuilder(
          animation: _ctrl,
          builder: (_, __) => Transform.translate(
            offset: Offset(0, _float.value),
            child: Stack(
              alignment: Alignment.center,
              children: [
                // Halo exterior
                Opacity(
                  opacity: _ctrl.value * 0.15,
                  child: Container(
                    width: 120, height: 120,
                    decoration: const BoxDecoration(
                      color: Color(0xFF10B981),
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                // Halo intermedio
                Opacity(
                  opacity: 0.08 + _ctrl.value * 0.08,
                  child: Container(
                    width: 96, height: 96,
                    decoration: const BoxDecoration(
                      color: Color(0xFF10B981),
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                // Círculo principal negro
                Container(
                  width: 76, height: 76,
                  decoration: const BoxDecoration(
                    color: Colors.black,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.monetization_on_outlined, color: Colors.white, size: 36),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 28),
        Text(
          'Sin entregas $label',
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.black),
        ),
        const SizedBox(height: 10),
        const Text(
          'Cuando entregues un pedido,\naparecerá aquí con su desglose.',
          style: TextStyle(fontSize: 14, color: Colors.black38, height: 1.5),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 32),
        // Skeleton bars animadas
        AnimatedBuilder(
          animation: _ctrl,
          builder: (_, __) => Padding(
            padding: const EdgeInsets.symmetric(horizontal: 40),
            child: Column(
              children: List.generate(3, (i) {
                final widths = [0.85, 0.60, 0.72];
                final phase = ((_ctrl.value + i * 0.25) % 1.0);
                final opacity = (0.04 + 0.06 * phase).clamp(0.03, 0.10);
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  height: 12,
                  width: double.infinity,
                  child: FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: widths[i],
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(opacity),
                        borderRadius: BorderRadius.circular(6),
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
        ),
      ],
    );
  }
}

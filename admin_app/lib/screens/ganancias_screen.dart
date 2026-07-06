// lib/screens/ganancias_screen.dart
// Pantalla de Historial de Ganancias del Repartidor — Desglose por pedido

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
      startDate =
          DateTime(now.year, now.month, now.day).subtract(const Duration(days: 6));
      break;
    case 'mes':
      startDate = DateTime(now.year, now.month, 1);
      break;
    default:
      startDate = DateTime(now.year, now.month, now.day);
  }

  final response = await supabase
      .from('pedidos')
      .select(
          'id, restaurante, cliente_nombre, direccion, precio_entrega, total, descripcion, updated_at, metodo_pago, tipo_pedido')
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0A0A0A) : const Color(0xFFF5F5F7),
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          // ── AppBar Premium ──
          SliverAppBar(
            expandedHeight: 180,
            pinned: true,
            backgroundColor: Colors.transparent,
            elevation: 0,
            leading: Padding(
              padding: const EdgeInsets.all(8),
              child: GestureDetector(
                onTap: () => Navigator.of(context).pop(),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                    child: Container(
                      decoration: BoxDecoration(
                        color: isDark ? Colors.white12 : Colors.black.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(
                        Icons.arrow_back_ios_new_rounded,
                        color: isDark ? Colors.white : Colors.black87,
                        size: 18,
                      ),
                    ),
                  ),
                ),
              ),
            ),
            flexibleSpace: FlexibleSpaceBar(
              collapseMode: CollapseMode.parallax,
              background: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFF0F172A), Color(0xFF1E293B)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: pedidosAsync.when(
                  data: (pedidos) {
                    final total = pedidos.fold<double>(
                        0.0, (sum, p) => sum + (p['_envio'] as double));
                    return _HeaderContent(
                        total: total,
                        count: pedidos.length,
                        periodo: periodo);
                  },
                  loading: () =>
                      const _HeaderContent(total: 0, count: 0, periodo: 'hoy'),
                  error: (_, __) =>
                      const _HeaderContent(total: 0, count: 0, periodo: 'hoy'),
                ),
              ),
            ),
          ),

          // ── Filtro de período ──
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
              child: _PeriodoPicker(
                value: periodo,
                onChanged: (v) =>
                    ref.read(gananciasPeriodoProvider.notifier).state = v,
              ),
            ),
          ),

          // ── Lista de pedidos ──
          pedidosAsync.when(
            data: (pedidos) {
              if (pedidos.isEmpty) {
                return SliverFillRemaining(
                  hasScrollBody: false,
                  child: _EmptyState(periodo: periodo),
                );
              }
              return SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (ctx, i) {
                      final p = pedidos[i];
                      return FadeInUp(
                        delay: Duration(milliseconds: i * 60),
                        duration: const Duration(milliseconds: 350),
                        child: _PedidoCard(
                          pedido: p,
                          isDark: isDark,
                          cs: cs,
                          index: i,
                        ),
                      );
                    },
                    childCount: pedidos.length,
                  ),
                ),
              );
            },
            loading: () => SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: CircularProgressIndicator(
                  color: const Color(0xFF38EF7D),
                  strokeWidth: 2,
                ),
              ),
            ),
            error: (e, _) => SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline_rounded,
                        color: Colors.redAccent, size: 48),
                    const SizedBox(height: 12),
                    Text('Error al cargar: $e',
                        style: TextStyle(color: cs.error),
                        textAlign: TextAlign.center),
                  ],
                ),
              ),
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
class _HeaderContent extends StatelessWidget {
  final double total;
  final int count;
  final String periodo;

  const _HeaderContent(
      {required this.total, required this.count, required this.periodo});

  @override
  Widget build(BuildContext context) {
    final label = periodo == 'hoy'
        ? 'hoy'
        : periodo == 'semana'
            ? 'esta semana'
            : 'este mes';
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 40, 24, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF38EF7D).withOpacity(0.2),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                        color: const Color(0xFF38EF7D).withOpacity(0.4)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.monetization_on_rounded,
                          color: Color(0xFF38EF7D), size: 14),
                      const SizedBox(width: 4),
                      Text(
                        'Mis Ganancias',
                        style: TextStyle(
                          color: const Color(0xFF38EF7D),
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              '\$${NumberFormat('#,##0.00', 'es_MX').format(total)}',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 40,
                fontWeight: FontWeight.w900,
                letterSpacing: -1.5,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '$count servicio${count != 1 ? 's' : ''} $label',
              style: const TextStyle(
                  color: Colors.white54, fontSize: 14, fontWeight: FontWeight.w500),
            ),
          ],
        ),
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      height: 44,
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withOpacity(0.06),
              blurRadius: 8,
              offset: const Offset(0, 2))
        ],
      ),
      child: Row(
        children: [
          _Tab('Hoy', 'hoy', value, onChanged, isDark),
          _Tab('Semana', 'semana', value, onChanged, isDark),
          _Tab('Mes', 'mes', value, onChanged, isDark),
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
  final bool isDark;

  const _Tab(this.label, this.tabValue, this.currentValue, this.onChanged,
      this.isDark);

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
            color: selected ? const Color(0xFF0F172A) : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              color: selected
                  ? Colors.white
                  : (isDark ? Colors.white38 : Colors.black38),
              fontWeight: FontWeight.w700,
              fontSize: 13,
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
  final bool isDark;
  final ColorScheme cs;
  final int index;

  const _PedidoCard(
      {required this.pedido,
      required this.isDark,
      required this.cs,
      required this.index});

  @override
  Widget build(BuildContext context) {
    final envio = pedido['_envio'] as double;
    final restaurante = pedido['restaurante'] as String? ?? 'Sin restaurante';
    final clienteNombre =
        pedido['cliente_nombre'] as String? ?? 'Cliente';
    final direccion = pedido['direccion'] as String? ?? '—';
    final metodo = pedido['metodo_pago'] as String? ?? 'efectivo';
    final tipoPedido = pedido['tipo_pedido'] as String? ?? 'domicilio';
    final updatedAt =
        DateTime.tryParse(pedido['updated_at'] ?? '')?.toLocal();
    final timeStr = updatedAt != null
        ? DateFormat('hh:mm a', 'es_MX').format(updatedAt)
        : '—';
    final dateStr = updatedAt != null
        ? DateFormat('d MMM', 'es_MX').format(updatedAt)
        : '';

    // Colores por método de pago
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

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A1A1A) : Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(isDark ? 0.3 : 0.06),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: InkWell(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => PedidoDetailScreen(pedidoId: pedido['id'] as String),
          ),
        ),
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Row: Header (restaurante + monto)
              Row(
                children: [
                  // Ícono restaurante
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF38EF7D), Color(0xFF11998E)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(
                      Icons.storefront_rounded,
                      color: Colors.white,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          restaurante,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: isDark ? Colors.white : Colors.black87,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '$timeStr · $dateStr',
                          style: TextStyle(
                            fontSize: 12,
                            color: isDark ? Colors.white38 : Colors.black38,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  // Monto ganado
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '+\$${envio.toStringAsFixed(0)}',
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          color: Color(0xFF38EF7D),
                          letterSpacing: -0.5,
                        ),
                      ),
                      Text(
                        'servicio',
                        style: TextStyle(
                          fontSize: 10,
                          color: isDark ? Colors.white38 : Colors.black38,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // Divider
              Divider(
                color: isDark ? Colors.white10 : Colors.black.withOpacity(0.07),
                height: 1,
              ),
              const SizedBox(height: 10),
              // Cliente + Dirección
              Row(
                children: [
                  Icon(Icons.person_outline_rounded,
                      size: 14,
                      color: isDark ? Colors.white38 : Colors.black38),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      clienteNombre,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: isDark ? Colors.white70 : Colors.black54,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              if (tipoPedido != 'tienda') ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(Icons.location_on_outlined,
                        size: 14,
                        color: isDark ? Colors.white38 : Colors.black38),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        direccion,
                        style: TextStyle(
                          fontSize: 12,
                          color: isDark ? Colors.white38 : Colors.black38,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 10),
              // Chips de método y tipo
              Row(
                children: [
                  _Chip(
                    icon: metodoIcon,
                    label: metodoLabel,
                    color: metodoColor,
                  ),
                  const SizedBox(width: 8),
                  _Chip(
                    icon: tipoPedido == 'tienda'
                        ? Icons.store_rounded
                        : Icons.delivery_dining_rounded,
                    label: tipoPedido == 'tienda' ? 'Tienda' : 'Domicilio',
                    color: const Color(0xFFF59E0B),
                  ),
                  const Spacer(),
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 18,
                    color: isDark ? Colors.white24 : Colors.black26,
                  ),
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
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────
class _EmptyState extends StatelessWidget {
  final String periodo;
  const _EmptyState({required this.periodo});

  @override
  Widget build(BuildContext context) {
    final label = periodo == 'hoy'
        ? 'hoy'
        : periodo == 'semana'
            ? 'esta semana'
            : 'este mes';
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF38EF7D), Color(0xFF11998E)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.monetization_on_outlined,
              color: Colors.white, size: 40),
        ),
        const SizedBox(height: 20),
        Text(
          'Sin entregas $label',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: Theme.of(context).brightness == Brightness.dark
                ? Colors.white
                : Colors.black87,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Cuando entregues un pedido,\naparecerá aquí con su desglose.',
          style: TextStyle(
            fontSize: 14,
            color: Theme.of(context).brightness == Brightness.dark
                ? Colors.white38
                : Colors.black38,
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

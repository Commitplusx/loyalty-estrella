import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/pedido_model.dart';
import '../core/theme_provider.dart';
import '../core/ui_helpers.dart';
import 'driver_pedidos_screen.dart'
    show pedidosActivosProvider, repartidoresListProvider, NuevoPedidoSheet;

class AdminPedidosScreen extends ConsumerStatefulWidget {
  const AdminPedidosScreen({super.key});

  @override
  ConsumerState<AdminPedidosScreen> createState() => _AdminPedidosScreenState();
}

class _AdminPedidosScreenState extends ConsumerState<AdminPedidosScreen> {
  // 'activos' | 'pendientes' | 'asignados' | 'recibidos' | 'en_camino' | 'entregados' | 'cancelados'
  String _filter = 'activos';

  @override
  Widget build(BuildContext context) {
    final pedidosAsync = ref.watch(pedidosActivosProvider);
    final isDark = ref.watch(themeProvider) == ThemeMode.dark;
    final bg = Theme.of(context).scaffoldBackgroundColor;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Scaffold(
      backgroundColor: bg,
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(bottom: 80, right: 8),
        child: FloatingActionButton.extended(
          heroTag: 'admin_nuevo_pedido',
          onPressed: () => _mostrarNuevoPedido(context),
          icon: const Icon(Icons.add_rounded),
          label: const Text('Nuevo', style: TextStyle(fontWeight: FontWeight.w700)),
          backgroundColor: isDark ? Colors.white : Colors.black,
          foregroundColor: isDark ? Colors.black : Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
        ),
      ),
      body: pedidosAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline_rounded, color: onSurface.withValues(alpha: 0.3), size: 64),
              const SizedBox(height: 16),
              Text('Error al cargar pedidos', style: TextStyle(color: onSurface.withValues(alpha: 0.5), fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => ref.invalidate(pedidosActivosProvider),
                child: const Text('Reintentar'),
              ),
            ],
          ),
        ),
        data: (allPedidos) {
          // Conteos por estado
          final activos = allPedidos.where((p) => !['entregado', 'cancelado'].contains(p.estado)).toList();
          final pendientes = allPedidos.where((p) => p.estado == 'pendiente').toList();
          final asignados = allPedidos.where((p) => p.estado == 'asignado').toList();
          final recibidos = allPedidos.where((p) => p.estado == 'recibido').toList();
          final enCamino = allPedidos.where((p) => p.estado == 'en_camino').toList();
          final entregados = allPedidos.where((p) => p.estado == 'entregado').toList();
          final cancelados = allPedidos.where((p) => p.estado == 'cancelado').toList();

          // Lista filtrada
          final pedidos = switch (_filter) {
            'activos'    => activos,
            'pendientes' => pendientes,
            'asignados'  => asignados,
            'recibidos'  => recibidos,
            'en_camino'  => enCamino,
            'entregados' => entregados,
            'cancelados' => cancelados,
            _            => allPedidos,
          };

          final filters = [
            _FilterOption(key: 'activos',    label: 'Activos',     count: activos.length,    color: const Color(0xFFFF6B35)),
            _FilterOption(key: 'pendientes', label: 'Pendientes',  count: pendientes.length, color: const Color(0xFFEA580C)),
            _FilterOption(key: 'asignados',  label: 'Asignados',   count: asignados.length,  color: const Color(0xFF60A5FA)),
            _FilterOption(key: 'recibidos',  label: 'Recibidos',   count: recibidos.length,  color: const Color(0xFF10B981)),
            _FilterOption(key: 'en_camino',  label: 'En Camino',   count: enCamino.length,   color: const Color(0xFFFF6B35)),
            _FilterOption(key: 'entregados', label: 'Entregados',  count: entregados.length, color: const Color(0xFF8B5CF6)),
            _FilterOption(key: 'cancelados', label: 'Cancelados',  count: cancelados.length, color: Colors.red),
          ];

          return CustomScrollView(
            slivers: [
              // ─── AppBar ─────────────────────────────────────────────────────
              SliverAppBar(
                backgroundColor: bg,
                elevation: 0,
                floating: true,
                pinned: true,
                leading: IconButton(
                  icon: const Icon(Icons.arrow_back_rounded),
                  onPressed: () => context.go('/dashboard'),
                ),
                title: Text(
                  'Pedidos',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                    color: onSurface,
                    letterSpacing: -1.0,
                  ),
                ),
                actions: [
                  IconButton(
                    icon: Icon(Icons.refresh_rounded, color: onSurface.withValues(alpha: 0.5)),
                    onPressed: () => ref.invalidate(pedidosActivosProvider),
                  ),
                  const SizedBox(width: 8),
                ],
                bottom: PreferredSize(
                  preferredSize: const Size.fromHeight(56),
                  child: _FilterBar(
                    filters: filters,
                    selected: _filter,
                    isDark: isDark,
                    onChanged: (key) => setState(() => _filter = key),
                  ),
                ),
              ),

              // ─── Resumen del filtro seleccionado ────────────────────────────
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
                  child: Row(
                    children: [
                      Text(
                        '${pedidos.length} ${pedidos.length == 1 ? 'pedido' : 'pedidos'}',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: onSurface.withValues(alpha: 0.8),
                          letterSpacing: -0.3,
                        ),
                      ),
                      if (pedidos.isEmpty) ...[ 
                        const SizedBox(width: 8),
                        Text(
                          '· Todo en orden ✓',
                          style: TextStyle(color: onSurface.withValues(alpha: 0.4), fontSize: 14),
                        ),
                      ],
                    ],
                  ),
                ),
              ),

              // ─── Lista vacía ─────────────────────────────────────────────────
              if (pedidos.isEmpty)
                SliverFillRemaining(
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.check_circle_outline_rounded,
                            color: onSurface.withValues(alpha: 0.06), size: 90),
                        const SizedBox(height: 20),
                        Text(
                          'Sin pedidos aquí',
                          style: TextStyle(
                            color: onSurface.withValues(alpha: 0.5),
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                )
              else
                // ─── Lista de pedidos ────────────────────────────────────────
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                  sliver: SliverList.separated(
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemCount: pedidos.length,
                    itemBuilder: (context, i) => _AdminPedidoCard(
                      pedido: pedidos[i],
                      isDark: isDark,
                      onTap: () => context.push('/pedidos/${pedidos[i].id}'),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  void _mostrarNuevoPedido(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      builder: (_) => NuevoPedidoSheet(
        onCreado: () => ref.invalidate(pedidosActivosProvider),
      ),
    );
  }
}

// ── Modelo interno para los filtros ──────────────────────────────────────────

class _FilterOption {
  final String key;
  final String label;
  final int count;
  final Color color;
  const _FilterOption({
    required this.key,
    required this.label,
    required this.count,
    required this.color,
  });
}

// ── Barra de filtros ──────────────────────────────────────────────────────────

class _FilterBar extends StatelessWidget {
  final List<_FilterOption> filters;
  final String selected;
  final bool isDark;
  final ValueChanged<String> onChanged;

  const _FilterBar({
    required this.filters,
    required this.selected,
    required this.isDark,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 56,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        itemCount: filters.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final f = filters[i];
          final isActive = selected == f.key;
          return GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              onChanged(f.key);
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: isActive
                    ? f.color
                    : (isDark
                        ? Colors.white.withValues(alpha: 0.07)
                        : Colors.black.withValues(alpha: 0.05)),
                borderRadius: BorderRadius.circular(20),
              ),
              alignment: Alignment.center,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    f.label,
                    style: TextStyle(
                      color: isActive
                          ? Colors.white
                          : (isDark ? Colors.white60 : Colors.black54),
                      fontSize: 13,
                      fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                      letterSpacing: -0.2,
                    ),
                  ),
                  if (f.count > 0) ...[ 
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(
                        color: isActive
                            ? Colors.white.withValues(alpha: 0.25)
                            : f.color.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        '${f.count}',
                        style: TextStyle(
                          color: isActive ? Colors.white : f.color,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ── Tarjeta de pedido para el admin ──────────────────────────────────────────

class _AdminPedidoCard extends StatelessWidget {
  final PedidoModel pedido;
  final bool isDark;
  final VoidCallback onTap;

  const _AdminPedidoCard({
    required this.pedido,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final estadoColor = _adminEstadoColor(pedido.estado);
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final cardBg = isDark ? Colors.black : Colors.white;

    final diff = DateTime.now().difference(pedido.createdAt);
    final timeStr = diff.inMinutes < 1
        ? 'ahora'
        : diff.inMinutes < 60
            ? '${diff.inMinutes}m'
            : diff.inHours < 24
                ? '${diff.inHours}h ${diff.inMinutes % 60}m'
                : '${diff.inDays}d';
    final isUrgent = diff.inMinutes > 20 &&
        !['entregado', 'cancelado', 'en_camino'].contains(pedido.estado);

    final shortId = pedido.id
        .replaceAll('-', '')
        .substring(pedido.id.replaceAll('-', '').length - 5)
        .toUpperCase();

    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: cardBg,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: isUrgent
                ? Colors.red.withValues(alpha: 0.5)
                : estadoColor.withValues(alpha: 0.2),
            width: isUrgent ? 1.5 : 1.0,
          ),
          boxShadow: isDark
              ? []
              : [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.04),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Fila superior: estado + tiempo ────────────────────────────
            Row(
              children: [
                // Punto de color + estado
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: estadoColor,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    pedido.estadoLabel.toUpperCase(),
                    style: TextStyle(
                      color: estadoColor,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.2,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (isUrgent) ...[ 
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.red.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text(
                      '⚠ TARDANDO',
                      style: TextStyle(
                          color: Colors.red, fontSize: 9, fontWeight: FontWeight.w900),
                    ),
                  ),
                ],
                const Spacer(),
                // Tiempo transcurrido
                Text(
                  timeStr,
                  style: TextStyle(
                    color: isUrgent ? Colors.red : onSurface.withValues(alpha: 0.4),
                    fontSize: 12,
                    fontWeight: isUrgent ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
                const SizedBox(width: 8),
                // ID corto
                Text(
                  'EST-$shortId',
                  style: TextStyle(
                    color: onSurface.withValues(alpha: 0.25),
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 14),

            // ── Fila principal: origen → cliente ─────────────────────────
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Origen
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'De',
                        style: TextStyle(
                            color: onSurface.withValues(alpha: 0.4),
                            fontSize: 11,
                            fontWeight: FontWeight.w500),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        pedido.restaurante?.isNotEmpty == true
                            ? pedido.restaurante!
                            : (pedido.origen?.isNotEmpty == true
                                ? pedido.origen!
                                : 'Sin origen'),
                        style: TextStyle(
                          color: onSurface.withValues(alpha: 0.9),
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),

                // Flecha
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Icon(Icons.arrow_forward_rounded,
                      size: 16, color: onSurface.withValues(alpha: 0.2)),
                ),

                // Cliente
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Para',
                        style: TextStyle(
                            color: onSurface.withValues(alpha: 0.4),
                            fontSize: 11,
                            fontWeight: FontWeight.w500),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        pedido.clienteNombre?.isNotEmpty == true
                            ? pedido.clienteNombre!
                            : 'Cliente',
                        style: TextStyle(
                          color: onSurface.withValues(alpha: 0.9),
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 14),

            // ── Fila inferior: repartidor + tipo + total ──────────────────
            Row(
              children: [
                // Repartidor
                Icon(Icons.two_wheeler_rounded,
                    size: 13, color: onSurface.withValues(alpha: 0.35)),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    pedido.repartidorNombre?.isNotEmpty == true
                        ? pedido.repartidorNombre!
                        : 'Sin asignar',
                    style: TextStyle(
                      color: pedido.repartidorNombre?.isNotEmpty == true
                          ? onSurface.withValues(alpha: 0.6)
                          : Colors.orange,
                      fontSize: 12,
                      fontWeight: pedido.repartidorNombre?.isNotEmpty == true
                          ? FontWeight.w500
                          : FontWeight.w700,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),

                // Tipo de pedido
                _TipoBadge(tipoPedido: pedido.tipoPedido),
                const SizedBox(width: 8),

                // Total
                if (pedido.total != null)
                  Text(
                    '\$${pedido.total!.toStringAsFixed(0)}',
                    style: const TextStyle(
                      color: Color(0xFF10B981),
                      fontWeight: FontWeight.w900,
                      fontSize: 14,
                    ),
                  ),

                // Flecha de detalle
                const SizedBox(width: 4),
                Icon(Icons.chevron_right_rounded,
                    size: 18, color: onSurface.withValues(alpha: 0.2)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Badge de tipo de pedido ───────────────────────────────────────────────────

class _TipoBadge extends StatelessWidget {
  final String? tipoPedido;
  const _TipoBadge({required this.tipoPedido});

  @override
  Widget build(BuildContext context) {
    final (String emoji, Color color) = switch (tipoPedido) {
      'mandadito'            => ('🛵', const Color(0xFFF97316)),
      'restaurante_delivery' => ('🏪', const Color(0xFF10B981)),
      _                     => ('🌐', const Color(0xFF3B82F6)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.25), width: 0.8),
      ),
      child: Text(
        emoji,
        style: const TextStyle(fontSize: 11),
      ),
    );
  }
}

// ── Helper: color por estado ──────────────────────────────────────────────────

Color _adminEstadoColor(String estado) {
  return switch (estado) {
    'pendiente'          => const Color(0xFFEA580C),
    'asignado'           => const Color(0xFF60A5FA),
    'en_cocina'          => const Color(0xFFEAB308),
    'listo_para_recoger' => const Color(0xFF14B8A6),
    'recibido'           => const Color(0xFF10B981),
    'en_camino'          => const Color(0xFFFF6B35),
    'entregado'          => const Color(0xFF8B5CF6),
    'cancelado'          => Colors.red,
    _                   => Colors.grey,
  };
}

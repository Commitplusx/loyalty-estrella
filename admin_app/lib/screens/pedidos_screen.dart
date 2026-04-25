// lib/screens/pedidos_screen.dart
// Pantalla de gestión de pedidos — Rediseño Premium con soporte de tema claro/oscuro.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/pedido_model.dart';
import '../services/pedido_service.dart';
import '../services/repartidor_service.dart';
import '../core/supabase_config.dart';
import '../core/theme_provider.dart';

// Provider de pedidos activos
final pedidosActivosProvider = FutureProvider.autoDispose<List<PedidoModel>>(
  (ref) => ref.read(pedidoServiceProvider).getPedidosActivos(),
);

// Provider de repartidores (para el dropdown)
final repartidoresListProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) async {
    final data = await supabase
        .from('repartidores')
        .select('id, user_id, nombre, telefono')
        .eq('activo', true)
        .order('nombre');
    return List<Map<String, dynamic>>.from(data);
  },
);

class PedidosScreen extends ConsumerWidget {
  const PedidosScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pedidosAsync = ref.watch(pedidosActivosProvider);
    final isDark = ref.watch(themeProvider) == ThemeMode.dark;
    final bg = Theme.of(context).scaffoldBackgroundColor;
    final cardBg = Theme.of(context).cardTheme.color ?? Theme.of(context).colorScheme.surface;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final primary = Theme.of(context).colorScheme.primary;

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Servicios Activos',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: onSurface,
              ),
            ),
            Text(
              'Pedidos en tiempo real',
              style: TextStyle(
                fontSize: 11,
                color: onSurface.withValues(alpha: 0.45),
                fontWeight: FontWeight.w400,
              ),
            ),
          ],
        ),
        actions: [
          pedidosAsync.when(
            data: (p) => Container(
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: primary.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: primary.withValues(alpha: 0.3)),
              ),
              child: Text(
                '${p.length} activos',
                style: TextStyle(
                  color: primary,
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                ),
              ),
            ),
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
          IconButton(
            icon: Icon(Icons.refresh_rounded, color: onSurface.withValues(alpha: 0.6)),
            onPressed: () => ref.invalidate(pedidosActivosProvider),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _mostrarNuevoPedido(context, ref),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Nuevo', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: primary,
        foregroundColor: Colors.white,
        elevation: 6,
      ),
      body: pedidosAsync.when(
        loading: () => Center(child: CircularProgressIndicator(color: primary)),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline_rounded, color: Colors.red[300], size: 48),
              const SizedBox(height: 12),
              Text('Error: $e', style: const TextStyle(color: Colors.red), textAlign: TextAlign.center),
            ],
          ),
        ),
        data: (pedidos) {
          if (pedidos.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 90, height: 90,
                    decoration: BoxDecoration(
                      color: primary.withValues(alpha: 0.08),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(Icons.inbox_rounded, color: primary, size: 44),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'Sin pedidos activos',
                    style: TextStyle(color: onSurface, fontSize: 17, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Toca + para crear un nuevo servicio',
                    style: TextStyle(color: onSurface.withValues(alpha: 0.4), fontSize: 13),
                  ),
                ],
              ),
            );
          }

          // Agrupar por estado para mostrar secciones
          final enCamino = pedidos.where((p) => p.estado == 'en_camino').toList();
          final recibidos = pedidos.where((p) => p.estado == 'recibido').toList();
          final asignados = pedidos.where((p) => p.estado == 'asignado').toList();
          final otros = pedidos.where((p) => !['en_camino', 'recibido', 'asignado'].contains(p.estado)).toList();

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
            children: [
              // Banner de resumen
              Container(
                margin: const EdgeInsets.only(bottom: 20),
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [primary, Theme.of(context).colorScheme.secondary],
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                  ),
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: [
                    BoxShadow(
                      color: primary.withValues(alpha: 0.3),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    const Icon(Icons.local_fire_department_rounded, color: Colors.white, size: 24),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${pedidos.length} servicios en juego',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 15),
                          ),
                          Text(
                            '${enCamino.length} en camino • ${recibidos.length} recibidos • ${asignados.length} asignados',
                            style: const TextStyle(color: Colors.white70, fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              if (enCamino.isNotEmpty) ...[
                _SectionHeader(title: '🚀 En Camino', count: enCamino.length, color: const Color(0xFFFF6B35), isDark: isDark),
                const SizedBox(height: 8),
                ...enCamino.map((p) => _PedidoTile(pedido: p, isDark: isDark, cardBg: cardBg, onSurface: onSurface, onTap: () => context.push('/pedidos/${p.id}'))),
                const SizedBox(height: 20),
              ],

              if (recibidos.isNotEmpty) ...[
                _SectionHeader(title: '🛍️ En Restaurante', count: recibidos.length, color: Theme.of(context).colorScheme.secondary, isDark: isDark),
                const SizedBox(height: 8),
                ...recibidos.map((p) => _PedidoTile(pedido: p, isDark: isDark, cardBg: cardBg, onSurface: onSurface, onTap: () => context.push('/pedidos/${p.id}'))),
                const SizedBox(height: 20),
              ],

              if (asignados.isNotEmpty) ...[
                _SectionHeader(title: '📋 Asignados', count: asignados.length, color: const Color(0xFF60A5FA), isDark: isDark),
                const SizedBox(height: 8),
                ...asignados.map((p) => _PedidoTile(pedido: p, isDark: isDark, cardBg: cardBg, onSurface: onSurface, onTap: () => context.push('/pedidos/${p.id}'))),
                const SizedBox(height: 20),
              ],

              if (otros.isNotEmpty) ...[
                _SectionHeader(title: '📦 Otros', count: otros.length, color: Colors.grey, isDark: isDark),
                const SizedBox(height: 8),
                ...otros.map((p) => _PedidoTile(pedido: p, isDark: isDark, cardBg: cardBg, onSurface: onSurface, onTap: () => context.push('/pedidos/${p.id}'))),
              ],
            ],
          );
        },
      ),
    );
  }

  Future<void> _mostrarNuevoPedido(BuildContext context, WidgetRef ref) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _NuevoPedidoSheet(
        onCreado: () => ref.invalidate(pedidosActivosProvider),
      ),
    );
  }
}

// ── Section header ────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final String title;
  final int count;
  final Color color;
  final bool isDark;

  const _SectionHeader({required this.title, required this.count, required this.color, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(title, style: TextStyle(color: isDark ? Colors.white : const Color(0xFF1A1A2E), fontWeight: FontWeight.w800, fontSize: 14)),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8)),
          child: Text('$count', style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 12)),
        ),
      ],
    );
  }
}

// ── Tile de pedido rediseñado ─────────────────────────────────────────────────

class _PedidoTile extends StatelessWidget {
  final PedidoModel pedido;
  final VoidCallback onTap;
  final bool isDark;
  final Color cardBg;
  final Color onSurface;

  const _PedidoTile({
    required this.pedido,
    required this.onTap,
    required this.isDark,
    required this.cardBg,
    required this.onSurface,
  });

  @override
  Widget build(BuildContext context) {
    final color = _estadoColor(pedido.estado);
    final timeAgo = _timeAgo(pedido.createdAt);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: cardBg,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: color.withValues(alpha: 0.25), width: 1.5),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Fila superior: ícono, descripción, tiempo
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Estado indicator
                    Container(
                      width: 48, height: 48,
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(_estadoIcon(pedido.estado), color: color, size: 24),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            pedido.descripcion,
                            style: TextStyle(
                              color: onSurface,
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: color.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  pedido.estadoLabel,
                                  style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w800),
                                ),
                              ),
                              const SizedBox(width: 6),
                              Icon(Icons.access_time_rounded, size: 11, color: onSurface.withValues(alpha: 0.4)),
                              const SizedBox(width: 2),
                              Text(timeAgo, style: TextStyle(color: onSurface.withValues(alpha: 0.4), fontSize: 11)),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded, color: onSurface.withValues(alpha: 0.2), size: 20),
                  ],
                ),

                // Divisor
                if (pedido.repartidorNombre != null || (pedido.direccion != null && pedido.direccion!.isNotEmpty) || (pedido.clienteTel != null && pedido.clienteTel!.isNotEmpty)) ...[
                  const SizedBox(height: 12),
                  Container(height: 1, color: onSurface.withValues(alpha: 0.06)),
                  const SizedBox(height: 10),
                ],

                // Info adicional en chips
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    if (pedido.repartidorNombre != null)
                      _InfoChip(
                        icon: Icons.delivery_dining_rounded,
                        label: pedido.repartidorNombre!,
                        color: const Color(0xFF10B981),
                        isDark: isDark,
                      ),
                    if (pedido.restaurante != null && pedido.restaurante!.isNotEmpty)
                      _InfoChip(
                        icon: Icons.storefront_rounded,
                        label: pedido.restaurante!,
                        color: const Color(0xFFF59E0B),
                        isDark: isDark,
                      ),
                    if (pedido.clienteTel != null && pedido.clienteTel!.isNotEmpty)
                      _InfoChip(
                        icon: Icons.phone_rounded,
                        label: pedido.clienteTel!,
                        color: const Color(0xFF60A5FA),
                        isDark: isDark,
                      ),
                    if (pedido.direccion != null && pedido.direccion!.isNotEmpty)
                      _InfoChip(
                        icon: Icons.location_on_rounded,
                        label: pedido.direccion!,
                        color: const Color(0xFFE11D48),
                        isDark: isDark,
                        maxWidth: true,
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final bool isDark;
  final bool maxWidth;

  const _InfoChip({
    required this.icon,
    required this.label,
    required this.color,
    required this.isDark,
    this.maxWidth = false,
  });

  @override
  Widget build(BuildContext context) {
    final bg = Theme.of(context).scaffoldBackgroundColor;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Container(
      constraints: maxWidth ? const BoxConstraints(maxWidth: double.infinity) : null,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 5),
          Flexible(
            child: Text(
              label,
              style: TextStyle(
                color: isDark ? Colors.white70 : onSurface.withValues(alpha: 0.7),
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Bottom sheet: Nuevo Pedido ────────────────────────────────────────────────

class _NuevoPedidoSheet extends ConsumerStatefulWidget {
  final VoidCallback onCreado;
  const _NuevoPedidoSheet({required this.onCreado});

  @override
  ConsumerState<_NuevoPedidoSheet> createState() => _NuevoPedidoSheetState();
}

class _NuevoPedidoSheetState extends ConsumerState<_NuevoPedidoSheet> {
  final _formKey = GlobalKey<FormState>();
  final _telCtrl = TextEditingController();
  final _nombreClienteCtrl = TextEditingController();
  final _restauranteCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _dirCtrl = TextEditingController();
  String? _repartidorId;
  String? _selectedRestId;
  bool _esRestaurante = false;
  bool _esOtroRest = false;
  bool _loading = false;

  @override
  void dispose() {
    _telCtrl.dispose();
    _nombreClienteCtrl.dispose();
    _restauranteCtrl.dispose();
    _descCtrl.dispose();
    _dirCtrl.dispose();
    super.dispose();
  }

  Future<void> _crear() async {
    if (!_formKey.currentState!.validate()) return;
    if (_repartidorId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Selecciona un repartidor'), backgroundColor: Color(0xFFE11D48)),
      );
      return;
    }

    setState(() => _loading = true);
    
    String finalRestaurante = _restauranteCtrl.text.trim();
    String finalDesc = _descCtrl.text.trim();

    if (_esRestaurante && !_esOtroRest && _selectedRestId != null) {
      final rests = ref.read(restaurantesProvider).value ?? [];
      try {
        final r = rests.firstWhere((element) => element['id'].toString() == _selectedRestId);
        finalRestaurante = r['nombre'];
        if (finalDesc.isEmpty) {
          finalDesc = 'Pedido de $finalRestaurante';
        }
      } catch (e) {
        // ignore
      }
    }

    final result = await ref.read(pedidoServiceProvider).crearPedido(
          clienteTel: _telCtrl.text.replaceAll(RegExp(r'\D'), ''),
          clienteNombre: _nombreClienteCtrl.text.trim(),
          restaurante: finalRestaurante.isEmpty ? null : finalRestaurante,
          repartidorId: _repartidorId!,
          descripcion: finalDesc,
          direccion: _dirCtrl.text.trim(),
        );
    setState(() => _loading = false);

    if (mounted) {
      if (result.ok) {
        Navigator.pop(context);
        widget.onCreado();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Pedido creado — Notificado por WhatsApp 📲'),
            backgroundColor: Color(0xFF11998E),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('❌ Error: ${result.error}'),
            backgroundColor: const Color(0xFFE11D48),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final repsAsync = ref.watch(repartidoresListProvider);
    final restsAsync = ref.watch(restaurantesProvider);
    final isDark = ref.watch(themeProvider) == ThemeMode.dark;
    final sheetBg = isDark ? const Color(0xFF16161E) : Colors.white;
    final inputFill = isDark ? const Color(0xFF0A0A12) : const Color(0xFFF5F5FA);
    final labelColor = isDark ? Colors.white54 : Colors.black38;
    final textColor = isDark ? Colors.white : const Color(0xFF1A1A2E);

    return Container(
      decoration: BoxDecoration(
        color: sheetBg,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.3), blurRadius: 30)],
      ),
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 28),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Handle
            Center(
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: isDark ? Colors.white24 : Colors.black12,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),

            Row(
              children: [
                Container(
                  width: 44, height: 44,
                  decoration: BoxDecoration(
                    color: const Color(0xFFFF6B35).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.add_box_rounded, color: Color(0xFFFF6B35), size: 24),
                ),
                const SizedBox(width: 14),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Nuevo Pedido', style: TextStyle(color: textColor, fontSize: 20, fontWeight: FontWeight.w900)),
                    Text('Asigna y notifica al repartidor', style: TextStyle(color: textColor.withValues(alpha: 0.4), fontSize: 12)),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 20),

            TextFormField(
              controller: _telCtrl,
              keyboardType: TextInputType.phone,
              maxLength: 10,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              style: TextStyle(color: textColor),
              decoration: _inputDeco('📱 Teléfono del cliente', Icons.phone_rounded, inputFill, labelColor),
              validator: (v) => (v == null || v.length != 10) ? 'Ingresa 10 dígitos' : null,
            ),
            const SizedBox(height: 10),

            TextFormField(
              controller: _nombreClienteCtrl,
              style: TextStyle(color: textColor),
              textCapitalization: TextCapitalization.words,
              decoration: _inputDeco('👤 Nombre del cliente (opcional)', Icons.person_rounded, inputFill, labelColor),
            ),
            const SizedBox(height: 14),

            // Dropdown de Restaurantes
            Row(
              children: [
                Icon(Icons.storefront_rounded, color: const Color(0xFFFF6B35).withValues(alpha: 0.7), size: 20),
                const SizedBox(width: 10),
                Text('¿Es un Restaurante?', style: TextStyle(color: textColor, fontWeight: FontWeight.w600)),
                const Spacer(),
                Switch(
                  value: _esRestaurante,
                  activeColor: const Color(0xFFFF6B35),
                  onChanged: (val) => setState(() {
                    _esRestaurante = val;
                    if (!val) { _selectedRestId = null; _esOtroRest = false; }
                  }),
                ),
              ],
            ),
            if (_esRestaurante) ...[
              const SizedBox(height: 10),
              restsAsync.when(
                data: (rests) => DropdownButtonFormField<String>(
                  value: _selectedRestId,
                  dropdownColor: isDark ? const Color(0xFF16161E) : Colors.white,
                  style: TextStyle(color: textColor),
                  decoration: _inputDeco('Seleccionar Restaurante', null, inputFill, labelColor),
                  items: [
                    ...rests.map((r) => DropdownMenuItem<String>(value: r['id'].toString(), child: Text(r['nombre'], style: TextStyle(color: textColor)))),
                    DropdownMenuItem<String>(value: 'otro', child: Text('Otro (Escribir manualmente)', style: TextStyle(color: const Color(0xFFFF6B35), fontWeight: FontWeight.bold))),
                  ],
                  onChanged: (val) => setState(() {
                    _selectedRestId = val;
                    _esOtroRest = val == 'otro';
                  }),
                ),
                loading: () => const LinearProgressIndicator(color: Color(0xFFFF6B35)),
                error: (e, _) => Text('Error: $e'),
              ),
              if (_esOtroRest) ...[
                const SizedBox(height: 10),
                TextFormField(
                  controller: _restauranteCtrl,
                  style: TextStyle(color: textColor),
                  textCapitalization: TextCapitalization.words,
                  decoration: _inputDeco('Nombre del Restaurante', null, inputFill, labelColor),
                ),
              ]
            ],

            const SizedBox(height: 14),

            TextFormField(
              controller: _descCtrl,
              style: TextStyle(color: textColor),
              maxLines: 2,
              decoration: _inputDeco('📝 Descripción del pedido', Icons.description_rounded, inputFill, labelColor),
              validator: (v) => (v == null || v.trim().isEmpty) && (!_esRestaurante || _esOtroRest) ? 'Escribe la descripción' : null,
            ),
            const SizedBox(height: 10),

            TextFormField(
              controller: _dirCtrl,
              style: TextStyle(color: textColor),
              decoration: _inputDeco('📍 Dirección de entrega (opcional)', Icons.location_on_rounded, inputFill, labelColor),
            ),
            const SizedBox(height: 10),

            // Dropdown de repartidores
            repsAsync.when(
              loading: () => const LinearProgressIndicator(color: Color(0xFFFF6B35)),
              error: (e, _) => Text('Error al cargar repartidores', style: TextStyle(color: Colors.red[300])),
              data: (reps) => DropdownButtonFormField<String>(
                value: _repartidorId,
                dropdownColor: isDark ? const Color(0xFF16161E) : Colors.white,
                style: TextStyle(color: textColor),
                decoration: _inputDeco('🚴 Seleccionar repartidor', Icons.delivery_dining_rounded, inputFill, labelColor),
                hint: Text('Selecciona un repartidor', style: TextStyle(color: labelColor, fontSize: 13)),
                items: reps.map((r) => DropdownMenuItem<String>(
                  value: r['id'].toString(),
                  child: Text(r['nombre'] ?? 'ID: ${r['id']}', style: TextStyle(color: textColor)),
                )).toList(),
                onChanged: (val) => setState(() => _repartidorId = val),
              ),
            ),

            const SizedBox(height: 20),

            _loading
                ? const Center(child: CircularProgressIndicator(color: Color(0xFFFF6B35)))
                : ElevatedButton.icon(
                    onPressed: _crear,
                    icon: const Icon(Icons.send_rounded),
                    label: const Text('Asignar y Notificar por WhatsApp', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFFF6B35),
                      foregroundColor: Colors.white,
                      minimumSize: const Size(double.infinity, 54),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      elevation: 0,
                    ),
                  ),
          ],
        ),
      ),
    );
  }

  InputDecoration _inputDeco(String label, IconData? icon, Color fill, Color labelColor) {
    return InputDecoration(
      labelText: label.isNotEmpty ? label : null,
      labelStyle: TextStyle(color: labelColor, fontSize: 13),
      prefixIcon: icon != null ? Icon(icon, color: const Color(0xFFFF6B35).withValues(alpha: 0.7), size: 20) : null,
      filled: true,
      fillColor: fill,
      counterStyle: TextStyle(color: labelColor),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFFF6B35), width: 2),
      ),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

String _timeAgo(DateTime? dt) {
  if (dt == null) return '';
  final diff = DateTime.now().difference(dt);
  if (diff.inMinutes < 1) return 'ahora';
  if (diff.inMinutes < 60) return 'hace ${diff.inMinutes}m';
  if (diff.inHours < 24) return 'hace ${diff.inHours}h';
  return 'hace ${diff.inDays}d';
}

Color _estadoColor(String estado) {
  switch (estado) {
    case 'asignado':  return const Color(0xFF60A5FA);
    case 'recibido':  return const Color(0xFFF59E0B);
    case 'en_camino': return const Color(0xFFFF6B35);
    case 'entregado': return const Color(0xFF11998E);
    default:          return Colors.grey;
  }
}

IconData _estadoIcon(String estado) {
  switch (estado) {
    case 'asignado':  return Icons.assignment_rounded;
    case 'recibido':  return Icons.handshake_rounded;
    case 'en_camino': return Icons.delivery_dining_rounded;
    case 'entregado': return Icons.check_circle_rounded;
    default:          return Icons.help_outline;
  }
}

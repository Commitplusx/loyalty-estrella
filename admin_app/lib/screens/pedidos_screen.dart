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
import '../core/user_role.dart';
import '../core/user_role.dart';
import '../core/cache_helper.dart';
import '../core/ui_helpers.dart';

// Provider de pedidos activos usando stream realtime directo
final pedidosActivosProvider = StreamProvider.autoDispose<List<PedidoModel>>((ref) {
  final isAdmin = ref.watch(isAdminProvider);
  final userId = isAdmin ? null : supabase.auth.currentUser?.id;

  if (userId != null) {
    return supabase
        .from('pedidos')
        .stream(primaryKey: ['id'])
        .eq('repartidor_id', userId)
        .order('created_at', ascending: false)
        .map((list) {
      final activeList = list.where((m) => !['entregado', 'cancelado'].contains(m['estado'])).toList();
      return activeList.map((m) => PedidoModel.fromMap(m)).toList();
    });
  } else {
    return supabase
        .from('pedidos')
        .stream(primaryKey: ['id'])
        .order('created_at', ascending: false)
        .map((list) {
      final activeList = list.where((m) => !['entregado', 'cancelado'].contains(m['estado'])).toList();
      return activeList.map((m) => PedidoModel.fromMap(m)).toList();
    });
  }
});

// Provider de repartidores (para el dropdown) con caché
final repartidoresListProvider = StreamProvider.autoDispose<List<Map<String, dynamic>>>((ref) async* {
  const cacheKey = 'repartidores_activos_list';

  final cached = await CacheHelper.getList(cacheKey);
  if (cached != null) yield cached;

  final data = await supabase
      .from('repartidores')
      .select('id, user_id, nombre, telefono')
      .eq('activo', true)
      .order('nombre');

  final networkData = List<Map<String, dynamic>>.from(data);
  await CacheHelper.saveList(cacheKey, networkData);
  yield networkData;
});

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
        leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => context.go('/dashboard')),
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
            icon: Icon(Icons.refresh_rounded, color: onSurface.withValues(alpha: 0.6)),
            onPressed: () => ref.invalidate(pedidosActivosProvider),
          ),
          const SizedBox(width: 8),
        ],
      ),
      floatingActionButton: !ref.watch(isAdminProvider) ? null : Padding(
        padding: const EdgeInsets.only(bottom: 100.0, right: 8.0),
        child: FloatingActionButton.extended(
          onPressed: () => _mostrarNuevoPedido(context, ref),
          icon: const Icon(Icons.add_rounded),
          label: const Text('Nuevo', style: TextStyle(fontWeight: FontWeight.w700, letterSpacing: -0.2)),
          backgroundColor: isDark ? Colors.white : Colors.black,
          foregroundColor: isDark ? Colors.black : Colors.white,
          elevation: 0,
          highlightElevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
        ),
      ),
      body: pedidosAsync.when(
        loading: () => ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: 5,
          itemBuilder: (ctx, i) => ShimmerLoading(
            child: Container(
              margin: const EdgeInsets.only(bottom: 12),
              height: 120,
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
            ),
          ),
        ),
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
                  Icon(Icons.check_circle_outline_rounded, color: onSurface.withValues(alpha: 0.05), size: 100),
                  const SizedBox(height: 24),
                  Text(
                    'Todo al día',
                    style: TextStyle(color: onSurface.withValues(alpha: 0.6), fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -0.5),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'No hay pedidos activos en este momento.',
                    style: TextStyle(color: onSurface.withValues(alpha: 0.4), fontSize: 14),
                  ),
                ],
              ),
            );
          }

          // Agrupar por estado para mostrar secciones
          final pendientes = pedidos.where((p) => p.estado == 'pendiente').toList();
          final enCamino = pedidos.where((p) => p.estado == 'en_camino').toList();
          final recibidos = pedidos.where((p) => p.estado == 'recibido').toList();
          final asignados = pedidos.where((p) => p.estado == 'asignado').toList();
          final otros = pedidos.where((p) => !['pendiente', 'en_camino', 'recibido', 'asignado'].contains(p.estado)).toList();

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
            children: [
              // Banner de resumen minimalista
              Padding(
                padding: const EdgeInsets.only(bottom: 24, top: 8),
                child: Row(
                  children: [
                    Text(
                      '${pedidos.length} Activos',
                      style: TextStyle(
                        color: onSurface.withValues(alpha: 0.9), 
                        fontWeight: FontWeight.w800, 
                        fontSize: 14,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(width: 12),
                    if (enCamino.isNotEmpty)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFF6B35).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          '${enCamino.length} en camino',
                          style: const TextStyle(
                            color: Color(0xFFFF6B35), 
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                  ],
                ),
              ),

              if (pendientes.isNotEmpty) ...[
                _SectionHeader(title: 'Pendientes (Sin Repartidor)', count: pendientes.length, color: const Color(0xFFEA580C), isDark: isDark),
                const SizedBox(height: 8),
                ...pendientes.map((p) => _PedidoTile(pedido: p, isDark: isDark, cardBg: cardBg, onSurface: onSurface, onTap: () => context.push('/pedidos/${p.id}'))),
                const SizedBox(height: 20),
              ],

              if (enCamino.isNotEmpty) ...[
                _SectionHeader(title: 'En Camino', count: enCamino.length, color: const Color(0xFFFF6B35), isDark: isDark),
                const SizedBox(height: 8),
                ...enCamino.map((p) => _PedidoTile(pedido: p, isDark: isDark, cardBg: cardBg, onSurface: onSurface, onTap: () => context.push('/pedidos/${p.id}'))),
                const SizedBox(height: 20),
              ],

              if (recibidos.isNotEmpty) ...[
                _SectionHeader(title: 'En Restaurante', count: recibidos.length, color: Theme.of(context).colorScheme.secondary, isDark: isDark),
                const SizedBox(height: 8),
                ...recibidos.map((p) => _PedidoTile(pedido: p, isDark: isDark, cardBg: cardBg, onSurface: onSurface, onTap: () => context.push('/pedidos/${p.id}'))),
                const SizedBox(height: 20),
              ],

              if (asignados.isNotEmpty) ...[
                _SectionHeader(title: 'Asignados', count: asignados.length, color: const Color(0xFF60A5FA), isDark: isDark),
                const SizedBox(height: 8),
                ...asignados.map((p) => _PedidoTile(pedido: p, isDark: isDark, cardBg: cardBg, onSurface: onSurface, onTap: () => context.push('/pedidos/${p.id}'))),
                const SizedBox(height: 20),
              ],

              if (otros.isNotEmpty) ...[
                _SectionHeader(title: 'Otros', count: otros.length, color: Colors.grey, isDark: isDark),
                const SizedBox(height: 8),
                ...otros.map((p) => _PedidoTile(pedido: p, isDark: isDark, cardBg: cardBg, onSurface: onSurface, onTap: () => context.push('/pedidos/${p.id}'))),
              ],
              
              const SizedBox(height: 100), // Espacio para el Bottom Nav Bar flotante
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
      useRootNavigator: true,
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
    return Padding(
      padding: const EdgeInsets.only(left: 0, bottom: 12, top: 24),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Text(
            title, 
            style: TextStyle(
              color: isDark ? Colors.white.withValues(alpha: 0.9) : Colors.black87, 
              fontWeight: FontWeight.w700, 
              fontSize: 16,
              letterSpacing: -0.5,
            )
          ),
          const SizedBox(width: 6),
          Text(
            '$count', 
            style: TextStyle(color: isDark ? Colors.white30 : Colors.black38, fontWeight: FontWeight.w500, fontSize: 14)
          ),
        ],
      ),
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
    
    final String origenStr = pedido.restaurante?.isNotEmpty == true ? pedido.restaurante! : (pedido.origen?.isNotEmpty == true ? pedido.origen! : 'Punto de recogida');
    final String destinoStr = pedido.clienteNombre?.isNotEmpty == true ? pedido.clienteNombre! : (pedido.destino?.isNotEmpty == true ? pedido.destino! : 'Cliente');

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      child: BouncingCard(
        onTap: onTap,
        child: Material(
          color: Colors.transparent,
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: (pedido.estado == 'asignado' || pedido.estado == 'pendiente' || pedido.estado == 'pendiente_pago')
                  ? (isDark ? const Color(0xFF0F172A) : const Color(0xFFEFF6FF))
                  : (isDark ? Colors.black : Colors.white),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: (pedido.estado == 'asignado' || pedido.estado == 'pendiente' || pedido.estado == 'pendiente_pago')
                    ? const Color(0xFF3B82F6).withValues(alpha: 0.5)
                    : (isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.05)),
                width: (pedido.estado == 'asignado' || pedido.estado == 'pendiente' || pedido.estado == 'pendiente_pago') ? 1.5 : 1.0,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Fila Superior: Estado y Tiempo
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.circle, size: 8, color: color),
                        const SizedBox(width: 6),
                        Text(
                          pedido.estadoLabel,
                          style: TextStyle(
                            color: onSurface.withValues(alpha: 0.8), 
                            fontSize: 12, 
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        if (pedido.estado == 'asignado' || pedido.estado == 'pendiente' || pedido.estado == 'pendiente_pago') ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xFF3B82F6).withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Text('NUEVO', style: TextStyle(color: Color(0xFF2563EB), fontSize: 10, fontWeight: FontWeight.bold)),
                          ),
                        ],
                        if (pedido.tipoPedido == 'tienda') ...[
                          const SizedBox(width: 8),
                          Text('•', style: TextStyle(color: onSurface.withValues(alpha: 0.3), fontSize: 12)),
                          const SizedBox(width: 8),
                          const Text('Recoger', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: Colors.orange)),
                        ],
                      ],
                    ),
                    Text(
                      timeAgo, 
                      style: TextStyle(
                        color: timeAgo == 'ahora' ? Colors.red : onSurface.withValues(alpha: 0.4), 
                        fontSize: 12, 
                        fontWeight: timeAgo == 'ahora' ? FontWeight.bold : FontWeight.w400
                      )
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                
                // Cuerpo Central: Rutas (Ultra Minimalista)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'De',
                            style: TextStyle(color: onSurface.withValues(alpha: 0.4), fontSize: 11, fontWeight: FontWeight.w500),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            origenStr,
                            style: TextStyle(
                              color: onSurface.withValues(alpha: 0.9),
                              fontWeight: FontWeight.w600,
                              fontSize: 15,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    Container(width: 1, height: 30, color: onSurface.withValues(alpha: 0.1), margin: const EdgeInsets.symmetric(horizontal: 16)),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Para',
                            style: TextStyle(color: onSurface.withValues(alpha: 0.4), fontSize: 11, fontWeight: FontWeight.w500),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            destinoStr,
                            style: TextStyle(
                              color: onSurface.withValues(alpha: 0.9),
                              fontWeight: FontWeight.w600,
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
                
                if (pedido.descripcion.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: isDark ? Colors.white.withValues(alpha: 0.03) : const Color(0xFFF9FAFB),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.notes_rounded, size: 14, color: onSurface.withValues(alpha: 0.4)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            pedido.descripcion,
                            style: TextStyle(
                              color: onSurface.withValues(alpha: 0.6),
                              fontSize: 13,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
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
      PremiumToast.show(context, title: 'Atención', description: 'Selecciona un repartidor', isError: true);
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
        PremiumToast.show(context, title: 'Pedido creado', description: 'Notificado por WhatsApp 📲');
      } else {
        PremiumToast.show(context, title: 'Error', description: result.error, isError: true);
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
        child: SingleChildScrollView(
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
    case 'pendiente': return const Color(0xFFEA580C);
    case 'asignado':  return const Color(0xFF60A5FA);
    case 'recibido':  return const Color(0xFF10B981);
    case 'en_camino': return const Color(0xFFFF6B35);
    case 'entregado': return const Color(0xFF8B5CF6);
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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/supabase_config.dart';
import 'main_shell.dart' show pendingSolicitudesProvider;
import '../core/ui_helpers.dart';

// ── Provider ──────────────────────────────────────────────────────────────────
final solicitudesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final res = await supabase
      .from('restaurantes_solicitudes')
      .select()
      .eq('estado', 'pendiente')
      .order('creado_en', ascending: false);
  return List<Map<String, dynamic>>.from(res);
});

// ── Screen ────────────────────────────────────────────────────────────────────
class SolicitudesScreen extends ConsumerStatefulWidget {
  const SolicitudesScreen({super.key});

  @override
  ConsumerState<SolicitudesScreen> createState() => _SolicitudesScreenState();
}

class _SolicitudesScreenState extends ConsumerState<SolicitudesScreen> {
  final Set<String> _loading = {};

  Future<void> _handle(Map<String, dynamic> sol, bool accept) async {
    final id = sol['id'] as String;
    final tel = sol['telefono'] as String? ?? '';
    final nombre = sol['nombre_restaurante'] as String? ?? '';

    setState(() => _loading.add(id));

    try {
      if (accept) {
        // Llamar a la Edge Function admin-approval que ya tiene la lógica completa
        // (crea usuario Auth con service role, inserta en restaurantes, notifica por WA)
        final res = await supabase.functions.invoke(
          'admin-approval',
          method: HttpMethod.post,
          body: {
            'action': 'accept',
            'tel': tel,
          },
        );

        if (res.status != 200 && res.status != 201) {
          throw Exception('Error en servidor: ${res.data}');
        }

        if (mounted) {
          _showSnack('✅ $nombre aprobado — se le enviaron sus credenciales por WA', isError: false);
        }
      } else {
        // Rechazar llamando a la misma Edge Function
        final res = await supabase.functions.invoke(
          'admin-approval',
          method: HttpMethod.post,
          body: {
            'action': 'reject',
            'tel': tel,
          },
        );

        if (res.status != 200 && res.status != 201) {
          throw Exception('Error en servidor al rechazar: ${res.data}');
        }

        if (mounted) {
          _showSnack('❌ Solicitud de $nombre rechazada', isError: true);
        }
      }

      // Refrescar lista y contador global
      ref.invalidate(solicitudesProvider);
      ref.invalidate(pendingSolicitudesProvider);
    } catch (e) {
      if (mounted) _showSnack('Error: $e', isError: true);
    } finally {
      if (mounted) setState(() => _loading.remove(id));
    }
  }

  void _showSnack(String msg, {required bool isError}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: isError
            ? Theme.of(context).colorScheme.error
            : const Color(0xFF10B981),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        margin: const EdgeInsets.all(16),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final asyncData = ref.watch(solicitudesProvider);

    return Scaffold(
      backgroundColor: cs.surface,
      body: CustomScrollView(
        slivers: [
          // ── Header ──
          SliverAppBar(
            expandedHeight: 120,
            pinned: true,
            backgroundColor: cs.surface,
            elevation: 0,
            flexibleSpace: FlexibleSpaceBar(
              titlePadding: const EdgeInsets.only(left: 20, bottom: 16),
              title: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [const Color(0xFFF97316), const Color(0xFFEF4444)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(10),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFFF97316).withOpacity(0.4),
                          blurRadius: 8,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: const Icon(Icons.store_rounded, color: Colors.white, size: 18),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'Solicitudes B2B',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: cs.onSurface,
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              IconButton(
                icon: Icon(Icons.refresh_rounded, color: cs.primary),
                onPressed: () {
                  ref.invalidate(solicitudesProvider);
                  ref.invalidate(pendingSolicitudesProvider);
                },
                tooltip: 'Actualizar',
              ),
              const SizedBox(width: 8),
            ],
          ),

          // ── Contenido ──
          asyncData.when(
            loading: () => const SliverFillRemaining(
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => SliverFillRemaining(
              child: _ErrorState(message: e.toString(), onRetry: () => ref.invalidate(solicitudesProvider)),
            ),
            data: (list) {
              if (list.isEmpty) {
                return const SliverFillRemaining(child: _EmptyState());
              }
              return SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (ctx, i) {
                      final sol = list[i];
                      return _SolicitudCard(
                        sol: sol,
                        isLoading: _loading.contains(sol['id']),
                        onAccept: () => _confirm(sol, true),
                        onReject: () => _confirm(sol, false),
                      );
                    },
                    childCount: list.length,
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Future<void> _confirm(Map<String, dynamic> sol, bool accept) async {
    final nombre = sol['nombre_restaurante'] ?? '';
    final confirmed = await PremiumBottomSheet.showConfirm(
      context,
      title: accept ? '¿Aprobar solicitud?' : '¿Rechazar solicitud?',
      content: accept
          ? 'Se creará el acceso para "$nombre" y recibirán sus credenciales.'
          : 'Se notificará a "$nombre" que su solicitud fue rechazada.',
      confirmText: accept ? 'Aprobar' : 'Rechazar',
      cancelText: 'Cancelar',
      isDestructive: !accept,
    );
    if (confirmed == true) _handle(sol, accept);
  }
}

// ── Tarjeta de Solicitud ──────────────────────────────────────────────────────
class _SolicitudCard extends StatelessWidget {
  final Map<String, dynamic> sol;
  final bool isLoading;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  const _SolicitudCard({
    required this.sol,
    required this.isLoading,
    required this.onAccept,
    required this.onReject,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final nombre = sol['nombre_restaurante'] ?? '—';
    final encargado = sol['encargado'] ?? '—';
    final categoria = sol['categoria'] ?? '—';
    final direccion = sol['direccion'] ?? '—';
    final tel = sol['telefono'] ?? '—';
    final fecha = sol['creado_en'] != null
        ? _formatFecha(sol['creado_en'] as String)
        : '—';

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isDark ? Colors.white.withOpacity(0.07) : Colors.black.withOpacity(0.06),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(isDark ? 0.25 : 0.06),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header de la tarjeta ──
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  const Color(0xFFF97316).withOpacity(0.12),
                  const Color(0xFFEF4444).withOpacity(0.06),
                ],
              ),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFFF97316), Color(0xFFEF4444)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Center(
                    child: Text(
                      nombre.isNotEmpty ? nombre[0].toUpperCase() : '?',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        nombre,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: cs.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        categoria,
                        style: TextStyle(
                          fontSize: 12,
                          color: const Color(0xFFF97316),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF59E0B).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: const Color(0xFFF59E0B).withOpacity(0.4)),
                  ),
                  child: const Text(
                    'Pendiente',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFFF59E0B),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // ── Detalles ──
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                _InfoRow(icon: Icons.person_rounded, label: 'Encargado', value: encargado),
                _InfoRow(icon: Icons.phone_rounded, label: 'Teléfono', value: tel),
                _InfoRow(icon: Icons.location_on_rounded, label: 'Dirección', value: direccion),
                _InfoRow(icon: Icons.calendar_today_rounded, label: 'Solicitud', value: fecha),
              ],
            ),
          ),

          // ── Acciones ──
          if (isLoading)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            )
          else
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: onReject,
                      icon: const Icon(Icons.close_rounded, size: 18),
                      label: const Text('Rechazar'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: cs.error,
                        side: BorderSide(color: cs.error.withOpacity(0.5)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: FilledButton.icon(
                      onPressed: onAccept,
                      icon: const Icon(Icons.check_circle_rounded, size: 18),
                      label: const Text('Aprobar'),
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF10B981),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  String _formatFecha(String raw) {
    try {
      final dt = DateTime.parse(raw).toLocal();
      return '${dt.day}/${dt.month}/${dt.year} ${dt.hour}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return raw;
    }
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15, color: cs.primary),
          const SizedBox(width: 8),
          Text(
            '$label: ',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: cs.onSurfaceVariant,
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 13,
                color: cs.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Empty State ───────────────────────────────────────────────────────────────
class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [const Color(0xFF10B981).withOpacity(0.15), const Color(0xFF10B981).withOpacity(0.05)],
              ),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check_circle_outline_rounded, size: 40, color: Color(0xFF10B981)),
          ),
          const SizedBox(height: 20),
          Text(
            '¡Todo al día!',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: cs.onSurface,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'No hay solicitudes pendientes\npor revisar en este momento.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, color: cs.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

// ── Error State ───────────────────────────────────────────────────────────────
class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.error_outline_rounded, size: 48, color: cs.error),
          const SizedBox(height: 16),
          Text('Error al cargar', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: cs.onSurface)),
          const SizedBox(height: 8),
          Text(message, style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant), textAlign: TextAlign.center),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('Reintentar'),
          ),
        ],
      ),
    );
  }
}

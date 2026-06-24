// lib/screens/dashboard_screen.dart — Minimalist Premium Dashboard
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:fl_chart/fl_chart.dart';
import '../services/cliente_service.dart';
import '../services/pdf_service.dart';
import '../services/repartidor_service.dart';
import '../services/gasto_service.dart';
import '../services/dashboard_service.dart';
import '../core/user_role.dart';
import '../core/connectivity_provider.dart';
import '../core/theme_provider.dart';
import '../core/theme.dart';
import 'pedidos_screen.dart';
import 'main_shell.dart' show pendingSolicitudesProvider;

final statsProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final isAdmin = ref.watch(isAdminProvider);
  if (isAdmin) {
    return ref.read(dashboardServiceProvider).getDailyStats();
  } else {
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) return {'servicios': 0, 'ganancias': 0.0, 'gratis': 0};
    
    // Conseguir el repartidor_id
    final repId = await ref.read(repartidorServiceProvider).getRepartidorIdByUserId(userId);
    if (repId == null) return {'servicios': 0, 'ganancias': 0.0, 'gratis': 0};

    return ref.read(dashboardServiceProvider).getDriverDailyStats(repId);
  }
});

final weeklyStatsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final isAdmin = ref.watch(isAdminProvider);
  if (isAdmin) {
    return ref.read(dashboardServiceProvider).getWeeklyStats();
  } else {
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) return [];
    final repId = await ref.read(repartidorServiceProvider).getRepartidorIdByUserId(userId);
    if (repId == null) return [];
    return ref.read(dashboardServiceProvider).getWeeklyStats(repartidorId: repId);
  }
});

final topRestaurantesProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  return ref.read(dashboardServiceProvider).getTopRestaurantes();
});

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(statsProvider);
    final user = Supabase.instance.client.auth.currentUser;
    final isAdmin = ref.watch(isAdminProvider);
    final themeMode = ref.watch(themeProvider);
    final userNameAsync = ref.watch(userNameProvider);

    final isDark = Theme.of(context).brightness == Brightness.dark;
    debugPrint('🚀 DashboardScreen build disparado | themeMode: $themeMode | isDark: $isDark');

    final hour = DateTime.now().hour;
    final greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    final userName = userNameAsync.value ?? (user?.email ?? 'Admin').split('@').first;

    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: RefreshIndicator(
        color: cs.primary,
        backgroundColor: Theme.of(context).cardTheme.color ?? cs.surface,
        onRefresh: () async {
          ref.invalidate(statsProvider);
          ref.invalidate(pedidosActivosProvider);
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
          slivers: [
            // ── Premium Glassmorphism AppBar ──
            SliverAppBar(
              expandedHeight: 100,
              pinned: true,
              backgroundColor: Colors.transparent,
              elevation: 0,
              flexibleSpace: ClipRRect(
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                  child: Container(
                    decoration: BoxDecoration(
                      color: Theme.of(context).brightness == Brightness.dark 
                          ? Colors.black.withOpacity(0.4) 
                          : Colors.white.withOpacity(0.7),
                      border: Border(
                        bottom: BorderSide(
                          color: Theme.of(context).brightness == Brightness.dark
                              ? Colors.white.withOpacity(0.05)
                              : Colors.black.withOpacity(0.05),
                          width: 1,
                        ),
                      ),
                    ),
                    child: FlexibleSpaceBar(
                      titlePadding: const EdgeInsets.only(left: 24, bottom: 16),
                      title: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            greeting,
                            style: TextStyle(
                              fontSize: 10,
                              color: cs.onSurfaceVariant,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 0.5,
                            ),
                          ),
                          Text(
                            userName,
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              color: cs.onSurface,
                              letterSpacing: -0.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              actions: [
                _OfflineBadge(),
                _ThemeSwitcher(themeMode: themeMode),
                if (isAdmin)
                  IconButton(
                    icon: Icon(Icons.settings_rounded, color: cs.onSurfaceVariant),
                    onPressed: () => context.push('/config'),
                  ),
                const SizedBox(width: 8),
              ],
            ),

            // ── Content ──
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 120),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  
                  // ── Hero Vital Stats ──
                  _VitalStatsCard(statsAsync: statsAsync, isAdmin: isAdmin),
                  const SizedBox(height: 24),

                  // ── Top Restaurantes (Movimiento Semanal) ──
                  if (isAdmin) ...[
                    _TopRestaurantesWidget(topAsync: ref.watch(topRestaurantesProvider)),
                    const SizedBox(height: 32),
                  ],

                  // ── Bento Box Grid ──
                  if (isAdmin) ...[
                    Text(
                  // ── Estadísticas Semanales (Gráfico) ──
                  const SizedBox(height: 32),
                  Text(
                    'Rendimiento Semanal',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: cs.onSurface,
                      letterSpacing: -0.3,
                    ),
                  ),
                  const SizedBox(height: 16),
                  _WeeklyChartCard(weeklyAsync: ref.watch(weeklyStatsProvider)),

                  // ── Exportación a PDF (Admin) ──
                  if (isAdmin) ...[
                    const SizedBox(height: 24),
                    ElevatedButton.icon(
                      onPressed: () async {
                        try {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Generando PDF...')),
                          );
                          await ref.read(pdfServiceProvider).generateAndPrintCorteCaja();
                        } catch (e) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Error al generar PDF: $e')),
                          );
                        }
                      },
                      icon: const Icon(Icons.picture_as_pdf_rounded),
                      label: const Text('Exportar Corte a PDF'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: cs.primaryContainer,
                        foregroundColor: cs.onPrimaryContainer,
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                    ),
                  ],

                  // ── Top Restaurantes ──
                  if (isAdmin) ...[
                    const SizedBox(height: 32),
                    _BentoGrid(),
                    const SizedBox(height: 32),
                  ],

                  // ── Logout ──
                  const SizedBox(height: 20),
                  Center(
                    child: TextButton.icon(
                      onPressed: () {
                        context.go('/login');
                        Supabase.instance.client.auth.signOut();
                      },
                      icon: Icon(Icons.logout_rounded, size: 18, color: cs.error),
                      label: Text('Cerrar sesión', style: TextStyle(color: cs.error, fontSize: 14, fontWeight: FontWeight.w700)),
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                    ),
                  ),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

class _OfflineBadge extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final conn = ref.watch(connectivityProvider);
    final isOffline = conn.valueOrNull == false;

    if (!isOffline) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(right: 8),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.error.withOpacity(0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Theme.of(context).colorScheme.error.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Icon(Icons.wifi_off_rounded, color: Theme.of(context).colorScheme.error, size: 14),
          const SizedBox(width: 6),
          Text('Offline', style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 11, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}

class _ThemeSwitcher extends ConsumerWidget {
  final AppThemeMode themeMode;
  const _ThemeSwitcher({required this.themeMode});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(right: 8),
      decoration: BoxDecoration(
        color: cs.surfaceContainerHighest.withOpacity(0.5),
        shape: BoxShape.circle,
      ),
      child: IconButton(
        icon: Icon(
          themeMode == AppThemeMode.light ? Icons.light_mode_rounded :
          themeMode == AppThemeMode.amoled ? Icons.nightlight_round : Icons.dark_mode_rounded,
          size: 20,
          color: cs.onSurfaceVariant,
        ),
        onPressed: () {
          debugPrint('🔘 Botón de Tema presionado. Cambiando...');
          ref.read(themeProvider.notifier).cycleTheme();
        },
      ),
    );
  }
}

class _VitalStatsCard extends StatelessWidget {
  final AsyncValue<Map<String, dynamic>> statsAsync;
  final bool isAdmin;

  const _VitalStatsCard({required this.statsAsync, required this.isAdmin});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF16161E) : Colors.white,
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: isDark ? Colors.white.withOpacity(0.05) : Colors.black.withOpacity(0.05)),
        boxShadow: isDark ? [] : [
          BoxShadow(
            color: theme.colorScheme.primary.withOpacity(0.06),
            blurRadius: 30,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: statsAsync.when(
        loading: () => Center(child: CircularProgressIndicator(color: theme.colorScheme.primary)),
        error: (e, _) => Center(child: Text('Error: $e', style: TextStyle(color: theme.colorScheme.error))),
        data: (stats) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primary.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(Icons.speed_rounded, color: theme.colorScheme.primary, size: 24),
                  ),
                  const SizedBox(width: 16),
                  Text(
                    'Servicios Hoy',
                    style: TextStyle(
                      color: theme.colorScheme.onSurface.withOpacity(0.6),
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TweenAnimationBuilder<double>(
                duration: const Duration(milliseconds: 1500),
                curve: Curves.easeOutCubic,
                tween: Tween<double>(begin: 0, end: (stats['servicios'] ?? 0).toDouble()),
                builder: (context, value, child) {
                  return Text(
                    value.toInt().toString(),
                    style: TextStyle(
                      color: theme.colorScheme.onSurface,
                      fontSize: 56,
                      fontWeight: FontWeight.w900,
                      height: 1.0,
                      letterSpacing: -2,
                    ),
                  );
                },
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  if (isAdmin) _MiniStat(
                    label: 'Ingresos Hoy', 
                    value: stats['ganancias'] ?? 0.0,
                    isCurrency: true,
                    color: const Color(0xFF10B981),
                  ),
                  if (isAdmin) const SizedBox(width: 32),
                  _MiniStat(
                    label: 'Gratis Hoy', 
                    value: stats['gratis'] ?? 0,
                    color: theme.colorScheme.onSurface.withOpacity(0.8),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final num value;
  final bool isCurrency;
  final Color? color;
  const _MiniStat({required this.label, required this.value, this.isCurrency = false, this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withOpacity(0.4), fontSize: 12, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 4),
        TweenAnimationBuilder<double>(
          duration: const Duration(milliseconds: 1500),
          curve: Curves.easeOutCubic,
          tween: Tween<double>(begin: 0, end: value.toDouble()),
          builder: (context, val, child) {
            final formatted = isCurrency ? '\$${val.toStringAsFixed(2)}' : val.toInt().toString();
            return Text(
              formatted,
              style: TextStyle(color: color ?? Theme.of(context).colorScheme.onSurface, fontSize: 18, fontWeight: FontWeight.w800),
            );
          },
        ),
      ],
    );
  }
}

class _BentoGrid extends ConsumerWidget {
  const _BentoGrid({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pendingAsync = ref.watch(pendingSolicitudesProvider);
    final pendingCount = pendingAsync.valueOrNull ?? 0;

    return Column(
      children: [
        // Fila 1: Asimétrica (Mapa grande, Aliados pequeño)
        Row(
          children: [
            Expanded(
              flex: 5,
              child: SizedBox(
                height: 160,
                child: _BentoItem(
                  title: 'Mapa',
                  subtitle: 'Rastreo de flota en vivo',
                  icon: Icons.map_rounded,
                  color: const Color(0xFF10B981),
                  onTap: () => context.push('/map'),
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              flex: 4,
              child: SizedBox(
                height: 160,
                child: _BentoItem(
                  title: 'Aliados',
                  subtitle: pendingCount > 0 ? '$pendingCount pendientes' : 'Gestión B2B',
                  icon: Icons.storefront_rounded,
                  color: const Color(0xFFF97316),
                  badgeCount: pendingCount,
                  onTap: () => context.go('/solicitudes'),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        // Fila 2: Simétrica
        Row(
          children: [
            Expanded(
              child: SizedBox(
                height: 140,
                child: _BentoItem(
                  title: 'Gastos',
                  subtitle: 'Finanzas flota',
                  icon: Icons.receipt_long_rounded,
                  color: const Color(0xFF8B5CF6),
                  onTap: () => context.go('/gastos'),
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: SizedBox(
                height: 140,
                child: _BentoItem(
                  title: 'Líderes',
                  subtitle: 'Ranking',
                  icon: Icons.emoji_events_rounded,
                  color: const Color(0xFFF59E0B),
                  onTap: () => context.push('/leaderboard'),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        // Fila 3: Asimétrica inversa (Mi Servicio pequeño, Corte grande)
        Row(
          children: [
            Expanded(
              flex: 4,
              child: SizedBox(
                height: 140,
                child: _BentoItem(
                  title: 'Mi Servicio',
                  subtitle: 'Registrar',
                  icon: Icons.two_wheeler_rounded,
                  color: const Color(0xFF06B6D4),
                  onTap: () => _agregarMiServicio(context, ref),
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              flex: 5,
              child: SizedBox(
                height: 140,
                child: _BentoItem(
                  title: 'Corte Hoy',
                  subtitle: 'Generar e Imprimir PDF',
                  icon: Icons.print_rounded,
                  color: Theme.of(context).colorScheme.error,
                  onTap: () => _printCorte(context, ref),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _printCorte(BuildContext context, WidgetRef ref) async {
    try {
      final conn = await Connectivity().checkConnectivity();
      if (conn.contains(ConnectivityResult.none) || conn.isEmpty) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('⚠️ Se requiere internet para el Corte.', style: TextStyle(color: Colors.white)),
              backgroundColor: Theme.of(context).colorScheme.error.withOpacity(0.9),
            ),
          );
        }
        return;
      }
      await ref.read(pdfServiceProvider).generateAndPrintCorteCaja();
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  void _agregarMiServicio(BuildContext context, WidgetRef ref) {
    final montoCtrl = TextEditingController();
    final descripcionCtrl = TextEditingController();
    bool isLoading = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) {
          return Padding(
            padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 40, height: 4,
                      decoration: BoxDecoration(color: Colors.grey.withOpacity(0.3), borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Text('Registrar Mi Servicio', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 24),
                  TextField(
                    controller: montoCtrl,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: 'Costo del Servicio (\$)',
                      prefixIcon: const Icon(Icons.attach_money_rounded),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                      filled: true,
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: descripcionCtrl,
                    decoration: InputDecoration(
                      labelText: 'Descripción / Motivo',
                      prefixIcon: const Icon(Icons.description_rounded),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                      filled: true,
                    ),
                  ),
                  const SizedBox(height: 32),
                  FilledButton(
                    onPressed: isLoading ? null : () async {
                      if (montoCtrl.text.isEmpty) return;
                      final monto = double.tryParse(montoCtrl.text);
                      if (monto == null) return;
                      
                      setModalState(() => isLoading = true);
                      try {
                        final myRepId = await ref.read(repartidorServiceProvider).getRepartidorIdByUserId(Supabase.instance.client.auth.currentUser!.id);
                        if (myRepId != null) {
                          await ref.read(gastoServiceProvider).addGasto(
                            'Mi Servicio: ${descripcionCtrl.text}', 
                            monto,
                            isAdmin: false,
                            repartidorId: myRepId,
                            tipoGasto: 'Reparación'
                          );
                          if (ctx.mounted) {
                            Navigator.pop(ctx);
                            ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content: Text('Servicio guardado exitosamente')));
                          }
                        }
                      } catch (e) {
                        if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text('Error: $e')));
                      } finally {
                        if (ctx.mounted) setModalState(() => isLoading = false);
                      }
                    },
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: isLoading ? const CircularProgressIndicator(color: Colors.white) : const Text('Guardar', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _BentoItem extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  final int badgeCount;

  const _BentoItem({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.onTap,
    this.badgeCount = 0,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cs = Theme.of(context).colorScheme;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFF9FAFB),
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: isDark ? Colors.white.withOpacity(0.04) : Colors.black.withOpacity(0.03)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(icon, color: color, size: 22),
                ),
                if (badgeCount > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: cs.error,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text(
                      badgeCount.toString(),
                      style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w900),
                    ),
                  ),
              ],
            ),
            const Spacer(),
            Text(
              title,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: cs.onSurface,
                letterSpacing: -0.3,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: badgeCount > 0 ? color : cs.onSurface.withOpacity(0.4),
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

class _TopRestaurantesWidget extends StatelessWidget {
  final AsyncValue<List<Map<String, dynamic>>> topAsync;

  const _TopRestaurantesWidget({required this.topAsync});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final cs = theme.colorScheme;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF16161E) : Colors.white,
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: isDark ? Colors.white.withOpacity(0.05) : Colors.black.withOpacity(0.05)),
        boxShadow: isDark ? [] : [
          BoxShadow(
            color: cs.primary.withOpacity(0.06),
            blurRadius: 30,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Top Restaurantes',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: cs.onSurface,
                  letterSpacing: -0.5,
                ),
              ),
              const Icon(Icons.local_fire_department_rounded, color: Color(0xFFFF6B35), size: 22),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Los más solicitados esta semana',
            style: TextStyle(color: cs.onSurface.withOpacity(0.5), fontSize: 13, fontWeight: FontWeight.w500),
          ),
          const SizedBox(height: 24),
          topAsync.when(
            loading: () => Center(child: CircularProgressIndicator(color: cs.primary)),
            error: (e, _) => Center(child: Text('Error: $e')),
            data: (data) {
              if (data.isEmpty) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 20),
                    child: Text('Aún no hay suficientes datos.', style: TextStyle(color: cs.onSurface.withOpacity(0.4))),
                  ),
                );
              }

              return Column(
                children: List.generate(data.length, (i) {
                  final item = data[i];
                  final isFirst = i == 0;
                  
                  Color getRankColor() {
                    if (i == 0) return const Color(0xFFF59E0B); // Oro
                    if (i == 1) return const Color(0xFF94A3B8); // Plata
                    if (i == 2) return const Color(0xFFD97706); // Bronce
                    return cs.onSurface.withOpacity(0.3);       // Otros
                  }
                  
                  final rankColor = getRankColor();

                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: isDark ? [] : [
                        BoxShadow(
                          color: cs.primary.withOpacity(0.04),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ],
                      border: Border.all(color: isDark ? Colors.white.withOpacity(0.02) : Colors.black.withOpacity(0.02)),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 38,
                          height: 38,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: i < 3 ? rankColor.withOpacity(0.15) : cs.onSurface.withOpacity(0.04),
                            shape: BoxShape.circle,
                            border: isFirst ? Border.all(color: rankColor.withOpacity(0.3), width: 1.5) : null,
                          ),
                          child: Text(
                            '${i + 1}',
                            style: TextStyle(
                              color: i < 3 ? rankColor : cs.onSurface.withOpacity(0.6),
                              fontWeight: FontWeight.w900,
                              fontSize: 16,
                            ),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Text(
                            item['nombre'],
                            style: TextStyle(
                              fontSize: isFirst ? 16 : 15,
                              fontWeight: isFirst ? FontWeight.w800 : FontWeight.w600,
                              color: cs.onSurface.withOpacity(isFirst ? 1.0 : 0.8),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF2A2A2D) : const Color(0xFFF4F4F5),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: isDark ? Colors.white.withOpacity(0.05) : Colors.black.withOpacity(0.03)),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.shopping_bag_rounded, size: 16, color: rankColor.withOpacity(0.9)),
                              const SizedBox(width: 6),
                              Text(
                                '${item['pedidos']}',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w900,
                                  color: cs.onSurface.withOpacity(0.9),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                }),
              );
            },
          ),
        ],
      ),
    );
  }
}

// ── Gráfico Semanal ────────────────────────────────────────────────────────
class _WeeklyChartCard extends StatelessWidget {
  final AsyncValue<List<Map<String, dynamic>>> weeklyAsync;

  const _WeeklyChartCard({required this.weeklyAsync});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final primaryColor = Theme.of(context).colorScheme.primary;

    return Container(
      width: double.infinity,
      height: 220,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF16161E) : Colors.white,
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: isDark ? Colors.white.withOpacity(0.05) : Colors.black.withOpacity(0.05)),
        boxShadow: isDark ? [] : [
          BoxShadow(
            color: primaryColor.withOpacity(0.06),
            blurRadius: 30,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: weeklyAsync.when(
        loading: () => Center(child: CircularProgressIndicator(color: primaryColor)),
        error: (e, _) => Center(child: Text('Error: $e', style: TextStyle(color: Theme.of(context).colorScheme.error))),
        data: (stats) {
          if (stats.isEmpty) return const Center(child: Text('Sin datos'));

          // Encontrar el valor máximo para la escala Y
          double maxY = 0;
          for (var s in stats) {
            if ((s['ganancias'] as double) > maxY) maxY = s['ganancias'] as double;
          }
          if (maxY == 0) maxY = 100; // default si está vacío

          return LineChart(
            LineChartData(
              gridData: FlGridData(
                show: true,
                drawVerticalLine: false,
                horizontalInterval: maxY > 0 ? (maxY / 4 == 0 ? 1 : maxY / 4) : 1,
                getDrawingHorizontalLine: (value) => FlLine(color: isDark ? Colors.white10 : Colors.black12, strokeWidth: 1, dashArray: [5, 5]),
              ),
              titlesData: FlTitlesData(
                show: true,
                rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 22,
                    getTitlesWidget: (value, meta) {
                      final int index = value.toInt();
                      if (index >= 0 && index < stats.length) {
                        return Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            stats[index]['day'] as String,
                            style: TextStyle(color: isDark ? Colors.white54 : Colors.black54, fontSize: 10, fontWeight: FontWeight.bold),
                          ),
                        );
                      }
                      return const SizedBox();
                    },
                  ),
                ),
              ),
              borderData: FlBorderData(show: false),
              minX: 0,
              maxX: (stats.length - 1).toDouble(),
              minY: 0,
              maxY: maxY * 1.2,
              lineBarsData: [
                LineChartBarData(
                  spots: stats.asMap().entries.map((e) => FlSpot(e.key.toDouble(), e.value['ganancias'] as double)).toList(),
                  isCurved: true,
                  color: primaryColor,
                  barWidth: 4,
                  isStrokeCapRound: true,
                  dotData: const FlDotData(show: false),
                  belowBarData: BarAreaData(
                    show: true,
                    gradient: LinearGradient(
                      colors: [primaryColor.withOpacity(0.3), primaryColor.withOpacity(0.0)],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

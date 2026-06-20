// lib/screens/dashboard_screen.dart — Minimalist Premium Dashboard
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
  return ref.read(dashboardServiceProvider).getDailyStats();
});

final chartDataProvider = FutureProvider<List<int>>((ref) async {
  return ref.read(clienteServiceProvider).getWeeklyChartData();
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
            // ── Minimalist AppBar ──
            SliverAppBar(
              expandedHeight: 100,
              pinned: true,
              backgroundColor: Theme.of(context).scaffoldBackgroundColor,
              elevation: 0,
              flexibleSpace: FlexibleSpaceBar(
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

                  // ── Weekly Activity Chart ──
                  if (isAdmin) ...[
                    _ActivityChart(chartDataAsync: ref.watch(chartDataProvider)),
                    const SizedBox(height: 32),
                  ],

                  // ── Bento Box Grid ──
                  if (isAdmin) ...[
                    Text(
                      'Herramientas',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: cs.onSurface,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 16),
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
        onPressed: () => ref.read(themeProvider.notifier).cycleTheme(),
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
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: AppGradients.brand,
        borderRadius: BorderRadius.circular(32),
        boxShadow: [
          BoxShadow(
            color: AppColors.brandRed.withOpacity(0.3),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: statsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Colors.white)),
        error: (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: Colors.white))),
        data: (stats) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(Icons.speed_rounded, color: Colors.white, size: 24),
                  ),
                  const SizedBox(width: 16),
                  const Text(
                    'Servicios Hoy',
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                '${stats['servicios'] ?? 0}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 56,
                  fontWeight: FontWeight.w900,
                  height: 1.0,
                  letterSpacing: -2,
                ),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  if (isAdmin) _MiniStat(label: 'Ingresos Hoy', value: '\$${(stats['ganancias'] ?? 0.0).toStringAsFixed(2)}'),
                  if (isAdmin) const SizedBox(width: 24),
                  _MiniStat(label: 'Gratis Hoy', value: '${stats['gratis'] ?? 0}'),
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
  final String value;
  const _MiniStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 12, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800),
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
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: isDark ? Colors.white.withOpacity(0.05) : Colors.black.withOpacity(0.05)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(isDark ? 0.2 : 0.04),
              blurRadius: 16,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(icon, color: color, size: 20),
                ),
                if (badgeCount > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: cs.error,
                      borderRadius: BorderRadius.circular(12),
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
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: cs.onSurface,
                letterSpacing: -0.3,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: badgeCount > 0 ? color : cs.onSurfaceVariant,
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

class _ActivityChart extends StatelessWidget {
  final AsyncValue<List<int>> chartDataAsync;

  const _ActivityChart({required this.chartDataAsync});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cs = Theme.of(context).colorScheme;

    return Container(
      width: double.infinity,
      height: 200,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: isDark ? Colors.white.withOpacity(0.05) : Colors.black.withOpacity(0.05)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(isDark ? 0.2 : 0.04),
            blurRadius: 16,
            offset: const Offset(0, 8),
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
                'Actividad Semanal',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: cs.onSurface,
                  letterSpacing: -0.3,
                ),
              ),
              Icon(Icons.bar_chart_rounded, color: cs.primary, size: 20),
            ],
          ),
          const SizedBox(height: 16),
          Expanded(
            child: chartDataAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Error: $e')),
              data: (data) {
                if (data.isEmpty || data.every((e) => e == 0)) {
                  return Center(
                    child: Text('Aún no hay datos para esta semana', style: TextStyle(color: cs.onSurfaceVariant, fontSize: 12)),
                  );
                }

                final maxVal = data.reduce((curr, next) => curr > next ? curr : next).toDouble();
                final days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

                return BarChart(
                  BarChartData(
                    alignment: BarChartAlignment.spaceAround,
                    maxY: maxVal == 0 ? 1 : maxVal * 1.2,
                    barTouchData: BarTouchData(enabled: false),
                    titlesData: FlTitlesData(
                      show: true,
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          getTitlesWidget: (value, meta) {
                            if (value < 0 || value >= days.length) return const SizedBox();
                            return Padding(
                              padding: const EdgeInsets.only(top: 8.0),
                              child: Text(
                                days[value.toInt()],
                                style: TextStyle(color: cs.onSurfaceVariant, fontSize: 10, fontWeight: FontWeight.bold),
                              ),
                            );
                          },
                        ),
                      ),
                      leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    ),
                    gridData: const FlGridData(show: false),
                    borderData: FlBorderData(show: false),
                    barGroups: List.generate(data.length, (i) {
                      return BarChartGroupData(
                        x: i,
                        barRods: [
                          BarChartRodData(
                            toY: data[i].toDouble(),
                            color: cs.primary,
                            width: 12,
                            borderRadius: BorderRadius.circular(6),
                            backDrawRodData: BackgroundBarChartRodData(
                              show: true,
                              toY: maxVal == 0 ? 1 : maxVal * 1.2,
                              color: isDark ? Colors.white.withOpacity(0.05) : Colors.black.withOpacity(0.03),
                            ),
                          ),
                        ],
                      );
                    }),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

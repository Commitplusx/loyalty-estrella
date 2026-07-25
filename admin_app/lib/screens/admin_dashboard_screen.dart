// lib/screens/dashboard_screen.dart — Minimalist Premium Dashboard
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../widgets/live_fleet_map.dart';
import '../core/ui_helpers.dart';
import '../widgets/friendly_error_widget.dart';
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

final weeklyStatsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  return ref.read(dashboardServiceProvider).getWeeklyStats();
});

final topRestaurantesProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  return ref.read(dashboardServiceProvider).getTopRestaurantes();
});

class AdminDashboardScreen extends ConsumerWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(statsProvider);
    final user = Supabase.instance.client.auth.currentUser;
    final themeMode = ref.watch(themeProvider);
    final userNameAsync = ref.watch(userNameProvider);

    final isDark = Theme.of(context).brightness == Brightness.dark;
    debugPrint('🚀 DashboardScreen build disparado | themeMode: $themeMode | isDark: $isDark');

    final hour = DateTime.now().hour;
    final greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    final userName = (userNameAsync.value ?? (user?.email ?? 'Admin').split('@').first).split(' ').first;

    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0A0A0A) : const Color(0xFFF5F5F7),
      body: RefreshIndicator(
        color: isDark ? Colors.white : Colors.black,
        backgroundColor: isDark ? const Color(0xFF1A1A1A) : Colors.white,
        onRefresh: () async {
          ref.invalidate(statsProvider);
          ref.invalidate(pedidosActivosProvider);
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
          slivers: [
            // ── Header Premium ──
            SliverAppBar(
              expandedHeight: 120,
              pinned: true,
              automaticallyImplyLeading: false,
              backgroundColor: isDark ? const Color(0xFF0A0A0A) : const Color(0xFFF5F5F7),
              elevation: 0,
              surfaceTintColor: Colors.transparent,
              bottom: PreferredSize(
                preferredSize: const Size.fromHeight(1),
                child: Container(
                  height: 1,
                  color: isDark ? Colors.white.withValues(alpha: 0.06) : Colors.black.withValues(alpha: 0.08),
                ),
              ),
              flexibleSpace: FlexibleSpaceBar(
                centerTitle: true,
                titlePadding: const EdgeInsets.only(bottom: 16),
                title: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    // Badge de Admin
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                      decoration: BoxDecoration(
                        color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.06),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(width: 6, height: 6,
                            decoration: const BoxDecoration(color: Color(0xFF22C55E), shape: BoxShape.circle)),
                          const SizedBox(width: 5),
                          Text('ADMINISTRADOR',
                            style: TextStyle(
                              fontSize: 8,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.2,
                              color: isDark ? Colors.white70 : Colors.black54,
                            )),
                        ],
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$greeting, $userName',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        color: isDark ? Colors.white : Colors.black,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                _OfflineBadge(),
                _ThemeSwitcher(themeMode: themeMode),
                GestureDetector(
                  onTap: () => context.push('/config'),
                  child: Container(
                    margin: const EdgeInsets.only(right: 12),
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.07),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(Icons.settings_rounded, size: 18,
                      color: isDark ? Colors.white70 : Colors.black54),
                  ),
                ),
              ],
            ),

            // ── Content ──
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 120),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  // ── Alertas Críticas ──
                  if (statsAsync.hasValue && (statsAsync.value!['pedidosAtrasados'] as int? ?? 0) > 0)
                    _CriticalAlertsBanner(count: statsAsync.value!['pedidosAtrasados'] as int),

                  // ── Hero Card (KPI Principal) ──
                  _HeroStatsCard(statsAsync: statsAsync, isDark: isDark),
                  const SizedBox(height: 20),

                  // ── Top Restaurantes ──
                  _SectionLabel(label: 'Top Restaurantes', isDark: isDark),
                  const SizedBox(height: 10),
                  _TopRestaurantesWidget(topAsync: ref.watch(topRestaurantesProvider)),
                  const SizedBox(height: 20),

                  // ── Bento Grid de Acciones ──
                  _SectionLabel(label: 'Accesos Rápidos', isDark: isDark),
                  const SizedBox(height: 10),
                  _BentoGrid(),
                  const SizedBox(height: 20),

                  // ── Gráfico Semanal ──
                  _SectionLabel(label: 'Rendimiento Semanal', isDark: isDark),
                  const SizedBox(height: 10),
                  _WeeklyChartCard(weeklyAsync: ref.watch(weeklyStatsProvider)),
                  const SizedBox(height: 20),

                  // ── Corte PDF ──
                  _PremiumActionButton(
                    icon: Icons.picture_as_pdf_rounded,
                    label: 'Exportar Corte del Día',
                    sublabel: 'Genera e imprime el PDF',
                    isDark: isDark,
                    onTap: () async {
                      try {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: const Row(children: [
                              SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
                              SizedBox(width: 12),
                              Text('Generando PDF...'),
                            ]),
                            backgroundColor: isDark ? const Color(0xFF1A1A1A) : Colors.black87,
                            behavior: SnackBarBehavior.floating,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        );
                        await ref.read(pdfServiceProvider).generateAndPrintCorteCaja();
                      } catch (e) {
                        if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Error: $e'), behavior: SnackBarBehavior.floating),
                        );
                      }
                    },
                  ),
                  const SizedBox(height: 12),

                  // ── Cerrar Sesión ──
                  Center(
                    child: TextButton(
                      onPressed: () {
                        context.go('/login');
                        Supabase.instance.client.auth.signOut();
                      },
                      child: Text('Cerrar sesión',
                        style: TextStyle(
                          color: isDark ? Colors.white38 : Colors.black38,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.2,
                        )),
                    ),
                  ),
                ]),
              ),
            )
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

// ── Section Label ──
class _SectionLabel extends StatelessWidget {
  final String label;
  final bool isDark;
  const _SectionLabel({required this.label, required this.isDark});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 4),
    child: Text(label, style: TextStyle(
      fontSize: 13,
      fontWeight: FontWeight.w700,
      letterSpacing: 0.6,
      color: isDark ? Colors.white38 : Colors.black38,
    )),
  );
}

// ── Hero Stats Card (Tarjeta oscura premium) ──
class _HeroStatsCard extends StatelessWidget {
  final AsyncValue<Map<String, dynamic>> statsAsync;
  final bool isDark;
  const _HeroStatsCard({required this.statsAsync, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final cardBg = isDark ? const Color(0xFF1A1A1A) : Colors.white;
    final borderColor = isDark ? Colors.white.withValues(alpha: 0.07) : Colors.black.withValues(alpha: 0.08);
    final labelColor = isDark ? Colors.white38 : Colors.black38;
    final textMain = isDark ? Colors.white : Colors.black;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: borderColor),
        boxShadow: isDark ? [] : [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 24,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: statsAsync.when(
        loading: () => const SizedBox(height: 140,
          child: Center(child: CircularProgressIndicator(color: Colors.black26, strokeWidth: 2))),
        error: (e, _) => Text('Error: $e', style: const TextStyle(color: Colors.redAccent)),
        data: (stats) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(children: [
                  Icon(Icons.local_shipping_rounded, color: labelColor, size: 15),
                  const SizedBox(width: 7),
                  Text('SERVICIOS HOY',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                      letterSpacing: 1.5, color: labelColor)),
                ]),
                _PulseDot(isDark: isDark),
              ],
            ),
            const SizedBox(height: 10),
            // Número gigante
            TweenAnimationBuilder<double>(
              duration: const Duration(milliseconds: 1400),
              curve: Curves.easeOutCubic,
              tween: Tween<double>(begin: 0, end: (stats['servicios'] ?? 0).toDouble()),
              builder: (_, v, __) => Text(v.toInt().toString(),
                style: TextStyle(
                  color: textMain,
                  fontSize: 80,
                  fontWeight: FontWeight.w900,
                  height: 0.95,
                  letterSpacing: -4,
                )),
            ),
            const SizedBox(height: 22),
            Container(height: 1, color: borderColor),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _HeroMiniStat(
                  label: 'INGRESOS',
                  value: stats['ganancias'] ?? 0.0,
                  isCurrency: true,
                  accent: const Color(0xFF16A34A),
                  isDark: isDark,
                ),
                Container(width: 1, height: 36, color: borderColor),
                _HeroMiniStat(
                  label: 'GASTOS',
                  value: stats['gastos'] ?? 0.0,
                  isCurrency: true,
                  accent: Theme.of(context).colorScheme.error,
                  isDark: isDark,
                ),
                Container(width: 1, height: 36, color: borderColor),
                _HeroMiniStat(
                  label: 'NETO',
                  value: stats['utilidadNeta'] ?? 0.0,
                  isCurrency: true,
                  accent: const Color(0xFF06B6D4), // Cyan
                  isDark: isDark,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _CriticalAlertsBanner extends StatelessWidget {
  final int count;
  const _CriticalAlertsBanner({required this.count});

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.error.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Theme.of(context).colorScheme.error.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(Icons.warning_amber_rounded, color: Theme.of(context).colorScheme.error),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              '⚠️ Atención: Tienes $count pedido${count == 1 ? '' : 's'} demorado${count == 1 ? '' : 's'} (más de 45 min).',
              style: TextStyle(
                color: Theme.of(context).colorScheme.error,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PulseDot extends StatefulWidget {
  final bool isDark;
  const _PulseDot({this.isDark = false});
  @override
  State<_PulseDot> createState() => _PulseDotState();
}
class _PulseDotState extends State<_PulseDot> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _anim;
  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))
      ..repeat(reverse: true);
    _anim = Tween(begin: 0.4, end: 1.0).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
  }
  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _anim,
    builder: (_, __) => Row(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 7, height: 7,
        decoration: BoxDecoration(
          color: const Color(0xFF22C55E),
          shape: BoxShape.circle,
          boxShadow: [BoxShadow(color: const Color(0xFF22C55E).withValues(alpha: _anim.value * 0.8), blurRadius: 8)],
        )),
      const SizedBox(width: 6),
      Text('En vivo', style: TextStyle(
        color: widget.isDark ? Colors.white38 : Colors.black38,
        fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
    ]),
  );
}

class _HeroMiniStat extends StatelessWidget {
  final String label;
  final double value;
  final bool isCurrency;
  final Color accent;
  final bool isDark;
  const _HeroMiniStat({required this.label, required this.value, this.isCurrency = false, required this.accent, this.isDark = false});
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.center,
    children: [
      Text(label, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700,
        letterSpacing: 1.2, color: isDark ? Colors.white38 : Colors.black38)),
      const SizedBox(height: 6),
      TweenAnimationBuilder<double>(
        duration: const Duration(milliseconds: 1200),
        curve: Curves.easeOutCubic,
        tween: Tween<double>(begin: 0, end: value),
        builder: (_, v, __) => Text(
          isCurrency ? '\$${v.toStringAsFixed(0)}' : v.toInt().toString(),
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: accent, letterSpacing: -0.5),
        ),
      ),
    ],
  );
}

// ── Premium Action Button ──
class _PremiumActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final String sublabel;
  final bool isDark;
  final VoidCallback onTap;
  const _PremiumActionButton({required this.icon, required this.label,
    required this.sublabel, required this.isDark, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1A1A1A) : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isDark ? Colors.white.withValues(alpha: 0.07) : Colors.black.withValues(alpha: 0.08),
          ),
          boxShadow: isDark ? [] : [
            BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, 2)),
          ],
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, size: 20, color: isDark ? Colors.white : Colors.black),
            ),
            const SizedBox(width: 16),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TextStyle(
                  fontSize: 14, fontWeight: FontWeight.w700,
                  color: isDark ? Colors.white : Colors.black,
                )),
                Text(sublabel, style: TextStyle(
                  fontSize: 11, color: isDark ? Colors.white38 : Colors.black38,
                )),
              ],
            )),
            Icon(Icons.arrow_forward_ios_rounded, size: 13,
              color: isDark ? Colors.white30 : Colors.black.withValues(alpha: 0.3)),
          ],
        ),
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(label,
          style: TextStyle(color: isDark ? Colors.white38 : Colors.black38, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.3)),
        const SizedBox(height: 5),
        TweenAnimationBuilder<double>(
          duration: const Duration(milliseconds: 1200),
          curve: Curves.easeOutCubic,
          tween: Tween<double>(begin: 0, end: value.toDouble()),
          builder: (context, val, _) {
            final formatted = isCurrency ? '\$${val.toStringAsFixed(0)}' : val.toInt().toString();
            return Text(formatted,
              style: TextStyle(color: color ?? (isDark ? Colors.white : Colors.black), fontSize: 17, fontWeight: FontWeight.w800));
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

    return LayoutBuilder(
      builder: (context, constraints) {
        final isMobile = constraints.maxWidth < 600;

        if (isMobile) {
          // Vista Móvil: una sola columna apilada para evitar overflow
          return Column(
            children: [
              SizedBox(
                height: 180,
                child: Stack(
                  children: [
                    const LiveFleetMap(),
                    Positioned.fill(
                      child: Material(
                        color: Colors.transparent,
                        child: InkWell(
                          onTap: () => context.push('/live-map'),
                          borderRadius: BorderRadius.circular(20),
                        ),
                      ),
                    ),
                    Positioned(
                      top: 12,
                      left: 12,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.surface.withOpacity(0.9),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.circle, color: Colors.green, size: 10),
                            const SizedBox(width: 6),
                            Text('Flota en Vivo', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 140,
                child: _BentoItem(
                  title: 'Aliados',
                  subtitle: pendingCount > 0 ? '$pendingCount pendientes' : 'Gestión B2B',
                  icon: Icons.storefront_rounded,
                  color: const Color(0xFFF97316),
                  badgeCount: pendingCount,
                  onTap: () => context.go('/solicitudes'),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 120,
                child: _BentoItem(
                  title: 'Gastos',
                  subtitle: 'Finanzas flota',
                  icon: Icons.receipt_long_rounded,
                  color: const Color(0xFF8B5CF6),
                  onTap: () => context.go('/gastos'),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 120,
                child: _BentoItem(
                  title: 'Líderes',
                  subtitle: 'Ranking',
                  icon: Icons.emoji_events_rounded,
                  color: const Color(0xFFF59E0B),
                  onTap: () => context.push('/leaderboard'),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 120,
                child: _BentoItem(
                  title: 'Promociones',
                  subtitle: 'Marketing',
                  icon: Icons.local_offer_rounded,
                  color: const Color(0xFFEC4899),
                  onTap: () => context.go('/promociones'),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 120,
                child: _BentoItem(
                  title: 'Mi Servicio',
                  subtitle: 'Registrar',
                  icon: Icons.two_wheeler_rounded,
                  color: const Color(0xFF06B6D4),
                  onTap: () => _agregarMiServicio(context, ref),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 120,
                child: _BentoItem(
                  title: 'Corte Hoy',
                  subtitle: 'Generar PDF',
                  icon: Icons.print_rounded,
                  color: Theme.of(context).colorScheme.error,
                  onTap: () => _printCorte(context, ref),
                ),
              ),
            ],
          );
        }

        // Vista Web/Tablet: Grid Bento
        return Column(
          children: [
            // Fila 1: Asimétrica (Mapa grande, Aliados pequeño)
            Row(
              children: [
                Expanded(
                  flex: 5,
                  child: SizedBox(
                    height: 160,
                    child: Stack(
                      children: [
                        const LiveFleetMap(),
                        Positioned.fill(
                          child: Material(
                            color: Colors.transparent,
                            child: InkWell(
                              onTap: () => context.push('/live-map'),
                              borderRadius: BorderRadius.circular(20),
                            ),
                          ),
                        ),
                        Positioned(
                          top: 12,
                          left: 12,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: Theme.of(context).colorScheme.surface.withOpacity(0.9),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.circle, color: Colors.green, size: 10),
                                const SizedBox(width: 6),
                                Text('Flota en Vivo', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                              ],
                            ),
                          ),
                        ),
                      ],
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
                      subtitle: 'Generar PDF',
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
      },
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
    final cardBg = isDark ? const Color(0xFF1A1A1A) : Colors.white;
    final borderColor = isDark ? Colors.white.withValues(alpha: 0.06) : Colors.black.withValues(alpha: 0.08);
    final iconBg = isDark ? Colors.white.withValues(alpha: 0.09) : Colors.black.withValues(alpha: 0.06);
    final textMain = isDark ? Colors.white : Colors.black;
    final textSub = isDark ? Colors.white54 : Colors.black45;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: cardBg,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: borderColor),
          boxShadow: isDark ? [] : [
            BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, 2)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.all(9),
                  decoration: BoxDecoration(
                    color: iconBg,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: textMain, size: 18),
                ),
                if (badgeCount > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.red.shade400,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      badgeCount.toString(),
                      style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900),
                    ),
                  ),
              ],
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: textMain, letterSpacing: -0.3, height: 1.1),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500,
                    color: badgeCount > 0 ? Colors.orange.shade600 : textSub),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
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
        color: isDark ? const Color(0xFF1A1A1A) : Colors.white,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: isDark ? Colors.white.withValues(alpha: 0.06) : Colors.black.withValues(alpha: 0.08)),
        boxShadow: isDark ? [] : [
          BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 20, offset: const Offset(0, 4)),
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

                  Color rankColor;
                  if (i == 0) rankColor = const Color(0xFFF59E0B);
                  else if (i == 1) rankColor = const Color(0xFF94A3B8);
                  else if (i == 2) rankColor = const Color(0xFFD97706);
                  else rankColor = Colors.black26;

                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFF9F9F9),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.06),
                      ),
                    ),
                    child: Row(
                      children: [
                        // Imagen del restaurante
                        ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: (item['imagen_url'] != null && (item['imagen_url'] as String).isNotEmpty)
                            ? Image.network(
                                item['imagen_url'] as String,
                                width: 46,
                                height: 46,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => _RestaurantFallback(rankColor: rankColor, index: i),
                              )
                            : _RestaurantFallback(rankColor: rankColor, index: i),
                        ),
                        const SizedBox(width: 14),
                        // Nombre + pedidos
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item['nombre'] ?? '',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: isFirst ? FontWeight.w800 : FontWeight.w600,
                                  color: isDark ? Colors.white : Colors.black,
                                  letterSpacing: -0.2,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${item['pedidos']} pedidos esta semana',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: isDark ? Colors.white38 : Colors.black38,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 10),
                        // Emoji de ranking
                        Text(
                          i == 0 ? '🥇' : i == 1 ? '🥈' : i == 2 ? '🥉' : '${i + 1}',
                          style: TextStyle(fontSize: i < 3 ? 20 : 13, fontWeight: FontWeight.w900),
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

class _RestaurantFallback extends StatelessWidget {
  final Color rankColor;
  final int index;
  const _RestaurantFallback({required this.rankColor, required this.index});
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: 46, height: 46,
      decoration: BoxDecoration(
        color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(Icons.storefront_rounded,
        size: 22,
        color: index < 3 ? rankColor : (isDark ? Colors.white38 : Colors.black38)),
    );
  }
}

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

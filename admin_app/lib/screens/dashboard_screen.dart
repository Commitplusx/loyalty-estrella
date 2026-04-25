// lib/screens/dashboard_screen.dart — Dashboard Premium con tema claro/oscuro
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:fl_chart/fl_chart.dart';
import '../services/cliente_service.dart';
import '../services/pdf_service.dart';
import '../services/repartidor_service.dart';
import '../services/gasto_service.dart';
import '../services/pedido_service.dart';
import '../core/theme.dart';
import '../core/user_role.dart';
import '../core/connectivity_provider.dart';
import '../core/theme_provider.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'pedidos_screen.dart';

final statsProvider = FutureProvider<Map<String, int>>((ref) async {
  return ref.read(clienteServiceProvider).getStats();
});

final chartDataProvider = FutureProvider<List<int>>((ref) async {
  return ref.read(clienteServiceProvider).getWeeklyChartData();
});

final fleetHealthProvider = FutureProvider.autoDispose((ref) {
  return ref.read(gastoServiceProvider).getFleetHealthData();
});

final resumenSemanalProvider = FutureProvider.autoDispose((ref) {
  return ref.read(repartidorServiceProvider).getResumenSemanal();
});

// ─────────────────────────────────────────────────────────────────────────────
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(statsProvider);
    final user = Supabase.instance.client.auth.currentUser;
    final isAdmin = ref.watch(isAdminProvider);
    final userRole = ref.watch(userRoleProvider);
    final themeMode = ref.watch(themeProvider);

    final hour = DateTime.now().hour;
    final greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    final userName = (user?.email ?? 'Admin').split('@').first;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              greeting,
              style: TextStyle(
                fontSize: 12,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w500,
              ),
            ),
            Text(
              userName,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: Theme.of(context).colorScheme.onSurface,
                letterSpacing: -0.5,
              ),
            ),
          ],
        ),
        actions: [
          // Theme Switcher
          Container(
            margin: const EdgeInsets.only(right: 4),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              shape: BoxShape.circle,
            ),
            child: IconButton(
              icon: Icon(
                themeMode == AppThemeMode.light ? Icons.light_mode_rounded :
                themeMode == AppThemeMode.amoled ? Icons.nightlight_round : Icons.dark_mode_rounded,
                size: 20,
                color: Theme.of(context).colorScheme.onSurface,
              ),
              onPressed: () => ref.read(themeProvider.notifier).cycleTheme(),
            ),
          ),
          
          // Offline indicator
          ref.watch(connectivityProvider).when(
            data: (isConnected) => isConnected
                ? SizedBox.shrink()
                : Container(
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
                        SizedBox(width: 6),
                        Text('Offline', style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 11, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
            loading: () => SizedBox.shrink(),
            error: (_, __) => SizedBox.shrink(),
          ),

          if (isAdmin)
            _AppBarBtn(
              icon: Icons.settings_rounded,
              onPressed: () => context.push('/config'),
            ),
          _AppBarBtn(
            icon: Icons.refresh_rounded,
            onPressed: () => ref.refresh(statsProvider),
            margin: const EdgeInsets.only(right: 12, left: 4),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: Theme.of(context).colorScheme.primary,
        backgroundColor: Theme.of(context).cardTheme.color ?? Theme.of(context).colorScheme.surface,
        onRefresh: () async {
          ref.refresh(statsProvider);
          ref.refresh(pedidosActivosProvider);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 40),
          children: [
            // ── Hero card ──────────────────────────────────────────
            _HeroCard(userName: userName, userRole: userRole),
            SizedBox(height: 32),

            // ── 1. Operación en Vivo ─────────────────────────────────
            if (isAdmin) ...[
              const _LiveOrdersBanner(),
              SizedBox(height: 32),
            ],

            // ── 2. Acciones Rápidas ───────────────────────────────────
            const _SectionTitle('Acciones Rápidas'),
            SizedBox(height: 16),

            _PrimaryAction(
              icon: Icons.qr_code_scanner_rounded,
              label: 'Escanear QR del Cliente',
              subtitle: 'Registra un envío al instante',
              color: Theme.of(context).colorScheme.primary,
              onTap: () => context.go('/scanner'),
            ),

            if (isAdmin) ...[
              SizedBox(height: 16),
              Row(
                children: [
                  Expanded(child: _ActionButton(
                    icon: Icons.business_center_rounded,
                    label: 'Mi Servicio',
                    color: const Color(0xFF10B981),
                    onTap: () => _agregarMiServicio(context, ref),
                  )),
                  SizedBox(width: 16),
                  Expanded(child: _ActionButton(
                    icon: Icons.receipt_long_rounded,
                    label: 'Corte Hoy',
                    color: Theme.of(context).colorScheme.error,
                    onTap: () async {
                      try {
                        final conn = await Connectivity().checkConnectivity();
                        if (conn.contains(ConnectivityResult.none) || conn.isEmpty) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('⚠️ Se requiere internet para el Corte.', style: TextStyle(color: Colors.white)),
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
                    },
                  )),
                  SizedBox(width: 16),
                  Expanded(child: _ActionButton(
                    icon: Icons.local_shipping_outlined,
                    label: 'Pedidos',
                    color: Theme.of(context).colorScheme.primary,
                    onTap: () => context.go('/pedidos'),
                  )),
                ],
              ),
              SizedBox(height: 16),
              Row(
                children: [
                  Expanded(child: _ActionButton(
                    icon: Icons.people_outline_rounded,
                    label: 'Clientes',
                    color: const Color(0xFF3B82F6),
                    onTap: () => context.go('/clients'),
                  )),
                  SizedBox(width: 16),
                  Expanded(child: _ActionButton(
                    icon: Icons.map_rounded,
                    label: 'Mapa',
                    color: const Color(0xFF10B981),
                    onTap: () => context.push('/map'),
                  )),
                  SizedBox(width: 16),
                  Expanded(child: _ActionButton(
                    icon: Icons.emoji_events_rounded,
                    label: 'Líderes',
                    color: Theme.of(context).colorScheme.secondary,
                    onTap: () => context.push('/leaderboard'),
                  )),
                ],
              ),
              SizedBox(height: 32),
            ] else ...[
              SizedBox(height: 32),
            ],

            // ── 3. Resumen general ────────────────────────────────────
            const _SectionTitle('Resumen General'),
            SizedBox(height: 16),

            statsAsync.when(
              loading: () => Center(
                child: Padding(
                  padding: EdgeInsets.symmetric(vertical: 32),
                  child: CircularProgressIndicator(color: Theme.of(context).colorScheme.primary),
                ),
              ),
              error: (e, _) => _ErrorCard(message: e.toString()),
              data: (stats) => Column(
                children: [
                  if (isAdmin) ...[
                    Row(
                      children: [
                        Expanded(child: _StatCard(
                          icon: Icons.people_outline_rounded,
                          label: 'Clientes',
                          value: '${stats['clientes']}',
                          iconColor: const Color(0xFF3B82F6),
                        )),
                        SizedBox(width: 16),
                        Expanded(child: _StatCard(
                          icon: Icons.local_shipping_outlined,
                          label: 'Envíos Totales',
                          value: '${stats['envios']}',
                          iconColor: Theme.of(context).colorScheme.primary,
                        )),
                      ],
                    ),
                    SizedBox(height: 16),
                  ],
                  Row(
                    children: [
                      Expanded(child: _StatCard(
                        icon: Icons.delivery_dining_rounded,
                        label: 'Mis Envíos Hoy',
                        value: '${stats['mis_envios_hoy']}',
                        gradient: AppGradients.brand,
                        iconColor: Colors.white,
                        forceWhiteText: true,
                      )),
                      SizedBox(width: 16),
                      Expanded(child: _StatCard(
                        icon: Icons.card_giftcard_rounded,
                        label: 'Envíos Gratis',
                        value: '${stats['gratis']}',
                        gradient: AppGradients.success,
                        iconColor: Colors.white,
                        forceWhiteText: true,
                      )),
                    ],
                  ),
                ],
              ),
            ),

            // ── 4. Gráficas y Negocio Semanal ──────────────────────
            if (isAdmin) ...[
              SizedBox(height: 32),
              const _SectionTitle('Negocio esta Semana'),
              SizedBox(height: 16),
              _BusinessSummarySection(ref: ref),
              SizedBox(height: 24),
              _FleetHealthSection(ref: ref),
              SizedBox(height: 24),
              _WeeklyChartSection(ref: ref),
            ],

            // ── Cerrar sesión ──────────────────────────────────────
            SizedBox(height: 40),
            Center(
              child: TextButton.icon(
                onPressed: () async {
                  await Supabase.instance.client.auth.signOut();
                  if (context.mounted) context.go('/login');
                },
                icon: Icon(Icons.logout_rounded, size: 18, color: Theme.of(context).colorScheme.error),
                label: Text('Cerrar sesión', style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 14, fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Widgets de UI
// ─────────────────────────────────────────────────────────────────────────────

class _AppBarBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onPressed;
  final EdgeInsets margin;

  const _AppBarBtn({
    required this.icon,
    required this.onPressed,
    this.margin = const EdgeInsets.only(right: 4),
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        shape: BoxShape.circle,
      ),
      child: IconButton(
        icon: Icon(icon, size: 20, color: Theme.of(context).colorScheme.onSurface), 
        onPressed: onPressed,
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(
        fontSize: 18, 
        fontWeight: FontWeight.w800, 
        color: Theme.of(context).colorScheme.onSurface,
        letterSpacing: -0.3,
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  final String userName;
  final String userRole;
  const _HeroCard({required this.userName, required this.userRole});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: AppGradients.brand,
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: Theme.of(context).colorScheme.primary.withOpacity(0.4),
            blurRadius: 30,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 56, height: 56,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.2),
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.local_shipping_rounded, color: Colors.white, size: 28),
          ),
          SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Estrella Delivery',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.5,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Panel de Control',
                  style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w500),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.25),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              userRole,
              style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }
}

class _LiveOrdersBanner extends ConsumerWidget {
  const _LiveOrdersBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pedidosAsync = ref.watch(pedidosActivosProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Operación en Vivo',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Theme.of(context).colorScheme.onSurface)),
        SizedBox(height: 16),
        pedidosAsync.when(
          loading: () => SizedBox(
            height: 80,
            child: Center(child: CircularProgressIndicator(color: Theme.of(context).colorScheme.primary)),
          ),
          error: (_, __) => SizedBox(),
          data: (pedidos) {
            final enCamino = pedidos.where((p) => p.estado == 'en_camino').length;
            final recibidos = pedidos.where((p) => p.estado == 'recibido').length;
            final asignados = pedidos.where((p) => p.estado == 'asignado').length;

            return GestureDetector(
              onTap: () => context.go('/pedidos'),
              child: Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Theme.of(context).cardTheme.color ?? Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(
                    color: pedidos.isNotEmpty
                        ? Theme.of(context).colorScheme.primary.withOpacity(0.3)
                        : Theme.of(context).colorScheme.outline,
                  ),
                  boxShadow: pedidos.isNotEmpty ? [
                    BoxShadow(color: Theme.of(context).colorScheme.primary.withOpacity(0.1), blurRadius: 20, offset: const Offset(0, 5))
                  ] : [],
                ),
                child: pedidos.isEmpty
                    ? Row(
                        children: [
                          Container(
                            width: 48, height: 48,
                            decoration: BoxDecoration(
                              color: const Color(0xFF10B981).withOpacity(0.15),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Icon(Icons.check_circle_outline_rounded, color: const Color(0xFF10B981), size: 24),
                          ),
                          SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Todo despejado', style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontWeight: FontWeight.bold, fontSize: 16)),
                                Text('Sin pedidos activos ahora', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13)),
                              ],
                            ),
                          ),
                          Icon(Icons.chevron_right_rounded, color: Theme.of(context).colorScheme.onSurface.withOpacity(0.4)),
                        ],
                      )
                    : Row(
                        children: [
                          Expanded(child: _LiveStat(icon: Icons.delivery_dining_rounded, label: 'En Camino', value: enCamino, color: Theme.of(context).colorScheme.primary)),
                          Container(width: 1, height: 48, color: Theme.of(context).colorScheme.outline),
                          Expanded(child: _LiveStat(icon: Icons.handshake_rounded, label: 'En Local', value: recibidos, color: Theme.of(context).colorScheme.secondary)),
                          Container(width: 1, height: 48, color: Theme.of(context).colorScheme.outline),
                          Expanded(child: _LiveStat(icon: Icons.assignment_rounded, label: 'Asignados', value: asignados, color: const Color(0xFF3B82F6))),
                          SizedBox(width: 8),
                          Icon(Icons.chevron_right_rounded, color: Theme.of(context).colorScheme.onSurface.withOpacity(0.4)),
                        ],
                      ),
              ),
            );
          },
        ),
      ],
    );
  }
}

class _LiveStat extends StatelessWidget {
  final IconData icon;
  final String label;
  final int value;
  final Color color;
  const _LiveStat({required this.icon, required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, color: color, size: 24),
        SizedBox(height: 6),
        Text('$value', style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontWeight: FontWeight.w900, fontSize: 22)),
        Text(label, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 11, fontWeight: FontWeight.w500), textAlign: TextAlign.center),
      ],
    );
  }
}

class _PrimaryAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  const _PrimaryAction({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withOpacity(0.1),
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: color.withOpacity(0.3)),
          ),
          child: Row(
            children: [
              Container(
                width: 56, height: 56,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.2),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: color, size: 28),
              ),
              SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 17)),
                    SizedBox(height: 4),
                    Text(subtitle, style: TextStyle(color: color.withOpacity(0.8), fontSize: 13)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: color.withOpacity(0.6)),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final LinearGradient? gradient;
  final Color iconColor;
  final bool forceWhiteText;

  const _StatCard({
    required this.icon,
    required this.label,
    required this.value,
    this.gradient,
    required this.iconColor,
    this.forceWhiteText = false,
  });

  @override
  Widget build(BuildContext context) {
    final textColor = forceWhiteText ? Colors.white : Theme.of(context).colorScheme.onSurface;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: gradient == null ? Theme.of(context).cardTheme.color ?? Theme.of(context).colorScheme.surface : null,
        gradient: gradient,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: gradient == null ? Theme.of(context).colorScheme.outline : Colors.transparent),
        boxShadow: gradient != null ? [
          BoxShadow(color: iconColor.withOpacity(0.3), blurRadius: 16, offset: const Offset(0, 4))
        ] : [],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: forceWhiteText ? Colors.white.withOpacity(0.2) : iconColor.withOpacity(0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: forceWhiteText ? Colors.white : iconColor, size: 24),
          ),
          SizedBox(height: 16),
          Text(value, style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: textColor, letterSpacing: -0.5)),
          SizedBox(height: 4),
          Text(label, style: TextStyle(fontSize: 13, color: forceWhiteText ? Colors.white70 : Theme.of(context).colorScheme.onSurfaceVariant, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 8),
        decoration: BoxDecoration(
          color: color.withOpacity(0.12),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 32),
            SizedBox(height: 10),
            Text(
              label,
              style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 13),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  final String message;
  const _ErrorCard({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.error.withOpacity(0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Theme.of(context).colorScheme.error.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline_rounded, color: Theme.of(context).colorScheme.error),
          SizedBox(width: 12),
          Expanded(child: Text(message, style: TextStyle(color: Theme.of(context).colorScheme.error))),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Secciones de negocio
// ─────────────────────────────────────────────────────────────────────────────

class _WeeklyChartSection extends ConsumerWidget {
  final WidgetRef ref;
  const _WeeklyChartSection({required this.ref});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(chartDataProvider);

    return statsAsync.when(
      loading: () => SizedBox(height: 200, child: Center(child: CircularProgressIndicator(color: Theme.of(context).colorScheme.primary))),
      error: (e, _) => SizedBox(),
      data: (chartData) {
        if (chartData.isEmpty) return SizedBox();

        return Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Theme.of(context).cardTheme.color ?? Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: Theme.of(context).colorScheme.outline),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Envíos — Últimos 7 días',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurface,
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                ),
              ),
              SizedBox(height: 24),
              SizedBox(
                height: 160,
                child: LineChart(
                  LineChartData(
                    gridData: const FlGridData(show: false),
                    titlesData: const FlTitlesData(show: false),
                    borderData: FlBorderData(show: false),
                    lineBarsData: [
                      LineChartBarData(
                        spots: chartData.asMap().entries
                            .map((e) => FlSpot(e.key.toDouble(), e.value.toDouble()))
                            .toList(),
                        isCurved: true,
                        color: Theme.of(context).colorScheme.primary,
                        barWidth: 4,
                        isStrokeCapRound: true,
                        dotData: const FlDotData(show: false),
                        belowBarData: BarAreaData(
                          show: true,
                          color: Theme.of(context).colorScheme.primary.withOpacity(0.1),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _FleetHealthSection extends ConsumerWidget {
  final WidgetRef ref;
  const _FleetHealthSection({required this.ref});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final healthAsync = ref.watch(fleetHealthProvider);

    return healthAsync.when(
      loading: () => Center(child: CircularProgressIndicator(color: const Color(0xFF10B981))),
      error: (e, _) => SizedBox(),
      data: (healthData) {
        if (healthData.isEmpty) return SizedBox();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Eficiencia de Flota',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Theme.of(context).colorScheme.onSurface),
            ),
            SizedBox(height: 16),
            SizedBox(
              height: 140,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: healthData.length,
                itemBuilder: (ctx, i) {
                  final h = healthData[i];
                  final double ratio = h['ratio_costo'];
                  final double totalProducido = h['producido_7d'];
                  final double totalGas = h['gasolina_7d'];
                  final needsMaint = (ratio > 25.0) || (totalProducido == 0 && totalGas > 0);

                  return Container(
                    width: 190,
                    margin: const EdgeInsets.only(right: 16),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Theme.of(context).cardTheme.color ?? Theme.of(context).colorScheme.surface,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: needsMaint
                            ? Theme.of(context).colorScheme.error.withOpacity(0.5)
                            : Theme.of(context).colorScheme.outline,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Icons.motorcycle_rounded,
                              color: needsMaint ? Theme.of(context).colorScheme.error : const Color(0xFF10B981),
                              size: 20,
                            ),
                            SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                h['alias'],
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Theme.of(context).colorScheme.onSurface,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                ),
                              ),
                            ),
                          ],
                        ),
                        SizedBox(height: 2),
                        Text(
                          h['conductor_actual'],
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 12),
                        ),
                        const Spacer(),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('⛽ \$${totalGas.toStringAsFixed(0)}', style: TextStyle(color: Theme.of(context).colorScheme.secondary, fontSize: 12, fontWeight: FontWeight.bold)),
                            Text('💵 \$${totalProducido.toStringAsFixed(0)}', style: TextStyle(color: const Color(0xFF10B981), fontSize: 12, fontWeight: FontWeight.bold)),
                          ],
                        ),
                        SizedBox(height: 6),
                        Text(
                          needsMaint
                              ? '🚨 Gasto Elevado (${ratio.toStringAsFixed(1)}%)'
                              : '✅ Óptimo (${ratio.toStringAsFixed(1)}%)',
                          style: TextStyle(
                            color: needsMaint ? Theme.of(context).colorScheme.error : Theme.of(context).colorScheme.onSurface.withOpacity(0.4),
                            fontSize: 11,
                            fontWeight: needsMaint ? FontWeight.bold : FontWeight.normal,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}

class _BusinessSummarySection extends ConsumerWidget {
  final WidgetRef ref;
  const _BusinessSummarySection({required this.ref});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final resumenAsync = ref.watch(resumenSemanalProvider);

    return resumenAsync.when(
      loading: () => SizedBox(height: 120, child: Center(child: CircularProgressIndicator(color: const Color(0xFF10B981)))),
      error: (_, __) => SizedBox(),
      data: (v) {
        if (v.isEmpty) return SizedBox();
        final r = v.first;
        final ingresos = (r['ingresos_totales'] as num?)?.toDouble() ?? 0.0;
        final gastos = (r['gastos_totales'] as num?)?.toDouble() ?? 0.0;
        final balance = ingresos - gastos;

        return Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Theme.of(context).cardTheme.color ?? Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: Theme.of(context).colorScheme.outline),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Balance Neto', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 13, fontWeight: FontWeight.w500)),
                    Text(
                      '\$${balance.toStringAsFixed(2)}',
                      style: TextStyle(
                        color: balance >= 0 ? const Color(0xFF10B981) : Theme.of(context).colorScheme.error,
                        fontSize: 32,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -1,
                      ),
                    ),
                    SizedBox(height: 16),
                    Row(
                      children: [
                        _TinyStat(label: 'Ingresos', value: '\$${ingresos.toInt()}', color: const Color(0xFF10B981)),
                        SizedBox(width: 24),
                        _TinyStat(label: 'Gastos', value: '\$${gastos.toInt()}', color: Theme.of(context).colorScheme.error),
                      ],
                    ),
                  ],
                ),
              ),
              Container(
                height: 72, width: 72,
                decoration: BoxDecoration(
                  color: (balance >= 0 ? const Color(0xFF10B981) : Theme.of(context).colorScheme.error).withOpacity(0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  balance >= 0 ? Icons.trending_up_rounded : Icons.trending_down_rounded,
                  color: balance >= 0 ? const Color(0xFF10B981) : Theme.of(context).colorScheme.error,
                  size: 36,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _TinyStat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _TinyStat({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant, fontWeight: FontWeight.w500)),
        Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: color)),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mi Servicio bottom sheet
// ─────────────────────────────────────────────────────────────────────────────

Future<void> _agregarMiServicio(BuildContext context, WidgetRef ref) async {
  final descCtrl = TextEditingController();
  final montoCtrl = TextEditingController();
  File? tempFile;

  final reps = await ref.read(repartidorServiceProvider).getRepartidores();
  final adminRep = reps.firstWhere(
    (r) => (r['alias'] ?? '').toString().toUpperCase() == 'ADMIN',
    orElse: () => {},
  );
  final adminId = adminRep['id']?.toString();

  if (adminId == null && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Error: No se encontró el perfil "ADMIN". Créalo en Logística.')),
    );
    return;
  }

  if (!context.mounted) return;

  await showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Theme.of(context).cardTheme.color ?? Theme.of(context).colorScheme.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSt) => Padding(
        padding: EdgeInsets.fromLTRB(24, 24, 24, MediaQuery.of(ctx).viewInsets.bottom + 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Anotar Entrega de Empresa', style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 22, fontWeight: FontWeight.bold)),
            SizedBox(height: 24),
            TextField(
              controller: descCtrl,
              style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
              decoration: InputDecoration(
                labelText: 'Descripción (Ej: Envío Local)',
                labelStyle: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
                filled: true,
                fillColor: Theme.of(context).scaffoldBackgroundColor,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
              ),
            ),
            SizedBox(height: 16),
            TextField(
              controller: montoCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
              decoration: InputDecoration(
                labelText: 'Monto (\$)',
                labelStyle: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
                filled: true,
                fillColor: Theme.of(context).scaffoldBackgroundColor,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
              ),
            ),
            SizedBox(height: 16),
            _ImageSelectorSmall(onImage: (file) => setSt(() => tempFile = file)),
            SizedBox(height: 28),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF10B981),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                onPressed: () async {
                  final monto = double.tryParse(montoCtrl.text);
                  if (descCtrl.text.isEmpty || monto == null) return;

                  String? url;
                  if (tempFile != null) {
                    url = await ref.read(repartidorServiceProvider).uploadComprobante(tempFile!);
                  }

                  final ok = await ref.read(repartidorServiceProvider).addServicio(
                    repartidorId: adminId!,
                    descripcion: descCtrl.text.trim(),
                    monto: monto,
                    esAdmin: true,
                    comprobanteUrl: url,
                  );
                  if (ok && ctx.mounted) {
                    Navigator.pop(ctx);
                    ref.invalidate(statsProvider);
                    ref.invalidate(resumenSemanalProvider);
                  }
                },
                child: Text('Guardar Mi Servicio', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    ),
  );

  descCtrl.dispose();
  montoCtrl.dispose();
}

class _ImageSelectorSmall extends StatefulWidget {
  final Function(File?) onImage;
  const _ImageSelectorSmall({required this.onImage});

  @override
  State<_ImageSelectorSmall> createState() => _ImageSelectorSmallState();
}

class _ImageSelectorSmallState extends State<_ImageSelectorSmall> {
  File? _image;

  Future<void> _pick(ImageSource source) async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: source, imageQuality: 70);
    if (picked != null) {
      final file = File(picked.path);
      setState(() => _image = file);
      widget.onImage(file);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (_image != null)
          Stack(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.file(_image!, height: 100, width: double.infinity, fit: BoxFit.cover),
              ),
              Positioned(
                right: 8, top: 8,
                child: InkWell(
                  onTap: () { setState(() => _image = null); widget.onImage(null); },
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                    child: Icon(Icons.close_rounded, color: Colors.white, size: 16),
                  ),
                ),
              ),
            ],
          )
        else
          Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: () => _pick(ImageSource.camera),
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    height: 52,
                    decoration: BoxDecoration(color: Theme.of(context).scaffoldBackgroundColor, borderRadius: BorderRadius.circular(16)),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.camera_alt_rounded, color: Theme.of(context).colorScheme.onSurfaceVariant, size: 20),
                        SizedBox(width: 8),
                        Text('Cámara', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 14)),
                      ],
                    ),
                  ),
                ),
              ),
              SizedBox(width: 16),
              Expanded(
                child: InkWell(
                  onTap: () => _pick(ImageSource.gallery),
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    height: 52,
                    decoration: BoxDecoration(color: Theme.of(context).scaffoldBackgroundColor, borderRadius: BorderRadius.circular(16)),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.image_rounded, color: Theme.of(context).colorScheme.onSurfaceVariant, size: 20),
                        SizedBox(width: 8),
                        Text('Galería', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontSize: 14)),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
      ],
    );
  }
}

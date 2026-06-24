import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemNavigator, SystemUiOverlayStyle;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter/rendering.dart';
import '../core/user_role.dart';
import '../core/supabase_config.dart';
import '../core/ui_helpers.dart';
import '../core/connectivity_provider.dart';
import 'dashboard_screen.dart' show statsProvider;
import 'pedidos_screen.dart' show pedidosActivosProvider;

// Provider para contar solicitudes pendientes
final pendingSolicitudesProvider = FutureProvider.autoDispose<int>((ref) async {
  final res = await supabase
      .from('restaurantes_solicitudes')
      .select('id')
      .eq('estado', 'pendiente');
  return (res as List).length;
});

final lastSeenPedidosProvider = StateProvider<DateTime>((ref) => DateTime.now());

// Provider para contar pedidos pendientes usando stream
final pendingPedidosCountProvider = StreamProvider.autoDispose<int>((ref) {
  final lastSeen = ref.watch(lastSeenPedidosProvider);
  return supabase
      .from('pedidos')
      .stream(primaryKey: ['id'])
      .map((list) => list.where((p) {
        final dt = DateTime.tryParse(p['created_at'] ?? '');
        if (dt == null) return false;
        final isNew = dt.isAfter(lastSeen);
        final isActive = p['estado'] == 'asignado' || p['estado'] == 'pendiente' || p['estado'] == 'pendiente_pago';
        return isNew && isActive;
      }).length);
});

class MainShell extends ConsumerStatefulWidget {
  final Widget child;
  const MainShell({super.key, required this.child});

  @override
  ConsumerState<MainShell> createState() => _MainShellState();
}

class _MainShellState extends ConsumerState<MainShell> {
  bool _isNavVisible = true;
  bool _isExpanded = false;

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final isAdmin = ref.watch(isAdminProvider);
    final pendingAsync = isAdmin ? ref.watch(pendingSolicitudesProvider) : null;
    final pendingCount = pendingAsync?.valueOrNull ?? 0;
    
    final isConnectedAsync = ref.watch(connectivityProvider);
    final isConnected = isConnectedAsync.valueOrNull ?? true;
    
    final pedidosCountAsync = ref.watch(pendingPedidosCountProvider);
    final pedidosCount = pedidosCountAsync.valueOrNull ?? 0;

    final tabs = [
      const _TabItem(icon: Icons.grid_view_rounded,      activeIcon: Icons.grid_view_rounded,     label: 'Dashboard',  route: '/dashboard'),
      const _TabItem(icon: Icons.qr_code_scanner_rounded, activeIcon: Icons.qr_code_scanner_rounded, label: 'Escanear', route: '/scanner'),
      if (isAdmin) const _TabItem(icon: Icons.delivery_dining_rounded, activeIcon: Icons.delivery_dining_rounded, label: 'Equipo',   route: '/repartidores'),
      if (isAdmin) const _TabItem(icon: Icons.people_outline,       activeIcon: Icons.people_rounded,       label: 'Clientes',  route: '/clients'),
      _TabItem(icon: Icons.inventory_2_outlined, activeIcon: Icons.inventory_2_rounded,  label: isAdmin ? 'Pedidos' : 'Asignados',   route: '/pedidos', badge: isAdmin ? pedidosCount : 0),
      if (isAdmin) _TabItem(icon: Icons.store_outlined, activeIcon: Icons.store_rounded, label: 'Aliados', route: '/solicitudes', badge: pendingCount),
    ];

    int currentIndex = 0;
    for (int i = 0; i < tabs.length; i++) {
      if (location.startsWith(tabs[i].route)) {
        currentIndex = i;
        if (tabs[i].route == '/pedidos') {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            ref.read(lastSeenPedidosProvider.notifier).state = DateTime.now();
          });
        }
        break;
      }
    }

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Theme.of(context).brightness == Brightness.dark ? Brightness.light : Brightness.dark,
        systemNavigationBarColor: Theme.of(context).cardTheme.color ?? Theme.of(context).colorScheme.surface,
        systemNavigationBarIconBrightness: Theme.of(context).brightness == Brightness.dark ? Brightness.light : Brightness.dark,
      ),
      child: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, result) async {
          if (didPop) return;
          if (_isExpanded) {
            setState(() => _isExpanded = false);
            return;
          }
          if (currentIndex != 0) {
            context.go('/dashboard');
            return;
          }
          final shouldExit = await PremiumBottomSheet.showConfirm(
            context,
            title: '¿Salir de la app?',
            content: '¿Estás seguro que quieres cerrar Estrella Delivery Admin?',
            confirmText: 'SALIR',
            cancelText: 'CANCELAR',
            isDestructive: true,
          );
          if (shouldExit == true && context.mounted) SystemNavigator.pop();
        },
        child: Scaffold(
          extendBody: true,
          body: NotificationListener<UserScrollNotification>(
            onNotification: (notification) {
              if (notification.direction == ScrollDirection.forward) {
                if (!_isNavVisible) setState(() => _isNavVisible = true);
              } else if (notification.direction == ScrollDirection.reverse) {
                if (_isNavVisible && !_isExpanded) setState(() => _isNavVisible = false);
              }
              return false; // Permitir que otros listeners escuchen
            },
            child: Stack(
              children: [
                widget.child,
                
                // Overlay oscuro animado
                Positioned.fill(
                  child: IgnorePointer(
                    ignoring: !_isExpanded,
                    child: GestureDetector(
                      onTap: () => setState(() => _isExpanded = false),
                      child: AnimatedOpacity(
                        duration: const Duration(milliseconds: 300),
                        opacity: _isExpanded ? 1.0 : 0.0,
                        curve: Curves.easeInOut,
                        child: Container(
                          color: Theme.of(context).brightness == Brightness.dark ? Colors.black.withOpacity(0.6) : Colors.black.withOpacity(0.3),
                        ),
                      ),
                    ),
                  ),
                ),

                // Menú Expandible
                Positioned(
                  left: 16,
                  right: 16,
                  bottom: 90,
                  child: AnimatedSlide(
                    duration: const Duration(milliseconds: 400),
                    curve: Curves.easeOutBack,
                    offset: _isExpanded ? Offset.zero : const Offset(0, 1.5),
                    child: AnimatedOpacity(
                      duration: const Duration(milliseconds: 300),
                      opacity: _isExpanded ? 1.0 : 0.0,
                      child: IgnorePointer(
                        ignoring: !_isExpanded,
                        child: _PremiumNavBar(
                          tabs: tabs,
                          currentIndex: currentIndex,
                          onTap: (i) {
                            setState(() => _isExpanded = false);
                            context.go(tabs[i].route);
                          },
                        ),
                      ),
                    ),
                  ),
                ),

                // ── Alerta Sin Conexión ──
                AnimatedPositioned(
                  duration: const Duration(milliseconds: 500),
                  curve: Curves.easeOutBack,
                  top: isConnected ? -100 : MediaQuery.of(context).padding.top + 10,
                  left: 16,
                  right: 16,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(
                          color: Colors.redAccent.withOpacity(0.85),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.red.withOpacity(0.5)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.wifi_off_rounded, color: Colors.white),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Text('Sin Conexión a Internet', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                                  Text('Trabajando en modo offline. Los pedidos no se actualizarán.', style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 12)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
          floatingActionButton: AnimatedSlide(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOutCubic,
            offset: _isNavVisible || _isExpanded ? Offset.zero : const Offset(0, 2.0),
            child: Consumer(
              builder: (context, ref, child) {
                return FloatingActionButton(
                  onPressed: () {
                    setState(() => _isExpanded = !_isExpanded);
                  },
                  elevation: _isExpanded ? 0 : 12,
                  backgroundColor: _isExpanded ? Theme.of(context).colorScheme.error : Theme.of(context).colorScheme.primary,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                  child: AnimatedRotation(
                    turns: _isExpanded ? 0.125 : 0, // Gira 45º
                    duration: const Duration(milliseconds: 300),
                    curve: Curves.easeOutCubic,
                    child: const Icon(Icons.add_rounded, color: Colors.white, size: 36),
                  ),
                );
              }
            ),
          ),
        ),
      ),
    );
  }
}

// ── Premium Bottom Nav Bar ─────────────────────────────────────────────────────
class _PremiumNavBar extends StatelessWidget {
  final List<_TabItem> tabs;
  final int currentIndex;
  final void Function(int) onTap;

  const _PremiumNavBar({
    required this.tabs,
    required this.currentIndex,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(left: 16, right: 16, bottom: 20, top: 0),
      child: Container(
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E1E1E).withOpacity(0.8) : Colors.white.withOpacity(0.85),
          borderRadius: BorderRadius.circular(30),
          border: Border.all(
            color: isDark ? Colors.white.withOpacity(0.1) : Colors.black.withOpacity(0.05),
            width: 1,
          ),
          boxShadow: [
            BoxShadow(
              color: theme.colorScheme.shadow.withOpacity(isDark ? 0.3 : 0.1),
              blurRadius: 20,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(30),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: List.generate(tabs.length, (i) {
                  final tab = tabs[i];
                  final active = i == currentIndex;
                  return Expanded(
                    child: _NavItem(tab: tab, active: active, onTap: () => onTap(i)),
                  );
                }),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final _TabItem tab;
  final bool active;
  final VoidCallback onTap;

  const _NavItem({required this.tab, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutQuint,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOutQuint,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: active ? theme.colorScheme.primary : Colors.transparent,
                shape: BoxShape.circle,
                boxShadow: active ? [
                  BoxShadow(
                    color: theme.colorScheme.primary.withOpacity(0.4),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  )
                ] : [
                  BoxShadow(
                    color: Colors.transparent,
                    blurRadius: 0,
                    offset: const Offset(0, 4),
                  )
                ],
              ),
              child: tab.badge > 0
                  ? Badge(
                      label: Text(tab.badge.toString()),
                      backgroundColor: const Color(0xFFF97316),
                      child: Icon(
                        active ? tab.activeIcon : tab.icon,
                        color: active ? Colors.white : theme.colorScheme.onSurfaceVariant.withOpacity(0.6),
                        size: 24,
                      ),
                    )
                  : Icon(
                      active ? tab.activeIcon : tab.icon,
                      color: active ? Colors.white : theme.colorScheme.onSurfaceVariant.withOpacity(0.6),
                      size: 24,
                    ),
            ),
            const SizedBox(height: 4),
            AnimatedDefaultTextStyle(
              duration: const Duration(milliseconds: 200),
              style: TextStyle(
                fontSize: 10,
                fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                color: active ? theme.colorScheme.primary : theme.colorScheme.onSurfaceVariant.withOpacity(0.7),
              ),
              child: Text(tab.label, maxLines: 1, overflow: TextOverflow.visible),
            ),
          ],
        ),
      ),
    );
  }
}

class _TabItem {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final String route;
  final int badge;
  const _TabItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.route,
    this.badge = 0,
  });
}

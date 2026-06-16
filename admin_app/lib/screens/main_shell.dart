import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemNavigator, SystemUiOverlayStyle;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/user_role.dart';

class MainShell extends ConsumerWidget {
  final Widget child;
  const MainShell({super.key, required this.child});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).matchedLocation;
    final isAdmin = ref.watch(isAdminProvider);

    final tabs = [
      const _TabItem(icon: Icons.grid_view_rounded,      activeIcon: Icons.grid_view_rounded,     label: 'Dashboard',  route: '/dashboard'),
      const _TabItem(icon: Icons.qr_code_scanner_rounded, activeIcon: Icons.qr_code_scanner_rounded, label: 'Escanear', route: '/scanner'),
      if (isAdmin) const _TabItem(icon: Icons.delivery_dining_rounded, activeIcon: Icons.delivery_dining_rounded, label: 'Equipo',   route: '/repartidores'),
      if (isAdmin) const _TabItem(icon: Icons.people_outline,       activeIcon: Icons.people_rounded,       label: 'Clientes',  route: '/clients'),
      _TabItem(icon: Icons.inventory_2_outlined, activeIcon: Icons.inventory_2_rounded,  label: isAdmin ? 'Pedidos' : 'Asignados',   route: '/pedidos'),
    ];

    int currentIndex = 0;
    for (int i = 0; i < tabs.length; i++) {
      if (location.startsWith(tabs[i].route)) {
        currentIndex = i;
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
          final shouldExit = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              backgroundColor: Theme.of(context).cardTheme.color ?? Theme.of(context).colorScheme.surface,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              title: Text('¿Salir de la app?', style: TextStyle(color: Theme.of(context).colorScheme.onSurface)),
              content: Text('¿Estás seguro que quieres cerrar Estrella Delivery Admin?',
                style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: Text('CANCELAR', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  style: FilledButton.styleFrom(
                    backgroundColor: Theme.of(context).colorScheme.error,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: Text('SALIR'),
                ),
              ],
            ),
          );
          if (shouldExit == true && context.mounted) SystemNavigator.pop();
        },
        child: Scaffold(
          extendBody: true,
          body: child,
          bottomNavigationBar: _PremiumNavBar(
            tabs: tabs,
            currentIndex: currentIndex,
            onTap: (i) => context.go(tabs[i].route),
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
                  return _NavItem(tab: tab, active: active, onTap: () => onTap(i));
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
        width: 58,
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
              child: Icon(
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
  const _TabItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.route,
  });
}

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
      const _TabItem(icon: Icons.delivery_dining_rounded, activeIcon: Icons.delivery_dining_rounded, label: 'Riders',   route: '/repartidores'),
      const _TabItem(icon: Icons.receipt_long_outlined,   activeIcon: Icons.receipt_long_rounded,  label: 'Gastos',    route: '/gastos'),
      if (isAdmin) const _TabItem(icon: Icons.people_outline,       activeIcon: Icons.people_rounded,       label: 'Clientes',  route: '/clients'),
      if (isAdmin) const _TabItem(icon: Icons.inventory_2_outlined, activeIcon: Icons.inventory_2_rounded,  label: 'Pedidos',   route: '/pedidos'),
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
        statusBarIconBrightness: Brightness.light,
        systemNavigationBarColor: Theme.of(context).cardTheme.color ?? Theme.of(context).colorScheme.surface,
        systemNavigationBarIconBrightness: Brightness.light,
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
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color ?? Theme.of(context).colorScheme.surface,
        border: Border(
          top: BorderSide(color: Theme.of(context).colorScheme.outline, width: 1),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
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
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: active ? Theme.of(context).colorScheme.primary.withOpacity(0.12) : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: Icon(
                active ? tab.activeIcon : tab.icon,
                key: ValueKey(active),
                color: active ? Theme.of(context).colorScheme.primary : Theme.of(context).colorScheme.onSurfaceVariant,
                size: 24,
              ),
            ),
            SizedBox(height: 4),
            AnimatedDefaultTextStyle(
              duration: const Duration(milliseconds: 200),
              style: TextStyle(
                fontSize: 10,
                fontWeight: active ? FontWeight.w700 : FontWeight.w400,
                color: active ? Theme.of(context).colorScheme.primary : Theme.of(context).colorScheme.onSurfaceVariant,
              ),
              child: Text(tab.label),
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

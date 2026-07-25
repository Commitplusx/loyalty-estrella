import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemNavigator, SystemUiOverlayStyle;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/ui_helpers.dart';
import '../core/connectivity_provider.dart';

final _sb = Supabase.instance.client;

// ── Providers reales para el Admin Shell ──────────────────────────────────────

/// Solicitudes de restaurantes pendientes (badge en "Aliados")
final pendingSolicitudesProvider = FutureProvider<int>((ref) async {
  final res = await _sb
      .from('restaurantes_solicitudes')
      .select('id')
      .eq('estado', 'pendiente');
  return (res as List).length;
});

/// Pedidos sin asignar o activos (badge en "Pedidos")
final pendingPedidosCountProvider = StreamProvider<int>((ref) {
  return _sb
      .from('pedidos')
      .stream(primaryKey: ['id'])
      .map((list) => list.where((p) {
            final estado = p['estado'] as String? ?? '';
            return estado == 'pendiente' ||
                estado == 'pendiente_pago' ||
                estado == 'asignado' ||
                estado == 'en_cocina' ||
                estado == 'recibido' ||
                estado == 'en_camino';
          }).length);
});

final lastSeenPedidosProvider = StateProvider<DateTime>((ref) => DateTime.now());


class AdminShell extends ConsumerStatefulWidget {
  final Widget child;
  const AdminShell({super.key, required this.child});

  @override
  ConsumerState<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends ConsumerState<AdminShell> {
  int _getSelectedIndex(String location) {
    if (location.startsWith('/dashboard')) return 0;
    if (location.startsWith('/pedidos')) return 1;
    if (location.startsWith('/repartidores')) return 2;
    if (location.startsWith('/clients')) return 3;
    if (location.startsWith('/solicitudes')) return 4;
    if (location.startsWith('/config')) return 5;
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final currentIndex = _getSelectedIndex(location);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final isConnectedAsync = ref.watch(connectivityProvider);
    final isConnected = isConnectedAsync.valueOrNull ?? true;

    final pendingAliados = ref.watch(pendingSolicitudesProvider).valueOrNull ?? 0;
    final pedidosActivos = ref.watch(pendingPedidosCountProvider).valueOrNull ?? 0;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
        systemNavigationBarColor: theme.colorScheme.surface,
        systemNavigationBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final isMobile = constraints.maxWidth < 600;

          final drawerContent = SafeArea(
            child: Column(
              children: [
                // Header Premium
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: isDark 
                        ? [const Color(0xFF1E1E1E), const Color(0xFF121212)]
                        : [theme.colorScheme.primary.withOpacity(0.05), Colors.transparent],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primary.withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(Icons.admin_panel_settings_rounded, size: 32, color: theme.colorScheme.primary),
                      ),
                      const SizedBox(width: 16),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Estrella Eats', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: theme.colorScheme.primary, letterSpacing: 1.2)),
                          const SizedBox(height: 2),
                          Text('Super Admin', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: theme.colorScheme.onSurface, letterSpacing: -0.5)),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                
                // Opciones
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    children: [
                                      _drawerItem(context, 'Panel',    Icons.grid_view_rounded,       0, currentIndex, '/dashboard',   theme, 0),
                      _drawerItem(context, 'Pedidos',  Icons.inventory_2_rounded,     1, currentIndex, '/pedidos',     theme, pedidosActivos),
                      _drawerItem(context, 'Equipo',   Icons.delivery_dining_rounded,  2, currentIndex, '/repartidores',theme, 0),
                      _drawerItem(context, 'Clientes', Icons.people_rounded,           3, currentIndex, '/clients',     theme, 0),
                      _drawerItem(context, 'Aliados',  Icons.store_rounded,            4, currentIndex, '/solicitudes', theme, pendingAliados),
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 12),
                        child: Divider(height: 1, thickness: 1),
                      ),
                                            _drawerItem(context, 'Ajustes',  Icons.settings_rounded,        5, currentIndex, '/config',      theme, 0),
                    ],
                  ),
                ),

                // Botón para cerrar menú
                Padding(
                  padding: const EdgeInsets.only(bottom: 16.0, top: 8.0),
                  child: Center(
                    child: InkWell(
                      onTap: () => context.pop(),
                      borderRadius: BorderRadius.circular(30),
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: theme.colorScheme.onSurface.withOpacity(0.05),
                          border: Border.all(color: theme.colorScheme.onSurface.withOpacity(0.1)),
                        ),
                        child: Icon(
                          Icons.close_rounded, 
                          color: theme.colorScheme.onSurface.withOpacity(0.6), 
                          size: 28
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          );

          if (isMobile) {
            // Vista Móvil: Drawer (Menú Hamburguesa)
            return Scaffold(
              backgroundColor: theme.colorScheme.surface,
              drawer: Drawer(
                backgroundColor: theme.colorScheme.surface,
                child: drawerContent,
              ),
              body: SafeArea(
                child: Stack(
                  children: [
                    widget.child,
                    
                    // Menu Button (Flotante inferior izquierdo)
                    Positioned(
                      bottom: 24,
                      left: 16,
                      child: Builder(
                        builder: (ctx) => FloatingActionButton(
                          heroTag: 'admin_menu_fab',
                          elevation: 4,
                          backgroundColor: theme.colorScheme.primary,
                          foregroundColor: theme.colorScheme.onPrimary,
                          child: const Icon(Icons.menu_rounded),
                          onPressed: () => Scaffold.of(ctx).openDrawer(),
                        ),
                      ),
                    ),

                    if (!isConnected)
                      Positioned(
                        top: 60,
                        left: 16,
                        right: 16,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          decoration: BoxDecoration(
                            color: Colors.redAccent.withOpacity(0.9),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Text(
                            'Sin Conexión a Internet - Modo Offline',
                            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            );
          }

          // Vista Tablet/Desktop: Navigation Rail
          return Scaffold(
            backgroundColor: theme.colorScheme.surface,
            body: SafeArea(
              child: Row(
                children: [
                  NavigationRail(
                    selectedIndex: currentIndex,
                    onDestinationSelected: (int index) {
                      switch (index) {
                        case 0: context.go('/dashboard'); break;
                        case 1: context.go('/pedidos'); break;
                        case 2: context.go('/repartidores'); break;
                        case 3: context.go('/clients'); break;
                        case 4: context.go('/solicitudes'); break;
                        case 5: context.go('/config'); break;
                      }
                    },
                    labelType: NavigationRailLabelType.all,
                    selectedLabelTextStyle: TextStyle(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.bold,
                      fontSize: 11,
                    ),
                    unselectedLabelTextStyle: TextStyle(
                      color: theme.colorScheme.onSurface.withOpacity(0.6),
                      fontSize: 11,
                    ),
                    selectedIconTheme: IconThemeData(color: theme.colorScheme.primary),
                    unselectedIconTheme: IconThemeData(color: theme.colorScheme.onSurface.withOpacity(0.6)),
                    backgroundColor: isDark ? const Color(0xFF16161E) : const Color(0xFFF8F9FA),
                    elevation: 1,
                    destinations: const [
                      NavigationRailDestination(icon: Icon(Icons.grid_view_outlined), selectedIcon: Icon(Icons.grid_view_rounded), label: Text('Panel')),
                      NavigationRailDestination(icon: Icon(Icons.inventory_2_outlined), selectedIcon: Icon(Icons.inventory_2_rounded), label: Text('Pedidos')),
                      NavigationRailDestination(icon: Icon(Icons.delivery_dining_outlined), selectedIcon: Icon(Icons.delivery_dining_rounded), label: Text('Equipo')),
                      NavigationRailDestination(icon: Icon(Icons.people_outline), selectedIcon: Icon(Icons.people_rounded), label: Text('Clientes')),
                      NavigationRailDestination(icon: Icon(Icons.store_outlined), selectedIcon: Icon(Icons.store_rounded), label: Text('Aliados')),
                      NavigationRailDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings_rounded), label: Text('Ajustes')),
                    ],
                  ),
                  const VerticalDivider(thickness: 1, width: 1),
                  
                  Expanded(
                    child: Stack(
                      children: [
                        widget.child,
                        if (!isConnected)
                          Positioned(
                            top: 16,
                            left: 16,
                            right: 16,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                              decoration: BoxDecoration(
                                color: Colors.redAccent.withOpacity(0.9),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Text(
                                'Sin Conexión a Internet - Modo Offline',
                                style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

    Widget _drawerItem(BuildContext context, String title, IconData icon, int index, int currentIndex, String route, ThemeData theme, int badge) {
    final isSelected = index == currentIndex;
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: ListTile(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        leading: Stack(
          clipBehavior: Clip.none,
          children: [
            Icon(icon, color: isSelected ? theme.colorScheme.primary : theme.colorScheme.onSurface.withOpacity(0.5), size: 22),
            if (badge > 0)
              Positioned(
                right: -6, top: -6,
                child: Container(
                  padding: const EdgeInsets.all(3),
                  constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                  decoration: const BoxDecoration(color: Color(0xFFEF4444), shape: BoxShape.circle),
                  child: Text('$badge', style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w900), textAlign: TextAlign.center),
                ),
              ),
          ],
        ),
        title: Text(title, style: TextStyle(
          color: isSelected ? theme.colorScheme.primary : theme.colorScheme.onSurface.withOpacity(0.8),
          fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
          fontSize: 15,
        )),
        trailing: badge > 0 ? Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: const Color(0xFFEF4444).withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
          child: Text('$badge', style: const TextStyle(color: Color(0xFFEF4444), fontSize: 11, fontWeight: FontWeight.w800)),
        ) : null,
        selected: isSelected,
        selectedTileColor: theme.colorScheme.primary.withOpacity(0.08),
        hoverColor: theme.colorScheme.primary.withOpacity(0.04),
        onTap: () {
          context.pop(); // Cerrar el drawer
          context.go(route);
        },
      ),
    );
  }
}

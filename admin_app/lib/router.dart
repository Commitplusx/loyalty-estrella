import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'screens/login_screen.dart';
import 'screens/admin_shell.dart';
import 'core/user_role.dart';
import 'screens/clients_screen.dart';
import 'screens/client_detail_screen.dart';
import 'screens/lock_screen.dart';
import 'screens/gastos_screen.dart';
import 'screens/config_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/scanner_screen.dart';
import 'screens/map_screen.dart';
import 'screens/repartidores_screen.dart';
import 'screens/repartidor_detail_screen.dart';
import 'screens/admin_map_screen.dart';
import 'screens/leaderboard_screen.dart';
import 'screens/pedidos_screen.dart';
import 'screens/pedido_detail_screen.dart';
import 'screens/zonas_config_screen.dart';
import 'screens/zonas_entrega_screen.dart';
import 'screens/mapa_zonas_screen.dart';
import 'screens/excepciones_precio_screen.dart';
import 'screens/solicitudes_screen.dart';
import 'screens/h3_editor_webview_screen.dart';
import 'screens/ganancias_screen.dart';
import 'screens/promociones_screen.dart';



final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

// Helper class to trigger GoRouter refreshes on Riverpod state changes
class RouterNotifier extends ChangeNotifier {
  RouterNotifier(this.ref) {
    ref.listen(isAdminProvider, (_, __) => notifyListeners());
    ref.listen(authStateProvider, (_, __) => notifyListeners());
  }
  final Ref ref;
}

final routerProvider = Provider<GoRouter>((ref) {
  final notifier = RouterNotifier(ref);

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/lock',
    refreshListenable: notifier,
    redirect: (context, state) {
      final session = Supabase.instance.client.auth.currentSession;
      final isLogin = state.matchedLocation == '/login';
      final isLock  = state.matchedLocation == '/lock';

      debugPrint('[ROUTER] redirect → loc=${state.matchedLocation} session=${session != null ? "SI" : "NO"} email=${session?.user.email ?? "-"}');

      // Sin sesión → siempre al login
      if (session == null && !isLogin) {
        debugPrint('[ROUTER] Sin sesión → /login');
        return '/login';
      }
      // Con sesión en el login → al lock para que el admin autentique
      if (session != null && isLogin) {
        debugPrint('[ROUTER] Con sesión en login → /lock');
        return '/lock';
      }

      if (session != null) {
        final email   = session.user.email ?? '';
        final isAdmin = email.toLowerCase().endsWith('@admin.com');

        debugPrint('[ROUTER] isAdmin=$isAdmin isLock=$isLock');

        // Si no es admin y está intentando acceder a la app, rechazarlo
        // Podríamos redirigirlo a una pantalla de error o forzar logout.
        if (!isAdmin) {
          debugPrint('[ROUTER] Acceso denegado: Usuario no es admin');
          return '/login'; // O alguna ruta de acceso denegado
        }
      }
      debugPrint('[ROUTER] Sin redirección → null');
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (ctx, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/lock',
        builder: (ctx, state) => const LockScreen(),
      ),
      GoRoute(
        path: '/map',
        builder: (ctx, state) => const MapScreen(),
      ),
      // Deep-link: /pedido/:id (singular, viene de WhatsApp)
      GoRoute(
        path: '/pedido/:id',
        builder: (ctx, state) => PedidoDetailScreen(
          pedidoId: state.pathParameters['id']!,
        ),
      ),
      // Pantalla de Ganancias (standalone, sin shell)
      GoRoute(
        path: '/ganancias',
        builder: (ctx, state) => const GananciasScreen(),
      ),
      // Mapa interactivo completo de repartidores
      GoRoute(
        path: '/live-map',
        builder: (ctx, state) => const AdminMapScreen(),
      ),
      ShellRoute(
        builder: (ctx, state, child) {
          return AdminShell(child: child);
        },
        routes: [
          GoRoute(
            path: '/dashboard',
            pageBuilder: (ctx, state) => _buildPageWithTransition(const DashboardScreen(), state),
          ),
          GoRoute(
            path: '/scanner',
            pageBuilder: (ctx, state) => _buildPageWithTransition(const ScannerScreen(), state),
          ),
          GoRoute(
            path: '/clients',
            pageBuilder: (ctx, state) => _buildPageWithTransition(const ClientsScreen(), state),
          ),
          GoRoute(
            path: '/gastos',
            pageBuilder: (ctx, state) => _buildPageWithTransition(const GastosScreen(), state),
          ),
          GoRoute(
            path: '/repartidores',
            pageBuilder: (ctx, state) => _buildPageWithTransition(const RepartidoresScreen(), state),
          ),
          GoRoute(
            path: '/repartidores/:id',
            pageBuilder: (ctx, state) => _buildPageWithTransition(RepartidorDetailScreen(repartidorId: state.pathParameters['id']!, nombre: state.uri.queryParameters['nombre'] ?? 'Detalle'), state),
          ),
          GoRoute(
            path: '/leaderboard',
            pageBuilder: (ctx, state) => _buildPageWithTransition(const LeaderboardScreen(), state),
          ),
          GoRoute(
            path: '/pedidos',
            pageBuilder: (ctx, state) => _buildPageWithTransition(const PedidosScreen(), state),
          ),
          GoRoute(
            path: '/pedidos/:id',
            pageBuilder: (ctx, state) => _buildPageWithTransition(PedidoDetailScreen(pedidoId: state.pathParameters['id']!), state),
          ),
          GoRoute(
            path: '/solicitudes',
            pageBuilder: (ctx, state) => _buildPageWithTransition(const SolicitudesScreen(), state),
          ),
          GoRoute(
            path: '/promociones',
            pageBuilder: (ctx, state) => _buildPageWithTransition(const PromocionesScreen(), state),
          ),
          GoRoute(
            path: '/config',
            pageBuilder: (ctx, state) => _buildPageWithTransition(const ConfigScreen(), state),
            routes: [
              GoRoute(
                path: 'zonas',
                builder: (ctx, state) => const ZonasConfigScreen(),
              ),
              GoRoute(
                path: 'zonas-entrega',
                builder: (ctx, state) => const ZonasEntregaScreen(),
                routes: [
                  GoRoute(
                    path: 'h3-editor',
                    builder: (ctx, state) => const H3EditorWebViewScreen(),
                  ),
                ],
              ),
              GoRoute(
                path: 'excepciones',
                builder: (ctx, state) => const ExcepcionesPrecioScreen(),
              ),
              GoRoute(
                path: 'mapa-zonas',
                builder: (ctx, state) => const MapaZonasScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

CustomTransitionPage<void> _buildPageWithTransition(Widget child, GoRouterState state) {
  return CustomTransitionPage<void>(
    key: state.pageKey,
    child: child,
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      return FadeTransition(
        opacity: animation,
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0.0, 0.05),
            end: Offset.zero,
          ).animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic)),
          child: child,
        ),
      );
    },
  );
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'screens/login_screen.dart';
import 'screens/driver_shell.dart';
import 'core/user_role.dart';
import 'screens/lock_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/map_screen.dart';
import 'screens/pedido_detail_screen.dart';
import 'screens/ganancias_screen.dart';
import 'screens/pedidos_screen.dart';
import 'screens/config_screen.dart';
import 'screens/driver_onboarding_screen.dart';


final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

// Helper class to trigger GoRouter refreshes on Riverpod state changes
class RouterNotifier extends ChangeNotifier {
  RouterNotifier(this.ref) {
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

//       debugPrint('[ROUTER] redirect → loc=${state.matchedLocation} session=${session != null ? "SI" : "NO"} email=${session?.user.email ?? "-"}');

      // Sin sesión → siempre al login
      if (session == null && !isLogin) {
//         debugPrint('[ROUTER] Sin sesión → /login');
        return '/login';
      }

      if (session != null) {
        // Con sesión válida en el login → al lock
        if (isLogin) {
//           debugPrint('[ROUTER] Con sesión en login → /lock');
          return '/lock';
        }

        // Repartidor con sesión activa → salta directo al dashboard, sin huella
        if (isLock) {
//           debugPrint('[ROUTER] Repartidor con sesión → /dashboard (skip lock)');
          return '/dashboard';
        }
      }
      
//       debugPrint('[ROUTER] Sin redirección → null');
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (ctx, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/onboarding',
        builder: (ctx, state) => const DriverOnboardingScreen(),
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
      GoRoute(
        path: '/pedidos/:id',
        builder: (ctx, state) => PedidoDetailScreen(
          pedidoId: state.pathParameters['id']!,
        ),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return DriverShell(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/dashboard',
                builder: (context, state) => const DashboardScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/ganancias',
                builder: (context, state) => const GananciasScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/perfil',
                builder: (context, state) => const ConfigScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/pedidos',
        builder: (ctx, state) => const PedidosScreen(),
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

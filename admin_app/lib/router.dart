import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'screens/login_screen.dart';
import 'screens/main_shell.dart';
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
import 'screens/leaderboard_screen.dart';
import 'screens/pedidos_screen.dart';
import 'screens/pedido_detail_screen.dart';
import 'screens/zonas_config_screen.dart';
import 'screens/zonas_entrega_screen.dart';
import 'screens/mapa_zonas_screen.dart';
import 'screens/excepciones_precio_screen.dart';
import 'screens/solicitudes_screen.dart';



final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/lock',
    // Deep links: https://www.app-estrella.shop/pedido/:id
    // iOS/Android App Links intercept and open this route directly
    redirect: (context, state) {
      final session = Supabase.instance.client.auth.currentSession;
      final isLogin = state.matchedLocation == '/login';
      if (session == null && !isLogin) return '/login';
      if (session != null && isLogin) return '/lock';

      if (session != null) {
        final email = session.user.email ?? '';
        final isAdmin = email.toLowerCase().endsWith('@admin.com');
        final loc = state.matchedLocation;
        const adminOnlyPrefixes = [
          '/clients',
          '/config',
          '/leaderboard',
          '/map',
          '/solicitudes',
        ];
        if (!isAdmin && adminOnlyPrefixes.any((p) => loc.startsWith(p))) {
          // Repartidores sí pueden ver el detalle de su pedido via deep link
          if (loc.startsWith('/pedidos/')) return null;
          return '/dashboard';
        }
        if (!isAdmin && loc.startsWith('/repartidores/')) {
          return '/repartidores';
        }
      }
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
        path: '/config',
        builder: (ctx, state) => const ConfigScreen(),
        routes: [
          GoRoute(
            path: 'zonas',
            builder: (ctx, state) => const ZonasConfigScreen(),
          ),
          GoRoute(
            path: 'zonas-entrega',
            builder: (ctx, state) => const ZonasEntregaScreen(),
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
      ShellRoute(
        builder: (ctx, state, child) => MainShell(child: child),
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
            path: '/clients/:id',
            pageBuilder: (ctx, state) => _buildPageWithTransition(ClientDetailScreen(clienteId: state.pathParameters['id']!), state),
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

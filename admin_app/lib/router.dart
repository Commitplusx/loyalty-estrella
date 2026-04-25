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
          '/pedidos',
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
            builder: (ctx, state) => const DashboardScreen(),
          ),
          GoRoute(
            path: '/scanner',
            builder: (ctx, state) => const ScannerScreen(),
          ),
          GoRoute(
            path: '/clients',
            builder: (ctx, state) => const ClientsScreen(),
          ),
          GoRoute(
            path: '/gastos',
            builder: (ctx, state) => const GastosScreen(),
          ),
          GoRoute(
            path: '/clients/:id',
            builder: (ctx, state) => ClientDetailScreen(
              clienteId: state.pathParameters['id']!,
            ),
          ),
          GoRoute(
            path: '/repartidores',
            builder: (ctx, state) => const RepartidoresScreen(),
          ),
          GoRoute(
            path: '/repartidores/:id',
            builder: (ctx, state) => RepartidorDetailScreen(
              repartidorId: state.pathParameters['id']!,
              nombre: state.uri.queryParameters['nombre'] ?? 'Detalle',
            ),
          ),
          GoRoute(
            path: '/leaderboard',
            builder: (ctx, state) => const LeaderboardScreen(),
          ),
          GoRoute(
            path: '/pedidos',
            builder: (ctx, state) => const PedidosScreen(),
          ),
          GoRoute(
            path: '/pedidos/:id',
            builder: (ctx, state) => PedidoDetailScreen(
              pedidoId: state.pathParameters['id']!,
            ),
          ),
        ],
      ),
    ],
  );
});

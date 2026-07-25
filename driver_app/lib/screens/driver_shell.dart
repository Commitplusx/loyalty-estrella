import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemNavigator, SystemUiOverlayStyle;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter/rendering.dart';
import '../core/user_role.dart';
import '../core/supabase_config.dart';
import '../core/ui_helpers.dart';
import '../models/pedido_model.dart';
import 'package:flutter/services.dart';
import 'package:audioplayers/audioplayers.dart';
import '../main.dart' show alarmPlayer, stopAlarm;
import 'package:shared_preferences/shared_preferences.dart';
import '../widgets/driver_permissions_checker.dart';
import '../core/connectivity_provider.dart';
import 'dashboard_screen.dart';

final isOverlayVisibleProvider = StateProvider<bool>((ref) => false);
final isUiHiddenProvider = StateProvider<bool>((ref) => false);
final lastSeenPedidosProvider = StateProvider<DateTime>((ref) => DateTime.now());

// Provider para contar pedidos pendientes usando stream
final pendingPedidosCountProvider = StreamProvider<int>((ref) {
  final lastSeen = ref.watch(lastSeenPedidosProvider);
  return supabase
      .from('pedidos')
      .stream(primaryKey: ['id'])
      .map((list) => list.where((p) {
        final dt = DateTime.tryParse(p['created_at'] ?? '');
        if (dt == null) return false;
        final isNew = dt.isAfter(lastSeen);
        
        // 🚀 Contar órdenes que el repartidor puede aceptar (pool o directas)
        final isPool = p['estado'] == 'buscando_repartidor' && (p['repartidor_id'] == null || p['repartidor_id'] == '');
        final isMine = p['repartidor_id'] == supabase.auth.currentUser?.id && p['estado'] == 'ofrecido';
        final isActive = isPool || isMine;
        
        return isNew && isActive;
      }).length);
});

// Provider para detectar viajes asignados al repartidor actual o al pool
final incomingDriverOrderProvider = StreamProvider<PedidoModel?>((ref) {
  final user = supabase.auth.currentUser;
  if (user == null) return Stream.value(null);
  
  return supabase
      .from('pedidos')
      .stream(primaryKey: ['id'])
      .map((list) {
          final pending = list.where((p) {
            final isMine = p['repartidor_id'] == user.id && (p['estado'] == 'preparando' || p['estado'] == 'ofrecido');
            final isPool = p['estado'] == 'buscando_repartidor' && (p['repartidor_id'] == null || p['repartidor_id'] == '');
            return isMine || isPool;
          });
         if (pending.isEmpty) return null;
         
         // Priorizar los míos sobre los del pool
         final mine = pending.where((p) => p['repartidor_id'] == user.id);
         if (mine.isNotEmpty) return PedidoModel.fromMap(mine.first);
         
         return PedidoModel.fromMap(pending.first);
      });
});

// Provider para monitorear la sesión activa (device_id)
final deviceIdMonitorProvider = StreamProvider<String?>((ref) {
  final user = supabase.auth.currentUser;
  if (user == null) return Stream.value(null);
  
  return supabase
      .from('repartidores')
      .stream(primaryKey: ['id'])
      .eq('user_id', user.id)
      .map((list) {
         if (list.isEmpty) return null;
         return list.first['current_device_id'] as String?;
      });
});

class DriverShell extends ConsumerStatefulWidget {
  final StatefulNavigationShell navigationShell;
  const DriverShell({super.key, required this.navigationShell});

  @override
  ConsumerState<DriverShell> createState() => _DriverShellState();
}

class _DriverShellState extends ConsumerState<DriverShell> {
  String? _lastNotifiedOrderId;

  @override
  Widget build(BuildContext context) {
    final state = GoRouterState.of(context);
    final location = state.uri.path;
    final isOverlayVisible = ref.watch(isOverlayVisibleProvider);
    final showPill = (location == '/dashboard' || location == '/ganancias' || location == '/perfil') && !isOverlayVisible;
    
    final incomingOrderAsync = ref.watch(incomingDriverOrderProvider);
    final incomingOrder = incomingOrderAsync.valueOrNull;

    final isConnectedAsync = ref.watch(connectivityProvider);
    final isConnected = isConnectedAsync.valueOrNull ?? true;
    
    // ── MAGIA GLOBAL: Escuchador de Pedidos Apilados / Nuevos ──
    ref.listen<AsyncValue<PedidoModel?>>(incomingDriverOrderProvider, (previous, next) {
      final pedido = next.valueOrNull;
      
      if (pedido != null && _lastNotifiedOrderId != pedido.id) {
        _lastNotifiedOrderId = pedido.id;
        
        try {
          alarmPlayer.stop();
          alarmPlayer.setVolume(1.0);
          alarmPlayer.setReleaseMode(ReleaseMode.loop);
          alarmPlayer.play(AssetSource('sounds/rappi_alarm.mp3'));
        } catch (_) {}

        // Ya NO redirigimos forzosamente a la pestaña "Nuevos".
        // Si están en el mapa, verán el StackedOrderPanel sobre el mapa.
        // Si están en Nuevos, lo verán en la lista.
      } else if (pedido == null) {
        _lastNotifiedOrderId = null;
      }
    });

    // ── MAGIA GLOBAL: Prevención de Sesiones Múltiples ──
    ref.listen<AsyncValue<String?>>(deviceIdMonitorProvider, (previous, next) async {
      final dbDeviceId = next.valueOrNull;
      if (dbDeviceId != null && dbDeviceId.isNotEmpty) {
        final prefs = await SharedPreferences.getInstance();
        final myDeviceId = prefs.getString('my_device_id');
        
        if (myDeviceId != null && myDeviceId != dbDeviceId) {
          // Fue iniciado en otro dispositivo
          if (mounted) {
            await supabase.auth.signOut();
            context.go('/login');
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Sesión cerrada: Has iniciado sesión en otro dispositivo.'),
                backgroundColor: Colors.red,
                duration: Duration(seconds: 8),
              )
            );
          }
        }
      }
    });

    int currentIndex = 0;
    if (location.startsWith('/dashboard')) currentIndex = 0;
    else if (location.startsWith('/ganancias')) currentIndex = 1;
    else if (location.startsWith('/perfil')) currentIndex = 2;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Theme.of(context).brightness == Brightness.dark ? Brightness.light : Brightness.dark,
        systemNavigationBarColor: Colors.white,
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
      child: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, result) async {
          if (didPop) return;
          if (currentIndex != 0) {
            context.go('/dashboard');
            return;
          }
          final shouldExit = await PremiumBottomSheet.showConfirm(
            context,
            title: '¿Salir de la app?',
            content: '¿Estás seguro que quieres cerrar la app?',
            confirmText: 'SALIR',
            cancelText: 'CANCELAR',
            isDestructive: true,
          );
          if (shouldExit == true && context.mounted) SystemNavigator.pop();
        },
        child: Scaffold(
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          body: Stack(
            children: [
              DriverPermissionsChecker(child: widget.navigationShell),
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
          // ── MENÚ INFERIOR ESTILO PÍLDORA (PILL-SHAPE) ──
          floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
          floatingActionButton: showPill
            ? AnimatedSlide(
                duration: const Duration(milliseconds: 500),
                curve: Curves.fastLinearToSlowEaseIn,
                offset: ref.watch(isUiHiddenProvider) ? const Offset(0, 2) : Offset.zero,
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(40),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.08),
                        blurRadius: 20,
                        spreadRadius: 2,
                        offset: const Offset(0, 5),
                      )
                    ]
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _buildNavItem(context, icon: Icons.explore_outlined, activeIcon: Icons.explore, label: 'Inicio', index: 0, currentIndex: widget.navigationShell.currentIndex),
                      _buildNavItem(context, icon: Icons.payments_outlined, activeIcon: Icons.payments, label: 'Ganancias', index: 1, currentIndex: widget.navigationShell.currentIndex),
                      _buildNavItem(context, icon: Icons.person_outline, activeIcon: Icons.person, label: 'Perfil', index: 2, currentIndex: widget.navigationShell.currentIndex),
                    ],
                  ),
                ),
              )
            : null,
        ),
      ),
    );
  }

  Widget _buildNavItem(BuildContext context, {required IconData icon, required IconData activeIcon, required String label, required int index, required int currentIndex}) {
    final isActive = index == currentIndex;
    final color = isActive ? const Color(0xFFFF5722) : Colors.grey.shade500; // Naranja-rojo del diseño
    
    return GestureDetector(
      onTap: () {
        widget.navigationShell.goBranch(
          index,
          initialLocation: index == widget.navigationShell.currentIndex,
        );
      },
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(isActive ? activeIcon : icon, color: color, size: 26),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
              ),
            )
          ],
        ),
      ),
    );
  }
}

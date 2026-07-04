import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:battery_plus/battery_plus.dart';
import 'package:volume_controller/volume_controller.dart';
import '../services/repartidor_service.dart';
import '../core/supabase_config.dart';
import '../core/theme_provider.dart';

import 'package:geolocator/geolocator.dart';
import 'package:animate_do/animate_do.dart';
import 'package:shimmer/shimmer.dart';

class DriverDashboardView extends ConsumerStatefulWidget {
  final Map<String, dynamic>? stats;
  const DriverDashboardView({super.key, this.stats});

  @override
  ConsumerState<DriverDashboardView> createState() => _DriverDashboardViewState();
}

class _DriverDashboardViewState extends ConsumerState<DriverDashboardView> {
  static bool? _cachedIsOnline;
  static LatLng? _cachedLocation;
  static String? _cachedRepartidorId;
  static String? _cachedNombre;

  late bool _isOnline;
  bool _isPressed = false;
  bool _sosSending = false;
  String? _repartidorId;
  String _repartidorNombre = '';
  late LatLng _currentLocation;
  
  // Novedades para el tracker e Inteligencia
  Map<String, dynamic>? _pedidoActivo;
  StreamSubscription<Position>? _positionStream;
  final MapController _mapController = MapController();

  @override
  void initState() {
    super.initState();
    _isOnline = _cachedIsOnline ?? false;
    _currentLocation = _cachedLocation ?? const LatLng(16.2519, -92.1345);
    _repartidorId = _cachedRepartidorId;
    // Pre-cargar nombre desde caché para que el SOS funcione aunque no haya terminado el fetch
    _repartidorNombre = _cachedNombre ??
        (supabase.auth.currentUser?.email?.split('@').first ?? '');
    _loadStatusSilently();
  }

  Future<void> _loadStatusSilently() async {
    final statusData = await ref.read(repartidorServiceProvider).getCurrentStatus();
    
    // Attempt to get location and start stream
    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.whileInUse || permission == LocationPermission.always) {
        final pos = await Geolocator.getCurrentPosition();
        _currentLocation = LatLng(pos.latitude, pos.longitude);
        _cachedLocation = _currentLocation;

        // Suscribirse a cambios de ubicación en vivo
        _positionStream = Geolocator.getPositionStream(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 5, // Notificar cada 5 metros
          ),
        ).listen((Position position) {
          if (mounted) {
            setState(() {
              _currentLocation = LatLng(position.latitude, position.longitude);
              _cachedLocation = _currentLocation;
              _mapController.move(_currentLocation, 15);
            });
            // Si está online, podríamos actualizar en Supabase silenciosamente, pero para no saturar 
            // la BD lo dejaremos local y la updateStatus principal se encarga cuando hay eventos mayores
          }
        });
      }
    } catch (e) {
      debugPrint("Could not get location: $e");
    }

      if (mounted) {
        setState(() {
          _isOnline = statusData['activo'] ?? false;
          _repartidorId = statusData['id'];
          // Usar nombre de la BD; si viene vacío, caer en el email del auth
          final nombreBD = statusData['nombre'] as String? ?? '';
          _repartidorNombre = nombreBD.isNotEmpty
              ? nombreBD
              : (supabase.auth.currentUser?.email?.split('@').first ?? 'Repartidor');
          _cachedIsOnline = _isOnline;
          _cachedRepartidorId = _repartidorId;
          _cachedNombre = _repartidorNombre; // guardar en caché estática
        });

        // 🚨 Inteligencia: Buscar si el repartidor tiene algún pedido activo pendiente
        if (_repartidorId != null) {
          await _checkPedidoActivo();
          
          // FORZAR CHECKLIST: Si estaba "En línea" pero NO tiene pedidos, lo apagamos.
          // Así se obliga a presionar el botón y pasar por la revisión de Batería/GPS/Volumen.
          if (_isOnline && _pedidoActivo == null && mounted) {
            setState(() {
              _isOnline = false;
              _cachedIsOnline = false;
            });
            ref.read(repartidorServiceProvider).updateStatus(_repartidorId!, false);
          }
        }
      }
    }

  Future<void> _checkPedidoActivo() async {
    try {
      final data = await supabase
          .from('pedidos')
          .select('*, restaurante: restaurantes(nombre_comercial)')
          .eq('repartidor_id', _repartidorId!)
          .inFilter('estado', ['asignado', 'aceptado', 'en_camino', 'recibido'])
          .order('created_at', ascending: false)
          .limit(1)
          .maybeSingle();

      if (mounted && data != null) {
        setState(() {
          _pedidoActivo = data;
        });
      }
    } catch (e) {
      debugPrint('Error buscando pedido activo: $e');
    }
  }

  @override
  void dispose() {
    _positionStream?.cancel();
    super.dispose();
  }

  Future<int?> _mostrarTipsInicio() async {
    // 1. Obtener Batería
    final battery = Battery();
    int batteryLevel = 0;
    try {
      batteryLevel = await battery.batteryLevel;
    } catch (e) {
      debugPrint("Error battery: $e");
    }

    // 2. Obtener GPS
    bool gpsEnabled = false;
    try {
      gpsEnabled = await Geolocator.isLocationServiceEnabled();
      if (gpsEnabled) {
         LocationPermission permission = await Geolocator.checkPermission();
         gpsEnabled = permission == LocationPermission.whileInUse || permission == LocationPermission.always;
      }
    } catch (e) {
      debugPrint("Error GPS: $e");
    }

    // 3. Obtener Volumen
    double currentVolume = 0.0;
    try {
      currentVolume = await VolumeController.instance.getVolume();
    } catch (e) {
      debugPrint("Error volume: $e");
    }
    final isVolumeOk = currentVolume > 0.2; // Más de 20% de volumen

    if (!mounted) return null;

    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        bool isLoading = false;
        return StatefulBuilder(
          builder: (context, setStateDialog) {
            return Dialog(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Icono animado
                    Container(
                      width: 72, height: 72,
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withOpacity(0.12),
                        shape: BoxShape.circle,
                      ),
                      child: isLoading 
                        ? const CircularProgressIndicator(color: Color(0xFF10B981))
                        : const Icon(Icons.emoji_events_rounded, color: Color(0xFF10B981), size: 36),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      isLoading ? 'Conectando...' : '¡Listo para salir, ${_repartidorNombre.split(' ').first}! 🛵',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      isLoading ? 'Preparando tu GPS y perfil...' : 'Revisión antes del turno:',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                    ),
                    const SizedBox(height: 20),
                    _TipItem(
                      icon: Icons.battery_charging_full_rounded, 
                      color: batteryLevel >= 15 ? const Color(0xFF10B981) : Colors.red, 
                      text: 'Batería: $batteryLevel%',
                      isCheck: batteryLevel >= 15,
                    ),
                    _TipItem(
                      icon: Icons.location_on_rounded, 
                      color: gpsEnabled ? const Color(0xFF3B82F6) : Colors.red, 
                      text: gpsEnabled ? 'Ubicación GPS activada' : 'Falta activar GPS o permisos',
                      isCheck: gpsEnabled,
                    ),
                    _TipItem(
                      icon: Icons.volume_up_rounded, 
                      color: isVolumeOk ? const Color(0xFF8B5CF6) : Colors.red, 
                      text: isVolumeOk ? 'Volumen adecuado (${(currentVolume * 100).toInt()}%)' : 'Celular en silencio o volumen muy bajo',
                      isCheck: isVolumeOk,
                    ),
                    const _TipItem(icon: Icons.two_wheeler_rounded, color: Color(0xFFF59E0B), text: 'Vehículo con combustible'),
                    const _TipItem(icon: Icons.wallet_rounded, color: Color(0xFFF43F5E), text: 'Efectivo para pagos y vueltos'),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: isLoading ? null : () async {
                           if (!gpsEnabled) {
                              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Activa tu GPS y acepta los permisos primero.'), backgroundColor: Colors.red));
                              return;
                           }
                           if (!isVolumeOk) {
                              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Por favor, sube el volumen para escuchar los nuevos pedidos.'), backgroundColor: Colors.orange));
                              return;
                           }
                           
                           setStateDialog(() => isLoading = true);
                           // Simular tiempo de conexión para dar feedback visual (5 segundos)
                           await Future.delayed(const Duration(milliseconds: 5000));
                           if (ctx.mounted) {
                             Navigator.pop(ctx, true);
                           }
                        },
                        icon: isLoading 
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Icon(Icons.rocket_launch_rounded),
                        label: Text(
                          isLoading ? 'Iniciando turno...' : '¡Todo listo, iniciar turno!', 
                          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15)
                        ),
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF10B981),
                          disabledBackgroundColor: const Color(0xFF10B981).withOpacity(0.5),
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextButton(
                      onPressed: isLoading ? null : () => Navigator.pop(ctx, false),
                      child: Text('Cancelar', style: TextStyle(color: isLoading ? Colors.grey[400] : Colors.grey[500], fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ),
            );
          }
        );
      },
    );
    return result == true ? batteryLevel : null;
  }

  Future<void> _toggleStatus(bool value) async {
    if (_repartidorId == null) return;

    int? batteryLevel;
    // Si va a ponerse EN LÍNEA, mostrar tips de inicio de turno primero
    if (value) {
      batteryLevel = await _mostrarTipsInicio();
      if (batteryLevel == null || !mounted) return;
      
      // Mostrar éxito PRIMERO
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: const [
              Icon(Icons.check_circle_rounded, color: Colors.white),
              SizedBox(width: 12),
              Expanded(child: Text('¡Estás en línea! Recibiendo pedidos...')),
            ],
          ),
          backgroundColor: const Color(0xFF10B981),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          margin: const EdgeInsets.all(16),
          duration: const Duration(seconds: 3),
        ),
      );

      // Esperar un segundo para que el usuario lea el snackbar antes de cambiar el botón
      await Future.delayed(const Duration(seconds: 1));
      if (!mounted) return;

    } else {
      // Si se apaga, opcionalmente mandar batería también
      try {
        batteryLevel = await Battery().batteryLevel;
      } catch (_) {}
    }

    setState(() {
      _isOnline = value;
      _cachedIsOnline = value;
    });
    final success = await ref.read(repartidorServiceProvider).updateStatus(
      _repartidorId!, 
      value,
      lat: _currentLocation.latitude,
      lng: _currentLocation.longitude,
      bateria: batteryLevel,
    );
    if (!success) {
      // Revert if failed
      if (mounted) {
        setState(() {
          _isOnline = !value;
          _cachedIsOnline = !value;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Error al actualizar estado')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final ganancias = widget.stats?['ganancias'] ?? 0.0;
    final viajes = widget.stats?['servicios'] ?? 0;
    final deuda = widget.stats?['deuda'] ?? 0.0;
    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      child: Padding(
        padding: const EdgeInsets.only(bottom: 120),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 🚨 Tarjeta de Recuperación de Pedido Activo
            if (_pedidoActivo != null)
              Pulse(
                infinite: true,
                child: Container(
                  margin: const EdgeInsets.only(bottom: 24),
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF59E0B),
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [BoxShadow(color: const Color(0xFFF59E0B).withOpacity(0.4), blurRadius: 15, offset: const Offset(0, 8))],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.warning_rounded, color: Colors.white, size: 28),
                          const SizedBox(width: 12),
                          const Expanded(child: Text('¡TIENES UN PEDIDO EN CURSO!', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16, letterSpacing: 1))),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text('Restaurante: ${_pedidoActivo!['restaurante']?['nombre_comercial'] ?? 'Desconocido'}', style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600)),
                      Text('Destino: ${_pedidoActivo!['direccion'] ?? 'Sin dirección'}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70, fontSize: 13)),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: () {
                             // Aquí se navega a la pantalla normal del pedido
                             // Por ahora, mostrará un SnackBar y luego puedes atarlo a tu router
                             ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Navegando a los detalles del pedido...')));
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.white,
                            foregroundColor: const Color(0xFFF59E0B),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            padding: const EdgeInsets.symmetric(vertical: 14),
                          ),
                          child: const Text('CONTINUAR PEDIDO', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            // ── Botón de Conexión (Elegante con Shimmer) ──
            AnimatedContainer(
              duration: const Duration(milliseconds: 500),
              curve: Curves.fastOutSlowIn,
              width: double.infinity,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(32),
                gradient: LinearGradient(
                  colors: _isOnline 
                      ? [const Color(0xFF11998E), const Color(0xFF38EF7D)]
                      : [Colors.grey.shade300, Colors.grey.shade400],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                boxShadow: _isOnline
                    ? [BoxShadow(color: const Color(0xFF38EF7D).withOpacity(0.6), blurRadius: 25, spreadRadius: 4, offset: const Offset(0, 8))]
                    : [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 10, offset: const Offset(0, 5))],
              ),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () async {
                    if (_isOnline) {
                      final confirm = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                          title: const Row(
                            children: [
                              Icon(Icons.power_settings_new_rounded, color: Colors.redAccent),
                              SizedBox(width: 10),
                              Text('¿Terminar Turno?', style: TextStyle(fontWeight: FontWeight.bold)),
                            ],
                          ),
                          content: const Text('Dejarás de recibir pedidos y te desconectarás de la red. ¿Estás seguro?'),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(ctx, false), 
                              child: const Text('Cancelar', style: TextStyle(fontWeight: FontWeight.bold))
                            ),
                            FilledButton(
                              onPressed: () => Navigator.pop(ctx, true), 
                              style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
                              child: const Text('Sí, terminar', style: TextStyle(fontWeight: FontWeight.bold)),
                            ),
                          ],
                        ),
                      );
                      if (confirm == true) {
                        _toggleStatus(false);
                      }
                    } else {
                      _toggleStatus(true);
                    }
                  },
                  borderRadius: BorderRadius.circular(32),
                  splashColor: Colors.white.withOpacity(0.3),
                  highlightColor: Colors.white.withOpacity(0.1),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (_isOnline)
                          const Icon(Icons.radar_rounded, color: Colors.white, size: 36)
                        else
                          Icon(Icons.power_settings_new_rounded, color: cs.onSurfaceVariant, size: 36),
                        const SizedBox(width: 14),
                        if (_isOnline)
                          Shimmer.fromColors(
                            baseColor: Colors.white,
                            highlightColor: Colors.black12,
                            period: const Duration(seconds: 2),
                            child: const Text(
                              'BUSCANDO PEDIDOS...',
                              style: TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.5,
                              ),
                            ),
                          )
                        else
                          Text(
                            'INICIAR TURNO',
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              color: cs.onSurfaceVariant,
                              letterSpacing: 1.5,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            
            const SizedBox(height: 28),

            // ── Billetera Dual (Premium Gradient) ──
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF1E293B), Color(0xFF0F172A)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(32),
                boxShadow: [
                  BoxShadow(color: const Color(0xFF0F172A).withOpacity(0.3), blurRadius: 20, offset: const Offset(0, 10))
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('MI BILLETERA', style: TextStyle(fontSize: 14, color: Colors.white70, fontWeight: FontWeight.w900, letterSpacing: 1.2)),
                      const Icon(Icons.account_balance_wallet_rounded, color: Color(0xFF38EF7D), size: 24),
                    ],
                  ),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Ganancias', style: TextStyle(fontSize: 13, color: Colors.white70, fontWeight: FontWeight.w600)),
                            const SizedBox(height: 4),
                            Text('\$${ganancias.toStringAsFixed(2)}', style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Color(0xFF38EF7D), letterSpacing: -1)),
                          ],
                        ),
                      ),
                      Container(width: 1, height: 50, color: Colors.white24),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(left: 16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Efectivo a entregar', style: TextStyle(fontSize: 13, color: Colors.white70, fontWeight: FontWeight.w600)),
                              const SizedBox(height: 4),
                              Text('\$${deuda.toStringAsFixed(2)}', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Color(0xFFF43F5E), letterSpacing: -1)),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            
            const SizedBox(height: 24),

            // ── Gamificación y Stats ──
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      gradient: isDark 
                          ? LinearGradient(colors: [const Color(0xFFF59E0B).withOpacity(0.15), const Color(0xFFD97706).withOpacity(0.05)])
                          : const LinearGradient(colors: [Color(0xFFFFFBEB), Color(0xFFFEF3C7)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                      borderRadius: BorderRadius.circular(28),
                      border: Border.all(color: const Color(0xFFF59E0B).withOpacity(isDark ? 0.2 : 0.4)),
                      boxShadow: isDark ? null : [BoxShadow(color: const Color(0xFFF59E0B).withOpacity(0.15), blurRadius: 15, offset: const Offset(0, 8))],
                    ),
                    child: Column(
                      children: [
                        const Icon(Icons.workspace_premium_rounded, color: Color(0xFFF59E0B), size: 36),
                        const SizedBox(height: 12),
                        Text('Nivel Diamante', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: isDark ? Colors.white : const Color(0xFF92400E))),
                        const SizedBox(height: 4),
                        Text('$viajes Viajes', style: TextStyle(color: isDark ? Colors.white70 : const Color(0xFFB45309), fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      gradient: isDark 
                          ? LinearGradient(colors: [const Color(0xFF8B5CF6).withOpacity(0.15), const Color(0xFF6D28D9).withOpacity(0.05)])
                          : const LinearGradient(colors: [Color(0xFFFAF5FF), Color(0xFFF3E8FF)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                      borderRadius: BorderRadius.circular(28),
                      border: Border.all(color: const Color(0xFF8B5CF6).withOpacity(isDark ? 0.2 : 0.4)),
                      boxShadow: isDark ? null : [BoxShadow(color: const Color(0xFF8B5CF6).withOpacity(0.15), blurRadius: 15, offset: const Offset(0, 8))],
                    ),
                    child: Column(
                      children: [
                        const Icon(Icons.star_rounded, color: Color(0xFF8B5CF6), size: 36),
                        const SizedBox(height: 12),
                        Text('Calificación', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: isDark ? Colors.white : const Color(0xFF5B21B6))),
                        const SizedBox(height: 4),
                        Text('4.98 ★', style: TextStyle(color: isDark ? Colors.white70 : const Color(0xFF7C3AED), fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 32),

            // ── SOS Botón ──
            GestureDetector(
              onTap: _sosSending ? null : () async {
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                    title: const Text('🆘 Enviar Emergencia', style: TextStyle(fontWeight: FontWeight.bold)),
                    content: const Text(
                      'Se enviará una alerta de emergencia al Administrador con tu ubicación actual.\n\n'
                      '¿Confirmas que estás en una situación de emergencia?',
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: const Text('Cancelar', style: TextStyle(fontWeight: FontWeight.bold)),
                      ),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFF43F5E),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        onPressed: () => Navigator.pop(ctx, true),
                        child: const Text('Sí, Enviar SOS', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                );
                if (confirm != true || !mounted) return;
                setState(() => _sosSending = true);
                final ok = await ref.read(repartidorServiceProvider).enviarSOS(
                  _repartidorNombre,
                  lat: _currentLocation.latitude,
                  lng: _currentLocation.longitude,
                );
                if (mounted) {
                  setState(() => _sosSending = false);
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                    content: Text(ok ? '🆘 Alerta enviada al Admin' : 'Error al enviar la alerta'),
                    backgroundColor: ok ? const Color(0xFFF43F5E) : Colors.grey,
                  ));
                }
              },
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 300),
                opacity: _sosSending ? 0.5 : 1.0,
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 20),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF43F5E).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: const Color(0xFFF43F5E).withOpacity(0.3)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (_sosSending)
                        const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Color(0xFFF43F5E), strokeWidth: 2))
                      else
                        const Icon(Icons.sos_rounded, color: Color(0xFFF43F5E), size: 28),
                      const SizedBox(width: 12),
                      Text(
                        _sosSending ? 'ENVIANDO...' : 'EMERGENCIA (SOS)',
                        style: const TextStyle(color: Color(0xFFF43F5E), fontWeight: FontWeight.w900, fontSize: 16, letterSpacing: 1),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            const SizedBox(height: 32),

            // ── Zonas Calientes ──
            Text('Zonas Calientes', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: cs.onSurface)),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: SizedBox(
                height: 200,
                child: FlutterMap(
                  mapController: _mapController,
                  options: MapOptions(
                    initialCenter: _currentLocation, // Centrado dinámico o Comitán
                    initialZoom: 14,
                    interactionOptions: const InteractionOptions(flags: InteractiveFlag.none),
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: isDark
                          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                          : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                      subdomains: const ['a', 'b', 'c', 'd'],
                    ),
                    // Círculo decorativo rojo simulando "hotspot" (Zonas Calientes) con latido
                    if (_pedidoActivo == null)
                      CircleLayer(
                        circles: [
                          CircleMarker(
                            point: _currentLocation, // Idealmente el centro de una zona de alta demanda real
                            color: Colors.red.withOpacity(0.15),
                            borderColor: Colors.red.withOpacity(0.5),
                            borderStrokeWidth: 2,
                            useRadiusInMeter: true,
                            radius: 400, // Más pequeño
                          ),
                        ],
                      ),
                    // Animación de latido sobre el hotspot
                    if (_pedidoActivo == null)
                      Pulse(
                        infinite: true,
                        duration: const Duration(seconds: 3),
                        child: CircleLayer(
                          circles: [
                            CircleMarker(
                              point: _currentLocation,
                              color: Colors.red.withOpacity(0.2),
                              borderColor: Colors.transparent,
                              useRadiusInMeter: true,
                              radius: 200, // Latido más concentrado
                            ),
                          ],
                        ),
                      ),
                    // ── RUTA DE NAVEGACIÓN (LÍNEA AZUL) ──
                    // Aquí es donde se dibujará la línea de la ruta cuando el backend devuelva la polyline
                    PolylineLayer(
                      polylines: [
                        Polyline(
                          points: const <LatLng>[], // TODO: Llenar con _routePoints decodificado desde get-route
                          color: const Color(0xFF3B82F6), // Azul brillante estilo Uber
                          strokeWidth: 5,
                        ),
                      ],
                    ),
                    // Puntos de demanda (simulados) más cerca para que se vean bien
                    if (_pedidoActivo == null)
                      MarkerLayer(
                        markers: [
                          Marker(
                            point: LatLng(_currentLocation.latitude + 0.002, _currentLocation.longitude + 0.0015),
                            width: 30, height: 30,
                            child: Pulse(
                              infinite: true, duration: const Duration(seconds: 2),
                              child: Container(
                                decoration: BoxDecoration(color: const Color(0xFFF59E0B).withOpacity(0.4), shape: BoxShape.circle),
                                child: Center(child: Container(width: 10, height: 10, decoration: const BoxDecoration(color: Color(0xFFF59E0B), shape: BoxShape.circle))),
                              ),
                            ),
                          ),
                          Marker(
                            point: LatLng(_currentLocation.latitude - 0.0015, _currentLocation.longitude - 0.0025),
                            width: 30, height: 30,
                            child: Pulse(
                              infinite: true, duration: const Duration(milliseconds: 2500),
                              child: Container(
                                decoration: BoxDecoration(color: const Color(0xFFF59E0B).withOpacity(0.4), shape: BoxShape.circle),
                                child: Center(child: Container(width: 10, height: 10, decoration: const BoxDecoration(color: Color(0xFFF59E0B), shape: BoxShape.circle))),
                              ),
                            ),
                          ),
                          Marker(
                            point: LatLng(_currentLocation.latitude + 0.0025, _currentLocation.longitude - 0.001),
                            width: 30, height: 30,
                            child: Pulse(
                              infinite: true, duration: const Duration(milliseconds: 2200),
                              child: Container(
                                decoration: BoxDecoration(color: const Color(0xFFF59E0B).withOpacity(0.4), shape: BoxShape.circle),
                                child: Center(child: Container(width: 10, height: 10, decoration: const BoxDecoration(color: Color(0xFFF59E0B), shape: BoxShape.circle))),
                              ),
                            ),
                          ),
                        ],
                      ),
                    // Marcador del repartidor animado en tiempo real
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: _currentLocation,
                          width: 40,
                          height: 40,
                          child: Pulse(
                            infinite: true,
                            duration: const Duration(milliseconds: 1500),
                            child: Container(
                              decoration: BoxDecoration(
                                color: const Color(0xFF3B82F6).withOpacity(0.3),
                                shape: BoxShape.circle,
                              ),
                              child: Center(
                                child: Container(
                                  width: 16,
                                  height: 16,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF3B82F6),
                                    shape: BoxShape.circle,
                                    border: Border.all(color: Colors.white, width: 2),
                                    boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 4)],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatBadge extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _StatBadge({required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: isDark ? color.withOpacity(0.8) : color),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(fontWeight: FontWeight.w700, color: isDark ? color.withOpacity(0.8) : color, fontSize: 12)),
        ],
      ),
    );
  }
}

class _TipItem extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String text;
  final bool? isCheck;

  const _TipItem({required this.icon, required this.color, required this.text, this.isCheck});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 14, 
                fontWeight: FontWeight.w500,
                color: isCheck == false ? Colors.red : null,
              ),
            ),
          ),
          if (isCheck != null)
            Icon(
              isCheck! ? Icons.check_circle_rounded : Icons.cancel_rounded,
              color: isCheck! ? const Color(0xFF10B981) : Colors.red,
              size: 20,
            ),
        ],
      ),
    );
  }
}

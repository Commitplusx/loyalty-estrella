import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/pedido_model.dart';
import '../utils/routing_engine.dart';
import '../widgets/itinerary_stepper.dart';
import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:geolocator/geolocator.dart';
import 'dart:io';
import '../services/local_database.dart';
import 'driver_pedidos_screen.dart' show pedidosActivosProvider;
import '../core/theme.dart';

class DriverActivePedidoView extends ConsumerStatefulWidget {
  final PedidoModel pedido;
  final VoidCallback? onRefresh;

  const DriverActivePedidoView({
    super.key,
    required this.pedido,
    this.onRefresh,
  });

  @override
  ConsumerState<DriverActivePedidoView> createState() => _DriverActivePedidoViewState();
}

class _DriverActivePedidoViewState extends ConsumerState<DriverActivePedidoView> {
  Timer? _etaTimer;
  String _etaText = 'Calculando ETA...';
  double _distanceToTargetKm = 999.0;
  Position? _currentLocation;

  @override
  void initState() {
    super.initState();
    _fetchETA();
    _etaTimer = Timer.periodic(const Duration(seconds: 15), (_) => _fetchETA());
  }

  @override
  void dispose() {
    _etaTimer?.cancel();
    super.dispose();
  }

  Future<void> _fetchETA() async {
    if (!mounted) return;
    try {
      final pos = await Geolocator.getLastKnownPosition() ?? await Geolocator.getCurrentPosition();
      final targetLat = widget.pedido.estado == 'asignado' ? (widget.pedido.restauranteLat ?? widget.pedido.lat ?? 0.0) : (widget.pedido.lat ?? 0.0);
      final targetLng = widget.pedido.estado == 'asignado' ? (widget.pedido.restauranteLng ?? widget.pedido.lng ?? 0.0) : (widget.pedido.lng ?? 0.0);
      
      if (targetLat == 0.0 || targetLng == 0.0) return;

      final dist = Geolocator.distanceBetween(pos.latitude, pos.longitude, targetLat, targetLng);
      if (mounted) {
        setState(() {
          _distanceToTargetKm = dist / 1000.0;
          _currentLocation = pos;
        });
      }

      // Call Google Maps Directions API
      final url = Uri.parse('https://maps.googleapis.com/maps/api/directions/json?origin=\${pos.latitude},\${pos.longitude}&destination=\$targetLat,\$targetLng&key=AIzaSyBOZkp595ze0Agwb7yPG5u7MD29EL9gHMw');
      final response = await http.get(url);
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['routes'] != null && data['routes'].isNotEmpty) {
          final route = data['routes'][0]['legs'][0];
          final duration = route['duration']['text'];
          final distance = route['distance']['text'];
          if (mounted) {
            setState(() {
              _etaText = 'A \$duration de distancia (\$distance)';
            });
          }
        }
      }
    } catch (e) {
      debugPrint('Error fetchETA: \$e');
    }
  }

  Future<void> _launchMaps(double lat, double lng) async {
    final url = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng');
    try {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } catch (e) {
      debugPrint('No se pudo abrir Maps: $e');
    }
  }

  Future<void> _callPhone(String phone) async {
    final url = Uri.parse('tel:$phone');
    try {
      await launchUrl(url);
    } catch (e) {
      debugPrint('No se pudo llamar: $e');
    }
  }

  Future<void> _openWhatsApp(String phone, String? name, String estado) async {
    final cleanPhone = phone.replaceAll(RegExp(r'\D'), '');
    final nombreStr = name != null && name.trim().isNotEmpty ? ' $name' : '';
    
    String mensaje;
    if (estado == 'asignado' || estado == 'recibido') {
      mensaje = 'Hola$nombreStr, soy tu repartidor de Estrella 🛵. Ya estoy atendiendo tu pedido.';
    } else if (estado == 'en_camino') {
      mensaje = 'Hola$nombreStr, soy tu repartidor de Estrella 🛵. ¡Voy en camino a tu ubicación!';
    } else {
      mensaje = 'Hola$nombreStr, soy tu repartidor de Estrella 🛵. Te contacto sobre tu pedido.';
    }

    final encodedMessage = Uri.encodeComponent(mensaje);
    final url = Uri.parse('https://wa.me/52$cleanPhone?text=$encodedMessage');
    try {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } catch (e) {
      debugPrint('No se pudo abrir WhatsApp: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final pedido = widget.pedido;
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final onSurface = isDark ? Colors.white : const Color(0xFF1E293B);

    final bool isGoingToRest = pedido.estado == 'asignado';
    final double targetLat = isGoingToRest 
        ? (pedido.restauranteLat ?? pedido.lat ?? 0.0) 
        : (pedido.lat ?? 0.0);
    final double targetLng = isGoingToRest 
        ? (pedido.restauranteLng ?? pedido.lng ?? 0.0) 
        : (pedido.lng ?? 0.0);
    final String targetName = isGoingToRest 
        ? (pedido.restaurante ?? 'Restaurante') 
        : (pedido.clienteNombre ?? 'Cliente');

    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ITINERARIO (Sustituye al mapa)
          Consumer(
            builder: (context, ref, child) {
              final pedidosAsync = ref.watch(pedidosActivosProvider);
              if (!pedidosAsync.hasValue || pedidosAsync.value!.isEmpty) {
                return Container(
                  margin: const EdgeInsets.all(16),
                  height: 100,
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF1E293B) : Colors.grey.shade200,
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: const Center(child: CircularProgressIndicator()),
                );
              }
              
              final pedidos = pedidosAsync.value!;
              final lat = _currentLocation?.latitude ?? 0.0;
              final lng = _currentLocation?.longitude ?? 0.0;
              
              final todasLasParadas = RoutingEngine.calcularTodasLasParadas(
                pedidos, 
                lat, 
                lng
              );
              
              if (todasLasParadas.isEmpty) return const SizedBox.shrink();
              
              // Buscar en qué índice del stepper estamos para EL PEDIDO ACTUAL
              int currentIndex = -1;
              for (int i = 0; i < todasLasParadas.length; i++) {
                final p = todasLasParadas[i];
                if (p['completado'] == false) {
                  currentIndex = i;
                  break;
                }
              }
              if (currentIndex == -1) currentIndex = todasLasParadas.length;

              return Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Ruta Activa', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: onSurface)),
                    const SizedBox(height: 12),
                    ItineraryStepper(paradas: todasLasParadas, currentIndex: currentIndex, isDark: isDark),
                  ],
                ),
              );
            },
          ),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Itinerario',
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: onSurface),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: Colors.blue.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
                  child: Text(_etaText, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.blue)),
                ),
              ],
            ),
          ),

          const SizedBox(height: 12),
          // PANEL DE ACCIÓN (Estilo Uber/Rappi - Solo muestra la acción actual)
          _buildCurrentActionPanel(context, pedido),
          
          const SizedBox(height: 40),
        ],
      ),
    );
  }

  Widget _buildCurrentActionPanel(BuildContext context, PedidoModel pedido) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final onSurface = isDark ? Colors.white : const Color(0xFF1E293B);

    Widget content = const SizedBox.shrink();
    String title = '';
    IconData icon = Icons.info;

    if (pedido.estado == 'ofrecido' || pedido.estado == 'pendiente' || pedido.estado == 'pendiente_pago') {
      title = '0. Aceptar Pedido';
      icon = Icons.thumb_up_alt_rounded;
      final double fee = pedido.precioEntrega ?? pedido.costoEnvioCalculado;
      content = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Tienes un nuevo pedido asignado. ¡Acéptalo rápido antes de que pase al siguiente repartidor!', style: TextStyle(fontSize: 14, color: onSurface)),
          const SizedBox(height: 16),
          Center(
            child: Text(
              '\$${fee.toStringAsFixed(2)}',
              style: const TextStyle(fontSize: 48, fontWeight: FontWeight.w900, color: AppColors.brandRed, letterSpacing: -1),
            ),
          ),
          const Center(
            child: Text('GANANCIA ESTIMADA', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey)),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurface : const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.storefront_rounded, color: Colors.orange, size: 20),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('RECOGER EN', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey)),
                          Text(pedido.restaurante ?? 'Restaurante', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: onSurface)),
                        ],
                      ),
                    ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.only(left: 9, top: 4, bottom: 4),
                  child: Container(width: 2, height: 20, color: Colors.grey.withOpacity(0.3)),
                ),
                Row(
                  children: [
                    const Icon(Icons.location_on_rounded, color: AppColors.brandRed, size: 20),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('ENTREGAR EN', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey)),
                          Text(pedido.direccion ?? 'Dirección del cliente', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: onSurface)),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: Container(
              decoration: BoxDecoration(
                gradient: AppGradients.brand,
                borderRadius: BorderRadius.circular(16),
              ),
              child: ElevatedButton(
                onPressed: () => _avanzarEstado(context, 'asignado', '¡Pedido Aceptado!'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent, 
                  shadowColor: Colors.transparent, 
                  foregroundColor: Colors.white, 
                  padding: const EdgeInsets.symmetric(vertical: 16)
                ),
                child: const Text('ACEPTAR PEDIDO', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 1)),
              ),
            ),
          ),
        ],
      );
    } else if (pedido.estado == 'asignado') {
      title = 'Dirígete al Restaurante';
      icon = Icons.storefront_rounded;
      content = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (pedido.restauranteLogoUrl != null && pedido.restauranteLogoUrl!.isNotEmpty) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.network(
                    pedido.restauranteLogoUrl!,
                    width: 36,
                    height: 36,
                    fit: BoxFit.cover,
                    errorBuilder: (c,e,s) => Container(
                      width: 36, height: 36, 
                      color: onSurface.withOpacity(0.05),
                      child: Icon(Icons.store, size: 20, color: onSurface.withOpacity(0.5))
                    ),
                  ),
                ),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: Text(pedido.restaurante ?? 'Restaurante', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: onSurface, letterSpacing: -0.5)),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (pedido.restauranteLat != null)
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => _launchMaps(pedido.restauranteLat!, pedido.restauranteLng!),
                icon: const Icon(Icons.directions, size: 20),
                label: const Text('Navegar en Maps', style: TextStyle(fontWeight: FontWeight.bold)),
                style: OutlinedButton.styleFrom(
                  foregroundColor: onSurface,
                  side: BorderSide(color: isDark ? AppColors.darkBorder : Colors.black12, width: 1.5),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: Container(
              decoration: BoxDecoration(
                gradient: AppGradients.brand,
                borderRadius: BorderRadius.circular(16),
              ),
              child: ElevatedButton(
                onPressed: () => _avanzarEstado(context, 'recibido', 'Marcado en restaurante'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent, 
                  shadowColor: Colors.transparent,
                  foregroundColor: Colors.white, 
                  padding: const EdgeInsets.symmetric(vertical: 16)
                ),
                child: const Text('LLEGUÉ AL RESTAURANTE', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1)),
              ),
            ),
          ),
        ],
      );
    } else if (pedido.estado == 'recibido') {
      title = 'Recolecta el Pedido';
      icon = Icons.shopping_bag_rounded;
      content = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkBg : const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: isDark ? AppColors.darkBorder : Colors.black12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Descripción del Pedido:'.toUpperCase(), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.brandRed, letterSpacing: 0.5)),
                const SizedBox(height: 8),
                Text(pedido.descripcion, style: TextStyle(fontSize: 15, color: onSurface, fontWeight: FontWeight.w500)),
              ],
            ),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: Container(
              decoration: BoxDecoration(
                gradient: AppGradients.brand,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(color: AppColors.brandRed.withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4))
                ]
              ),
              child: ElevatedButton(
                onPressed: () {
                  if (pedido.pickupPin != null && pedido.pickupPin!.isNotEmpty) {
                    _mostrarDialogoPin(context, pedido.pickupPin!);
                  } else {
                    _avanzarEstado(context, 'en_camino', '¡Pedido recolectado, ve con el cliente!');
                  }
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent, 
                  shadowColor: Colors.transparent, 
                  foregroundColor: Colors.white, 
                  padding: const EdgeInsets.symmetric(vertical: 16)
                ),
                child: const Text('YA TENGO EL PEDIDO', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1)),
              ),
            ),
          ),
        ],
      );
    } else if (pedido.estado == 'en_camino') {
      title = 'Entrega al Cliente';
      icon = Icons.home_rounded;
      content = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(pedido.clienteNombre ?? 'Cliente', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: onSurface, letterSpacing: -0.5)),
          const SizedBox(height: 4),
          Text(pedido.direccion ?? 'Sin dirección', style: TextStyle(fontSize: 15, color: onSurface.withOpacity(0.8))),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _callPhone(pedido.clienteTel),
                  icon: const Icon(Icons.phone, size: 18),
                  label: const Text('Llamar'),
                  style: OutlinedButton.styleFrom(foregroundColor: onSurface, side: BorderSide(color: isDark ? AppColors.darkBorder : Colors.black26), padding: const EdgeInsets.symmetric(vertical: 12)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _openWhatsApp(pedido.clienteTel, pedido.clienteNombre, pedido.estado),
                  icon: const Icon(Icons.chat_bubble_rounded, size: 18, color: Color(0xFF25D366)),
                  label: const Text('WhatsApp', style: TextStyle(color: Color(0xFF25D366))),
                  style: OutlinedButton.styleFrom(side: const BorderSide(color: Color(0xFF25D366)), padding: const EdgeInsets.symmetric(vertical: 12)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (pedido.lat != null && pedido.lat != 0.0)
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => _launchMaps(pedido.lat!, pedido.lng ?? 0.0),
                icon: const Icon(Icons.directions, size: 20),
                label: const Text('Navegar al Destino', style: TextStyle(fontWeight: FontWeight.bold)),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.brandRed,
                  side: const BorderSide(color: AppColors.brandRed, width: 1.5),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
          const SizedBox(height: 20),
          if (pedido.total != null && pedido.total! > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              margin: const EdgeInsets.only(bottom: 20),
              decoration: BoxDecoration(color: AppColors.success.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Cobrar en Efectivo:', style: TextStyle(fontWeight: FontWeight.bold, color: onSurface)),
                  Text('\$${pedido.total?.toStringAsFixed(2)}', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20, color: AppColors.success)),
                ],
              ),
            ),
          SizedBox(
            width: double.infinity,
            child: Container(
              decoration: BoxDecoration(
                gradient: AppGradients.brand,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(color: AppColors.brandRed.withOpacity(0.3), blurRadius: 12, offset: const Offset(0, 4))
                ]
              ),
              child: ElevatedButton(
                onPressed: () => _avanzarEstado(context, 'entregado', '¡Entrega finalizada con éxito!'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent, 
                  shadowColor: Colors.transparent,
                  foregroundColor: Colors.white, 
                  padding: const EdgeInsets.symmetric(vertical: 16)
                ),
                child: const Text('MARCAR COMO ENTREGADO', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1)),
              ),
            ),
          ),
        ],
      );
    } else if (pedido.estado == 'entregado') {
      title = 'Pedido Completado';
      icon = Icons.check_circle_rounded;
      content = Center(
        child: Column(
          children: [
            const Icon(Icons.verified_rounded, size: 48, color: AppColors.success),
            const SizedBox(height: 16),
            Text('¡Buen trabajo!', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: onSurface)),
            Text('Este pedido ya fue entregado.', style: TextStyle(color: onSurface.withOpacity(0.6))),
          ],
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkCard : Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(isDark ? 0.3 : 0.08),
            blurRadius: 24,
            offset: const Offset(0, 8)
          )
        ],
        border: Border.all(color: isDark ? AppColors.darkBorder : Colors.black12, width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurface : const Color(0xFFF1F5F9),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
              border: Border(bottom: BorderSide(color: isDark ? AppColors.darkBorder : Colors.black12)),
            ),
            child: Row(
              children: [
                Icon(icon, color: AppColors.brandRed, size: 22),
                const SizedBox(width: 12),
                Text(title, style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: onSurface, letterSpacing: -0.3)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: content,
          ),
        ],
      ),
    );
  }

  Future<void> _mostrarDialogoPin(BuildContext context, String expectedPin) async {
    final TextEditingController pinController = TextEditingController();
    String? errorMessage;
    
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              title: const Row(
                children: [
                  Icon(Icons.lock_rounded, color: Colors.orange),
                  SizedBox(width: 8),
                  Text('PIN de Recolección', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                ],
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Pídele al restaurante el PIN de seguridad de 4 dígitos para poder llevarte el pedido.',
                    style: TextStyle(fontSize: 14),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: pinController,
                    keyboardType: TextInputType.number,
                    maxLength: 4,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, letterSpacing: 8),
                    decoration: InputDecoration(
                      hintText: '----',
                      errorText: errorMessage,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      contentPadding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                    onChanged: (val) {
                      if (val.length == 4) {
                        if (val == expectedPin) {
                          Navigator.pop(ctx, true);
                        } else {
                          setState(() => errorMessage = 'PIN Incorrecto. Intenta de nuevo.');
                        }
                      } else {
                        if (errorMessage != null) setState(() => errorMessage = null);
                      }
                    },
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('Cancelar', style: TextStyle(color: Colors.grey)),
                ),
                ElevatedButton(
                  onPressed: () {
                    if (pinController.text == expectedPin) {
                      Navigator.pop(ctx, true);
                    } else {
                      setState(() => errorMessage = 'PIN Incorrecto. Intenta de nuevo.');
                    }
                  },
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.orange, foregroundColor: Colors.white),
                  child: const Text('Verificar'),
                ),
              ],
            );
          }
        );
      }
    ).then((success) {
      if (success == true && mounted) {
        _avanzarEstado(context, 'en_camino', '¡PIN Correcto! Pedido recolectado, ve con el cliente.');
      }
    });
  }

  Future<void> _avanzarEstado(BuildContext context, String nuevoEstado, String successMsg, {bool isBlocked = false}) async {
    if (isBlocked) return;
    try {
      final userId = Supabase.instance.client.auth.currentUser?.id;
      final updateData = <String, dynamic>{'estado': nuevoEstado};
      
      // Si estamos aceptando el pedido, asegurar que nos asignamos como repartidor
      if (nuevoEstado == 'asignado' && userId != null) {
        updateData['repartidor_id'] = userId;
      }

      // 1. Mutación Optimista (Si falla, el Future throweó y lo manejamos en catch)
      try {
        final response = await Supabase.instance.client
            .from('pedidos')
            .update(updateData)
            .eq('id', widget.pedido.id)
            .select();

        if (response.isEmpty) {
          throw Exception('El pedido ya no está disponible (quizás expiró el tiempo de 25s).');
        }
      } catch (networkError) {
        // En Supabase Flutter, los problemas de red suelen lanzar excepciones base
        // Detectamos si es de conexión o timeout
        final isNetworkIssue = networkError is SocketException || 
                               networkError.toString().contains('Failed host lookup') ||
                               networkError.toString().contains('Connection refused') ||
                               networkError.toString().contains('Timeout') ||
                               networkError.toString().contains('ClientException');
                               
        if (isNetworkIssue) {
          debugPrint('Falla de red detectada. Encolando mutación offline...');
          await LocalDatabase.instance.encolarMutacion(
            tabla: 'pedidos',
            id: widget.pedido.id,
            payload: updateData,
          );
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Sin conexión. Sincronizando en segundo plano...')));
          }
        } else {
          rethrow; // Si es error RLS u otro, que truene en el catch exterior
        }
      }
          
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMsg)));
      }
      
      widget.onRefresh?.call();
      
      // ── Enrutamiento Inteligente ──
      if (context.mounted) {
        if (nuevoEstado == 'entregado') {
          // Obtener los pedidos restantes en el itinerario
          final activos = ref.read(pedidosActivosProvider).value ?? [];
          final remaining = activos.where((p) => p.id != widget.pedido.id && p.estado != 'entregado' && p.estado != 'cancelado').toList();
          
          if (remaining.isNotEmpty) {
            // Hay más pedidos encolados, saltar directo al siguiente
            final nextId = remaining.first.id;
            context.replace('/pedidos/$nextId');
          } else {
            // Ya no hay pedidos, regresamos al mapa (resumen)
            if (Navigator.canPop(context)) Navigator.pop(context);
          }
        } else if (nuevoEstado == 'en_camino') {
          // Si acaba de recoger, revisamos si tiene OTRA recolección pendiente
          final activos = ref.read(pedidosActivosProvider).value ?? [];
          final otherPickups = activos.where((p) => p.id != widget.pedido.id && (p.estado == 'asignado' || p.estado == 'recibido')).toList();
          
          if (otherPickups.isNotEmpty) {
            final nextId = otherPickups.first.id;
            context.replace('/pedidos/$nextId');
          } else {
            // Si ya no hay recolecciones pendientes, no hacemos pop, 
            // nos quedamos en esta pantalla porque ahora le toca Entregar ESTE pedido al cliente.
          }
        }
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
          backgroundColor: Colors.redAccent,
        ));
        
        // Si el pedido se perdió (ya sea por timeout o porque se reasignó), lo regresamos al inicio
        if (e.toString().contains('ya no está disponible')) {
          Future.delayed(const Duration(seconds: 2), () {
            if (context.mounted) {
              if (Navigator.canPop(context)) {
                Navigator.pop(context);
              } else {
                context.replace('/');
              }
            }
          });
        }
      }
    }
  }
}

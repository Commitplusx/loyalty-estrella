  Future<void> _loadStatusSilently() async {
    final statusData = await ref.read(repartidorServiceProvider).getCurrentStatus();
    
    // Extracciones de seguridad
    bool isOnlineBD = statusData['activo'] ?? false;
    final repIdBD = statusData['id'];
    
    if (mounted) {
      _repartidorId = repIdBD;
      final nombreBD = statusData['nombre'] as String? ?? '';
      _repartidorNombre = nombreBD.isNotEmpty
          ? nombreBD
          : (supabase.auth.currentUser?.email?.split('@').first ?? 'Repartidor');
      _cachedRepartidorId = _repartidorId;
      _cachedNombre = _repartidorNombre;
    }

    // ­ƒÜ¿ Inteligencia: Buscar pedidos activos ANTES de decidir el estado
    if (_repartidorId != null) {
      await _checkPedidoActivo();
    }

    // === L├ôGICA TIPO RAPPI: SIEMPRE DESCONECTADO AL ABRIR LA APP ===
    if (mounted) {
      setState(() {
        if (_cachedIsOnline == null && _pedidosActivos.isEmpty) {
          // Inicio limpio y sin pedidos -> Forzamos Apagado
          _isOnline = false;
          if (isOnlineBD && _repartidorId != null) {
            // Si la BD dec├¡a que est├íbamos online (ej. cerramos la app a la fuerza), lo corregimos
            ref.read(repartidorServiceProvider).updateStatus(_repartidorId!, false);
            isOnlineBD = false;
          }
        } else {
          // Hot-reload o hay pedidos activos -> Respetamos BD/Cach├®
          _isOnline = _cachedIsOnline ?? isOnlineBD;
        }
        _cachedIsOnline = _isOnline;
      });
    }
    
    // Attempt to get location and start stream
    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.whileInUse || permission == LocationPermission.always) {
        final pos = await Geolocator.getCurrentPosition();
        if (mounted) {
          setState(() {
            _currentLocation = LatLng(pos.latitude, pos.longitude);
            _cachedLocation = _currentLocation;
          });
        }
        
        // Sincronizaci├│n inicial obligatoria si decidimos estar en l├¡nea
        if (_isOnline && _repartidorId != null) {
          debugPrint('­ƒôì Sincronizando ubicaci├│n inicial a Supabase: \${pos.latitude}, \${pos.longitude}');
          ref.read(repartidorServiceProvider).updateStatus(
            _repartidorId!,
            true,
            lat: pos.latitude,
            lng: pos.longitude,
          );
        }

        // Suscribirse a cambios de ubicaci├│n en vivo
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
            });
            _animatedMapMove(_currentLocation, 15);
            // Solo sincronizar si estamos en l├¡nea de verdad
            if (_isOnline && !_isPressed && !_isSuccess && _repartidorId != null) {
              ref.read(repartidorServiceProvider).updateStatus(
                _repartidorId!,
                true,
                lat: position.latitude,
                lng: position.longitude,
              );
            }
          }
        });
      }
    } catch (e) {
      debugPrint("Could not get location: $e");
    }
  }

  Future<void> _checkPedidoActivo() async {
    try {
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) {
        debugPrint('­ƒÜ¿ Inteligencia: No hay usuario autenticado (auth.currentUser?.id es null).');
        return;
      }
      
      debugPrint('­ƒÜ¿ Inteligencia: Buscando pedidos activos para auth_id: $userId');

      final data = await supabase
          .from('pedidos')
          .select()
          .eq('repartidor_id', userId)
          .inFilter('estado', ['pendiente', 'asignado', 'aceptado', 'en_cocina', 'listo_para_recoger', 'recibido', 'en_camino'])
          .order('created_at', ascending: false)
          .limit(5); // Soporte para Stacked Orders (Cola de Trabajo)

      if (mounted && data != null) {
        final pedidosList = List<Map<String, dynamic>>.from(data as List<dynamic>);
        debugPrint('­ƒÜ¿ Inteligencia: ┬í${pedidosList.length} pedidos activos en la cola!');
        setState(() {
          _pedidosActivos = pedidosList;
        });
        
        if (_pedidosActivos.isNotEmpty) {
          _stopRadarSound();
        } else if (_isOnline && _radarTimer == null) {
          _startRadarSound();
        }
        
        // AUTO-NAVEGACI├ôN REMOVIDA
        // El repartidor ahora ve su cola de trabajo (Stacked Orders) en el Dashboard
        // y decide a cu├íl pedido entrar manualmente, d├índole control total sobre su ruta.
      } else {
        if (mounted) {
          setState(() {
            _pedidosActivos = [];
          });
          if (_isOnline && _radarTimer == null) {
            _startRadarSound();
          }
        }
        debugPrint('­ƒÜ¿ Inteligencia: Ning├║n pedido activo en curso.');
      }
    } catch (e) {
      debugPrint('­ƒÜ¿ Inteligencia: Error buscando pedido activo: $e');
    }
  }
  // === ESTADO DE M├üQUINA (NEXT STOP LOGIC) ===
  Map<String, dynamic>? _calcularProximaParada() {
    if (_pedidosActivos.isEmpty) return null;

    Map<String, dynamic>? bestStop;
    double minDistance = double.infinity;

    for (var pedido in _pedidosActivos) {
      final estado = pedido['estado'];
      final bool isPickup = ['asignado', 'aceptado', 'en_cocina', 'listo_para_recoger'].contains(estado);
      final bool isDropoff = estado == 'en_camino';

      if (!isPickup && !isDropoff) continue;

      double targetLat = 0.0;
      double targetLng = 0.0;
      String actionText = '';
      String title = '';
      String subtitle = '';

      if (isPickup) {
        // Datos del Restaurante
        final rest = pedido['restaurante'];
        if (rest is Map) {
          targetLat = (rest['lat'] ?? 0.0).toDouble();
          targetLng = (rest['lng'] ?? 0.0).toDouble();
          title = rest['nombre_comercial'] ?? 'Restaurante';
        } else {
          title = rest?.toString() ?? 'Restaurante';
        }
        subtitle = 'Recoger Pedido #${pedido['id'].toString().substring(0, 4)}';
        actionText = 'IR A RECOGER';
      } else if (isDropoff) {
        // Datos del Cliente (Privacidad: Se oculta el nombre)
        targetLat = (pedido['lat_cliente'] ?? pedido['lat'] ?? 0.0).toDouble();
        targetLng = (pedido['lng_cliente'] ?? pedido['lng'] ?? 0.0).toDouble();
        title = 'Cliente'; 
        subtitle = 'Entregar en: ${pedido['direccion'] ?? 'Ubicaci├│n'}';
        actionText = 'IR A ENTREGAR';
      }

      if (targetLat == 0.0 || targetLng == 0.0) {
         if (bestStop == null) {
            bestStop = {'pedido': pedido, 'action': actionText, 'title': title, 'subtitle': subtitle, 'targetLat': targetLat, 'targetLng': targetLng, 'isPickup': isPickup};
         }
         continue;
      }

      final distance = Geolocator.distanceBetween(_currentLocation.latitude, _currentLocation.longitude, targetLat, targetLng);

      if (distance < minDistance) {
        minDistance = distance;
        bestStop = {'pedido': pedido, 'action': actionText, 'title': title, 'subtitle': subtitle, 'targetLat': targetLat, 'targetLng': targetLng, 'distance': distance, 'isPickup': isPickup};
      }
    }
    return bestStop;
  }
  // ===========================================

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _positionStream?.cancel();
    _radarTimer?.cancel();
    _successPlayer.dispose();
    _radarPlayer.dispose();
    super.dispose();
  }

  void _playSuccessSound() async {
    try {
      await _successPlayer.play(AssetSource('sounds/success.mp3'));
    } catch (e) {
      debugPrint('No se pudo reproducir success sound: $e');
    }
  }

  void _startRadarSound() {
    _radarTimer?.cancel();
    // Emitir el ping cada 5 segundos
    _radarTimer = Timer.periodic(const Duration(seconds: 5), (timer) async {
      // Solo pitear si est├í en l├¡nea y no hay pedidos activos
      if (_isOnline && _pedidosActivos.isEmpty) {
        try {
          await _radarPlayer.play(AssetSource('sounds/radar.mp3'));
        } catch (e) {
          debugPrint('No se pudo reproducir radar sound: $e');
        }
      } else {
        _stopRadarSound();
      }
    });
  }

  void _stopRadarSound() {
    _radarTimer?.cancel();
    _radarTimer = null;
  }

  Future<void> _mostrarDeudaDetalle(bool isDark) async {
    if (_repartidorId == null) return;
    final detalle = await ref.read(repartidorServiceProvider).getDeudaDetalle(_repartidorId!);

    if (!mounted) return;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.0, end: 1.0),
        duration: const Duration(milliseconds: 450),
        curve: Curves.easeOutCubic,
        builder: (context, value, child) => Transform.translate(
          offset: Offset(0, 60 * (1 - value)),
          child: Opacity(opacity: value, child: child),
        ),
        child: Container(
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF1E293B) : Colors.white,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
          ),
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 40),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40, height: 4,
                  margin: const EdgeInsets.only(bottom: 24),
                  decoration: BoxDecoration(
                    color: isDark ? Colors.white24 : Colors.black12,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF43F5E).withOpacity(0.12),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(Icons.receipt_long_rounded, color: Color(0xFFF43F5E), size: 24),
                  ),
                  const SizedBox(width: 14),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Efectivo a Entregar', style: TextStyle(
                        fontSize: 20, fontWeight: FontWeight.w900,
                        color: isDark ? Colors.white : Colors.black,
                      )),
                      Text('Desglose por restaurante ┬À Hoy', style: TextStyle(
                        fontSize: 13,
                        color: isDark ? Colors.white54 : Colors.black45,
                      )),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 28),
              if (detalle.isEmpty)
                Center(
                  child: Column(
                    children: [
                      const Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 48),
                      const SizedBox(height: 12),
                      Text('┬íSin deuda pendiente hoy!', style: TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w700,
                        color: isDark ? Colors.white70 : Colors.black54,
                      )),
                      const SizedBox(height: 12),
                    ],
                  ),
                )
              else
                ...detalle.map((item) {
                  final monto = (item['monto'] as num?)?.toDouble() ?? 0.0;
                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF43F5E).withOpacity(0.06),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0xFFF43F5E).withOpacity(0.15)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.storefront_rounded, color: Color(0xFFF43F5E), size: 22),
                            const SizedBox(width: 12),
                            Text(
                              item['restaurante']?.toString() ?? 'Restaurante',
                              style: TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w700,
                                color: isDark ? Colors.white : Colors.black87,
                              ),
                            ),
                          ],
                        ),
                        Text(
                          '\$${monto.toStringAsFixed(2)}',
                          style: const TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w900,
                            color: Color(0xFFF43F5E),
                          ),
                        ),
                      ],
                    ),
                  );
                }),
              if (detalle.isNotEmpty) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: isDark ? Colors.white.withOpacity(0.05) : Colors.black.withOpacity(0.04),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('TOTAL A ENTREGAR', style: TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 0.5,
                        color: isDark ? Colors.white70 : Colors.black54,
                      )),
                      Text(
                        '\$${detalle.fold(0.0, (s, e) => s + ((e['monto'] as num?)?.toDouble() ?? 0.0)).toStringAsFixed(2)}',
                        style: const TextStyle(
                          fontSize: 22, fontWeight: FontWeight.w900,
                          color: Color(0xFFF43F5E),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _isOnline) {
      _syncLocationBackground();
    }
  }

  Future<void> _syncLocationBackground() async {
    try {
      final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
      final battery = await Battery().batteryLevel;
      if (_repartidorId != null) {
        await ref.read(repartidorServiceProvider).updateStatus(
          _repartidorId!,
          true,
          lat: pos.latitude,
          lng: pos.longitude,
          bateria: battery,
        );
      }
    } catch (e) {
      debugPrint("Fallo al sincronizar GPS/Bater├¡a en background: $e");
    }
  }

  Future<int?> _mostrarTipsInicio() async {
    return await showDialog<int>(
      context: context,
      builder: (ctx) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.0, end: 1.0),
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeOutBack,
        builder: (context, value, child) {
          return Transform.scale(
            scale: value,
            child: Opacity(
              opacity: value.clamp(0.0, 1.0),
              child: child,
            ),
          );
        },
        child: Dialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF59E0B).withOpacity(0.15),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.monetization_on_rounded, color: Color(0xFFF59E0B), size: 40),
                ),
                const SizedBox(height: 20),
                const Text(
                  '┬┐Cu├ínto dinero traes?',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Para dar un mejor servicio y calcular tu cambio, selecciona con cu├ínto efectivo empiezas tu turno.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 14, color: Colors.grey),
                ),
                const SizedBox(height: 28),
                Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: () => Navigator.pop(ctx, 200),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 20),
                          decoration: BoxDecoration(
                            color: const Color(0xFF10B981).withOpacity(0.1),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: const Color(0xFF10B981).withOpacity(0.3)),
                          ),
                          child: const Column(
                            children: [
                              Text('\$200', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Color(0xFF10B981))),
                              SizedBox(height: 4),
                              Text('Pesos', style: TextStyle(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: GestureDetector(
                        onTap: () => Navigator.pop(ctx, 500),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 20),
                          decoration: BoxDecoration(
                            color: const Color(0xFF3B82F6).withOpacity(0.1),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: const Color(0xFF3B82F6).withOpacity(0.3)),
                          ),
                          child: const Column(
                            children: [
                              Text('\$500', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Color(0xFF3B82F6))),
                              SizedBox(height: 4),
                              Text('Pesos', style: TextStyle(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                TextButton(
                  onPressed: () => Navigator.pop(ctx, 0),
                  child: const Text('No traigo efectivo', style: TextStyle(color: Colors.grey, fontWeight: FontWeight.w600, fontSize: 16)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<int?> _checkInitialLocation() async {
    // 1. Obtener Bater├¡a
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
    final isVolumeOk = currentVolume > 0.2; // M├ís de 20% de volumen

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
                      isLoading ? 'Conectando...' : '┬íHola ${_repartidorNombre.split(' ').first}!\nSocio Repartidor ­ƒÜÇ',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      isLoading ? 'Preparando tu GPS y perfil...' : 'Revisi├│n antes del turno:',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                    ),
                    const SizedBox(height: 20),
                    _TipItem(
                      icon: Icons.battery_charging_full_rounded, 
                      color: batteryLevel >= 15 ? const Color(0xFF10B981) : Colors.red, 
                      text: 'Bater├¡a: $batteryLevel%',
                      isCheck: batteryLevel >= 15,
                    ),
                    _TipItem(
                      icon: Icons.location_on_rounded, 
                      color: gpsEnabled ? const Color(0xFF3B82F6) : Colors.red, 
                      text: gpsEnabled ? 'Ubicaci├│n GPS activada' : 'Falta activar GPS o permisos',
                      isCheck: gpsEnabled,
                    ),
                    _TipItem(
                      icon: Icons.volume_up_rounded, 
                      color: isVolumeOk ? const Color(0xFF8B5CF6) : Colors.red, 
                      text: isVolumeOk ? 'Volumen adecuado (${(currentVolume * 100).toInt()}%)' : 'Celular en silencio o volumen muy bajo',
                      isCheck: isVolumeOk,
                    ),
                    const _TipItem(icon: Icons.two_wheeler_rounded, color: Color(0xFFF59E0B), text: 'Veh├¡culo con combustible'),
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
                           // Simular tiempo de conexi├│n para dar feedback visual (5 segundos)
                           await Future.delayed(const Duration(milliseconds: 5000));
                           if (ctx.mounted) {
                             Navigator.pop(ctx, true);
                           }
                        },
                        icon: isLoading 
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Icon(Icons.rocket_launch_rounded),
                        label: Text(
                          isLoading ? 'Iniciando turno...' : '┬íTodo listo, iniciar turno!', 
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
    // Si va a ponerse EN L├ìNEA, mostrar tips de inicio de turno primero
    if (value) {
      // PERMISOS ANDROID 14
      try {
        const platform = MethodChannel('app.estrella.shop/permissions');
        final bool canUseFullScreen = await platform.invokeMethod('canUseFullScreenIntent');
        if (!canUseFullScreen) {
          final shouldRequest = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Permiso Requerido'),
              content: const Text('Para poder despertar la pantalla y avisarte de nuevos pedidos mientras la app est├í minimizada, necesitamos permiso de Pantalla Completa.\n\n┬┐Quieres activarlo ahora?'),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Ahora no')),
                ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Activar')),
              ],
            ),
          );
          
          if (shouldRequest == true) {
            await platform.invokeMethod('requestFullScreenIntent');
            return; // Detener flujo para que regresen y lo intenten de nuevo
          }
        }
      } catch (e) {
        debugPrint('Error chequeando fullScreenIntent: $e');
      }

      // 1. Mostrar pantalla de revisi├│n de GPS, Bater├¡a, Volumen
      batteryLevel = await _checkInitialLocation();
      if (batteryLevel == null || !mounted) return;
      
      // 2. Preguntar cantidad de efectivo
      final money = await _mostrarTipsInicio();
      if (money == null || !mounted) return;
      
      // Mostrar ├®xito PRIMERO
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: const [
              Icon(Icons.check_circle_rounded, color: Colors.white),
              SizedBox(width: 12),
              Expanded(child: Text('┬íEst├ís en l├¡nea! Recibiendo pedidos...')),
            ],
          ),
          backgroundColor: const Color(0xFF10B981),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          margin: const EdgeInsets.all(16),
          duration: const Duration(seconds: 3),
        ),
      );

      // Esperar un segundo para que el usuario lea el snackbar antes de cambiar el bot├│n
      await Future.delayed(const Duration(seconds: 1));
      if (!mounted) return;

    } else {
      // Si se apaga, opcionalmente mandar bater├¡a tambi├®n
      try {
        batteryLevel = await Battery().batteryLevel;
      } catch (_) {}
    }

    setState(() {
      _isPressed = true;
    });

    final success = await ref.read(repartidorServiceProvider).updateStatus(
      _repartidorId!, 
      value,
      lat: _currentLocation.latitude,
      lng: _currentLocation.longitude,
      bateria: batteryLevel,
    );

    if (mounted) {
      if (success && !value) {
        _stopRadarSound();
        setState(() {
          _isPressed = false;
          _isSuccess = true;
        });
        
        await Future.delayed(const Duration(milliseconds: 2500));
        
        if (mounted) {
          setState(() {
            _isSuccess = false;
            _isOnline = value;
            _cachedIsOnline = value;
          });
        }
      } else {
        setState(() {
          _isPressed = false;
          if (success) {
            _isOnline = value;
            _cachedIsOnline = value;
            _playSuccessSound();
            _startRadarSound();
          }
        });
      }

      if (!success) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Error al actualizar estado')),
        );
      }
    }
  }


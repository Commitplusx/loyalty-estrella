import 'dart:async';
import 'package:flutter/material.dart';
import 'package:animate_do/animate_do.dart';
import 'package:action_slider/action_slider.dart';
import '../models/pedido_model.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/supabase_config.dart';
import '../utils/top_toast.dart';
import '../main.dart' show stopAlarm;
import '../core/theme.dart';

class StackedOrderPanel extends StatefulWidget {
  final PedidoModel pedido;
  final VoidCallback onAccepted;
  final VoidCallback onTimeout;

  const StackedOrderPanel({
    Key? key,
    required this.pedido,
    required this.onAccepted,
    required this.onTimeout,
  }) : super(key: key);

  @override
  State<StackedOrderPanel> createState() => _StackedOrderPanelState();
}

class _StackedOrderPanelState extends State<StackedOrderPanel> {
  Timer? _timer;
  double _progress = 1.0;
  final int _totalDurationSeconds = 20;
  int _remainingSeconds = 20;
  bool _isAccepting = false;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    final updateInterval = const Duration(milliseconds: 50);
    final totalTicks = (_totalDurationSeconds * 1000) / updateInterval.inMilliseconds;
    int currentTick = 0;

    _timer = Timer.periodic(updateInterval, (timer) {
      if (!mounted || _isAccepting) {
        timer.cancel();
        return;
      }

      currentTick++;
      setState(() {
        _progress = 1.0 - (currentTick / totalTicks);
        _remainingSeconds = _totalDurationSeconds - (currentTick * updateInterval.inMilliseconds ~/ 1000);
      });

      if (currentTick >= totalTicks) {
        timer.cancel();
        stopAlarm();
        widget.onTimeout();
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _aceptarPedido(ActionSliderController controller) async {
    setState(() => _isAccepting = true);
    controller.loading();

    try {
      await supabase.from('pedidos').update({
        'estado': 'asignado',
        'repartidor_id': supabase.auth.currentUser?.id,
        'fecha_asignado': DateTime.now().toUtc().toIso8601String(),
      }).eq('id', widget.pedido.id);

      stopAlarm();
      controller.success();
      TopToast.show(context, '¡Pedido aceptado exitosamente!', backgroundColor: const Color(0xFF10B981));
      
      await Future.delayed(const Duration(milliseconds: 500));
      if (mounted) {
        widget.onAccepted();
      }
    } catch (e) {
      controller.reset();
      setState(() => _isAccepting = false);
      TopToast.show(context, 'Error al aceptar: $e', backgroundColor: Colors.red);
      // Reiniciar temporizador si falla
      _startTimer();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return FadeInUp(
      duration: const Duration(milliseconds: 400),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.15),
              blurRadius: 24,
              offset: const Offset(0, 10),
            )
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header Rojo Estrella
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 16),
                decoration: BoxDecoration(
                  gradient: AppGradients.brand,
                ),
                child: const Text(
                  '🚨 VIAJE APILADO',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
              
              // Barra de progreso (Temporizador) - pegada al header
              LinearProgressIndicator(
                value: _progress,
                minHeight: 6,
                backgroundColor: Colors.grey.shade200,
                valueColor: AlwaysStoppedAnimation<Color>(
                  _remainingSeconds > 5 ? const Color(0xFF10B981) : Colors.redAccent,
                ),
              ),
              
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    // Temporizador destacado
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: _remainingSeconds > 5 
                            ? AppColors.brandRed.withOpacity(0.1) 
                            : Colors.red.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: _remainingSeconds > 5 
                              ? AppColors.brandRed.withOpacity(0.3) 
                              : Colors.red.withOpacity(0.5),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.timer_outlined, 
                            color: _remainingSeconds > 5 ? AppColors.brandRed : Colors.red,
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '$_remainingSeconds SEGUNDOS',
                            style: TextStyle(
                              color: _remainingSeconds > 5 ? AppColors.brandRed : Colors.red,
                              fontWeight: FontWeight.w900,
                              fontSize: 14,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    
                    // Info del Restaurante (Estilo Minimalista)
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF8FAFC),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFE2E8F0)),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 48,
                            height: 48,
                            decoration: BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10)
                              ],
                            ),
                            child: const Center(
                              child: Icon(Icons.storefront_rounded, color: Colors.black87),
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'NUEVA PARADA',
                                  style: TextStyle(
                                    color: Colors.black45,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  widget.pedido.restaurante ?? 'Restaurante',
                                  style: const TextStyle(
                                    color: Colors.black87,
                                    fontSize: 18,
                                    fontWeight: FontWeight.w900,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    
                    const SizedBox(height: 24),
                    
                    // Slider de aceptación
                    Container(
                      decoration: BoxDecoration(
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.brandRed.withOpacity(0.3),
                            blurRadius: 12,
                            offset: const Offset(0, 4)
                          )
                        ]
                      ),
                      child: ActionSlider.standard(
                        sliderBehavior: SliderBehavior.stretch,
                        width: double.infinity,
                        backgroundColor: AppColors.brandRed,
                        toggleColor: Colors.white,
                        icon: const Icon(Icons.check_rounded, color: AppColors.brandRed, size: 28),
                        action: (controller) async {
                          await _aceptarPedido(controller);
                        },
                        child: const Text(
                          'DESLIZA PARA ACEPTAR',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                            fontSize: 15,
                            letterSpacing: 1.0,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}


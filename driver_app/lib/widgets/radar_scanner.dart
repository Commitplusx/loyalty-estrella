import 'package:flutter/material.dart';

class RadarScanner extends StatefulWidget {
  final Color color;
  final double size;
  
  const RadarScanner({
    super.key, 
    this.color = const Color(0xFFFF6B35), // Naranja corporativo Estrella
    this.size = 250.0,
  });

  @override
  State<RadarScanner> createState() => _RadarScannerState();
}

class _RadarScannerState extends State<RadarScanner> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    // 2 segundos de duración por ciclo, se repite infinitamente
    _controller = AnimationController(
      vsync: this, 
      duration: const Duration(seconds: 2)
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return CustomPaint(
          size: Size(widget.size, widget.size),
          painter: _RadarPainter(_controller.value, widget.color),
        );
      },
    );
  }
}

class _RadarPainter extends CustomPainter {
  final double progress;
  final Color color;

  _RadarPainter(this.progress, this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final maxRadius = size.width / 2;

    // Dibujamos 3 anillos en expansión
    for (int i = 0; i < 3; i++) {
      // Desfase para cada anillo
      final ringProgress = (progress + (i * 0.33)) % 1.0;
      
      // Función de curva (ease-out) para que desacelere al final
      final curveProgress = 1.0 - (1.0 - ringProgress) * (1.0 - ringProgress);
      final radius = maxRadius * curveProgress;
      
      // La opacidad disminuye a medida que se expande
      final opacity = 1.0 - ringProgress;

      // Anillo exterior (borde)
      final strokePaint = Paint()
        ..color = color.withOpacity(opacity * 0.8)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.0;
      canvas.drawCircle(center, radius, strokePaint);
      
      // Relleno sutil
      final fillPaint = Paint()
        ..color = color.withOpacity(opacity * 0.15)
        ..style = PaintingStyle.fill;
      canvas.drawCircle(center, radius, fillPaint);
    }
    
    // Punto central (Puck)
    final centerPaint = Paint()
      ..color = color
      ..style = PaintingStyle.fill
      ..maskFilter = const MaskFilter.blur(BlurStyle.solid, 3);
      
    // Halo interior fijo
    final innerHaloPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;

    canvas.drawCircle(center, 12, centerPaint);
    canvas.drawCircle(center, 5, innerHaloPaint);
  }

  @override
  bool shouldRepaint(covariant _RadarPainter oldDelegate) {
    return oldDelegate.progress != progress;
  }
}

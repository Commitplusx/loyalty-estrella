import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../models/cliente_model.dart';
import '../services/cliente_service.dart';
import '../core/theme.dart';

class ScannerScreen extends ConsumerStatefulWidget {
  const ScannerScreen({super.key});

  @override
  ConsumerState<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends ConsumerState<ScannerScreen> {
  final MobileScannerController _ctrl = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    facing: CameraFacing.back,
    torchEnabled: false,
  );
  bool _processing = false;
  ScanResultModel? _lastResult;
  bool _torchOn = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_processing) return;
    final barcode = capture.barcodes.firstOrNull;
    if (barcode?.rawValue == null) return;

    setState(() => _processing = true);
    HapticFeedback.mediumImpact();

    final service = ref.read(clienteServiceProvider);
    final result = await service.registrarEnvio(barcode!.rawValue!);

    if (result.success) {
      HapticFeedback.heavyImpact();
    } else {
      HapticFeedback.vibrate();
    }

    if (mounted) {
      setState(() {
        _lastResult = result;
        _processing = false;
      });
    }
  }

  void _reset() => setState(() => _lastResult = null);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Escanear QR'),
        actions: [
          IconButton(
            icon: Icon(_torchOn ? Icons.flashlight_off : Icons.flashlight_on),
            onPressed: () {
              _ctrl.toggleTorch();
              setState(() => _torchOn = !_torchOn);
            },
          ),
        ],
      ),
      body: Stack(
        children: [
          if (_lastResult == null)
            Column(
              children: [
                // Scanner
                Expanded(
                  flex: 3,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      MobileScanner(
                        controller: _ctrl,
                        onDetect: _onDetect,
                      ),
                      // Overlay
                      Container(
                        color: Colors.transparent,
                        child: Center(
                          child: _ScanOverlay(),
                        ),
                      ),
                      if (_processing)
                        Container(
                          color: Colors.black54,
                          child: Center(
                            child: CircularProgressIndicator(
                                color: Theme.of(context).colorScheme.primary),
                          ),
                        ),
                    ],
                  ),
                ),
                // Hint
                Container(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      Icon(Icons.qr_code_2_rounded,
                          color: Theme.of(context).colorScheme.primary, size: 32),
                      SizedBox(height: 10),
                      Text(
                        'Apunta la cámara al QR del cliente\npara registrar su envío',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5), fontSize: 14),
                      ),
                    ],
                  ),
                ),
              ],
            ),

          // Resultado
          if (_lastResult != null)
            _ResultView(result: _lastResult!, onReset: _reset),
        ],
      ),
    );
  }
}

class _ScanOverlay extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size(260, 260),
      painter: _CornerPainter(),
    );
  }
}

class _CornerPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFFFF6B35)
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    const len = 40.0;
    final w = size.width;
    final h = size.height;

    // Top-left
    canvas.drawLine(const Offset(0, len), Offset.zero, paint);
    canvas.drawLine(Offset.zero, const Offset(len, 0), paint);
    // Top-right
    canvas.drawLine(Offset(w - len, 0), Offset(w, 0), paint);
    canvas.drawLine(Offset(w, 0), Offset(w, len), paint);
    // Bottom-left
    canvas.drawLine(Offset(0, h - len), Offset(0, h), paint);
    canvas.drawLine(Offset(0, h), Offset(len, h), paint);
    // Bottom-right
    canvas.drawLine(Offset(w - len, h), Offset(w, h), paint);
    canvas.drawLine(Offset(w, h), Offset(w, h - len), paint);
  }

  @override
  bool shouldRepaint(_) => false;
}

class _ResultView extends StatelessWidget {
  final ScanResultModel result;
  final VoidCallback onReset;

  const _ResultView({required this.result, required this.onReset});

  @override
  Widget build(BuildContext context) {
    final isSuccess = result.success;
    final isGratis = result.esGratis;

    return Container(
      decoration: BoxDecoration(
        gradient: isGratis
            ? AppGradients.success
            : isSuccess
                ? AppGradients.cardDark
                : const LinearGradient(
                    colors: [Color(0xFF3D0000), Color(0xFF1A0000)]),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Icon
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.onSurface.withOpacity(0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  isGratis
                      ? Icons.card_giftcard_rounded
                      : isSuccess
                          ? Icons.check_circle_rounded
                          : Icons.error_rounded,
                  color: Theme.of(context).colorScheme.onSurface,
                  size: 56,
                ),
              ),
              SizedBox(height: 24),
              Text(
                isGratis ? '¡GRATIS!' : isSuccess ? 'Registrado ✅' : 'Error',
                style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w900,
                  color: Theme.of(context).colorScheme.onSurface,
                ),
              ),
              SizedBox(height: 12),
              Text(
                result.message,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 16,
                  color: Theme.of(context).colorScheme.onSurface.withOpacity(0.85),
                ),
              ),

              // Cliente info
              if (result.cliente != null) ...[
                SizedBox(height: 32),
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.onSurface.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    children: [
                      _InfoRow(Icons.phone_rounded, 'Teléfono',
                          result.cliente!.telefono),
                      Divider(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.24), height: 20),
                      _InfoRow(Icons.local_shipping_rounded, 'Total envíos',
                          '${result.cliente!.totalEnvios}'),
                      Divider(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.24), height: 20),
                      _InfoRow(Icons.card_giftcard_rounded, 'Gratis disponibles',
                          '${result.cliente!.enviosGratis}'),
                      // Progress bar
                      SizedBox(height: 16),
                      _ProgressBar(
                          progress: (result.cliente!.totalEnvios % 5) / 5),
                      SizedBox(height: 6),
                      Text(
                        'Faltan ${result.cliente!.enviosParaGratis} para el próximo gratis',
                        style:
                            TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7), fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ],

              SizedBox(height: 32),
              ElevatedButton.icon(
                onPressed: onReset,
                icon: Icon(Icons.qr_code_scanner_rounded),
                label: Text('Escanear Otro'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: Theme.of(context).colorScheme.primary,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow(this.icon, this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5), size: 18),
        SizedBox(width: 10),
        Text(label, style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5), fontSize: 13)),
        const Spacer(),
        Text(value,
            style: TextStyle(
                color: Theme.of(context).colorScheme.onSurface, fontWeight: FontWeight.w700, fontSize: 15)),
      ],
    );
  }
}

class _ProgressBar extends StatelessWidget {
  final double progress;
  const _ProgressBar({required this.progress});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(4),
      child: LinearProgressIndicator(
        value: progress,
        backgroundColor: Colors.white24,
        valueColor: AlwaysStoppedAnimation(Theme.of(context).colorScheme.primary),
        minHeight: 8,
      ),
    );
  }
}

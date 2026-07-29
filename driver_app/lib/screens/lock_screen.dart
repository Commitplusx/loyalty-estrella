import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:local_auth/local_auth.dart';
import 'package:local_auth_android/local_auth_android.dart';
import 'package:local_auth_darwin/local_auth_darwin.dart';
import '../core/supabase_config.dart';

class LockScreen extends StatefulWidget {
  const LockScreen({super.key});

  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen>
    with TickerProviderStateMixin {
  final LocalAuthentication auth = LocalAuthentication();
  bool _isAuthenticating = false;
  bool _authenticated = false;
  bool _failed = false;

  // Entrada
  AnimationController? _entryCtrl;
  Animation<double>? _entryFade;
  Animation<Offset>? _entrySlide;

  // Pulso huella
  AnimationController? _pulseCtrl;
  Animation<double>? _pulse1;
  Animation<double>? _pulse2;
  Animation<double>? _pulseOpacity1;
  Animation<double>? _pulseOpacity2;

  // Rotación anillo
  AnimationController? _ringCtrl;

  // Éxito
  AnimationController? _successCtrl;
  Animation<double>? _successScale;

  // Shake (fallo)
  AnimationController? _shakeCtrl;
  Animation<double>? _shakeAnim;

  @override
  void initState() {
    super.initState();
//     debugPrint('[LOCK] initState — usuario=${supabase.auth.currentUser?.email ?? "sin sesión"}');
    _initAnimations();
  }

  void _initAnimations() {
    // Animación de entrada
    _entryCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 800));
    _entryFade = CurvedAnimation(parent: _entryCtrl!, curve: Curves.easeOut);
    _entrySlide = Tween<Offset>(begin: const Offset(0, 0.08), end: Offset.zero)
        .animate(CurvedAnimation(parent: _entryCtrl!, curve: Curves.easeOutCubic));

    // Pulso anillos
    _pulseCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 2200))
      ..repeat();
    _pulse1 = Tween<double>(begin: 0.85, end: 1.35).animate(
        CurvedAnimation(parent: _pulseCtrl!, curve: Curves.easeInOut));
    _pulse2 = Tween<double>(begin: 0.85, end: 1.55).animate(
        CurvedAnimation(parent: _pulseCtrl!, curve: const Interval(0.15, 1.0, curve: Curves.easeInOut)));
    _pulseOpacity1 = Tween<double>(begin: 0.25, end: 0.0).animate(
        CurvedAnimation(parent: _pulseCtrl!, curve: Curves.easeInOut));
    _pulseOpacity2 = Tween<double>(begin: 0.15, end: 0.0).animate(
        CurvedAnimation(parent: _pulseCtrl!, curve: const Interval(0.15, 1.0, curve: Curves.easeInOut)));

    // Anillo rotante decorativo
    _ringCtrl = AnimationController(vsync: this, duration: const Duration(seconds: 8))..repeat();

    // Éxito
    _successCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
    _successScale = CurvedAnimation(parent: _successCtrl!, curve: Curves.elasticOut);

    // Shake
    _shakeCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
    _shakeAnim = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.0, end: -10.0), weight: 1),
      TweenSequenceItem(tween: Tween(begin: -10.0, end: 10.0), weight: 2),
      TweenSequenceItem(tween: Tween(begin: 10.0, end: -8.0), weight: 2),
      TweenSequenceItem(tween: Tween(begin: -8.0, end: 8.0), weight: 2),
      TweenSequenceItem(tween: Tween(begin: 8.0, end: 0.0), weight: 1),
    ]).animate(_shakeCtrl!);

    _entryCtrl!.forward().then((_) {
//       debugPrint('[LOCK] Animación de entrada terminada — lanzando _authenticate()');
      // Lanzar autenticación automáticamente al terminar la animación de entrada
      if (mounted) _authenticate();
    });
  }

  @override
  void dispose() {
    _entryCtrl?.dispose();
    _pulseCtrl?.dispose();
    _ringCtrl?.dispose();
    _successCtrl?.dispose();
    _shakeCtrl?.dispose();
    super.dispose();
  }

  Future<void> _authenticate() async {
//     debugPrint('[LOCK] _authenticate() llamado — isAuthenticating=$_isAuthenticating authenticated=$_authenticated');
    if (_isAuthenticating || _authenticated) return;
    if (!mounted) return;

    if (supabase.auth.currentUser == null) {
//       debugPrint('[LOCK] Sin usuario → redirigiendo a /login');
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go('/login');
      });
      return;
    }

    setState(() {
      _isAuthenticating = true;
      _failed = false;
    });

    try {
      final bool canCheckBiometrics = await auth.canCheckBiometrics;
      final bool canAuthenticate = canCheckBiometrics || await auth.isDeviceSupported();
//       debugPrint('[LOCK] canCheckBiometrics=$canCheckBiometrics canAuthenticate=$canAuthenticate');

      if (!canAuthenticate) {
//         debugPrint('[LOCK] Dispositivo sin biometria → /dashboard');
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) context.go('/dashboard');
        });
        return;
      }

      final authenticated = await auth.authenticate(
        localizedReason: 'Desbloquea Estrella Admin para continuar',
        authMessages: const <AuthMessages>[
          AndroidAuthMessages(
            signInTitle: 'Seguridad Estrella',
            cancelButton: 'Cancelar',
          ),
          IOSAuthMessages(cancelButton: 'Cancelar'),
        ],
        options: const AuthenticationOptions(stickyAuth: true, biometricOnly: false),
      );

      if (!mounted) return;

      if (authenticated) {
//         debugPrint('[LOCK] ✅ Autenticado → /dashboard');
        setState(() {
          _authenticated = true;
          _isAuthenticating = false;
        });
        _pulseCtrl?.stop();
        _successCtrl?.forward();
        await Future.delayed(const Duration(milliseconds: 700));
        if (mounted) context.go('/dashboard');
      } else {
        debugPrint('[LOCK] ❌ Autenticación fallida');
        setState(() {
          _isAuthenticating = false;
          _failed = true;
        });
        _shakeCtrl?.forward(from: 0);
        await Future.delayed(const Duration(milliseconds: 1500));
        if (mounted) setState(() => _failed = false);
      }
    } catch (e) {
      debugPrint('[LOCK] ❌ Excepción en biometría: $e');
      if (!mounted) return;
      setState(() => _isAuthenticating = false);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go('/login');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      resizeToAvoidBottomInset: false,
      backgroundColor: Colors.white,
      body: FadeTransition(
        opacity: _entryFade ?? const AlwaysStoppedAnimation(1.0),
        child: SlideTransition(
          position: _entrySlide ?? const AlwaysStoppedAnimation(Offset.zero),
          child: SafeArea(
            child: Stack(
              children: [
                // Decoración top-right sutil
                Positioned(
                  top: -60,
                  right: -60,
                  child: _DecoCircle(size: 220, color: const Color(0xFFF0F0F0)),
                ),
                Positioned(
                  bottom: -40,
                  left: -40,
                  child: _DecoCircle(size: 180, color: const Color(0xFFF5F5F5)),
                ),

                // Contenido principal
                Column(
                  children: [
                    // Header
                    Padding(
                      padding: const EdgeInsets.fromLTRB(28, 32, 28, 0),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                            decoration: BoxDecoration(
                              color: Colors.black,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Text(
                              'ESTRELLA',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 2,
                              ),
                            ),
                          ),
                          const Spacer(),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF3F3F3),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 6, height: 6,
                                  decoration: BoxDecoration(
                                    color: _authenticated
                                        ? const Color(0xFF22C55E)
                                        : _failed
                                            ? const Color(0xFFEF4444)
                                            : const Color(0xFF6B7280),
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  _authenticated ? 'Autenticado' : _failed ? 'Fallido' : 'Bloqueado',
                                  style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280), fontWeight: FontWeight.w600),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),

                    const Spacer(),

                    // Icono central animado
                    AnimatedBuilder(
                      animation: Listenable.merge([_pulseCtrl ?? const AlwaysStoppedAnimation(0), _ringCtrl ?? const AlwaysStoppedAnimation(0), _shakeCtrl ?? const AlwaysStoppedAnimation(0), _successCtrl ?? const AlwaysStoppedAnimation(0)]),
                      builder: (context, _) {
                        return Transform.translate(
                          offset: Offset(_shakeAnim?.value ?? 0, 0),
                          child: SizedBox(
                            width: 200,
                            height: 200,
                            child: Stack(
                              alignment: Alignment.center,
                              children: [
                                // Anillo pulsante exterior
                                if (!_authenticated)
                                  Transform.scale(
                                    scale: _pulse2?.value ?? 1.0,
                                    child: Container(
                                      width: 160,
                                      height: 160,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        border: Border.all(
                                          color: (_failed
                                                  ? const Color(0xFFEF4444)
                                                  : Colors.black)
                                              .withOpacity(_pulseOpacity2?.value ?? 0),
                                          width: 1.5,
                                        ),
                                      ),
                                    ),
                                  ),

                                // Anillo pulsante interior
                                if (!_authenticated)
                                  Transform.scale(
                                    scale: _pulse1?.value ?? 1.0,
                                    child: Container(
                                      width: 140,
                                      height: 140,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        border: Border.all(
                                          color: (_failed
                                                  ? const Color(0xFFEF4444)
                                                  : Colors.black)
                                              .withOpacity(_pulseOpacity1?.value ?? 0),
                                          width: 2,
                                        ),
                                      ),
                                    ),
                                  ),

                                // Anillo decorativo rotante
                                Transform.rotate(
                                  angle: (_ringCtrl?.value ?? 0) * 2 * math.pi,
                                  child: CustomPaint(
                                    size: const Size(130, 130),
                                    painter: _DashedRingPainter(
                                      color: _authenticated
                                          ? const Color(0xFF22C55E)
                                          : _failed
                                              ? const Color(0xFFEF4444)
                                              : const Color(0xFFD1D5DB),
                                    ),
                                  ),
                                ),

                                // Circulo base
                                AnimatedContainer(
                                  duration: const Duration(milliseconds: 400),
                                  width: 100,
                                  height: 100,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: _authenticated
                                        ? const Color(0xFF22C55E)
                                        : _failed
                                            ? const Color(0xFFEF4444)
                                            : Colors.black,
                                    boxShadow: [
                                      BoxShadow(
                                        color: (_authenticated
                                                ? const Color(0xFF22C55E)
                                                : _failed
                                                    ? const Color(0xFFEF4444)
                                                    : Colors.black)
                                            .withOpacity(0.18),
                                        blurRadius: 30,
                                        spreadRadius: 4,
                                      ),
                                    ],
                                  ),
                                  child: _authenticated
                                      ? Transform.scale(
                                          scale: _successScale?.value ?? 1.0,
                                          child: const Icon(Icons.check_rounded, color: Colors.white, size: 46),
                                        )
                                      : _isAuthenticating
                                          ? const Padding(
                                              padding: EdgeInsets.all(28),
                                              child: CircularProgressIndicator(
                                                color: Colors.white,
                                                strokeWidth: 2.5,
                                              ),
                                            )
                                          : Icon(
                                              _failed ? Icons.fingerprint_outlined : Icons.fingerprint,
                                              color: Colors.white,
                                              size: 46,
                                            ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),

                    const SizedBox(height: 40),

                    // Textos
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 300),
                      child: _authenticated
                          ? const Text(
                              '¡Bienvenido!',
                              key: ValueKey('ok'),
                              style: TextStyle(
                                fontSize: 26,
                                fontWeight: FontWeight.w900,
                                color: Color(0xFF22C55E),
                                letterSpacing: -0.5,
                              ),
                            )
                          : _failed
                              ? const Text(
                                  'No reconocido',
                                  key: ValueKey('fail'),
                                  style: TextStyle(
                                    fontSize: 26,
                                    fontWeight: FontWeight.w900,
                                    color: Color(0xFFEF4444),
                                    letterSpacing: -0.5,
                                  ),
                                )
                              : const Text(
                                  'Verificación',
                                  key: ValueKey('idle'),
                                  style: TextStyle(
                                    fontSize: 28,
                                    fontWeight: FontWeight.w900,
                                    color: Colors.black,
                                    letterSpacing: -0.8,
                                  ),
                                ),
                    ),

                    const SizedBox(height: 10),

                    Text(
                      _authenticated
                          ? 'Redirigiendo al panel...'
                          : _failed
                              ? 'Intenta de nuevo'
                              : 'Usa tu huella para acceder',
                      style: const TextStyle(
                        fontSize: 15,
                        color: Color(0xFF9CA3AF),
                        fontWeight: FontWeight.w500,
                      ),
                    ),

                    const Spacer(),

                    // Botones inferiores
                    if (!_authenticated)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(28, 0, 28, 12),
                        child: Column(
                          children: [
                            // Botón principal
                            GestureDetector(
                              onTap: _isAuthenticating ? null : _authenticate,
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 200),
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(vertical: 18),
                                decoration: BoxDecoration(
                                  color: _isAuthenticating
                                      ? const Color(0xFFF3F3F3)
                                      : Colors.black,
                                  borderRadius: BorderRadius.circular(18),
                                ),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      Icons.fingerprint_rounded,
                                      color: _isAuthenticating ? const Color(0xFFD1D5DB) : Colors.white,
                                      size: 22,
                                    ),
                                    const SizedBox(width: 10),
                                    Text(
                                      _isAuthenticating ? 'Leyendo huella...' : 'Desbloquear',
                                      style: TextStyle(
                                        color: _isAuthenticating ? const Color(0xFFD1D5DB) : Colors.white,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 16,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),

                            const SizedBox(height: 12),

                            // Botón secundario
                            GestureDetector(
                              onTap: () async {
                                await supabase.auth.signOut();
                                if (!context.mounted) return;
                                context.go('/login');
                              },
                              child: Container(
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(vertical: 16),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF9F9F9),
                                  borderRadius: BorderRadius.circular(18),
                                  border: Border.all(color: const Color(0xFFE5E7EB)),
                                ),
                                child: const Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.lock_open_rounded, color: Color(0xFF6B7280), size: 18),
                                    SizedBox(width: 8),
                                    Text(
                                      'Ingresar con contraseña',
                                      style: TextStyle(
                                        color: Color(0xFF6B7280),
                                        fontWeight: FontWeight.w600,
                                        fontSize: 14,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),

                    const SizedBox(height: 16),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Círculo decorativo de fondo ─────────────────────────────────
class _DecoCircle extends StatelessWidget {
  final double size;
  final Color color;
  const _DecoCircle({required this.size, required this.color});

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, color: color),
      );
}

// ── Anillo punteado rotante ─────────────────────────────────────
class _DashedRingPainter extends CustomPainter {
  final Color color;
  _DashedRingPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;

    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;
    const dashCount = 24;
    const dashAngle = math.pi / (dashCount * 1.5);
    final stepAngle = (2 * math.pi) / dashCount;

    for (int i = 0; i < dashCount; i++) {
      final startAngle = i * stepAngle;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        dashAngle,
        false,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_DashedRingPainter old) => old.color != color;
}

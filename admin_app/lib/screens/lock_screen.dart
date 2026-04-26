import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:local_auth/local_auth.dart';
import 'package:local_auth_android/local_auth_android.dart';
import 'package:local_auth_darwin/local_auth_darwin.dart';
import '../core/supabase_config.dart';
import '../core/theme.dart';
import 'dart:ui';

class LockScreen extends StatefulWidget {
  const LockScreen({super.key});

  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen> with SingleTickerProviderStateMixin {
  final LocalAuthentication auth = LocalAuthentication();
  bool _isAuthenticating = false;
  late AnimationController _animCtrl;
  late Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _animCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1000));
    _fadeAnim = CurvedAnimation(parent: _animCtrl, curve: Curves.easeIn);
    _animCtrl.forward();
    _authenticate();
  }

  @override
  void dispose() {
    _animCtrl.dispose();
    super.dispose();
  }

  Future<void> _authenticate() async {
    if (_isAuthenticating) return;
    if (!mounted) return;

    // Si no hay sesión, mandarlo al login real
    if (supabase.auth.currentUser == null) {
      // Usar addPostFrameCallback para evitar navegación durante build
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go('/login');
      });
      return;
    }

    try {
      setState(() => _isAuthenticating = true);

      final bool canAuthenticateWithBiometrics = await auth.canCheckBiometrics;
      final bool canAuthenticate =
          canAuthenticateWithBiometrics || await auth.isDeviceSupported();

      if (!canAuthenticate) {
        // Dispositivo sin seguridad biométrica, pasar directo al dashboard
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
          IOSAuthMessages(
            cancelButton: 'Cancelar',
          ),
        ],
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: false,
        ),
      );

      if (!mounted) return;
      if (authenticated) {
        context.go('/dashboard');
      } else {
        setState(() => _isAuthenticating = false);
      }
    } catch (e) {
      print('Error en biometria: $e');
      if (!mounted) return;
      setState(() => _isAuthenticating = false);
      // Cualquier error de biometría → ir al login manual
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go('/login');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0F13), // Deep black background
      body: Stack(
        children: [
          // Ambient Glows
          Positioned(
            top: -100,
            left: -50,
            child: _GlowCircle(color: Theme.of(context).colorScheme.primary.withOpacity(0.2), size: 300),
          ),
          Positioned(
            bottom: -50,
            right: -100,
            child: _GlowCircle(color: Theme.of(context).colorScheme.secondary.withOpacity(0.15), size: 350),
          ),
          
          // Glassmorphism Content
          Center(
            child: FadeTransition(
              opacity: _fadeAnim,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(32),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
                    width: MediaQuery.of(context).size.width * 0.85,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.05),
                      borderRadius: BorderRadius.circular(32),
                      border: Border.all(color: Colors.white.withOpacity(0.1), width: 1.5),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            gradient: AppGradients.brand,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: Theme.of(context).colorScheme.primary.withOpacity(0.5),
                                blurRadius: 24,
                                offset: const Offset(0, 8),
                              ),
                            ],
                          ),
                          child: const Icon(Icons.shield_rounded, size: 48, color: Colors.white),
                        ),
                        const SizedBox(height: 32),
                        const Text(
                          'Estrella Seguro',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 26,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.5,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Acceso logístico protegido',
                          style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 14),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 48),
                        if (!_isAuthenticating)
                          GestureDetector(
                            onTap: _authenticate,
                            child: Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              decoration: BoxDecoration(
                                color: Theme.of(context).colorScheme.primary.withOpacity(0.15),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: Theme.of(context).colorScheme.primary.withOpacity(0.5)),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.fingerprint_rounded, color: Theme.of(context).colorScheme.primary),
                                  const SizedBox(width: 12),
                                  Text('Desbloquear', style: TextStyle(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.bold, fontSize: 16)),
                                ],
                              ),
                            ),
                          )
                        else
                          Column(
                            children: [
                              SizedBox(
                                width: 40, height: 40,
                                child: CircularProgressIndicator(color: Theme.of(context).colorScheme.primary, strokeWidth: 3),
                              ),
                              const SizedBox(height: 16),
                              Text('Verificando...', style: TextStyle(color: Colors.white.withOpacity(0.5))),
                            ],
                          ),
                        
                        const SizedBox(height: 24),
                        TextButton(
                          onPressed: () async {
                            await supabase.auth.signOut();
                            if (!context.mounted) return;
                            context.go('/login');
                          },
                          child: Text('Cerrar Sesión', style: TextStyle(color: Colors.white.withOpacity(0.4))),
                        )
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GlowCircle extends StatelessWidget {
  final Color color;
  final double size;
  const _GlowCircle({required this.color, required this.size});

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      gradient: RadialGradient(
        colors: [color, Colors.transparent],
        stops: const [0.0, 1.0],
      ),
    ),
  );
}

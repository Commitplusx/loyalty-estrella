import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/theme.dart';
import '../core/user_role.dart';
import 'repartidores_screen.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen>
    with SingleTickerProviderStateMixin {
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  String? _error;
  late AnimationController _animCtrl;
  late Animation<double> _fadeAnim;
  late Animation<Offset> _slideAnim;

  @override
  void initState() {
    super.initState();
    // Fade + slide-up on entry
    _animCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
    _fadeAnim = CurvedAnimation(parent: _animCtrl, curve: Curves.easeOut);
    _slideAnim = Tween<Offset>(begin: const Offset(0, 0.08), end: Offset.zero)
        .animate(CurvedAnimation(parent: _animCtrl, curve: Curves.easeOutCubic));
    _animCtrl.forward();

    // Transparent status bar for the full-bleed background
    SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ));
  }

  @override
  void dispose() {
    _animCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    setState(() { _loading = true; _error = null; });
    try {
      String emailText = _emailCtrl.text.trim();
      if (!emailText.contains('@')) {
        emailText = '$emailText@repartidor.com';
      }
      await Supabase.instance.client.auth.signInWithPassword(
        email: emailText,
        password: _passCtrl.text.trim(),
      );
      ref.invalidate(isAdminProvider);
      ref.invalidate(myRepartidorIdProvider);
      if (mounted) context.go('/dashboard');
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Stack(
        children: [
          // ── Ambient background glow ─────────────────────────────────
          Positioned(
            top: -size.height * 0.15,
            left: -80,
            child: _GlowCircle(color: Theme.of(context).colorScheme.primary.withOpacity(0.18), size: 380),
          ),
          Positioned(
            top: size.height * 0.1,
            right: -120,
            child: _GlowCircle(color: Theme.of(context).colorScheme.secondary.withOpacity(0.10), size: 300),
          ),
          // ── Main content ────────────────────────────────────────────
          SafeArea(
            child: FadeTransition(
              opacity: _fadeAnim,
              child: SlideTransition(
                position: _slideAnim,
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // ── Logo Icon ──────────────────────────────────
                        _LogoIcon(),
                        SizedBox(height: 28),

                        // ── Brand Name ─────────────────────────────────
                        Text(
                          'Estrella Delivery',
                          style: TextStyle(
                            fontSize: 30,
                            fontWeight: FontWeight.w800,
                            color: Theme.of(context).colorScheme.onSurface,
                            letterSpacing: -0.8,
                          ),
                        ),
                        SizedBox(height: 6),
                        Text(
                          'Panel Logístico',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            color: Theme.of(context).colorScheme.primary,
                            letterSpacing: 0.5,
                          ),
                        ),
                        SizedBox(height: 44),

                        // ── Login Card (Glassmorphism) ──────────────────
                        _LoginCard(
                          emailCtrl: _emailCtrl,
                          passCtrl: _passCtrl,
                          obscure: _obscure,
                          loading: _loading,
                          error: _error,
                          onToggleObscure: () => setState(() => _obscure = !_obscure),
                          onLogin: _login,
                        ),
                        SizedBox(height: 40),

                        // ── Footer ─────────────────────────────────────
                        Text(
                          'Estrella Delivery © 2025',
                          style: TextStyle(
                            fontSize: 12,
                            color: Theme.of(context).colorScheme.onSurface.withOpacity(0.4),
                          ),
                        ),
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

// ── Ambient Glow Helper ────────────────────────────────────────────────────────
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

// ── Star Logo ──────────────────────────────────────────────────────────────────
class _LogoIcon extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 100,
      height: 100,
      decoration: BoxDecoration(
        gradient: AppGradients.brand,
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: Theme.of(context).colorScheme.primary.withOpacity(0.45),
            blurRadius: 40,
            spreadRadius: 4,
            offset: const Offset(0, 12),
          ),
          BoxShadow(
            color: Theme.of(context).colorScheme.secondary.withOpacity(0.20),
            blurRadius: 20,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Icon(Icons.local_shipping_rounded, color: Colors.white, size: 52),
    );
  }
}

// ── Glassmorphism Login Card ───────────────────────────────────────────────────
class _LoginCard extends StatelessWidget {
  final TextEditingController emailCtrl;
  final TextEditingController passCtrl;
  final bool obscure;
  final bool loading;
  final String? error;
  final VoidCallback onToggleObscure;
  final VoidCallback onLogin;

  const _LoginCard({
    required this.emailCtrl,
    required this.passCtrl,
    required this.obscure,
    required this.loading,
    required this.error,
    required this.onToggleObscure,
    required this.onLogin,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color ?? Theme.of(context).colorScheme.surface.withOpacity(0.85),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Theme.of(context).colorScheme.outline, width: 1.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.4),
            blurRadius: 40,
            offset: const Offset(0, 20),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Email
          TextField(
            controller: emailCtrl,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 15),
            decoration: const InputDecoration(
              labelText: 'Correo electrónico',
              prefixIcon: Icon(Icons.email_outlined),
            ),
          ),
          SizedBox(height: 16),
          // Password
          TextField(
            controller: passCtrl,
            obscureText: obscure,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => onLogin(),
            style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 15),
            decoration: InputDecoration(
              labelText: 'Contraseña',
              prefixIcon: Icon(Icons.lock_outline_rounded),
              suffixIcon: IconButton(
                icon: Icon(
                  obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
                onPressed: onToggleObscure,
              ),
            ),
          ),
          // Error banner
          if (error != null) ...[
            SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.error.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Theme.of(context).colorScheme.error.withOpacity(0.30)),
              ),
              child: Row(
                children: [
                  Icon(Icons.error_outline_rounded, color: Theme.of(context).colorScheme.error, size: 18),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      error!,
                      style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
          ],
          SizedBox(height: 24),
          // CTA Button with gradient
          _GradientButton(onPressed: loading ? null : onLogin, loading: loading),
        ],
      ),
    );
  }
}

// ── Gradient Button ────────────────────────────────────────────────────────────
class _GradientButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final bool loading;
  const _GradientButton({required this.onPressed, required this.loading});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        height: 56,
        decoration: BoxDecoration(
          gradient: onPressed != null ? AppGradients.brand : null,
          color: onPressed == null ? Theme.of(context).colorScheme.onSurface.withOpacity(0.4) : null,
          borderRadius: BorderRadius.circular(14),
          boxShadow: onPressed != null
              ? [BoxShadow(color: Theme.of(context).colorScheme.primary.withOpacity(0.40), blurRadius: 20, offset: const Offset(0, 8))]
              : [],
        ),
        child: Center(
          child: loading
              ? SizedBox(
                  width: 22, height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : Text(
                  'Iniciar Sesión',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.3,
                  ),
                ),
        ),
      ),
    );
  }
}

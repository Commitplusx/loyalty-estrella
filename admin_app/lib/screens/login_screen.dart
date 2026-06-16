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
  final _phoneCtrl = TextEditingController();
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
    _animCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
    _fadeAnim = CurvedAnimation(parent: _animCtrl, curve: Curves.easeOut);
    _slideAnim = Tween<Offset>(begin: const Offset(0, 0.08), end: Offset.zero)
        .animate(CurvedAnimation(parent: _animCtrl, curve: Curves.easeOutCubic));
    _animCtrl.forward();

    SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ));
  }

  @override
  void dispose() {
    _animCtrl.dispose();
    _phoneCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  String _cleanPhone(String p) => p.replaceAll(RegExp(r'\D'), '');

  Future<void> _login() async {
    setState(() { _loading = true; _error = null; });
    try {
      final phone = _cleanPhone(_phoneCtrl.text);
      if (phone.length < 10) throw Exception('Ingresa un teléfono válido de 10 dígitos.');
      if (_passCtrl.text.isEmpty) throw Exception('Ingresa tu contraseña.');

      // Al no saber si es admin o repartidor en el momento, intentamos primero admin.com y luego repartidor.com.
      // O mucho mejor, dejamos que Supabase nos diga si está mal la clave. 
      // Si usábamos correos, tenemos que intentar ambas o averiguar el dominio primero.
      // Vamos a intentar con @repartidor.com y si falla por Invalid Credentials, intentamos con @admin.com.
      
      AuthResponse? res;
      final pass = _passCtrl.text.trim();
      final repFuture = Supabase.instance.client.auth.signInWithPassword(email: '$phone@repartidor.com', password: pass);
      final adminFuture = Supabase.instance.client.auth.signInWithPassword(email: '$phone@admin.com', password: pass);
      
      AuthResponse? repRes;
      AuthResponse? adminRes;
      
      await Future.wait([
        repFuture.then((r) => repRes = r).catchError((_) => null),
        adminFuture.then((r) => adminRes = r).catchError((_) => null),
      ]);

      res = repRes ?? adminRes;
      if (res == null) {
        throw const AuthException('Credenciales inválidas o usuario no encontrado.');
      }

      ref.invalidate(isAdminProvider);
      ref.invalidate(myRepartidorIdProvider);
      if (mounted) context.go('/dashboard');
    } catch (e) {
      if (e is AuthException) {
        setState(() => _error = 'Credenciales inválidas o usuario no encontrado.');
      } else {
        setState(() => _error = e.toString().replaceAll('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── FLUJO OTP ──────────────────────────────────────────────────
  Future<void> _iniciarFlujoOtp() async {
    final phone = _cleanPhone(_phoneCtrl.text);
    if (phone.length < 10) {
      setState(() => _error = 'Escribe tu número a 10 dígitos arriba para pedir el código.');
      return;
    }

    setState(() { _loading = true; _error = null; });
    try {
      final res = await Supabase.instance.client.functions.invoke(
        'auth-otp',
        body: {'action': 'request', 'telefono': phone},
      );
      // Supabase lanza una excepción si hay error HTTP, por lo que si llega aquí, fue exitoso.

      if (!mounted) return;
      // Modal OTP
      _mostrarModalOtp(phone);
    } catch (e) {
      print('OTP Error: $e');
      setState(() => _error = 'No se pudo generar código. Error interno: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _mostrarModalOtp(String phone) {
    final codeCtrl = TextEditingController();
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('🔐 Código de Seguridad'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Te hemos enviado un código de 6 dígitos por WhatsApp. Ingrésalo aquí:'),
            const SizedBox(height: 16),
            TextField(
              controller: codeCtrl,
              keyboardType: TextInputType.number,
              maxLength: 6,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 24, letterSpacing: 8, fontWeight: FontWeight.bold),
              decoration: const InputDecoration(counterText: ''),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          ElevatedButton(
            onPressed: () {
              final codigo = codeCtrl.text.trim();
              if (codigo.length == 6) {
                Navigator.pop(ctx);
                _mostrarModalNuevaPassword(phone, codigo);
              }
            },
            child: const Text('Verificar'),
          ),
        ],
      ),
    );
  }

  void _mostrarModalNuevaPassword(String phone, String codigo) {
    final passCtrl = TextEditingController();
    bool localLoading = false;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) {
          return AlertDialog(
            title: const Text('🔑 Nueva Contraseña'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('El código es correcto. Crea una contraseña segura para tus futuros ingresos:'),
                const SizedBox(height: 16),
                TextField(
                  controller: passCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Nueva Contraseña'),
                ),
              ],
            ),
            actions: [
              if (localLoading) const CircularProgressIndicator(),
              if (!localLoading)
                ElevatedButton(
                  onPressed: () async {
                    if (passCtrl.text.length < 6) {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Mínimo 6 caracteres')));
                      return;
                    }
                    setModalState(() => localLoading = true);
                    try {
                      final res = await Supabase.instance.client.functions.invoke(
                        'auth-otp',
                        body: {
                          'action': 'set-password',
                          'telefono': phone,
                          'codigo': codigo,
                          'nuevaPassword': passCtrl.text
                        },
                      );
                      
                      // Auto login
                      final email = res.data['email'];
                      await Supabase.instance.client.auth.signInWithPassword(email: email, password: passCtrl.text);
                      
                      if (mounted) {
                        Navigator.pop(ctx);
                        context.go('/dashboard');
                      }
                    } catch (e) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
                      setModalState(() => localLoading = false);
                    }
                  },
                  child: const Text('Guardar y Entrar'),
                ),
            ],
          );
        }
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Stack(
        children: [
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
                        _LogoIcon(),
                        const SizedBox(height: 28),

                        Text(
                          'Estrella Delivery',
                          style: TextStyle(
                            fontSize: 30,
                            fontWeight: FontWeight.w800,
                            color: Theme.of(context).colorScheme.onSurface,
                            letterSpacing: -0.8,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Panel Logístico',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            color: Theme.of(context).colorScheme.primary,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: 44),

                        _LoginCard(
                          phoneCtrl: _phoneCtrl,
                          passCtrl: _passCtrl,
                          obscure: _obscure,
                          loading: _loading,
                          error: _error,
                          onToggleObscure: () => setState(() => _obscure = !_obscure),
                          onLogin: _login,
                          onOtpRequest: _iniciarFlujoOtp,
                        ),
                        const SizedBox(height: 40),

                        Text(
                          'Estrella Delivery © 2026',
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
      child: const Icon(Icons.local_shipping_rounded, color: Colors.white, size: 52),
    );
  }
}

class _LoginCard extends StatelessWidget {
  final TextEditingController phoneCtrl;
  final TextEditingController passCtrl;
  final bool obscure;
  final bool loading;
  final String? error;
  final VoidCallback onToggleObscure;
  final VoidCallback onLogin;
  final VoidCallback onOtpRequest;

  const _LoginCard({
    required this.phoneCtrl,
    required this.passCtrl,
    required this.obscure,
    required this.loading,
    required this.error,
    required this.onToggleObscure,
    required this.onLogin,
    required this.onOtpRequest,
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
          TextField(
            controller: phoneCtrl,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.next,
            style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 15),
            decoration: const InputDecoration(
              labelText: 'Número de Teléfono',
              prefixIcon: Icon(Icons.phone_iphone_rounded),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: passCtrl,
            obscureText: obscure,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => onLogin(),
            style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 15),
            decoration: InputDecoration(
              labelText: 'Contraseña',
              prefixIcon: const Icon(Icons.lock_outline_rounded),
              suffixIcon: IconButton(
                icon: Icon(
                  obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
                onPressed: onToggleObscure,
              ),
            ),
          ),
          if (error != null) ...[
            const SizedBox(height: 14),
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
                  const SizedBox(width: 8),
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
          const SizedBox(height: 24),
          _GradientButton(onPressed: loading ? null : onLogin, loading: loading),
          
          const SizedBox(height: 16),
          TextButton(
            onPressed: loading ? null : onOtpRequest,
            child: const Text('¿Sin contraseña? Generar PIN por WhatsApp'),
          ),
        ],
      ),
    );
  }
}

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
              ? const SizedBox(
                  width: 22, height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Text(
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

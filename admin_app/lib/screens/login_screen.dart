import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/theme.dart';
import '../core/ui_helpers.dart';
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

      AuthResponse? res;
      final pass = _passCtrl.text.trim();
      
      AuthResponse? repRes;
      try {
        repRes = await Supabase.instance.client.auth.signInWithPassword(
          email: '$phone@repartidor.com', 
          password: pass,
        );
      } catch (e) {
        debugPrint('=== LOG: Error Auth Repartidor: $e');
      }

      AuthResponse? adminRes;
      // Si no es repartidor, intentamos como admin
      if (repRes == null) {
        try {
          adminRes = await Supabase.instance.client.auth.signInWithPassword(
            email: '$phone@admin.com', 
            password: pass,
          );
        } catch (e) {
          debugPrint('=== LOG: Error Auth Admin: $e');
        }
      }

      res = repRes ?? adminRes;
      if (res == null) {
        throw const AuthException('Credenciales inválidas o usuario no encontrado.');
      }

      ref.invalidate(isAdminProvider);
      ref.invalidate(myRepartidorIdProvider);
      if (mounted) context.go('/dashboard');
    } catch (e, stackTrace) {
      debugPrint('=== LOG: Exception General Login: $e');
      debugPrint('=== LOG: StackTrace: $stackTrace');
      
      if (e is AuthException) {
        setState(() => _error = 'Credenciales inválidas o usuario no encontrado.');
      } else {
        // Limpiamos los caracteres extraños si es una excepción con JSON
        String errorMsg = e.toString().replaceAll('Exception: ', '');
        if (errorMsg.contains('{') && errorMsg.contains('}')) {
          errorMsg = 'Ocurrió un error interno. Revisa tu conexión.';
        }
        setState(() => _error = errorMsg);
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

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

      if (!mounted) return;
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
    bool localLoading = false;

    PremiumBottomSheet.showCustom<void>(
      context,
      title: '🔐 Código de Seguridad',
      child: StatefulBuilder(
        builder: (context, setModalState) {
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Te hemos enviado un código de 6 dígitos por WhatsApp. Ingrésalo aquí:', style: TextStyle(fontSize: 14)),
              const SizedBox(height: 24),
              TextField(
                controller: codeCtrl,
                keyboardType: TextInputType.number,
                maxLength: 6,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 28, letterSpacing: 12, fontWeight: FontWeight.bold),
                decoration: InputDecoration(
                  counterText: '',
                  filled: true,
                  fillColor: Theme.of(context).colorScheme.surface.withOpacity(0.5),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                ),
              ),
              const SizedBox(height: 32),
              Row(
                children: [
                  Expanded(
                    child: TextButton(
                      onPressed: localLoading ? null : () => Navigator.pop(context),
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      child: Text('Cancelar', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, fontWeight: FontWeight.bold)),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: FilledButton(
                      onPressed: localLoading ? null : () async {
                        final codigo = codeCtrl.text.trim();
                        if (codigo.length != 6) {
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('El código debe tener 6 dígitos')));
                          return;
                        }

                        setModalState(() => localLoading = true);
                        try {
                          // Verificar el PIN en el servidor primero
                          await Supabase.instance.client.functions.invoke(
                            'auth-otp',
                            body: {
                              'action': 'verify-code',
                              'telefono': phone,
                              'codigo': codigo,
                            },
                          );

                          if (mounted) {
                            Navigator.pop(context); // Cerrar modal de OTP
                            _mostrarModalNuevaPassword(phone, codigo);
                          }
                        } catch (e) {
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('❌ Código incorrecto o expirado.'), backgroundColor: Colors.red)
                            );
                          }
                        } finally {
                          if (mounted) setModalState(() => localLoading = false);
                        }
                      },
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      child: localLoading 
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Text('Verificar', style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
            ],
          );
        }
      ),
    );
  }

  void _mostrarModalNuevaPassword(String phone, String codigo) {
    final passCtrl = TextEditingController();
    bool localLoading = false;

    PremiumBottomSheet.showCustom<void>(
      context,
      title: '🔑 Nueva Contraseña',
      child: StatefulBuilder(
        builder: (context, setModalState) {
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('El código es correcto. Crea una contraseña segura para tus futuros ingresos:', style: TextStyle(fontSize: 14)),
              const SizedBox(height: 24),
              TextField(
                controller: passCtrl,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: 'Nueva Contraseña',
                  filled: true,
                  fillColor: Theme.of(context).colorScheme.surface.withOpacity(0.5),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                ),
              ),
              const SizedBox(height: 32),
              if (localLoading) 
                const Center(child: CircularProgressIndicator())
              else
                FilledButton(
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
                      
                      final email = res.data['email'];
                      await Supabase.instance.client.auth.signInWithPassword(email: email, password: passCtrl.text);
                      
                      if (mounted) {
                        Navigator.pop(context);
                        context.go('/dashboard');
                      }
                    } catch (e) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
                      setModalState(() => localLoading = false);
                    }
                  },
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: const Text('Guardar y Entrar', style: TextStyle(fontWeight: FontWeight.bold)),
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
      backgroundColor: const Color(0xFFC71E24), // Color base similar a la textura de la imagen
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Imagen anclada en la mitad superior sin deformar
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: size.height * 0.55,
            child: Image.asset(
              'assets/images/login_cover.jpg',
              fit: BoxFit.cover,
              alignment: Alignment.topCenter, // Asegura que la parte de arriba del monito siempre se vea
            ),
          ),
          
          // Difuminado mágico para mezclar el corte de la imagen con el fondo rojo sólido de abajo
          Positioned(
            top: size.height * 0.40,
            left: 0,
            right: 0,
            height: size.height * 0.15,
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Colors.transparent, Color(0xFFC71E24)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ),
          
          SafeArea(
            child: FadeTransition(
              opacity: _fadeAnim,
              child: SlideTransition(
                position: _slideAnim,
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SizedBox(height: size.height * 0.38), // Empuja el form debajo del scooter
                        
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
                        const SizedBox(height: 32),

                        Text(
                          'Estrella Delivery © 2026',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.white.withOpacity(0.5),
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
    return ClipRRect(
      borderRadius: BorderRadius.circular(32),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            color: Colors.white, // Tarjeta blanca super limpia
            borderRadius: BorderRadius.circular(32),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.15),
                blurRadius: 40,
                offset: const Offset(0, 15),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Acceso al Sistema',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                  color: Color(0xFFC71E24), // Rojo que combina con el fondo
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 32),
              
              TextField(
                controller: phoneCtrl,
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.next,
                style: const TextStyle(color: Colors.black87, fontSize: 16, fontWeight: FontWeight.bold),
                decoration: InputDecoration(
                  labelText: 'NÚMERO DE TELÉFONO',
                  labelStyle: TextStyle(color: Colors.black54, fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 1.2),
                  prefixIcon: const Icon(Icons.phone_iphone_rounded, color: Colors.black45),
                  filled: true,
                  fillColor: Colors.black.withOpacity(0.04),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Color(0xFFC71E24), width: 2)),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: passCtrl,
                obscureText: obscure,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => onLogin(),
                style: const TextStyle(color: Colors.black87, fontSize: 16, fontWeight: FontWeight.bold, letterSpacing: 4),
                decoration: InputDecoration(
                  labelText: 'CONTRASEÑA',
                  labelStyle: TextStyle(color: Colors.black54, fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 1.2),
                  prefixIcon: const Icon(Icons.lock_outline_rounded, color: Colors.black45),
                  filled: true,
                  fillColor: Colors.black.withOpacity(0.04),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Color(0xFFC71E24), width: 2)),
                  suffixIcon: IconButton(
                    icon: Icon(
                      obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                      color: Colors.black45,
                    ),
                    onPressed: onToggleObscure,
                  ),
                ),
              ),
              if (error != null) ...[
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFC71E24).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFC71E24).withOpacity(0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline_rounded, color: Color(0xFFC71E24), size: 20),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          error!,
                          style: const TextStyle(color: Color(0xFFC71E24), fontSize: 13, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 32),
              _GradientButton(onPressed: loading ? null : onLogin, loading: loading),
              
              const SizedBox(height: 16),
              TextButton(
                onPressed: loading ? null : onOtpRequest,
                style: TextButton.styleFrom(
                  foregroundColor: Colors.black54,
                  textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
                child: const Text('¿Problemas de acceso? Generar PIN'),
              ),
            ],
          ),
        ),
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
          color: onPressed == null ? Colors.grey.shade300 : const Color(0xFFC71E24),
          borderRadius: BorderRadius.circular(16),
          boxShadow: onPressed != null
              ? [BoxShadow(color: const Color(0xFFC71E24).withOpacity(0.40), blurRadius: 20, offset: const Offset(0, 8))]
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
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.5,
                  ),
                ),
        ),
      ),
    );
  }
}

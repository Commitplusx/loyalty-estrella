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

class _LockScreenState extends State<LockScreen> {
  final LocalAuthentication auth = LocalAuthentication();
  bool _isAuthenticating = false;

  @override
  void initState() {
    super.initState();
    _authenticate();
  }

  Future<void> _authenticate() async {
    if (_isAuthenticating) return;
    
    // Si no hay sesión, mandarlo al login real
    if (supabase.auth.currentUser == null) {
      if (!context.mounted) return;
      context.go('/login');
      return;
    }

    try {
      setState(() => _isAuthenticating = true);
      final bool canAuthenticateWithBiometrics = await auth.canCheckBiometrics;
      final bool canAuthenticate =
          canAuthenticateWithBiometrics || await auth.isDeviceSupported();

      if (!canAuthenticate) {
        // Dispositivo sin seguridad, pasarlo directo
        if (!context.mounted) return;
        context.go('/dashboard');
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

      if (!context.mounted) return;
      if (authenticated) {
        context.go('/dashboard');
      } else {
        setState(() => _isAuthenticating = false);
      }
    } catch (e) {
      print('Error en biometría: $e');
      setState(() => _isAuthenticating = false);
      // Fallback a login manual si falla el lector
      if (!context.mounted) return;
      context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF111827), Theme.of(context).cardColor],
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.lock_rounded, size: 80, color: Color(0xFFFF6B35)),
            SizedBox(height: 24),
            Text(
              'App Bloqueada',
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurface,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            SizedBox(height: 12),
            Text(
              'Usa tu huella o rostro para entrar',
              style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5), fontSize: 16),
            ),
            SizedBox(height: 48),
            if (!_isAuthenticating)
              ElevatedButton.icon(
                onPressed: _authenticate,
                icon: Icon(Icons.fingerprint_rounded),
                label: Text('Desbloquear'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                ),
              )
            else
              const CircularProgressIndicator(color: Color(0xFFFF6B35)),
            
            SizedBox(height: 24),
            TextButton(
              onPressed: () async {
                await supabase.auth.signOut();
                if (!context.mounted) return;
                context.go('/login');
              },
              child: Text('Cerrar Sesión', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
            )
          ],
        ),
      ),
    );
  }
}

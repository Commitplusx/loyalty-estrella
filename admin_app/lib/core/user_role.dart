import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Stream del estado de autenticación de Supabase
final authStateProvider = StreamProvider<AuthState>((ref) {
  return Supabase.instance.client.auth.onAuthStateChange;
});

/// Retorna `true` si el email autenticado termina en @admin.com
/// Retorna `false` si es repartidor (cualquier otro dominio)
/// Es reactivo: se actualiza automáticamente al iniciar/cerrar sesión
final isAdminProvider = Provider<bool>((ref) {
  // Observamos el estado de auth. Al cambiar de sesión, este provider se re-evalúa.
  final authState = ref.watch(authStateProvider).value;
  
  // Usamos el email de la sesión activa o el del currentUser actual
  final email = authState?.session?.user.email ?? 
                Supabase.instance.client.auth.currentUser?.email ?? '';
                
  return email.toLowerCase().endsWith('@admin.com');
});

/// Provee el rol legible del usuario actual
final userRoleProvider = Provider<String>((ref) {
  final isAdmin = ref.watch(isAdminProvider);
  return isAdmin ? 'Administrador' : 'Repartidor';
});

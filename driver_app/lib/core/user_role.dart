import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Stream del estado de autenticación de Supabase
final authStateProvider = StreamProvider<AuthState>((ref) {
  return Supabase.instance.client.auth.onAuthStateChange;
});

// Ya no consultamos la tabla 'admins' porque se eliminó la lógica de administrador.
final isAdminAsyncProvider = FutureProvider<bool>((ref) async {
  ref.watch(authStateProvider);
  return false;
});

/// Retorna siempre false ya que esta app es exclusiva de repartidores
final isAdminProvider = Provider<bool>((ref) {
  return false;
});

/// Provee el rol legible del usuario actual
final userRoleProvider = Provider<String>((ref) {
  return 'Repartidor';
});

final userNameProvider = FutureProvider<String>((ref) async {
  // Observar el estado de autenticación para invalidar el caché al cambiar de sesión
  ref.watch(authStateProvider);
  
  final user = Supabase.instance.client.auth.currentUser;
  final email = user?.email ?? '';
  final defaultName = email.split('@').first;
  
  // Buscamos su nombre en la base de datos (tabla repartidores)
  if (user != null) {
    try {
      final res = await Supabase.instance.client
          .from('repartidores')
          .select('nombre')
          .eq('user_id', user.id)
          .maybeSingle();
      if (res != null && res['nombre'] != null) {
        return res['nombre'] as String;
      }
    } catch (_) {}
  }
  return defaultName;
});

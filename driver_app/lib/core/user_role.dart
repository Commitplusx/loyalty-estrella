import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Stream del estado de autenticación de Supabase
final authStateProvider = StreamProvider<AuthState>((ref) {
  return Supabase.instance.client.auth.onAuthStateChange;
});

final isAdminAsyncProvider = FutureProvider<bool>((ref) async {
  // Observar el estado de autenticación para invalidar el caché al cambiar de sesión
  ref.watch(authStateProvider);
  
  final user = Supabase.instance.client.auth.currentUser;
  if (user == null) return false;
  
  try {
//     debugPrint('isAdminAsyncProvider: Checking for user ${user.id} in admins table...');
    final res = await Supabase.instance.client
        .from('admins')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
//     debugPrint('isAdminAsyncProvider: result = $res');
    return res != null;
  } catch (e) {
    debugPrint('isAdminAsyncProvider: error = $e');
    return false;
  }
});

/// Retorna `true` si el usuario actual est registrado en la tabla `admins`
/// Es reactivo: se actualiza automticamente al iniciar/cerrar sesin
final isAdminProvider = Provider<bool>((ref) {
  // Observamos el estado de auth para que se reevalue si cambia de sesin
  ref.watch(authStateProvider);
  return ref.watch(isAdminAsyncProvider).value ?? false;
});

/// Provee el rol legible del usuario actual
final userRoleProvider = Provider<String>((ref) {
  final isAdmin = ref.watch(isAdminProvider);
  return isAdmin ? 'Administrador' : 'Repartidor';
});

final userNameProvider = FutureProvider<String>((ref) async {
  // Observar el estado de autenticación para invalidar el caché al cambiar de sesión
  ref.watch(authStateProvider);
  
  final isAdmin = ref.watch(isAdminProvider);
  final user = Supabase.instance.client.auth.currentUser;
  final email = user?.email ?? '';
  final defaultName = email.split('@').first;
  
  if (isAdmin) return 'Admin';
  
  // Si es repartidor, buscamos su nombre en la base de datos
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

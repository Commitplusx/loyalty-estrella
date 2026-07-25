import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/ui_helpers.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/theme_provider.dart';
import '../core/ui_helpers.dart';

class ConfigScreen extends ConsumerStatefulWidget {
  const ConfigScreen({super.key});

  @override
  ConsumerState<ConfigScreen> createState() => _ConfigScreenState();
}

class _ConfigScreenState extends ConsumerState<ConfigScreen> {
  String _driverName = 'Repartidor';
  String _driverPhone = '';
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user == null) {
      if (mounted) setState(() => _isLoading = false);
      return;
    }
    
    // Fallback inicial con metadatos
    String name = user.userMetadata?['nombre'] ?? user.userMetadata?['name'] ?? 'Repartidor';
    
    try {
      final res = await Supabase.instance.client
          .from('repartidores')
          .select('nombre')
          .eq('user_id', user.id)
          .maybeSingle();
          
      if (res != null) {
        if (res['nombre'] != null && res['nombre'].toString().trim().isNotEmpty) {
          name = res['nombre'].toString();
        }
        if (res['telefono'] != null) {
          _driverPhone = res['telefono'].toString();
        }
      }
    } catch (_) {}
    
    if (mounted) {
      setState(() {
        _driverName = name;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = ref.watch(themeProvider) == ThemeMode.dark;
    final userEmail = Supabase.instance.client.auth.currentUser?.email ?? '';

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF111111) : const Color(0xFFF8F9FA),
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.go('/dashboard'),
        ),
        title: const Text('Mi Perfil', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
        children: [
          // ── PERFIL HEADER ──
          Center(
            child: Column(
              children: [
                Container(
                  width: 100,
                  height: 100,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade200,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.person, size: 50, color: Colors.grey), // Fallback
                ),
                const SizedBox(height: 16),
                Text(
                  _isLoading ? 'Cargando...' : _driverName,
                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
                ),
                if (_driverPhone.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(_driverPhone, style: const TextStyle(fontSize: 16, color: Colors.grey)),
                ],
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: _showEditProfileDialog,
                  icon: const Icon(Icons.edit_rounded, size: 18),
                  label: const Text('Editar Perfil'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: isDark ? Colors.white : Colors.black,
                    side: BorderSide(color: isDark ? Colors.white24 : Colors.black12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 40),

          // ── AJUSTES ──
          const Text(
            'AJUSTES DE APLICACIÓN',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey, letterSpacing: 1.2),
          ),
          const SizedBox(height: 12),
          Container(
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 10, offset: const Offset(0, 5))
              ],
            ),
            child: Column(
              children: [
                Material(
                  color: Colors.transparent,
                  child: ListTile(
                    leading: Icon(isDark ? Icons.light_mode_rounded : Icons.dark_mode_rounded, color: const Color(0xFFFFD000)),
                    title: const Text('Modo Oscuro', style: TextStyle(fontWeight: FontWeight.w600)),
                    trailing: Switch(
                      value: isDark,
                      activeColor: const Color(0xFFFFD000),
                      onChanged: (_) => ref.read(themeProvider.notifier).cycleTheme(),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 40),

          Container(
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 10, offset: const Offset(0, 5))
              ],
            ),
            child: Material(
              color: Colors.transparent,
              child: ListTile(
                onTap: () async {
                  final confirm = await PremiumBottomSheet.showConfirm(
                    context,
                    title: 'Cerrar Sesión',
                    content: '¿Estás seguro de que deseas salir de tu cuenta?',
                    isDestructive: true,
                    confirmText: 'CERRAR SESIÓN',
                    cancelText: 'CANCELAR',
                  );
                  if (confirm == true) {
                    await Supabase.instance.client.auth.signOut();
                    if (context.mounted) context.go('/login');
                  }
                },
                leading: const Icon(Icons.logout_rounded, color: Colors.redAccent),
                title: const Text('Cerrar Sesión', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w600)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showEditProfileDialog() {
    final nameCtrl = TextEditingController(text: _driverName == 'Repartidor' ? '' : _driverName);
    final phoneCtrl = TextEditingController(text: _driverPhone);
    bool isSaving = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) {
          final isDark = Theme.of(context).brightness == Brightness.dark;
          
          return Container(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
              left: 24, right: 24, top: 24,
            ),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40, height: 4,
                    decoration: BoxDecoration(color: Colors.grey.withOpacity(0.3), borderRadius: BorderRadius.circular(10)),
                  ),
                ),
                const SizedBox(height: 24),
                const Text('Editar Perfil', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                const SizedBox(height: 24),
                
                TextField(
                  controller: nameCtrl,
                  decoration: InputDecoration(
                    labelText: 'Nombre Completo',
                    prefixIcon: const Icon(Icons.person_outline),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  textCapitalization: TextCapitalization.words,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: phoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: InputDecoration(
                    labelText: 'Teléfono',
                    prefixIcon: const Icon(Icons.phone_outlined),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
                const SizedBox(height: 32),
                
                ElevatedButton(
                  onPressed: isSaving ? null : () async {
                    if (nameCtrl.text.trim().isEmpty) {
                      PremiumToast.show(ctx, title: 'Error', description: 'El nombre no puede estar vacío', isError: true);
                      return;
                    }
                    
                    setModalState(() => isSaving = true);
                    
                    try {
                      final userId = Supabase.instance.client.auth.currentUser!.id;
                      
                      // 1. Guardar en Base de Datos
                      await Supabase.instance.client
                          .from('repartidores')
                          .update({
                            'nombre': nameCtrl.text.trim(),
                            'telefono': phoneCtrl.text.trim(),
                          })
                          .eq('user_id', userId);
                          
                      // 2. Guardar en Auth Metadata
                      await Supabase.instance.client.auth.updateUser(
                        UserAttributes(
                          data: {'nombre': nameCtrl.text.trim()},
                        ),
                      );
                      
                      setState(() {
                        _driverName = nameCtrl.text.trim();
                        _driverPhone = phoneCtrl.text.trim();
                      });
                      
                      if (ctx.mounted) Navigator.pop(ctx);
                      if (mounted) PremiumToast.show(context, title: 'Perfil actualizado', isError: false);
                      
                    } catch (e) {
                      setModalState(() => isSaving = false);
                      if (ctx.mounted) PremiumToast.show(ctx, title: 'Error al guardar', description: e.toString(), isError: true);
                    }
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFFFD000),
                    foregroundColor: Colors.black,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                  child: isSaving 
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                    : const Text('Guardar Cambios', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                ),
              ],
            ),
          );
        }
      ),
    );
  }
}

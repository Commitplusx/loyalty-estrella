import 'dart:io';
import 'package:animate_do/animate_do.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../services/repartidor_service.dart';
import '../services/gasto_service.dart'; // Necesitamos esto para los nombres de las motos
import '../core/supabase_config.dart';
import '../core/user_role.dart';

final myRepartidorIdProvider = FutureProvider.autoDispose<String?>((ref) async {
  final user = supabase.auth.currentUser;
  if (user == null) return null;
  return ref.read(repartidorServiceProvider).getRepartidorIdByUserId(user.id);
});

final repartidoresProvider = FutureProvider.autoDispose((ref) {
  return ref.read(repartidorServiceProvider).getRepartidores();
});

final serviciosHoyProvider = FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String?>((ref, repId) {
  return ref.read(repartidorServiceProvider).getServicios(repartidorId: repId, fecha: DateTime.now());
});

final cuadreProvider = FutureProvider.autoDispose((ref) async {
  final isAdmin = ref.read(isAdminProvider);
  if (isAdmin) {
    return ref.read(repartidorServiceProvider).getCuadre();
  }
  // Repartidor: solo su propio cuadre
  final user = supabase.auth.currentUser;
  if (user == null) return <Map<String, dynamic>>[];
  final myRepId = await ref.read(repartidorServiceProvider).getRepartidorIdByUserId(user.id);
  if (myRepId == null) return <Map<String, dynamic>>[];
  return ref.read(repartidorServiceProvider).getCuadrePorRepartidor(myRepId);
});

final metaEnviosProvider = FutureProvider.autoDispose((ref) {
  return ref.read(repartidorServiceProvider).getMetaEnvios();
});

final leaderboardProvider = FutureProvider.autoDispose((ref) {
  return ref.read(repartidorServiceProvider).getLeaderboard();
});

final repartidorHistorialProvider = FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, id) {
  return ref.read(repartidorServiceProvider).getHistorialServicios(id);
});

class RepartidoresScreen extends ConsumerStatefulWidget {
  const RepartidoresScreen({super.key});
  @override
  ConsumerState<RepartidoresScreen> createState() => _RepartidoresScreenState();
}

class _RepartidoresScreenState extends ConsumerState<RepartidoresScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  String? _selectedRepId;
  String? _selectedRepNombre;
  File? _tempFile;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = ref.watch(isAdminProvider);
    final myRepIdAsync = ref.watch(myRepartidorIdProvider);
    
    final colorScheme = Theme.of(context).colorScheme;
    final onSurface = colorScheme.onSurface;

    if (!isAdmin) {
      return myRepIdAsync.when(
        loading: () => const Scaffold(body: Center(child: CircularProgressIndicator(color: Color(0xFFFF6B35)))),
        error: (e, _) => Scaffold(body: Center(child: Text('Error al cargar perfil: $e'))),
        data: (myId) {
          if (myId == null) {
            return Scaffold(
              appBar: AppBar(title: const Text('Mis Servicios')),
              body: Center(child: Padding(
                padding: const EdgeInsets.all(32.0),
                child: Text('No tienes un perfil de repartidor asociado. Contacta al Administrador.', textAlign: TextAlign.center, style: TextStyle(color: onSurface.withValues(alpha: 0.5))),
              )),
            );
          }
          return Scaffold(
            appBar: AppBar(
              title: const Text('Mis Servicios'),
              actions: [
                IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: () {
                  ref.invalidate(serviciosHoyProvider(myId));
                  ref.invalidate(metaEnviosProvider);
                }),
              ],
            ),
            floatingActionButton: FloatingActionButton.extended(
              heroTag: 'add_srv_me',
              backgroundColor: const Color(0xFF11998E),
              onPressed: () => _agregarServicioPropio(context, myId),
              icon: const Icon(Icons.add_task_rounded, color: Colors.white),
              label: const Text('Anotar Entrega', style: TextStyle(color: Colors.white)),
            ),
            body: Column(
              children: [
                Consumer(builder: (context, ref, _) {
                  final metaAsync = ref.watch(metaEnviosProvider);
                  final colorScheme = Theme.of(context).colorScheme;
                  final onSurfaceCol = colorScheme.onSurface;
                  final cardCol = Theme.of(context).cardColor;
                  
                  return metaAsync.when(
                    data: (metas) {
                      final m = metas.firstWhere((e) => e['repartidor_id'] == myId, orElse: () => {});
                      final int meta = m['meta_envios'] ?? 0;
                      final int hoy = m['envios_hoy'] ?? 0;
                      if (meta <= 0) return const SizedBox();
                      return Container(
                        margin: const EdgeInsets.all(16),
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: cardCol,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [BoxShadow(color: onSurfaceCol.withValues(alpha: 0.05), blurRadius: 10)],
                        ),
                        child: Column(
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text('Tu Meta de Hoy', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                                    Text('Completa tus envíos y gana más estrellas', style: TextStyle(fontSize: 12, color: onSurfaceCol.withValues(alpha: 0.5))),
                                  ],
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text('$hoy / $meta', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20, color: Color(0xFFFF6B35))),
                                    const Text('ENVIOS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                                  ],
                                ),
                              ],
                            ),
                            const SizedBox(height: 16),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: LinearProgressIndicator(
                                value: (hoy / meta).clamp(0.0, 1.0),
                                backgroundColor: onSurfaceCol.withValues(alpha: 0.05),
                                color: hoy >= meta ? Colors.green : const Color(0xFFFF6B35),
                                minHeight: 12,
                              ),
                            ),
                            if (hoy >= meta) ...[
                              const SizedBox(height: 12),
                              const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.emoji_events_rounded, color: Colors.amber, size: 18),
                                  SizedBox(width: 8),
                                  Text('¡Meta cumplida! Felicidades', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.green, fontSize: 13)),
                                ],
                              ),
                            ],
                          ],
                        ),
                      );
                    },
                    loading: () => const SizedBox(),
                    error: (_, __) => const SizedBox(),
                  );
                }),
                Expanded(child: _ServiciosTab(repartidorId: myId, repartidorNombre: 'Mis Entregas')),
              ],
            ),
          );
        },
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Logística / Gestión'),
        actions: [
          IconButton(
            icon: const Icon(Icons.map_rounded),
            onPressed: () => context.push('/map'),
          ),
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () {
              ref.invalidate(repartidoresProvider);
              ref.invalidate(serviciosHoyProvider(_selectedRepId));
              ref.invalidate(cuadreProvider);
              ref.invalidate(metaEnviosProvider);
            },
          )
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(60),
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: onSurface.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(16),
            ),
            child: TabBar(
              controller: _tabs,
              indicatorSize: TabBarIndicatorSize.tab,
              dividerColor: Colors.transparent,
              indicator: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                color: const Color(0xFFFF6B35),
                boxShadow: [
                  BoxShadow(color: const Color(0xFFFF6B35).withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 4))
                ],
              ),
              labelColor: Colors.white,
              unselectedLabelColor: onSurface.withValues(alpha: 0.6),
              labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
              unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
              tabs: const [
                Tab(child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.people_rounded, size: 16), SizedBox(width: 6), Text('Equipo')])),
                Tab(child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.receipt_long_rounded, size: 16), SizedBox(width: 6), Text('Actividad')])),
                Tab(child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.account_balance_wallet_rounded, size: 16), SizedBox(width: 6), Text('Corte')])),
              ],
            ),
          ),
        ),
      ),
      floatingActionButton: _buildFAB(context),
      body: TabBarView(
        controller: _tabs,
        children: [
          _RepartidoresTab(onSelect: (id, nombre) {
            setState(() { _selectedRepId = id; _selectedRepNombre = nombre; });
            _tabs.animateTo(1);
          }),
          _ServiciosTab(repartidorId: _selectedRepId, repartidorNombre: _selectedRepNombre),
          const _CuadreTab(),
        ],
      ),
    );
  }

  Widget _buildFAB(BuildContext context) {
    return AnimatedBuilder(
      animation: _tabs,
      builder: (context, _) {
        if (_tabs.index == 0) {
          return FloatingActionButton.extended(
            heroTag: 'add_rep',
            backgroundColor: const Color(0xFFFF6B35),
            elevation: 8,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            onPressed: () => _agregarRepartidor(context),
            icon: const Icon(Icons.person_add_rounded, color: Colors.white),
            label: const Text('Nuevo Repartidor', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          );
        }
        return const SizedBox();
      },
    );
  }

  // ── Modal para establecer la meta diaria ──────────────────────────────
  Future<void> _setMetaDialog(BuildContext context, String repId, String nombre, int metaActual) async {
    final ctrl = TextEditingController(text: metaActual > 0 ? metaActual.toString() : '');
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('Meta de envíos — $nombre'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('¿Cuántos envíos debe completar hoy?',
                style: TextStyle(color: Theme.of(ctx).colorScheme.onSurface.withValues(alpha: 0.6), fontSize: 13)),
            const SizedBox(height: 16),
            TextField(
              controller: ctrl,
              keyboardType: TextInputType.number,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Meta (número de envíos)',
                prefixIcon: Icon(Icons.flag_rounded),
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFFF6B35)),
            onPressed: () async {
              final meta = int.tryParse(ctrl.text.trim()) ?? 0;
              await ref.read(repartidorServiceProvider).setMetaEnvios(repId, meta);
              if (ctx.mounted) Navigator.pop(ctx);
              ref.invalidate(metaEnviosProvider);
            },
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }

  Future<void> _agregarRepartidor(BuildContext context) async {
    final nombreCtrl = TextEditingController();
    final telCtrl = TextEditingController();
    final aliasCtrl = TextEditingController();

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(24, 24, 24, MediaQuery.of(ctx).viewInsets.bottom + 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Nuevo Repartidor', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 20),
            TextField(controller: nombreCtrl, decoration: const InputDecoration(labelText: 'Nombre completo *')),
            const SizedBox(height: 12),
            TextField(controller: telCtrl, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Teléfono')),
            const SizedBox(height: 12),
            TextField(controller: aliasCtrl, decoration: const InputDecoration(labelText: 'Alias / Apodo')),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFFF6B35), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14)),
                icon: const Icon(Icons.save_rounded),
                label: const Text('Guardar Repartidor'),
                onPressed: () async {
                  if (nombreCtrl.text.trim().isEmpty) return;
                  final cleanTel = telCtrl.text.replaceAll(RegExp(r'\D'), '');
                  final errorMsg = await ref.read(repartidorServiceProvider).addRepartidor(
                    nombreCtrl.text.trim(), cleanTel.isEmpty ? null : cleanTel, aliasCtrl.text.trim().isEmpty ? null : aliasCtrl.text.trim(),
                  );
                  if (errorMsg == null && ctx.mounted) {
                    Navigator.pop(ctx);
                    ref.invalidate(repartidoresProvider);
                  } else if (ctx.mounted) {
                    ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text('Error: $errorMsg')));
                  }
                },
              ),
            ),
          ],
        ),
      ),
    );
  }



  Future<void> _agregarServicioPropio(BuildContext context, String myId) async {
    final descCtrl = TextEditingController();
    final montoCtrl = TextEditingController();
    final notasCtrl = TextEditingController();

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Consumer(
        builder: (context, ref, _) {
          final restsAsync = ref.watch(restaurantesProvider);
          return StatefulBuilder(
            builder: (ctx, setState) {
              String? selectedRestId;
              bool isRestaurante = false;

              return Padding(
                padding: EdgeInsets.fromLTRB(24, 24, 24, MediaQuery.of(ctx).viewInsets.bottom + 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Anotar Mi Entrega', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Theme.of(context).colorScheme.onSurface)),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('¿Es un Restaurante asociado?', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7))),
                        Switch(
                          value: isRestaurante,
                          activeColor: const Color(0xFF11998E),
                          onChanged: (val) => setState(() { isRestaurante = val; selectedRestId = null; }),
                        ),
                      ],
                    ),
                    if (isRestaurante) ...[
                      restsAsync.when(
                        data: (rests) => DropdownButtonFormField<String>(
                          value: selectedRestId,
                          hint: const Text('Selecciona Restaurante'),
                          items: rests.map((r) => DropdownMenuItem(value: r['id'].toString(), child: Text(r['nombre']))).toList(),
                          onChanged: (val) => setState(() => selectedRestId = val),
                        ),
                        loading: () => const CircularProgressIndicator(),
                        error: (_, __) => const Text('Error al cargar restaurantes'),
                      ),
                    ] else ...[
                      TextField(controller: descCtrl, decoration: const InputDecoration(labelText: 'Descripción a dónde fuiste')),
                    ],
                    const SizedBox(height: 12),
                    TextField(controller: montoCtrl, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Monto cobrado (\x24)')),
                    const SizedBox(height: 12),
                    TextField(controller: notasCtrl, decoration: const InputDecoration(labelText: 'Notas (Opcional)')),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF11998E), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14)),
                        icon: const Icon(Icons.add_task_rounded),
                        label: const Text('Registrar'),
                        onPressed: () async {
                          final monto = double.tryParse(montoCtrl.text);
                          if (monto == null) return;
                          
                          String finalDesc = '';
                          if (isRestaurante) {
                            if (selectedRestId == null) return;
                            final restNombre = restsAsync.value?.firstWhere((r) => r['id'] == selectedRestId)['nombre'] ?? 'Restaurante';
                            finalDesc = restNombre;
                          } else {
                            if (descCtrl.text.isEmpty) return;
                            finalDesc = descCtrl.text.trim();
                          }

                          final ok = await ref.read(repartidorServiceProvider).addServicio(
                            repartidorId: myId, 
                            descripcion: finalDesc, 
                            monto: monto, 
                            restauranteId: selectedRestId, // New field
                            tipoServicio: isRestaurante ? 'restaurante' : 'cliente', // New field
                            notas: notasCtrl.text.isEmpty ? null : notasCtrl.text,
                            estado: 'completado',
                            esAdmin: false,
                          );
                          if (ok && ctx.mounted) {
                            Navigator.pop(ctx);
                            ref.invalidate(serviciosHoyProvider(myId));
                            ref.invalidate(cuadreProvider);
                            ref.invalidate(metaEnviosProvider);
                          } else if (ctx.mounted) {
                            ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content: Text('Error al enviar el servicio al servidor.'), backgroundColor: Color(0xFFE11D48)));
                          }
                        },
                      ),
                    ),
                  ],
                ),
              );
            }
          );
        }
      ),
    );
    descCtrl.dispose();
    montoCtrl.dispose();
    notasCtrl.dispose();
  }
}

// ── Pestaña 1: Lista de Repartidores ─────────────────────────────────────────
class _RepartidoresTab extends ConsumerWidget {
  final void Function(String id, String nombre) onSelect;
  const _RepartidoresTab({required this.onSelect});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repsAsync = ref.watch(repartidoresProvider);
    final metaAsync = ref.watch(metaEnviosProvider);
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final cardColor = Theme.of(context).cardColor;
    final isAdmin = ref.watch(isAdminProvider);

    return repsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFFFF6B35))),
      error: (e, _) => Center(child: Text('Error: $e')),
      data: (reps) {
        // Ordenamos para que 'ADMIN' salga primero
        final sortedReps = [...reps];
        sortedReps.sort((a, b) {
          if ((a['alias'] ?? '').toString().toUpperCase() == 'ADMIN') return -1;
          if ((b['alias'] ?? '').toString().toUpperCase() == 'ADMIN') return 1;
          return (a['nombre'] ?? '').toString().compareTo(b['nombre'] ?? '');
        });

        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
          itemCount: sortedReps.length,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (ctx, i) {
            final r = sortedReps[i];
            final isAdminProfile = (r['alias'] ?? '').toString().toUpperCase() == 'ADMIN';
            return FadeInLeft(
              delay: Duration(milliseconds: i * 60),
              child: Material(
                color: cardColor,
                borderRadius: BorderRadius.circular(16),
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                onTap: () {
                    if (isAdmin) {
                      context.push('/repartidores/${r['id']}?nombre=${Uri.encodeComponent(r['alias'] ?? r['nombre'])}');
                    } else {
                      onSelect(r['id'].toString(), r['alias'] ?? r['nombre']);
                    }
                  },

                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            CircleAvatar(
                              backgroundColor: (isAdminProfile ? Colors.blueGrey : const Color(0xFFFF6B35)).withValues(alpha: 0.2),
                              radius: 28,
                              child: isAdminProfile 
                                ? const Icon(Icons.business_center_rounded, color: Colors.blueGrey, size: 28)
                                : Text(
                                    (r['alias'] ?? r['nombre'] ?? '?').substring(0, 1).toUpperCase(),
                                    style: const TextStyle(color: Color(0xFFFF6B35), fontWeight: FontWeight.bold, fontSize: 22),
                                  ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    isAdminProfile ? 'Servicios de la Empresa (Administración)' : (r['nombre'] ?? ''), 
                                    style: TextStyle(color: onSurface, fontWeight: FontWeight.bold, fontSize: 16)
                                  ),
                                  if (r['alias'] != null && !isAdminProfile) Text(r['alias'], style: TextStyle(color: onSurface.withValues(alpha: 0.5), fontSize: 13)),
                                  if (isAdminProfile) Text('Toca aquí para ver tus propios servicios', style: TextStyle(color: const Color(0xFF11998E), fontSize: 12, fontWeight: FontWeight.bold)),
                                  if (r['telefono'] != null && !isAdminProfile) Text(r['telefono'], style: TextStyle(color: onSurface.withValues(alpha: 0.5), fontSize: 13)),
                                ],
                              ),
                            ),
                            if (isAdmin && !isAdminProfile)
                              IconButton(
                                icon: const Icon(Icons.outlined_flag_rounded, color: Color(0xFFFF6B35)),
                                tooltip: 'Establecer Meta',
                                onPressed: () {
                                  // Buscamos la meta actual si existe
                                  int metaActual = 0;
                                  metaAsync.whenData((metas) {
                                    final m = metas.firstWhere((element) => element['repartidor_id'].toString() == r['id'].toString(), orElse: () => {});
                                    metaActual = m['meta_envios'] ?? 0;
                                  });
                                  final state = context.findAncestorStateOfType<_RepartidoresScreenState>();
                                  state?._setMetaDialog(context, r['id'].toString(), r['alias'] ?? r['nombre'], metaActual);
                                },
                              )
                            else
                              Icon(Icons.chevron_right_rounded, color: onSurface.withValues(alpha: 0.3)),
                          ],
                        ),
                        // ── Barra de Progreso de Meta ──
                        metaAsync.when(
                          loading: () => const SizedBox(),
                          error: (_, __) => const SizedBox(),
                          data: (metas) {
                            final m = metas.firstWhere((element) => element['repartidor_id'].toString() == r['id'].toString(), orElse: () => {});
                            final int meta = m['meta_envios'] ?? 0;
                            final int hoy = m['envios_hoy'] ?? 0;
                            
                            if (meta <= 0 && !isAdmin) return const SizedBox();

                            return Column(
                              children: [
                                const SizedBox(height: 12),
                                Divider(height: 1, color: onSurface.withValues(alpha: 0.05)),
                                const SizedBox(height: 12),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Row(
                                      children: [
                                        Icon(
                                          hoy >= meta && meta > 0 ? Icons.emoji_events_rounded : Icons.track_changes_rounded,
                                          size: 16,
                                          color: hoy >= meta && meta > 0 ? Colors.amber : const Color(0xFFFF6B35),
                                        ),
                                        const SizedBox(width: 6),
                                        Text(
                                          meta > 0 ? 'Meta diaria' : 'Sin meta asignada',
                                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: onSurface.withValues(alpha: 0.7)),
                                        ),
                                      ],
                                    ),
                                    Text(
                                      meta > 0 ? '$hoy / $meta envíos' : '$hoy envíos hoy',
                                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: onSurface),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(10),
                                  child: LinearProgressIndicator(
                                    value: meta > 0 ? (hoy / meta).clamp(0.0, 1.0) : 0,
                                    backgroundColor: onSurface.withValues(alpha: 0.05),
                                    color: isAdminProfile ? Colors.blueGrey : (hoy >= meta && meta > 0 ? Colors.green : const Color(0xFFFF6B35)),
                                    minHeight: 8,
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }
}

// ── Pestaña 2: Servicios de hoy ──────────────────────────────────────────────
class _ServiciosTab extends ConsumerWidget {
  final String? repartidorId;
  final String? repartidorNombre;
  const _ServiciosTab({this.repartidorId, this.repartidorNombre});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final svcAsync = ref.watch(serviciosHoyProvider(repartidorId));
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final cardColor = Theme.of(context).cardColor;

    if (repartidorId == null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.touch_app_rounded, size: 64, color: onSurface.withValues(alpha: 0.3)),
            const SizedBox(height: 16),
            Text('Selecciona un repartidor\ndesde la pestaña anterior', textAlign: TextAlign.center, style: TextStyle(color: onSurface.withValues(alpha: 0.5))),
          ],
        ),
      );
    }

    return svcAsync.when(
      loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFFFF6B35))),
      error: (e, _) => Center(child: Text('Error: $e')),
      data: (servicios) {
        final completado = servicios.where((s) => s['estado'] == 'completado').fold<double>(0, (a, b) => a + ((b['monto'] as num?)?.toDouble() ?? 0));
        final pendiente = servicios.where((s) => s['estado'] == 'pendiente').fold<double>(0, (a, b) => a + ((b['monto'] as num?)?.toDouble() ?? 0));

        return Column(
          children: [
            Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFF11998E), Color(0xFF38EF7D)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [BoxShadow(color: const Color(0xFF11998E).withValues(alpha: 0.3), blurRadius: 20, offset: const Offset(0, 8))],
              ),
              child: Row(
                children: [
                  const Icon(Icons.delivery_dining_rounded, color: Colors.white, size: 40),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(repartidorNombre ?? 'Repartidor', style: const TextStyle(color: Colors.white70, fontSize: 13)),
                        Text('\$${completado.toStringAsFixed(2)} cobrado', style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                        if (pendiente > 0)
                          Text('+\$${pendiente.toStringAsFixed(2)} en ruta (por cobrar)', style: const TextStyle(color: Colors.yellowAccent, fontSize: 12, fontWeight: FontWeight.bold)),
                        Text('${servicios.length} servicios (${servicios.where((s) => s['estado'] == 'completado').length} completos)', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: servicios.isEmpty
                  ? Center(child: Text('Sin servicios hoy', style: TextStyle(color: onSurface.withValues(alpha: 0.5))))
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                      itemCount: servicios.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (ctx, i) {
                        final s = servicios[i];
                        final isCompleto = s['estado'] == 'completado';
                        final isPendiente = s['estado'] == 'pendiente';
                        return FadeInUp(
                          delay: Duration(milliseconds: i * 50),
                          child: Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: cardColor,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: isPendiente ? const Color(0xFFF59E0B).withValues(alpha: 0.5) : Colors.transparent),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 44, height: 44,
                                  decoration: BoxDecoration(
                                    color: (isCompleto ? const Color(0xFF11998E) : isPendiente ? const Color(0xFFF59E0B) : Colors.grey).withValues(alpha: 0.2),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Icon(
                                    isCompleto ? Icons.check_circle_rounded : isPendiente ? Icons.hourglass_top_rounded : Icons.cancel_rounded,
                                    color: isCompleto ? const Color(0xFF11998E) : isPendiente ? const Color(0xFFF59E0B) : Colors.grey,
                                    size: 22,
                                  ),
                                ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(s['descripcion'] ?? '', style: TextStyle(color: onSurface, fontWeight: FontWeight.w600, fontSize: 14)),
                                      if (s['notas'] != null && (s['notas'] as String).isNotEmpty)
                                        Text(s['notas'], style: TextStyle(color: onSurface.withValues(alpha: 0.5), fontSize: 12)),
                                    ],
                                  ),
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text('\$${s['monto']}', style: TextStyle(color: isCompleto ? const Color(0xFF11998E) : onSurface, fontWeight: FontWeight.bold, fontSize: 16)),
                                    if (isPendiente)
                                      GestureDetector(
                                        onTap: () async {
                                          await ref.read(repartidorServiceProvider).updateEstadoServicio(s['id'], 'completado');
                                          ref.invalidate(serviciosHoyProvider(repartidorId));
                                          ref.invalidate(cuadreProvider);
                                          ref.invalidate(metaEnviosProvider);
                                        },
                                        child: const Text('✓ Completar', style: TextStyle(color: Color(0xFF11998E), fontSize: 11, fontWeight: FontWeight.bold)),
                                      ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        );
      },
    );
  }
}

// ── Pestaña 3: Cuadre del día ────────────────────────────────────────────────
class _CuadreTab extends ConsumerWidget {
  const _CuadreTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cuadreAsync = ref.watch(cuadreProvider);
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final cardColor = Theme.of(context).cardColor;

    return cuadreAsync.when(
      loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFFFF6B35))),
      error: (e, _) => Center(child: Text('Error: $e')),
      data: (rows) {
        if (rows.isEmpty) return Center(child: Text('Sin datos para hoy', style: TextStyle(color: onSurface.withValues(alpha: 0.5))));

        final grandTotal = rows.fold<double>(0, (a, r) => a + ((r['total_admin'] as num?)?.toDouble() ?? 0));

        return Column(
          children: [
            Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFFFF6B35), Color(0xFFFF8C42)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFFFF6B35).withOpacity(0.25),
                    blurRadius: 20,
                    offset: const Offset(0, 10),
                  )
                ],
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.account_balance_wallet_rounded, color: Colors.white, size: 32),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('SALDO TOTAL POR COBRAR', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.5)),
                        const SizedBox(height: 4),
                        Text('\$${grandTotal.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900, letterSpacing: -1)),
                        const SizedBox(height: 4),
                        Text('${rows.length} repartidores en turno', style: const TextStyle(color: Colors.white70, fontSize: 13)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Row(
                children: [
                  Text('DESGLOSE POR REPARTIDOR', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1, color: onSurface.withOpacity(0.4))),
                ],
              ),
            ),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                itemCount: rows.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (ctx, i) {
                  final r = rows[i];
                  final totalAdmin = (r['total_admin'] as num?)?.toDouble() ?? 0;
                  final totalRep = (r['total_repartidor'] as num?)?.toDouble() ?? 0;
                  final totalGastos = (r['total_gastos'] as num?)?.toDouble() ?? 0;
                  final diff = (r['diferencia'] as num?)?.toDouble() ?? 0;
                  
                  final hasDiscrepancy = diff.abs() > 0.01;

                  return FadeInUp(
                    delay: Duration(milliseconds: i * 40),
                    child: Container(
                      decoration: BoxDecoration(
                        color: cardColor, 
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.02), blurRadius: 10, offset: const Offset(0, 4))],
                      ),
                      child: Column(
                        children: [
                          Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              children: [
                                CircleAvatar(
                                  radius: 18,
                                  backgroundColor: (hasDiscrepancy ? Colors.redAccent : const Color(0xFF11998E)).withOpacity(0.1),
                                  child: Icon(
                                    hasDiscrepancy ? Icons.warning_amber_rounded : Icons.person_rounded, 
                                    color: hasDiscrepancy ? Colors.redAccent : const Color(0xFF11998E), 
                                    size: 20,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    r['alias'] ?? r['repartidor'] ?? 'Sin nombre', 
                                    style: TextStyle(color: onSurface, fontWeight: FontWeight.bold, fontSize: 16),
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                  decoration: BoxDecoration(
                                    color: (hasDiscrepancy ? Colors.redAccent : const Color(0xFF11998E)).withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Text(
                                    '\$${diff.toStringAsFixed(2)}',
                                    style: TextStyle(
                                      color: hasDiscrepancy ? Colors.redAccent : const Color(0xFF11998E),
                                      fontWeight: FontWeight.w900,
                                      fontSize: 14,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Divider(height: 1),
                          Padding(
                            padding: const EdgeInsets.all(16),
                            child: IntrinsicHeight(
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceAround,
                                children: [
                                  _AmountCol(label: 'COBROS', amount: totalAdmin, color: onSurface, icon: Icons.arrow_upward_rounded),
                                  const VerticalDivider(width: 1),
                                  _AmountCol(label: 'GASTOS', amount: totalGastos, color: Colors.orangeAccent, icon: Icons.receipt_long_rounded),
                                  const VerticalDivider(width: 1),
                                  _AmountCol(label: 'REPART.', amount: totalRep, color: onSurface.withOpacity(0.5), icon: Icons.person_search_rounded),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}

class _AmountCol extends StatelessWidget {
  final String label;
  final double amount;
  final Color color;
  final IconData icon;
  
  const _AmountCol({
    required this.label, 
    required this.amount, 
    required this.color, 
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 10, color: Theme.of(context).colorScheme.onSurface.withOpacity(0.3)),
            const SizedBox(width: 4),
            Text(label, style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withOpacity(0.4), fontSize: 9, fontWeight: FontWeight.w800)),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          '\$${amount.toStringAsFixed(2)}', 
          style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 13)
        ),
      ],
    );
  }
}

class _ImageSelector extends StatefulWidget {
  final Function(File?) onImage;
  const _ImageSelector({required this.onImage});

  @override
  State<_ImageSelector> createState() => _ImageSelectorState();
}

class _ImageSelectorState extends State<_ImageSelector> {
  File? _image;

  Future<void> _pick(ImageSource source) async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: source, imageQuality: 70);
    if (picked != null) {
      final file = File(picked.path);
      setState(() => _image = file);
      widget.onImage(file);
    }
  }

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Column(
      children: [
        if (_image != null) 
          Stack(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.file(_image!, height: 120, width: double.infinity, fit: BoxFit.cover),
              ),
              Positioned(
                right: 8, top: 8,
                child: InkWell(
                  onTap: () { setState(() => _image = null); widget.onImage(null); },
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                    child: const Icon(Icons.close_rounded, color: Colors.white, size: 16),
                  ),
                ),
              )
            ],
          )
        else
          Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: () => _pick(ImageSource.camera),
                  child: Container(
                    height: 50,
                    decoration: BoxDecoration(border: Border.all(color: onSurface.withValues(alpha: 0.1)), borderRadius: BorderRadius.circular(12)),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                         Icon(Icons.camera_alt_rounded, color: onSurface.withValues(alpha: 0.5), size: 20),
                         const SizedBox(width: 8),
                         Text('Cámara', style: TextStyle(color: onSurface.withValues(alpha: 0.5), fontSize: 13)),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: InkWell(
                  onTap: () => _pick(ImageSource.gallery),
                  child: Container(
                    height: 50,
                    decoration: BoxDecoration(border: Border.all(color: onSurface.withValues(alpha: 0.1)), borderRadius: BorderRadius.circular(12)),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                         Icon(Icons.image_rounded, color: onSurface.withValues(alpha: 0.5), size: 20),
                         const SizedBox(width: 8),
                         Text('Galería', style: TextStyle(color: onSurface.withValues(alpha: 0.5), fontSize: 13)),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
      ],
    );
  }
}


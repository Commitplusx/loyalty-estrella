import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/supabase_config.dart';
import '../core/theme_provider.dart';
import '../core/ui_helpers.dart';
import '../services/repartidor_service.dart';
import '../services/gasto_service.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/foundation.dart';

final promosProvider = FutureProvider.autoDispose((ref) async {
  final data = await supabase
      .from('promociones_dinamicas')
      .select()
      .order('created_at', ascending: false);
  return List<Map<String, dynamic>>.from(data);
});

final anunciosProvider = FutureProvider.autoDispose((ref) async {
  final data = await supabase
      .from('anuncios_flash')
      .select()
      .order('created_at', ascending: false);
  return List<Map<String, dynamic>>.from(data);
});

// ─────────────────────────────────────────────────────────────────────────────
//  PANEL PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
class ConfigScreen extends ConsumerWidget {
  const ConfigScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDark = ref.watch(themeProvider) == ThemeMode.dark;
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
        title: const Text('Herramientas'),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        children: [
          // ── APARIENCIA ──────────────────────────────────────────────────
          _SectionHeader(label: 'Apariencia'),
          _ToolTile(
            icon: isDark ? Icons.light_mode_rounded : Icons.dark_mode_rounded,
            iconColor: const Color(0xFF8B5CF6),
            title: isDark ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro',
            subtitle: isDark ? 'Tema actual: Oscuro (AMOLED)' : 'Tema actual: Claro',
            trailing: Switch(
              value: isDark,
              activeColor: const Color(0xFF8B5CF6),
              onChanged: (_) => ref.read(themeProvider.notifier).cycleTheme(),
            ),
            onTap: () => ref.read(themeProvider.notifier).cycleTheme(),
          ),

          const SizedBox(height: 20),

          // ── FLOTA (REPARTIDORES) ───────────────────────────────────────────
          _SectionHeader(label: 'Flota (Personal)'),
          _ToolTile(
            icon: Icons.people_rounded,
            iconColor: const Color(0xFFF59E0B),
            title: 'Gestionar Repartidores',
            subtitle: 'Directorio, añadir y desactivar personal',
            onTap: () => _mostrarRepartidores(context, ref),
          ),
          const SizedBox(height: 8),
          _ToolTile(
            icon: Icons.calendar_month_rounded,
            iconColor: const Color(0xFF60A5FA),
            title: 'Historial por Fecha',
            subtitle: 'Revisa gastos o entregas de un día específico',
            onTap: () => _abrirCalendario(context, ref),
          ),

          const SizedBox(height: 20),

          // ── LOCALES ──────────────────────────────────────────────────────
          _SectionHeader(label: 'Restaurantes Asociados'),
          _ToolTile(
            icon: Icons.storefront_rounded,
            iconColor: const Color(0xFF10B981),
            title: 'Gestionar Locales',
            subtitle: 'Agrega o revisa los restaurantes de tu red',
            onTap: () => _mostrarLocales(context, ref),
          ),
          const SizedBox(height: 8),
          _ToolTile(
            icon: Icons.map_rounded,
            iconColor: const Color(0xFF6366F1),
            title: 'Zonas de Entrega',
            subtitle: 'Editar precios, colonias y zonas del bot',
            onTap: () => context.push('/config/zonas-entrega'),
          ),
          const SizedBox(height: 8),
          _ToolTile(
            icon: Icons.explore_rounded,
            iconColor: const Color(0xFF10B981),
            title: '🗺️ Centro de Comando',
            subtitle: 'Mapa interactivo — toca una colonia para asignar zona',
            onTap: () => context.push('/config/mapa-zonas'),
          ),
          const SizedBox(height: 8),
          _ToolTile(
            icon: Icons.warning_amber_rounded,
            iconColor: Colors.orange,
            title: 'Excepciones de Precio',
            subtitle: 'Colonias con precio fijo o Dificultad Alta ⚠️',
            onTap: () => context.push('/config/excepciones'),
          ),

          const SizedBox(height: 20),

          // ── SESIÓN ───────────────────────────────────────────────────────
          _SectionHeader(label: 'Sesión'),
          _ToolTile(
            icon: Icons.logout_rounded,
            iconColor: Colors.redAccent,
            title: 'Cerrar Sesión',
            subtitle: supabase.auth.currentUser?.email ?? '',
            onTap: () {
              context.go('/login');
              supabase.auth.signOut();
            },
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  // ── Modales ─────────────────────────────────────────────────────────────

  void _mostrarMotos(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => _MotosSheet(ref: ref),
    );
  }

  void _mostrarLocales(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => _LocalesSheet(ref: ref),
    );
  }

  void _mostrarPromos(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => _PromosSheet(ref: ref),
    );
  }

  void _mostrarAvisos(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => _AvisosSheet(ref: ref),
    );
  }

  Future<void> _abrirCalendario(BuildContext context, WidgetRef ref) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(2024),
      lastDate: DateTime.now(),
      helpText: 'Selecciona una fecha',
    );
    if (picked != null && context.mounted) {
      _mostrarResumenFecha(context, ref, picked);
    }
  }

  void _mostrarResumenFecha(BuildContext context, WidgetRef ref, DateTime fecha) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => _ResumenFechaSheet(ref: ref, fecha: fecha),
    );
  }

  void _mostrarRepartidores(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => _RepartidoresConfigSheet(ref: ref),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  WIDGETS REUTILIZABLES
// ─────────────────────────────────────────────────────────────────────────────
class _SectionHeader extends StatelessWidget {
  final String label;
  const _SectionHeader({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.2,
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.45),
        ),
      ),
    );
  }
}

class _ToolTile extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Widget? trailing;

  const _ToolTile({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: Theme.of(context).cardColor,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: iconColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: iconColor, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15, color: cs.onSurface)),
                    const SizedBox(height: 2),
                    Text(subtitle, style: TextStyle(fontSize: 12, color: cs.onSurface.withValues(alpha: 0.5))),
                  ],
                ),
              ),
              trailing ?? Icon(Icons.chevron_right_rounded, color: cs.onSurface.withValues(alpha: 0.3)),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHEET: MOTOS
// ─────────────────────────────────────────────────────────────────────────────
class _MotosSheet extends ConsumerWidget {
  final WidgetRef ref;
  const _MotosSheet({required this.ref});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final motosAsync = ref.watch(motosProvider);
    return DraggableScrollableSheet(
      initialChildSize: 0.65,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      expand: false,
      builder: (ctx, ctrl) => Column(
        children: [
          const SizedBox(height: 12),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(4))),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
            child: Row(
              children: [
                const Icon(Icons.motorcycle_rounded, color: Color(0xFFF59E0B)),
                const SizedBox(width: 10),
                const Expanded(child: Text('Flota de Motos', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold))),
                IconButton(
                  icon: const Icon(Icons.add_circle_rounded, color: Color(0xFFF59E0B), size: 28),
                  onPressed: () => _agregarMoto(context, ref),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: motosAsync.when(
              loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFFF59E0B))),
              error: (e, _) => Center(child: Text('Error: $e')),
              data: (motos) {
                if (motos.isEmpty) {
                  return const Center(child: Text('No hay motos registradas.\nToca + para agregar una.', textAlign: TextAlign.center));
                }
                return ListView.separated(
                  controller: ctrl,
                  padding: const EdgeInsets.all(16),
                  itemCount: motos.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final m = motos[i];
                    final repartidor = m['repartidores'];
                    return Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Theme.of(context).cardColor,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFFF59E0B).withOpacity(0.2)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.two_wheeler_rounded, color: Color(0xFFF59E0B), size: 28),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(m['alias'] ?? m['placa'], style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                                Text('Placas: ${m['placa']}', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
                                if (repartidor != null)
                                  Text('👤 ${repartidor['alias'] ?? repartidor['nombre']}',
                                      style: const TextStyle(fontSize: 12, color: Color(0xFF10B981))),
                              ],
                            ),
                          ),
                          IconButton(
                            icon: Icon(Icons.edit_rounded, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4), size: 20),
                            onPressed: () => _editarMoto(context, ref, m),
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _agregarMoto(BuildContext context, WidgetRef ref) async {
    final placaCtrl = TextEditingController();
    final aliasCtrl = TextEditingController();
    await PremiumBottomSheet.showCustom<void>(
      context,
      title: 'Nueva Motocicleta',
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: placaCtrl, decoration: const InputDecoration(labelText: 'Placas (ej: X1A2B)')),
        const SizedBox(height: 12),
        TextField(controller: aliasCtrl, decoration: const InputDecoration(labelText: 'Alias / Apodo (ej: Moto Roja)')),
        const SizedBox(height: 32),
        Row(
          children: [
            Expanded(
              child: TextButton(
                onPressed: () => Navigator.pop(context),
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
                onPressed: () async {
                  if (placaCtrl.text.isEmpty || aliasCtrl.text.isEmpty) return;
                  final err = await ref.read(gastoServiceProvider).addMoto(placaCtrl.text, aliasCtrl.text);
                  if (err == null && context.mounted) {
                    Navigator.pop(context);
                    ref.invalidate(motosProvider);
                  } else if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err ?? 'Error')));
                  }
                },
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFFF59E0B),
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                child: const Text('Guardar', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ]),
    );
  }

  Future<void> _editarMoto(BuildContext context, WidgetRef ref, Map<String, dynamic> moto) async {
    final val = await PremiumBottomSheet.showInput(
      context,
      title: 'Editar ${moto['placa']}',
      hintText: 'Alias / Apodo',
      confirmText: 'Guardar',
      initialValue: moto['alias'] ?? '',
    );

    if (val != null) {
      await supabase.from('motos').update({'alias': val.trim()}).eq('id', moto['id']);
      if (context.mounted) {
        ref.invalidate(motosProvider);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHEET: LOCALES
// ─────────────────────────────────────────────────────────────────────────────
class _LocalesSheet extends ConsumerWidget {
  final WidgetRef ref;
  const _LocalesSheet({required this.ref});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final restsAsync = ref.watch(restaurantesProvider);
    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.9,
      expand: false,
      builder: (ctx, ctrl) => Column(
        children: [
          const SizedBox(height: 12),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(4))),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
            child: Row(
              children: [
                const Icon(Icons.storefront_rounded, color: Color(0xFF10B981)),
                const SizedBox(width: 10),
                const Expanded(child: Text('Restaurantes Asociados', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold))),
                IconButton(
                  icon: const Icon(Icons.add_circle_rounded, color: Color(0xFF10B981), size: 28),
                  onPressed: () => _agregarLocal(context, ref),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: restsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF10B981))),
              error: (e, _) => Center(child: Text('Error: $e')),
              data: (rests) {
                if (rests.isEmpty) return const Center(child: Text('Sin locales. Toca + para agregar.', textAlign: TextAlign.center));
                return ListView.separated(
                  controller: ctrl,
                  padding: const EdgeInsets.all(16),
                  itemCount: rests.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final r = rests[i];
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                      decoration: BoxDecoration(
                        color: Theme.of(context).cardColor,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.restaurant_rounded, color: Color(0xFF10B981)),
                          const SizedBox(width: 14),
                          Expanded(child: Text(r['nombre'], style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
                          IconButton(
                            icon: const Icon(Icons.edit_rounded, color: Colors.blueAccent, size: 20),
                            onPressed: () => _mostrarLocalDialog(context, ref, r),
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _agregarLocal(BuildContext context, WidgetRef ref) {
    _mostrarLocalSheet(context, ref, null);
  }

  Future<void> _mostrarLocalDialog(BuildContext context, WidgetRef ref, Map<String, dynamic>? local) async {
    _mostrarLocalSheet(context, ref, local);
  }

  void _mostrarLocalSheet(BuildContext context, WidgetRef ref, Map<String, dynamic>? local) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _LocalFormSheet(local: local, currentRef: ref),
    );
  }
}

class _LocalFormSheet extends ConsumerStatefulWidget {
  final Map<String, dynamic>? local;
  final WidgetRef currentRef;
  const _LocalFormSheet({this.local, required this.currentRef});

  @override
  ConsumerState<_LocalFormSheet> createState() => _LocalFormSheetState();
}

// ── Estilo oscuro tipo Rappi/Uber para el mapa ─────────────────────────────
const String _darkMapStyle = '''
[
  {"elementType":"geometry","stylers":[{"color":"#0f172a"}]},
  {"elementType":"labels.text.fill","stylers":[{"color":"#94a3b8"}]},
  {"elementType":"labels.text.stroke","stylers":[{"color":"#0f172a"}]},
  {"featureType":"administrative","elementType":"geometry","stylers":[{"color":"#1e293b"}]},
  {"featureType":"administrative.country","elementType":"labels.text.fill","stylers":[{"color":"#94a3b8"}]},
  {"featureType":"administrative.locality","elementType":"labels.text.fill","stylers":[{"color":"#cbd5e1"}]},
  {"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#f97316"}]},
  {"featureType":"poi","elementType":"geometry","stylers":[{"color":"#1e293b"}]},
  {"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#132e26"}]},
  {"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#34d399"}]},
  {"featureType":"poi.business","stylers":[{"visibility":"on"}]},
  {"featureType":"poi.medical","elementType":"labels.text.fill","stylers":[{"color":"#f87171"}]},
  {"featureType":"poi.school","elementType":"labels.text.fill","stylers":[{"color":"#60a5fa"}]},
  {"featureType":"road","elementType":"geometry","stylers":[{"color":"#1e293b"}]},
  {"featureType":"road","elementType":"geometry.stroke","stylers":[{"color":"#0f172a"}]},
  {"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#334155"}]},
  {"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#1e293b"}]},
  {"featureType":"road.highway","elementType":"labels.text.fill","stylers":[{"color":"#f97316"}]},
  {"featureType":"road.arterial","elementType":"geometry","stylers":[{"color":"#1e293b"}]},
  {"featureType":"road.local","elementType":"geometry","stylers":[{"color":"#1a2744"}]},
  {"featureType":"transit","elementType":"geometry","stylers":[{"color":"#1e293b"}]},
  {"featureType":"transit.station","elementType":"labels.text.fill","stylers":[{"color":"#a78bfa"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#0c1a2e"}]},
  {"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#38bdf8"}]},
  {"featureType":"water","elementType":"labels.text.stroke","stylers":[{"color":"#0c1a2e"}]}
]
''';

class _LocalFormSheetState extends ConsumerState<_LocalFormSheet> {
  final nombreCtrl = TextEditingController();
  final telCtrl    = TextEditingController();
  final dirCtrl    = TextEditingController();
  final mapsUrlCtrl = TextEditingController();
  bool activo      = true;
  double? lat;
  double? lng;
  String etiquetaZona = 'verde';
  bool _isLoadingGps  = false;
  bool _isSaving      = false;
  String? _errorMsg;
  GoogleMapController? _mapController;
  bool _showMap = false;

  bool get _isEditing => widget.local != null;

  @override
  void initState() {
    super.initState();
    if (_isEditing) {
      nombreCtrl.text = widget.local!['nombre'] ?? '';
      telCtrl.text    = widget.local!['telefono'] ?? '';
      dirCtrl.text    = widget.local!['direccion'] ?? '';
      mapsUrlCtrl.text= widget.local!['maps_url'] ?? '';
      activo          = widget.local!['activo'] ?? true;
      lat             = (widget.local!['lat'] as num?)?.toDouble();
      lng             = (widget.local!['lng'] as num?)?.toDouble();
      etiquetaZona    = widget.local!['etiqueta_zona'] ?? 'verde';
    }
  }

  @override
  void dispose() {
    nombreCtrl.dispose();
    telCtrl.dispose();
    dirCtrl.dispose();
    mapsUrlCtrl.dispose();
    _mapController?.dispose();
    super.dispose();
  }

  Future<void> _obtenerUbicacion() async {
    setState(() { _isLoadingGps = true; _errorMsg = null; });
    try {
      bool svcOn = await Geolocator.isLocationServiceEnabled();
      if (!svcOn) throw 'Activa el GPS del dispositivo';
      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) throw 'Permiso de ubicación denegado';
      final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
      setState(() {
        lat = pos.latitude;
        lng = pos.longitude;
        dirCtrl.text = 'GPS: ${lat!.toStringAsFixed(6)}, ${lng!.toStringAsFixed(6)}';
        _isLoadingGps = false;
      });
    } catch (e) {
      setState(() { _isLoadingGps = false; _errorMsg = e.toString(); });
    }
  }

  Future<void> _guardar() async {
    final n = nombreCtrl.text.trim();
    final t = telCtrl.text.replaceAll(RegExp(r'\D'), '');
    if (n.isEmpty) { setState(() => _errorMsg = 'El nombre es requerido'); return; }
    if (t.length != 10) { setState(() => _errorMsg = 'Teléfono debe tener exactamente 10 dígitos'); return; }

    setState(() { _isSaving = true; _errorMsg = null; });
    try {
      final svc = widget.currentRef.read(repartidorServiceProvider);
      bool ok;
      if (!_isEditing) {
        ok = await svc.addRestaurante(nombre: n, telefono: t, direccion: dirCtrl.text.isEmpty ? null : dirCtrl.text, mapsUrl: mapsUrlCtrl.text.isEmpty ? null : mapsUrlCtrl.text, lat: lat, lng: lng, etiquetaZona: etiquetaZona);
      } else {
        ok = await svc.updateRestaurante(id: widget.local!['id'], nombre: n, telefono: t, activo: activo, direccion: dirCtrl.text.isEmpty ? null : dirCtrl.text, mapsUrl: mapsUrlCtrl.text.isEmpty ? null : mapsUrlCtrl.text, lat: lat, lng: lng, etiquetaZona: etiquetaZona);
      }
      if (ok) {
        widget.currentRef.invalidate(restaurantesProvider);
        if (mounted) Navigator.pop(context);
      } else {
        setState(() => _errorMsg = 'No se pudo guardar. Revisa si el teléfono ya está registrado en otro restaurante.');
      }
    } catch (e) {
      setState(() => _errorMsg = e.toString());
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _eliminar() async {
    final ok = await PremiumBottomSheet.showConfirm(
      context,
      title: '¿Eliminar restaurante?',
      content: 'Se eliminará permanentemente junto con sus zonas configuradas.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      isDestructive: true,
    );
    if (ok != true) return;
    await supabase.from('restaurantes').delete().eq('id', widget.local!['id']);
    widget.currentRef.invalidate(restaurantesProvider);
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final bg = Theme.of(context).scaffoldBackgroundColor;
    final accent = const Color(0xFF10B981);

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, ctrl) => Container(
        decoration: BoxDecoration(
          color: bg,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          children: [
            // Drag handle
            const SizedBox(height: 12),
            Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(4))),
            const SizedBox(height: 16),

            // Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  Container(
                    width: 44, height: 44,
                    decoration: BoxDecoration(color: accent.withOpacity(0.12), borderRadius: BorderRadius.circular(14)),
                    child: Icon(Icons.storefront_rounded, color: accent),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_isEditing ? 'Editar Restaurante' : 'Nuevo Restaurante',
                            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                        Text(_isEditing ? widget.local!['nombre'] ?? '' : 'Completa los datos del local',
                            style: TextStyle(color: Colors.grey.shade500, fontSize: 13)),
                      ],
                    ),
                  ),
                  if (_isEditing)
                    IconButton(
                      icon: const Icon(Icons.delete_outline_rounded, color: Colors.redAccent),
                      onPressed: _eliminar,
                    ),
                ],
              ),
            ),
            const Divider(height: 24),

            // Form
            Expanded(
              child: ListView(
                controller: ctrl,
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 40),
                children: [
                  // Error banner
                  if (_errorMsg != null)
                    Container(
                      margin: const EdgeInsets.only(bottom: 16),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.withOpacity(0.1),
                        border: Border.all(color: Colors.redAccent.withOpacity(0.4)),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.error_outline_rounded, color: Colors.redAccent, size: 18),
                          const SizedBox(width: 8),
                          Expanded(child: Text(_errorMsg!, style: const TextStyle(color: Colors.redAccent, fontSize: 13))),
                        ],
                      ),
                    ),

                  // Name field
                  _buildLabel('Nombre del Restaurante *'),
                  const SizedBox(height: 6),
                  TextField(
                    controller: nombreCtrl,
                    textCapitalization: TextCapitalization.words,
                    decoration: _inputDeco('Ej: Pizza Roma'),
                  ),
                  const SizedBox(height: 16),

                  // Phone field
                  _buildLabel('WhatsApp / Teléfono (10 dígitos) *'),
                  const SizedBox(height: 6),
                  TextField(
                    controller: telCtrl,
                    keyboardType: TextInputType.phone,
                    maxLength: 10,
                    decoration: _inputDeco('Ej: 9631234567'),
                  ),
                  const SizedBox(height: 20),

                  // ── Ubicación del restaurante ──
                  _buildLabel('📍 Ubicación del Restaurante'),
                  const SizedBox(height: 8),

                  // Si ya tiene coordenadas, mostrar badge verde
                  if (lat != null && lng != null)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      margin: const EdgeInsets.only(bottom: 10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withOpacity(0.1),
                        border: Border.all(color: const Color(0xFF10B981).withOpacity(0.4)),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Coordenadas: ${lat!.toStringAsFixed(5)}, ${lng!.toStringAsFixed(5)}',
                              style: const TextStyle(color: Color(0xFF10B981), fontSize: 12, fontWeight: FontWeight.w600),
                            ),
                          ),
                        ],
                      ),
                    ),

                  // Botón principal: Detectar mi ubicación (GPS)
                  SizedBox(
                    height: 48,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1D4ED8),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      onPressed: _isLoadingGps ? null : () async {
                        await _obtenerUbicacion();
                        if (lat != null && lng != null) {
                          setState(() => _showMap = true);
                          _mapController?.animateCamera(
                            CameraUpdate.newLatLng(LatLng(lat!, lng!)),
                          );
                        }
                      },
                      icon: _isLoadingGps
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Icon(Icons.my_location_rounded, color: Colors.white),
                      label: Text(
                        _isLoadingGps ? 'Detectando...' : '📡 Usar mi ubicación actual',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),

                  // Botón secundario: Abrir/cerrar mapa manual
                  SizedBox(
                    height: 44,
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        side: BorderSide(color: Colors.white.withOpacity(0.2)),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      onPressed: () => setState(() => _showMap = !_showMap),
                      icon: Icon(_showMap ? Icons.map_rounded : Icons.pin_drop_rounded, size: 18),
                      label: Text(_showMap ? 'Ocultar mapa' : '🗺️ Seleccionar en mapa (arrastra el pin)'),
                    ),
                  ),

                  // Mapa interactivo con pin arrastrable
                  if (_showMap) ...[
                    const SizedBox(height: 12),
                    Container(
                      height: 250,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.white24),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: Stack(
                        children: [
                          GoogleMap(
                            initialCameraPosition: CameraPosition(
                              target: lat != null && lng != null
                                  ? LatLng(lat!, lng!)
                                  : const LatLng(16.7519, -92.6376), // Comitán de Domínguez por defecto
                              zoom: 16,
                            ),
                            onMapCreated: (ctrl) {
                              _mapController = ctrl;
                              ctrl.setMapStyle(_darkMapStyle);
                            },
                            myLocationEnabled: true,
                            myLocationButtonEnabled: false,
                            zoomControlsEnabled: false,
                            mapType: MapType.normal,
                            // ← Esto hace que el mapa capture los gestos
                            // aunque esté dentro de un ListView/ScrollView
                            gestureRecognizers: {
                              Factory<OneSequenceGestureRecognizer>(
                                () => EagerGestureRecognizer(),
                              ),
                            },
                            markers: lat != null && lng != null
                                ? {
                                    Marker(
                                      markerId: const MarkerId('restaurante'),
                                      position: LatLng(lat!, lng!),
                                      icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
                                      draggable: true,
                                      onDragEnd: (newPos) {
                                        setState(() {
                                          lat = newPos.latitude;
                                          lng = newPos.longitude;
                                        });
                                      },
                                    ),
                                  }
                                : {},
                            onLongPress: (pos) {
                              setState(() {
                                lat = pos.latitude;
                                lng = pos.longitude;
                              });
                            },
                            onTap: (pos) {
                              setState(() {
                                lat = pos.latitude;
                                lng = pos.longitude;
                              });
                            },
                            onCameraMove: (position) {
                              // Actualiza coords en tiempo real al mover la cámara
                              setState(() {
                                lat = position.target.latitude;
                                lng = position.target.longitude;
                              });
                            },
                          ),
                          // Instrucciones flotantes arriba
                          Positioned(
                            top: 8, left: 8, right: 8,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: Colors.black.withOpacity(0.75),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: const Text(
                                'Toca el mapa o arrastra el pin verde',
                                style: TextStyle(color: Colors.white70, fontSize: 10),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ),
                          // 📍 Overlay de coordenadas en tiempo real — parte inferior
                          Positioned(
                            bottom: 10, left: 10, right: 10,
                            child: AnimatedOpacity(
                              opacity: lat != null ? 1.0 : 0.0,
                              duration: const Duration(milliseconds: 300),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF0f172a).withOpacity(0.92),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: const Color(0xFF10B981).withOpacity(0.5)),
                                ),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    const Icon(Icons.location_on_rounded, color: Color(0xFF10B981), size: 14),
                                    const SizedBox(width: 6),
                                    Text(
                                      lat != null
                                          ? '${lat!.toStringAsFixed(6)},  ${lng!.toStringAsFixed(6)}'
                                          : '',
                                      style: const TextStyle(
                                        color: Color(0xFF10B981),
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                        fontFamily: 'monospace',
                                        letterSpacing: 0.5,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),

                  // Campo de texto de dirección (opcional, de apoyo)
                  _buildLabel('Dirección (texto, opcional)'),
                  const SizedBox(height: 6),
                  TextField(
                    controller: dirCtrl,
                    minLines: 1,
                    maxLines: 2,
                    decoration: _inputDeco('Ej: Av. Central 123, Centro, Comitán'),
                  ),
                  const SizedBox(height: 16),

                  // Etiqueta Zona section
                  _buildLabel('Etiqueta de Zona (Núcleo vs Periferia)'),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<String>(
                    value: etiquetaZona,
                    decoration: _inputDeco(''),
                    dropdownColor: Colors.grey.shade900,
                    items: const [
                      DropdownMenuItem(value: 'verde', child: Text('🟢 Verde (Centro / Núcleo Urbano)')),
                      DropdownMenuItem(value: 'rojo', child: Text('🔴 Rojo (Periferia / Extendida)')),
                    ],
                    onChanged: (val) {
                      if (val != null) {
                        setState(() => etiquetaZona = val);
                      }
                    },
                  ),
                  const SizedBox(height: 10),

                  // Active toggle (edit only)
                  if (_isEditing) ...[
                    const SizedBox(height: 20),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                      decoration: BoxDecoration(
                        color: activo ? accent.withOpacity(0.08) : Colors.red.withOpacity(0.06),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: activo ? accent.withOpacity(0.3) : Colors.red.withOpacity(0.2)),
                      ),
                      child: SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(activo ? 'Activo — El bot lo atiende' : 'Inactivo — El bot lo ignora',
                            style: TextStyle(fontWeight: FontWeight.w600, color: activo ? accent : Colors.redAccent)),
                        subtitle: const Text('Si lo desactivas, los mensajes del restaurante se tratarán como clientes normales'),
                        value: activo,
                        activeColor: accent,
                        onChanged: (v) => setState(() => activo = v),
                      ),
                    ),
                  ],

                  const SizedBox(height: 32),

                  // Save button
                  SizedBox(
                    height: 56,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: accent,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      onPressed: _isSaving ? null : _guardar,
                      child: _isSaving
                          ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : Text(_isEditing ? 'Guardar Cambios' : 'Registrar Restaurante',
                              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLabel(String text) =>
      Text(text, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13));

  InputDecoration _inputDeco(String hint) => InputDecoration(
    hintText: hint,
    filled: true,
    fillColor: Colors.white.withOpacity(0.05),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Colors.white24)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: Colors.white.withOpacity(0.12))),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: Color(0xFF10B981))),
    counterText: '',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHEET: PROMOS
// ─────────────────────────────────────────────────────────────────────────────
class _PromosSheet extends ConsumerWidget {
  final WidgetRef ref;
  const _PromosSheet({required this.ref});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final promosAsync = ref.watch(promosProvider);
    return DraggableScrollableSheet(
      initialChildSize: 0.65,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      expand: false,
      builder: (ctx, ctrl) => Column(
        children: [
          const SizedBox(height: 12),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(4))),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
            child: Row(
              children: [
                const Icon(Icons.local_offer_rounded, color: Color(0xFFFF6B35)),
                const SizedBox(width: 10),
                const Expanded(child: Text('Promociones App', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold))),
                IconButton(
                  icon: const Icon(Icons.add_circle_rounded, color: Color(0xFFFF6B35), size: 28),
                  onPressed: () => _nuevaPromo(context, ref),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: promosAsync.when(
              loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFFFF6B35))),
              error: (e, _) => Center(child: Text('Error: $e')),
              data: (promos) {
                if (promos.isEmpty) return const Center(child: Text('Sin promociones. Toca + para crear.', textAlign: TextAlign.center));
                return ListView.separated(
                  controller: ctrl,
                  padding: const EdgeInsets.all(16),
                  itemCount: promos.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final p = promos[i];
                    return Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Theme.of(context).cardColor,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: p['activa'] ? const Color(0xFFFF6B35).withOpacity(0.4) : Colors.transparent),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(p['titulo'], style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                              if (p['descripcion'] != null && (p['descripcion'] as String).isNotEmpty)
                                Text(p['descripcion'], style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
                            ]),
                          ),
                          Switch(
                            value: p['activa'] ?? false,
                            activeColor: const Color(0xFFFF6B35),
                            onChanged: (val) async {
                              await supabase.from('promociones_dinamicas').update({'activa': val}).eq('id', p['id']);
                              ref.invalidate(promosProvider);
                            },
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _nuevaPromo(BuildContext context, WidgetRef ref) async {
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    await PremiumBottomSheet.showCustom<void>(
      context,
      title: 'Nueva Promoción',
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: titleCtrl, decoration: const InputDecoration(labelText: 'Título (ej: Hora Feliz)')),
        const SizedBox(height: 12),
        TextField(controller: descCtrl, maxLines: 2, decoration: const InputDecoration(labelText: 'Descripción')),
        const SizedBox(height: 32),
        Row(
          children: [
            Expanded(
              child: TextButton(
                onPressed: () => Navigator.pop(context),
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
                onPressed: () async {
                  if (titleCtrl.text.trim().isEmpty) return;
                  await supabase.from('promociones_dinamicas').insert({'titulo': titleCtrl.text.trim(), 'descripcion': descCtrl.text.trim(), 'activa': true});
                  if (context.mounted) { Navigator.pop(context); ref.invalidate(promosProvider); }
                },
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFFFF6B35),
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                child: const Text('Crear', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHEET: AVISOS FLASH
// ─────────────────────────────────────────────────────────────────────────────
class _AvisosSheet extends ConsumerWidget {
  final WidgetRef ref;
  const _AvisosSheet({required this.ref});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final avAsync = ref.watch(anunciosProvider);
    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.9,
      expand: false,
      builder: (ctx, ctrl) => Column(
        children: [
          const SizedBox(height: 12),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(4))),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
            child: Row(
              children: [
                const Icon(Icons.bolt_rounded, color: Color(0xFFE11D48)),
                const SizedBox(width: 10),
                const Expanded(child: Text('Avisos Flash', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold))),
                IconButton(
                  icon: const Icon(Icons.add_circle_rounded, color: Color(0xFFE11D48), size: 28),
                  onPressed: () => _nuevoAviso(context, ref),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: avAsync.when(
              loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFFE11D48))),
              error: (e, _) => Center(child: Text('Error: $e')),
              data: (avisos) {
                if (avisos.isEmpty) return const Center(child: Text('Sin avisos activos.', textAlign: TextAlign.center));
                return ListView.separated(
                  controller: ctrl,
                  padding: const EdgeInsets.all(16),
                  itemCount: avisos.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final a = avisos[i];
                    return Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Theme.of(context).cardColor,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: a['activo'] ? const Color(0xFFE11D48).withOpacity(0.4) : Colors.transparent),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.bolt_rounded, color: Color(0xFFE11D48), size: 20),
                          const SizedBox(width: 12),
                          Expanded(child: Text(a['mensaje'] ?? '', style: const TextStyle(fontSize: 14))),
                          Switch(
                            value: a['activo'] ?? false,
                            activeColor: const Color(0xFFE11D48),
                            onChanged: (val) async {
                              await supabase.from('anuncios_flash').update({'activo': val}).eq('id', a['id']);
                              ref.invalidate(anunciosProvider);
                            },
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _nuevoAviso(BuildContext context, WidgetRef ref) async {
    final val = await PremiumBottomSheet.showInput(
      context,
      title: 'Nuevo Aviso Flash ⚡',
      hintText: 'Ej: Hoy llueve, +20min de espera',
      confirmText: 'Lanzar',
    );

    if (val != null && val.trim().isNotEmpty) {
      await supabase.from('anuncios_flash').update({'activo': false}).neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('anuncios_flash').insert({'mensaje': val.trim(), 'activo': true});
      if (context.mounted) { ref.invalidate(anunciosProvider); }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHEET: RESUMEN POR FECHA (Calendario)
// ─────────────────────────────────────────────────────────────────────────────
class _ResumenFechaSheet extends ConsumerWidget {
  final WidgetRef ref;
  final DateTime fecha;
  const _ResumenFechaSheet({required this.ref, required this.fecha});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fechaStr = '${fecha.day}/${fecha.month}/${fecha.year}';
    final fechaIso = fecha.toIso8601String().split('T')[0];

    final gastosAsync = ref.watch(FutureProvider.autoDispose((r) {
      return r.read(gastoServiceProvider).getGastos(
        startDate: fecha,
        endDate: fecha,
      );
    }));

    final serviciosAsync = ref.watch(FutureProvider.autoDispose((r) {
      return r.read(repartidorServiceProvider).getServicios(fechaInicio: fecha, fechaFin: fecha);
    }));

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (ctx, ctrl) => Column(
        children: [
          const SizedBox(height: 12),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(4))),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                const Icon(Icons.calendar_month_rounded, color: Color(0xFF60A5FA)),
                const SizedBox(width: 10),
                Text('Resumen del $fechaStr', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView(
              controller: ctrl,
              padding: const EdgeInsets.all(16),
              children: [
                // Servicios del día
                Text('ENTREGAS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4))),
                const SizedBox(height: 10),
                serviciosAsync.when(
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Text('Error: $e'),
                  data: (servicios) {
                    if (servicios.isEmpty) return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text('Sin entregas ese día.', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4))),
                    );
                    final total = servicios.fold<double>(0, (s, e) => s + (double.tryParse(e['monto'].toString()) ?? 0));
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ...servicios.map((s) => Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Row(children: [
                            const Icon(Icons.delivery_dining_rounded, size: 16, color: Color(0xFF10B981)),
                            const SizedBox(width: 8),
                            Expanded(child: Text(s['descripcion'] ?? '', style: const TextStyle(fontSize: 13))),
                            Text('\$${s['monto']}', style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF10B981))),
                          ]),
                        )),
                        const Divider(),
                        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                          const Text('Total entregas', style: TextStyle(fontWeight: FontWeight.bold)),
                          Text('\$${total.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: Color(0xFF10B981))),
                        ]),
                      ],
                    );
                  },
                ),

                const SizedBox(height: 24),

                // Gastos del día
                Text('GASTOS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4))),
                const SizedBox(height: 10),
                gastosAsync.when(
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Text('Error: $e'),
                  data: (gastos) {
                    if (gastos.isEmpty) return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text('Sin gastos ese día.', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4))),
                    );
                    final total = gastos.fold<double>(0, (s, e) => s + (double.tryParse(e['monto'].toString()) ?? 0));
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ...gastos.map((g) => Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Row(children: [
                            const Icon(Icons.receipt_rounded, size: 16, color: Color(0xFFE11D48)),
                            const SizedBox(width: 8),
                            Expanded(child: Text(g['concepto'] ?? '', style: const TextStyle(fontSize: 13))),
                            Text('\$${g['monto']}', style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFFE11D48))),
                          ]),
                        )),
                        const Divider(),
                        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                          const Text('Total gastos', style: TextStyle(fontWeight: FontWeight.bold)),
                          Text('\$${total.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: Color(0xFFE11D48))),
                        ]),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHEET: REPARTIDORES
// ─────────────────────────────────────────────────────────────────────────────
class _RepartidoresConfigSheet extends ConsumerWidget {
  final WidgetRef ref;
  const _RepartidoresConfigSheet({required this.ref});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Usamos el listado que trae todos los activos (o podemos traer también inactivos mapeando una nueva query en el service, pero con los activos por ahora basta para visualizar y eliminar. Idealmente listaremos todos, pero utilizaremos la función existente).
    // NOTA: Para no alterar la función global, traemos la variable nativamente
    final repsStream = supabase.from('repartidores').stream(primaryKey: ['id']).order('nombre', ascending: true);

    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.9,
      expand: false,
      builder: (ctx, ctrl) => Column(
        children: [
          const SizedBox(height: 12),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(4))),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
            child: Row(
              children: [
                const Icon(Icons.people_rounded, color: Color(0xFFF59E0B)),
                const SizedBox(width: 10),
                const Expanded(child: Text('Plantilla de Repartidores', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold))),
                IconButton(
                  icon: const Icon(Icons.person_add_rounded, color: Color(0xFFF59E0B), size: 28),
                  onPressed: () => _mostrarRepartidorSheet(context, ref, null),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: StreamBuilder<List<Map<String, dynamic>>>(
              stream: repsStream,
              builder: (ctx, snap) {
                if (!snap.hasData) return const Center(child: CircularProgressIndicator(color: Color(0xFFF59E0B)));
                final reps = snap.data!;
                if (reps.isEmpty) return const Center(child: Text('Sin repartidores. Toca el botón + para agregar uno.'));
                
                return ListView.separated(
                  controller: ctrl,
                  padding: const EdgeInsets.all(16),
                  itemCount: reps.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final r = reps[i];
                    final isActivo = r['activo'] == true;
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                      decoration: BoxDecoration(
                        color: Theme.of(context).cardColor,
                        borderRadius: BorderRadius.circular(14),
                        border: isActivo ? null : Border.all(color: Colors.redAccent.withValues(alpha: 0.5)),
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            backgroundColor: isActivo ? const Color(0xFFF59E0B).withValues(alpha: 0.2) : Colors.redAccent.withValues(alpha: 0.2),
                            child: Icon(Icons.person_rounded, color: isActivo ? const Color(0xFFF59E0B) : Colors.redAccent),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('${r['nombre']}', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15, decoration: isActivo ? null : TextDecoration.lineThrough)),
                                if (r['alias'] != null && r['alias'].toString().trim().isNotEmpty) Text('Alias: ${r['alias']}', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5), fontSize: 12)),
                                Text('📱 ${r['telefono'] ?? 'S/N'}', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5), fontSize: 12)),
                              ],
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.edit_rounded, color: Colors.blueAccent, size: 20),
                            onPressed: () => _mostrarRepartidorSheet(context, ref, r),
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _mostrarRepartidorSheet(BuildContext context, WidgetRef ref, Map<String, dynamic>? rep) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _RepartidorFormSheet(rep: rep, currentRef: ref),
    );
  }
}

class _RepartidorFormSheet extends ConsumerStatefulWidget {
  final Map<String, dynamic>? rep;
  final WidgetRef currentRef;
  const _RepartidorFormSheet({this.rep, required this.currentRef});

  @override
  ConsumerState<_RepartidorFormSheet> createState() => _RepartidorFormSheetState();
}

class _RepartidorFormSheetState extends ConsumerState<_RepartidorFormSheet> {
  final nombreCtrl = TextEditingController();
  final telCtrl    = TextEditingController();
  final aliasCtrl  = TextEditingController();
  bool activo      = true;
  bool _isSaving   = false;
  String? _errorMsg;

  bool get _isEditing => widget.rep != null;

  @override
  void initState() {
    super.initState();
    if (_isEditing) {
      nombreCtrl.text = widget.rep!['nombre'] ?? '';
      telCtrl.text    = widget.rep!['telefono']?.toString() ?? '';
      aliasCtrl.text  = widget.rep!['alias'] ?? '';
      activo          = widget.rep!['activo'] ?? true;
    }
  }

  @override
  void dispose() {
    nombreCtrl.dispose();
    telCtrl.dispose();
    aliasCtrl.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    final n = nombreCtrl.text.trim();
    final t = telCtrl.text.replaceAll(RegExp(r'\D'), '');
    final a = aliasCtrl.text.trim();

    if (n.isEmpty) { setState(() => _errorMsg = 'El nombre es requerido'); return; }
    if (t.isNotEmpty && t.length != 10) { setState(() => _errorMsg = 'Si añades teléfono, deben ser 10 dígitos'); return; }

    setState(() { _isSaving = true; _errorMsg = null; });

    try {
      if (_isEditing) {
        await supabase.from('repartidores').update({
          'nombre': n,
          'telefono': t.isEmpty ? null : t,
          'alias': a.isEmpty ? null : a,
          'activo': activo,
        }).eq('id', widget.rep!['id']);
      } else {
        final errorMsg = await widget.currentRef.read(repartidorServiceProvider).addRepartidor(n, t.isEmpty ? null : t, a.isEmpty ? null : a);
        if (errorMsg != null) {
          throw Exception(errorMsg);
        }
      }
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() { _isSaving = false; _errorMsg = e.toString(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(24, 24, 24, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(_isEditing ? 'Editar Repartidor' : 'Nuevo Repartidor', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              if (_isEditing)
                Switch(
                  value: activo,
                  activeColor: const Color(0xFFF59E0B),
                  onChanged: (v) => setState(() => activo = v),
                ),
            ],
          ),
          if (_isEditing)
             Text(activo ? 'Estado: Activo' : 'Estado: Inactivo (No recibirá pedidos ni será visible para la IA)', style: TextStyle(color: activo ? Colors.green : Colors.red, fontSize: 12)),
          
          const SizedBox(height: 20),
          TextField(
            controller: nombreCtrl,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Nombre del Conductor *', prefixIcon: Icon(Icons.person)),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: aliasCtrl,
            decoration: const InputDecoration(labelText: 'Alias / Nombre Clave', prefixIcon: Icon(Icons.badge_rounded)),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: telCtrl,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Teléfono a 10 dígitos', prefixIcon: Icon(Icons.phone)),
          ),
          if (_errorMsg != null) ...[
            const SizedBox(height: 12),
            Text(_errorMsg!, style: const TextStyle(color: Colors.red, fontWeight: FontWeight.bold)),
          ],
          const SizedBox(height: 24),
          _isSaving
              ? const Center(child: CircularProgressIndicator(color: Color(0xFFF59E0B)))
              : FilledButton.icon(
                  icon: const Icon(Icons.save_rounded),
                  label: Text(_isEditing ? 'Guardar Cambios' : 'Registrar Repartidor'),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFF59E0B),
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                  onPressed: _guardar,
                ),
        ],
      ),
    );
  }
}

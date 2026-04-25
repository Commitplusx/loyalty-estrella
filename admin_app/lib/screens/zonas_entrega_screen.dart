// lib/screens/zonas_entrega_screen.dart
// Gestión de Zonas de Entrega — tabla global zonas_entrega
// Permite crear, editar y eliminar zonas y sus colonias desde la APK admin.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/supabase_config.dart';
import '../core/theme.dart';

// ── Modelo ────────────────────────────────────────────────────────────────────
class ZonaEntrega {
  final int id;
  String nombre;
  String colorEmoji;
  double precio;
  double? precioMax;
  double? kmMax;
  List<String> colonias;
  bool activo;
  int orden;

  ZonaEntrega({
    required this.id,
    required this.nombre,
    required this.colorEmoji,
    required this.precio,
    this.precioMax,
    this.kmMax,
    required this.colonias,
    required this.activo,
    required this.orden,
  });

  factory ZonaEntrega.fromMap(Map<String, dynamic> m) => ZonaEntrega(
        id:          m['id'] as int,
        nombre:      m['nombre'] as String,
        colorEmoji:  m['color_emoji'] as String? ?? '🟢',
        precio:      (m['precio'] as num).toDouble(),
        precioMax:   m['precio_max'] != null ? (m['precio_max'] as num).toDouble() : null,
        kmMax:       m['km_max'] != null ? (m['km_max'] as num).toDouble() : null,
        colonias:    List<String>.from((m['colonias'] as List? ?? []).map((e) => e.toString())),
        activo:      m['activo'] as bool? ?? true,
        orden:       m['orden'] as int? ?? 0,
      );

  String get precioTexto => precioMax != null ? '\$$precio–\$$precioMax' : '\$${precio.toStringAsFixed(0)}';
  Color get color {
    switch (nombre.toUpperCase()) {
      case 'VERDE': return Colors.green;
      case 'AZUL': return Colors.blue;
      case 'AMARILLA': return Colors.orange;
      case 'ROJA': return Colors.red;
      default: return Colors.purple;
    }
  }
}

// ── Providers ─────────────────────────────────────────────────────────────────
final zonasEntregaProvider = FutureProvider.autoDispose<List<ZonaEntrega>>((ref) async {
  final data = await supabase
      .from('zonas_entrega')
      .select()
      .order('orden', ascending: true);
  return (data as List).map((m) => ZonaEntrega.fromMap(m as Map<String, dynamic>)).toList();
});

// ── Pantalla principal ────────────────────────────────────────────────────────
class ZonasEntregaScreen extends ConsumerStatefulWidget {
  const ZonasEntregaScreen({super.key});

  @override
  ConsumerState<ZonasEntregaScreen> createState() => _ZonasEntregaScreenState();
}

class _ZonasEntregaScreenState extends ConsumerState<ZonasEntregaScreen> {
  @override
  Widget build(BuildContext context) {
    final zonasAsync = ref.watch(zonasEntregaProvider);
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text('Zonas de Entrega'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle_outline_rounded),
            tooltip: 'Nueva Zona',
            onPressed: () => _mostrarFormularioZona(context, null),
          ),
        ],
      ),
      body: zonasAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline_rounded, size: 48, color: Colors.redAccent),
              const SizedBox(height: 12),
              Text('Error cargando zonas:\n$e', textAlign: TextAlign.center,
                  style: TextStyle(color: theme.colorScheme.onSurface.withValues(alpha: 0.6))),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: () => ref.invalidate(zonasEntregaProvider),
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Reintentar'),
              ),
            ],
          ),
        ),
        data: (zonas) {
          if (zonas.isEmpty) {
            return _buildEmpty(context);
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(zonasEntregaProvider),
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              itemCount: zonas.length,
              itemBuilder: (_, i) => _ZonaCard(
                zona: zonas[i],
                onChanged: () => ref.invalidate(zonasEntregaProvider),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildEmpty(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.map_outlined, size: 72,
              color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.2)),
          const SizedBox(height: 16),
          Text('No hay zonas configuradas',
              style: TextStyle(
                fontSize: 18, fontWeight: FontWeight.bold,
                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
              )),
          const SizedBox(height: 8),
          Text('El bot usará los precios mínimos como fallback.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4))),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: () => _mostrarFormularioZona(context, null),
            icon: const Icon(Icons.add_rounded),
            label: const Text('Crear Primera Zona'),
          ),
        ],
      ),
    );
  }

  void _mostrarFormularioZona(BuildContext context, ZonaEntrega? zonaExistente) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _ZonaFormSheet(
        zonaExistente: zonaExistente,
        onSaved: () {
          Navigator.pop(ctx);
          ref.invalidate(zonasEntregaProvider);
        },
      ),
    );
  }
}

// ── Tarjeta por zona ──────────────────────────────────────────────────────────
class _ZonaCard extends ConsumerStatefulWidget {
  final ZonaEntrega zona;
  final VoidCallback onChanged;

  const _ZonaCard({required this.zona, required this.onChanged});

  @override
  ConsumerState<_ZonaCard> createState() => _ZonaCardState();
}

class _ZonaCardState extends ConsumerState<_ZonaCard> {
  bool _expandida = false;
  bool _guardandoColonia = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final zona = widget.zona;
    final colorZona = zona.color;

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: colorZona.withValues(alpha: 0.25), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: colorZona.withValues(alpha: 0.08),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          // ── Cabecera de la zona ──────────────────────────────────────────
          InkWell(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            onTap: () => setState(() => _expandida = !_expandida),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  // Emoji + Nombre
                  Container(
                    width: 44, height: 44,
                    decoration: BoxDecoration(
                      color: colorZona.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Center(child: Text(zona.colorEmoji, style: const TextStyle(fontSize: 22))),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Zona ${_capitalize(zona.nombre)}',
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        Text('${zona.colonias.length} colonia${zona.colonias.length != 1 ? 's' : ''}',
                            style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.55))),
                      ],
                    ),
                  ),
                  // Badge precio
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: colorZona,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(zona.precioTexto,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                  ),
                  const SizedBox(width: 8),
                  // Menú
                  PopupMenuButton<String>(
                    icon: Icon(Icons.more_vert_rounded, color: theme.colorScheme.onSurface.withValues(alpha: 0.6)),
                    itemBuilder: (_) => [
                      const PopupMenuItem(value: 'edit', child: Row(children: [Icon(Icons.edit_rounded, size: 18), SizedBox(width: 8), Text('Editar Zona')])),
                      const PopupMenuItem(value: 'toggle', child: Row(children: [Icon(Icons.visibility_off_rounded, size: 18), SizedBox(width: 8), Text('Desactivar')])),
                      const PopupMenuItem(value: 'delete', child: Row(children: [Icon(Icons.delete_outline_rounded, color: Colors.red, size: 18), SizedBox(width: 8), Text('Eliminar', style: TextStyle(color: Colors.red))])),
                    ],
                    onSelected: (action) => _menuAction(action, zona),
                  ),
                  AnimatedRotation(
                    turns: _expandida ? 0.5 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: const Icon(Icons.expand_more_rounded),
                  ),
                ],
              ),
            ),
          ),
          // ── Colonias expandibles ─────────────────────────────────────────
          AnimatedCrossFade(
            duration: const Duration(milliseconds: 250),
            crossFadeState: _expandida ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            firstChild: const SizedBox.shrink(),
            secondChild: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Divider(color: theme.colorScheme.onSurface.withValues(alpha: 0.1)),
                  const SizedBox(height: 8),
                  // Info de km si existe
                  if (zona.kmMax != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Row(
                        children: [
                          Icon(Icons.radar_rounded, size: 16, color: colorZona),
                          const SizedBox(width: 6),
                          Text('Radio máximo: ${zona.kmMax} km desde el centro',
                              style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.6))),
                        ],
                      ),
                    ),
                  Text('Colonias / Barrios', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: colorZona)),
                  const SizedBox(height: 8),
                  // Chips de colonias
                  if (zona.colonias.isEmpty)
                    Text('Sin colonias registradas',
                        style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.4)))
                  else
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: zona.colonias.map((col) => _ColoniaChip(
                        colonia: col,
                        color: colorZona,
                        onDelete: () => _eliminarColonia(zona, col),
                      )).toList(),
                    ),
                  const SizedBox(height: 12),
                  // Botón agregar colonia
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: colorZona,
                      side: BorderSide(color: colorZona.withValues(alpha: 0.5)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    onPressed: _guardandoColonia ? null : () => _agregarColonia(zona),
                    icon: _guardandoColonia
                        ? SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: colorZona))
                        : const Icon(Icons.add_rounded, size: 18),
                    label: const Text('Agregar Colonia'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _menuAction(String action, ZonaEntrega zona) async {
    switch (action) {
      case 'edit':
        if (mounted) {
          showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (ctx) => _ZonaFormSheet(
              zonaExistente: zona,
              onSaved: () { Navigator.pop(ctx); widget.onChanged(); },
            ),
          );
        }
        break;
      case 'toggle':
        await supabase.from('zonas_entrega').update({'activo': !zona.activo}).eq('id', zona.id);
        widget.onChanged();
        break;
      case 'delete':
        final ok = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('¿Eliminar zona?'),
            content: Text('Se eliminará "${_capitalize(zona.nombre)}" y todas sus colonias. El bot dejará de usarla.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: Colors.red),
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Eliminar'),
              ),
            ],
          ),
        );
        if (ok == true) {
          await supabase.from('zonas_entrega').delete().eq('id', zona.id);
          widget.onChanged();
        }
        break;
    }
  }

  Future<void> _agregarColonia(ZonaEntrega zona) async {
    final ctrl = TextEditingController();
    final nuevaColonia = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Agregar colonia a ${_capitalize(zona.nombre)}'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            labelText: 'Nombre de la colonia',
            hintText: 'ej: San Sebastián',
          ),
          onSubmitted: (v) => Navigator.pop(ctx, v.trim()),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: const Text('Agregar')),
        ],
      ),
    );

    if (nuevaColonia == null || nuevaColonia.isEmpty) return;
    setState(() => _guardandoColonia = true);

    final nuevasLista = [...zona.colonias, nuevaColonia.toLowerCase()];
    await supabase.from('zonas_entrega').update({'colonias': nuevasLista}).eq('id', zona.id);
    
    setState(() => _guardandoColonia = false);
    widget.onChanged();
  }

  Future<void> _eliminarColonia(ZonaEntrega zona, String colonia) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Eliminar colonia?'),
        content: Text('Se quitará "$colonia" de la zona ${_capitalize(zona.nombre)}.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    final nuevasLista = zone_list_without(zona.colonias, colonia);
    await supabase.from('zonas_entrega').update({'colonias': nuevasLista}).eq('id', zona.id);
    widget.onChanged();
  }

  String _capitalize(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1).toLowerCase();

  List<String> zone_list_without(List<String> colonias, String eliminar) =>
      colonias.where((c) => c != eliminar).toList();
}

// ── Chip individual de colonia ─────────────────────────────────────────────
class _ColoniaChip extends StatelessWidget {
  final String colonia;
  final Color color;
  final VoidCallback onDelete;

  const _ColoniaChip({required this.colonia, required this.color, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(colonia, style: const TextStyle(fontSize: 12)),
      backgroundColor: color.withValues(alpha: 0.08),
      side: BorderSide(color: color.withValues(alpha: 0.3)),
      deleteIcon: Icon(Icons.close_rounded, size: 14, color: color.withValues(alpha: 0.7)),
      onDeleted: onDelete,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    );
  }
}

// ── Formulario crear/editar zona ──────────────────────────────────────────────
class _ZonaFormSheet extends StatefulWidget {
  final ZonaEntrega? zonaExistente;
  final VoidCallback onSaved;

  const _ZonaFormSheet({this.zonaExistente, required this.onSaved});

  @override
  State<_ZonaFormSheet> createState() => _ZonaFormSheetState();
}

class _ZonaFormSheetState extends State<_ZonaFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _nombreCtrl;
  late TextEditingController _precioCtrl;
  late TextEditingController _precioMaxCtrl;
  late TextEditingController _kmMaxCtrl;
  late TextEditingController _ordenCtrl;
  String _emoji = '🟢';
  bool _saving = false;

  final _emojis = ['🟢', '🔵', '🟡', '🔴', '🟣', '⚪', '🟠'];

  @override
  void initState() {
    super.initState();
    final z = widget.zonaExistente;
    _nombreCtrl   = TextEditingController(text: z?.nombre ?? '');
    _precioCtrl   = TextEditingController(text: z != null ? z.precio.toStringAsFixed(0) : '45');
    _precioMaxCtrl = TextEditingController(text: z?.precioMax?.toStringAsFixed(0) ?? '');
    _kmMaxCtrl    = TextEditingController(text: z?.kmMax?.toStringAsFixed(1) ?? '');
    _ordenCtrl    = TextEditingController(text: z?.orden.toString() ?? '1');
    _emoji        = z?.colorEmoji ?? '🟢';
  }

  @override
  void dispose() {
    _nombreCtrl.dispose();
    _precioCtrl.dispose();
    _precioMaxCtrl.dispose();
    _kmMaxCtrl.dispose();
    _ordenCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      margin: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.scaffoldBackgroundColor,
        borderRadius: BorderRadius.circular(24),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
        top: 24, left: 20, right: 20,
      ),
      child: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Título
              Row(
                children: [
                  Icon(widget.zonaExistente == null ? Icons.add_location_alt_rounded : Icons.edit_location_alt_rounded,
                      color: theme.colorScheme.primary),
                  const SizedBox(width: 10),
                  Text(widget.zonaExistente == null ? 'Nueva Zona' : 'Editar Zona',
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 20),

              // Selector de emoji
              Row(
                children: [
                  const Text('Color: ', style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Wrap(
                      spacing: 8,
                      children: _emojis.map((e) => GestureDetector(
                        onTap: () => setState(() => _emoji = e),
                        child: Container(
                          width: 40, height: 40,
                          decoration: BoxDecoration(
                            border: e == _emoji ? Border.all(color: theme.colorScheme.primary, width: 2) : null,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Center(child: Text(e, style: const TextStyle(fontSize: 22))),
                        ),
                      )).toList(),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Nombre
              TextFormField(
                controller: _nombreCtrl,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                  labelText: 'Nombre de la Zona *',
                  hintText: 'ej: VERDE, AZUL, ROJA...',
                  prefixIcon: Icon(Icons.label_rounded),
                ),
                validator: (v) => v == null || v.trim().isEmpty ? 'Campo requerido' : null,
              ),
              const SizedBox(height: 12),

              // Precios
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _precioCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Precio Base *',
                        prefixText: '\$ ',
                      ),
                      validator: (v) => v == null || double.tryParse(v) == null ? 'Número requerido' : null,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _precioMaxCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Precio Máx (opcional)',
                        prefixText: '\$ ',
                        helperText: 'Para rango ej: \$55-60',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Radio km y orden
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _kmMaxCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Radio máx (km)',
                        prefixIcon: Icon(Icons.radar_rounded),
                        helperText: 'Fallback GPS',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _ordenCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Orden',
                        prefixIcon: Icon(Icons.sort_rounded),
                        helperText: '1=primer check',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Guardar
              FilledButton.icon(
                onPressed: _saving ? null : _guardar,
                icon: _saving
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.save_rounded),
                label: Text(_saving ? 'Guardando...' : 'Guardar Zona'),
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _guardar() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);

    final payload = <String, dynamic>{
      'nombre':      _nombreCtrl.text.trim().toUpperCase(),
      'color_emoji': _emoji,
      'precio':      double.parse(_precioCtrl.text.trim()),
      'precio_max':  _precioMaxCtrl.text.trim().isEmpty ? null : double.tryParse(_precioMaxCtrl.text.trim()),
      'km_max':      _kmMaxCtrl.text.trim().isEmpty ? null : double.tryParse(_kmMaxCtrl.text.trim()),
      'orden':       int.tryParse(_ordenCtrl.text.trim()) ?? 1,
    };

    try {
      if (widget.zonaExistente != null) {
        await supabase.from('zonas_entrega').update(payload).eq('id', widget.zonaExistente!.id);
      } else {
        payload['colonias'] = <String>[];
        payload['activo'] = true;
        await supabase.from('zonas_entrega').insert(payload);
      }
      widget.onSaved();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.redAccent),
        );
        setState(() => _saving = false);
      }
    }
  }
}

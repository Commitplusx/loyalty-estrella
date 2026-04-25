// lib/screens/excepciones_precio_screen.dart
// Gestión de Excepciones de Precio Manual — tabla excepciones_precio v2
// zona_id SIEMPRE se guarda (FK obligatoria) para integridad de datos

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/supabase_config.dart';

// ── Modelo ────────────────────────────────────────────────────────────────────
class ExcepcionPrecio {
  final int id;
  final int zonaId;          // FK a zonas_entrega — OBLIGATORIO
  String coloniaTex;
  String zonaForzada;        // texto redundante para UI
  bool dificultadAlta;
  String? motivo;
  bool activo;

  ExcepcionPrecio({
    required this.id,
    required this.zonaId,
    required this.coloniaTex,
    required this.zonaForzada,
    required this.dificultadAlta,
    this.motivo,
    required this.activo,
  });

  factory ExcepcionPrecio.fromMap(Map<String, dynamic> m) {
    final zonaMap = m['zonas_entrega'] as Map<String, dynamic>?;
    return ExcepcionPrecio(
      id:             m['id'] as int,
      zonaId:         m['zona_id'] as int,
      coloniaTex:     m['colonia_texto'] as String,
      zonaForzada:    zonaMap?['nombre'] as String? ?? m['zona_forzada'] as String? ?? 'ROJA',
      dificultadAlta: m['dificultad_alta'] as bool? ?? false,
      motivo:         m['motivo'] as String?,
      activo:         m['activo'] as bool? ?? true,
    );
  }

  Color get zonaColor {
    switch (zonaForzada.toUpperCase()) {
      case 'VERDE':    return Colors.green;
      case 'AZUL':     return Colors.blue;
      case 'AMARILLA': return Colors.orange;
      case 'ROJA':     return Colors.red;
      default:         return Colors.purple;
    }
  }

  String get zonaEmoji {
    switch (zonaForzada.toUpperCase()) {
      case 'VERDE':    return '🟢';
      case 'AZUL':     return '🔵';
      case 'AMARILLA': return '🟡';
      case 'ROJA':     return '🔴';
      default:         return '🟣';
    }
  }
}

// ── Providers ─────────────────────────────────────────────────────────────────
final excepcionesProvider = FutureProvider.autoDispose<List<ExcepcionPrecio>>((ref) async {
  final data = await supabase
      .from('excepciones_precio')
      .select('*, zonas_entrega(nombre, color_emoji)')
      .order('zona_id')
      .order('colonia_texto');
  return (data as List).map((m) => ExcepcionPrecio.fromMap(m as Map<String, dynamic>)).toList();
});

final zonasNombresProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final data = await supabase
      .from('zonas_entrega')
      .select('id, nombre, color_emoji, precio, precio_max')
      .eq('activo', true)
      .order('orden');
  return List<Map<String, dynamic>>.from(data);
});

// ── Pantalla principal ────────────────────────────────────────────────────────
class ExcepcionesPrecioScreen extends ConsumerStatefulWidget {
  const ExcepcionesPrecioScreen({super.key});

  @override
  ConsumerState<ExcepcionesPrecioScreen> createState() => _ExcepcionesPrecioScreenState();
}

class _ExcepcionesPrecioScreenState extends ConsumerState<ExcepcionesPrecioScreen> {
  String _filtro = 'todas';

  @override
  Widget build(BuildContext context) {
    final excAsync = ref.watch(excepcionesProvider);
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        title: const Text('Excepciones de Precio'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle_outline_rounded),
            tooltip: 'Nueva Excepción',
            onPressed: () => _mostrarFormulario(context, null),
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Info banner ─────────────────────────────────────────────────────
          Container(
            margin: const EdgeInsets.all(12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.amber.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.amber.withValues(alpha: 0.4)),
            ),
            child: const Row(
              children: [
                Icon(Icons.info_outline_rounded, color: Colors.amber, size: 20),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '🚨 Prioridad máxima sobre Google Maps.\nSi la dirección contiene el texto → este precio manda siempre.',
                    style: TextStyle(fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
          // ── Filtros ─────────────────────────────────────────────────────────
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: ['todas', 'VERDE', 'AZUL', 'AMARILLA', 'ROJA', '⚠️ Dif. Alta'].map((f) {
                final isSelected = _filtro == f;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(f),
                    selected: isSelected,
                    onSelected: (_) => setState(() => _filtro = f),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 8),
          // ── Lista ───────────────────────────────────────────────────────────
          Expanded(
            child: excAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline_rounded, size: 48, color: Colors.redAccent),
                    const SizedBox(height: 12),
                    Text('Error: $e', textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: () => ref.invalidate(excepcionesProvider),
                      icon: const Icon(Icons.refresh_rounded),
                      label: const Text('Reintentar'),
                    ),
                  ],
                ),
              ),
              data: (excepciones) {
                final filtradas = _filtrar(excepciones);
                if (filtradas.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.block_rounded, size: 64,
                            color: theme.colorScheme.onSurface.withValues(alpha: 0.2)),
                        const SizedBox(height: 16),
                        Text(
                          excepciones.isEmpty
                              ? 'Sin excepciones configuradas'
                              : 'Sin resultados para "$_filtro"',
                          style: TextStyle(color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
                        ),
                        if (excepciones.isEmpty) ...[
                          const SizedBox(height: 16),
                          FilledButton.icon(
                            onPressed: () => _mostrarFormulario(context, null),
                            icon: const Icon(Icons.add_rounded),
                            label: const Text('Crear Primera Excepción'),
                          ),
                        ],
                      ],
                    ),
                  );
                }
                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(excepcionesProvider),
                  child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: filtradas.length,
                    itemBuilder: (_, i) => _ExcepcionCard(
                      exc: filtradas[i],
                      onChanged: () => ref.invalidate(excepcionesProvider),
                      onEdit: () => _mostrarFormulario(context, filtradas[i]),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  List<ExcepcionPrecio> _filtrar(List<ExcepcionPrecio> lista) {
    if (_filtro == 'todas') return lista;
    if (_filtro == '⚠️ Dif. Alta') return lista.where((e) => e.dificultadAlta).toList();
    return lista.where((e) => e.zonaForzada.toUpperCase() == _filtro).toList();
  }

  void _mostrarFormulario(BuildContext context, ExcepcionPrecio? exc) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _ExcepcionFormSheet(
        excExistente: exc,
        onSaved: () {
          Navigator.pop(ctx);
          ref.invalidate(excepcionesProvider);
        },
      ),
    );
  }
}

// ── Tarjeta de excepción ──────────────────────────────────────────────────────
class _ExcepcionCard extends StatelessWidget {
  final ExcepcionPrecio exc;
  final VoidCallback onChanged;
  final VoidCallback onEdit;

  const _ExcepcionCard({required this.exc, required this.onChanged, required this.onEdit});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = exc.zonaColor;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: exc.dificultadAlta
              ? Colors.orange.withValues(alpha: 0.5)
              : color.withValues(alpha: 0.2),
          width: exc.dificultadAlta ? 2 : 1,
        ),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Container(
          width: 44, height: 44,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(child: Text(exc.zonaEmoji, style: const TextStyle(fontSize: 22))),
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(exc.coloniaTex,
                  style: const TextStyle(fontWeight: FontWeight.bold)),
            ),
            if (exc.dificultadAlta)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.orange.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.orange.withValues(alpha: 0.5)),
                ),
                child: const Text('⚠️ Dif. Alta',
                    style: TextStyle(fontSize: 11, color: Colors.orange, fontWeight: FontWeight.w600)),
              ),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text('${exc.zonaEmoji} Zona ${exc.zonaForzada}',
                style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 13)),
            if (exc.dificultadAlta)
              Text('💰 Cobra precio_max automáticamente',
                  style: TextStyle(fontSize: 11,
                      color: Colors.orange.withValues(alpha: 0.8))),
            if (exc.motivo != null)
              Text('📝 ${exc.motivo}',
                  style: TextStyle(fontSize: 12,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.55))),
          ],
        ),
        trailing: PopupMenuButton<String>(
          icon: Icon(Icons.more_vert_rounded,
              color: theme.colorScheme.onSurface.withValues(alpha: 0.5)),
          itemBuilder: (_) => [
            const PopupMenuItem(value: 'edit',
                child: Row(children: [Icon(Icons.edit_rounded, size: 18), SizedBox(width: 8), Text('Editar')])),
            PopupMenuItem(
              value: 'toggle',
              child: Row(children: [
                Icon(exc.activo ? Icons.visibility_off_rounded : Icons.visibility_rounded, size: 18),
                const SizedBox(width: 8),
                Text(exc.activo ? 'Desactivar' : 'Activar'),
              ]),
            ),
            const PopupMenuItem(value: 'delete',
                child: Row(children: [
                  Icon(Icons.delete_outline_rounded, color: Colors.red, size: 18),
                  SizedBox(width: 8),
                  Text('Eliminar', style: TextStyle(color: Colors.red)),
                ])),
          ],
          onSelected: (action) => _menuAction(context, action),
        ),
      ),
    );
  }

  void _menuAction(BuildContext context, String action) async {
    switch (action) {
      case 'edit':
        onEdit();
        break;
      case 'toggle':
        await supabase.from('excepciones_precio').update({'activo': !exc.activo}).eq('id', exc.id);
        onChanged();
        break;
      case 'delete':
        final ok = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('¿Eliminar excepción?'),
            content: Text('Se eliminará la regla para "${exc.coloniaTex}". El bot usará cálculo automático.'),
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
          await supabase.from('excepciones_precio').delete().eq('id', exc.id);
          onChanged();
        }
    }
  }
}

// ── Formulario crear/editar excepción ─────────────────────────────────────────
class _ExcepcionFormSheet extends ConsumerStatefulWidget {
  final ExcepcionPrecio? excExistente;
  final VoidCallback onSaved;
  const _ExcepcionFormSheet({this.excExistente, required this.onSaved});

  @override
  ConsumerState<_ExcepcionFormSheet> createState() => _ExcepcionFormSheetState();
}

class _ExcepcionFormSheetState extends ConsumerState<_ExcepcionFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _coloniaCtrl;
  late TextEditingController _motivoCtrl;
  int? _zonaIdSeleccionada;      // ID del FK — obligatorio
  String _zonaNombreUI = 'ROJA'; // nombre para display en tarjeta
  bool _dificultadAlta = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.excExistente;
    _coloniaCtrl = TextEditingController(text: e?.coloniaTex ?? '');
    _motivoCtrl  = TextEditingController(text: e?.motivo ?? '');
    _zonaIdSeleccionada = e?.zonaId;
    _zonaNombreUI       = e?.zonaForzada ?? 'ROJA';
    _dificultadAlta     = e?.dificultadAlta ?? false;
  }

  @override
  void dispose() {
    _coloniaCtrl.dispose();
    _motivoCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final zonasAsync = ref.watch(zonasNombresProvider);

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
              Row(
                children: [
                  Icon(
                    widget.excExistente == null ? Icons.add_circle_outline_rounded : Icons.edit_rounded,
                    color: Colors.orange,
                  ),
                  const SizedBox(width: 10),
                  Text(
                    widget.excExistente == null ? 'Nueva Excepción' : 'Editar Excepción',
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text('Prioridad máxima — cancela cualquier cálculo de Google Maps.',
                  style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withValues(alpha: 0.5))),
              const SizedBox(height: 20),

              // Nombre colonia
              TextFormField(
                controller: _coloniaCtrl,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Nombre de Colonia / Lugar *',
                  hintText: 'ej: Chichimá Acapetahua, Gas Villatoro...',
                  prefixIcon: Icon(Icons.location_on_rounded),
                  helperText: 'Se busca con fuzzy match — ignora acentos y mayúsculas',
                ),
                validator: (v) => v == null || v.trim().isEmpty ? 'Campo requerido' : null,
              ),
              const SizedBox(height: 16),

              // Zona forzada — guarda ID
              zonasAsync.when(
                loading: () => const LinearProgressIndicator(),
                error: (_, __) => const Text('Error cargando zonas'),
                data: (zonas) => DropdownButtonFormField<int>(
                  value: _zonaIdSeleccionada,
                  decoration: const InputDecoration(
                    labelText: 'Zona Forzada *',
                    prefixIcon: Icon(Icons.map_rounded),
                    helperText: 'El precio se jala de esta zona via ID (no puede quedar sin seleccionar)',
                  ),
                  items: zonas.map((z) {
                    final emoji  = z['color_emoji'] as String? ?? '';
                    final nombre = z['nombre'] as String;
                    final zId    = z['id'] as int;
                    final precio = z['precio_max'] != null
                        ? '\$${z['precio']}–\$${z['precio_max']}'
                        : '\$${z['precio']}';
                    return DropdownMenuItem<int>(
                      value: zId,
                      child: Text('$emoji $nombre — $precio'),
                    );
                  }).toList(),
                  validator: (v) => v == null ? '⚠️ Debes seleccionar una zona' : null,
                  onChanged: (id) {
                    if (id == null) return;
                    final zona = zonas.firstWhere((z) => z['id'] == id);
                    setState(() {
                      _zonaIdSeleccionada = id;
                      _zonaNombreUI = zona['nombre'] as String;
                    });
                  },
                ),
              ),
              const SizedBox(height: 16),

              // Dificultad Alta
              Container(
                decoration: BoxDecoration(
                  color: _dificultadAlta
                      ? Colors.orange.withValues(alpha: 0.1)
                      : theme.colorScheme.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _dificultadAlta
                        ? Colors.orange.withValues(alpha: 0.5)
                        : theme.colorScheme.onSurface.withValues(alpha: 0.12),
                  ),
                ),
                child: SwitchListTile(
                  title: const Text('⚠️ Dificultad Alta',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: const Text(
                      'Activa esto si es terracería, sin retorno o zona muy difícil.\n'
                      'El bot cobrará precio_max de la zona en lugar del precio base.',
                      style: TextStyle(fontSize: 12)),
                  value: _dificultadAlta,
                  activeColor: Colors.orange,
                  onChanged: (v) => setState(() => _dificultadAlta = v),
                ),
              ),
              const SizedBox(height: 16),

              // Motivo
              TextFormField(
                controller: _motivoCtrl,
                textCapitalization: TextCapitalization.sentences,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Motivo (nota interna)',
                  hintText: 'ej: Terracería, Sin acceso en lluvia, Muy lejos',
                  prefixIcon: Icon(Icons.note_rounded),
                ),
              ),
              const SizedBox(height: 24),

              // Guardar
              FilledButton.icon(
                onPressed: _saving ? null : _guardar,
                icon: _saving
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.save_rounded),
                label: Text(_saving ? 'Guardando...' : 'Guardar Excepción'),
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.orange,
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
    // Validación extra de seguridad: zona_id nunca puede ser null
    if (_zonaIdSeleccionada == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('⚠️ Selecciona una zona del catálogo'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }
    setState(() => _saving = true);

    final payload = <String, dynamic>{
      'colonia_texto':   _coloniaCtrl.text.trim().toLowerCase(),
      'zona_id':         _zonaIdSeleccionada,   // FK obligatoria — nunca null
      'zona_forzada':    _zonaNombreUI,          // redundante, para legibilidad
      'dificultad_alta': _dificultadAlta,
      'motivo':          _motivoCtrl.text.trim().isEmpty ? null : _motivoCtrl.text.trim(),
      'activo':          true,
    };

    try {
      if (widget.excExistente != null) {
        await supabase.from('excepciones_precio').update(payload).eq('id', widget.excExistente!.id);
      } else {
        await supabase.from('excepciones_precio').insert(payload);
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

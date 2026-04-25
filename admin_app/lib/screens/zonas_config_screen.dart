import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../services/zonas_service.dart';

class ZonasConfigScreen extends ConsumerStatefulWidget {
  const ZonasConfigScreen({super.key});

  @override
  ConsumerState<ZonasConfigScreen> createState() => _ZonasConfigScreenState();
}

class _ZonasConfigScreenState extends ConsumerState<ZonasConfigScreen> {
  Map<String, dynamic>? selectedRestaurant;
  List<Map<String, dynamic>> zonas = [];
  bool isLoading = false;

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<Map<String, dynamic>>> restsAsync = ref.watch(restaurantesConfigProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Zonas e Importes'),
        actions: [
          if (selectedRestaurant != null)
            IconButton(
              icon: const Icon(Icons.add_location_alt_rounded),
              onPressed: () => _mostrarDialogoNuevaZona(context),
            ),
        ],
      ),
      body: Column(
        children: [
          _buildRestaurantSelector(restsAsync),
          const Divider(height: 1),
          Expanded(
            child: selectedRestaurant == null
                ? _buildEmptyState()
                : _buildZonasList(),
          ),
        ],
      ),
    );
  }

  Widget _buildRestaurantSelector(AsyncValue<List<Map<String, dynamic>>> restsAsync) {
    return restsAsync.when(
      loading: () => const LinearProgressIndicator(),
      error: (e, _) => Text('Error: $e'),
      data: (rests) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          color: Theme.of(context).cardColor.withOpacity(0.5),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<Map<String, dynamic>>(
              isExpanded: true,
              hint: const Text('Selecciona un Restaurante'),
              value: selectedRestaurant,
              items: rests.map((r) => DropdownMenuItem(
                value: r,
                child: Text(r['nombre'], style: const TextStyle(fontWeight: FontWeight.bold)),
              )).toList(),
              onChanged: (val) {
                setState(() {
                  selectedRestaurant = val;
                  _cargarZonas();
                });
              },
            ),
          ),
        );
      },
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.storefront_rounded, size: 64, color: Colors.grey.withOpacity(0.3)),
          const SizedBox(height: 16),
          const Text('Selecciona un restaurante para\nconfigurar sus zonas de envío',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey)),
        ],
      ),
    );
  }

  Widget _buildZonasList() {
    if (isLoading) return const Center(child: CircularProgressIndicator());
    if (zonas.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('No hay zonas configuradas.'),
            TextButton.icon(
              onPressed: () => _mostrarDialogoNuevaZona(context),
              icon: const Icon(Icons.add),
              label: const Text('Agregar primera zona'),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: zonas.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (_, i) {
        final z = zonas[i];
        final colonia = z['colonias']['nombre'];
        final aplicaHF = z['aplica_hora_feliz'] == true;
        final precio = z['precio_estandar'];

        return Container(
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: aplicaHF ? Colors.orange.withOpacity(0.3) : Colors.transparent),
          ),
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            leading: CircleAvatar(
              backgroundColor: (aplicaHF ? Colors.orange : Colors.blue).withOpacity(0.1),
              child: Icon(
                aplicaHF ? Icons.local_fire_department_rounded : Icons.location_on_rounded,
                color: aplicaHF ? Colors.orange : Colors.blue,
              ),
            ),
            title: Text(colonia, style: const TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Text(aplicaHF ? '🔥 Hora Feliz activa (\$35)' : 'Precio fijo: \$${precio ?? 45}'),
            trailing: IconButton(
              icon: const Icon(Icons.delete_outline_rounded, color: Colors.redAccent),
              onPressed: () => _confirmarBorrado(z['id']),
            ),
          ),
        );
      },
    );
  }

  Future<void> _cargarZonas() async {
    if (selectedRestaurant == null) return;
    setState(() => isLoading = true);
    try {
      final data = await ref.read(zonasServiceProvider).getZonasPorRestaurante(
            selectedRestaurant!['telefono'] ?? '',
          );
      setState(() {
        zonas = data;
        isLoading = false;
      });
    } catch (e) {
      debugPrint('Error cargando zonas: $e');
      setState(() => isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString().split(':').last.trim()}'),
            backgroundColor: Colors.redAccent,
          ),
        );
      }
    }
  }

  Future<void> _confirmarBorrado(String id) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Eliminar zona?'),
        content: const Text('El bot dejará de usar esta tarifa especial.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Eliminar', style: TextStyle(color: Colors.red))),
        ],
      ),
    );

    if (confirmar == true) {
      await ref.read(zonasServiceProvider).deleteZona(id);
      _cargarZonas();
    }
  }

  void _mostrarDialogoNuevaZona(BuildContext context) {
    if (selectedRestaurant == null || selectedRestaurant!['telefono'] == null) {
       ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Este restaurante no tiene teléfono configurado. Ve a Configuración y edítalo.')));
       return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => _NuevaZonaSheet(
        restauranteTelefono: selectedRestaurant!['telefono'],
        onSaved: () {
          Navigator.pop(ctx);
          _cargarZonas();
        },
      ),
    );
  }
}

class _NuevaZonaSheet extends ConsumerStatefulWidget {
  final String restauranteTelefono;
  final VoidCallback onSaved;

  const _NuevaZonaSheet({required this.restauranteTelefono, required this.onSaved});

  @override
  ConsumerState<_NuevaZonaSheet> createState() => _NuevaZonaSheetState();
}

class _NuevaZonaSheetState extends ConsumerState<_NuevaZonaSheet> {
  String? selectedColoniaId;
  bool aplicaHoraFeliz = true;
  final precioCtrl = TextEditingController(text: '45');

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<Map<String, dynamic>>> masterColonias = ref.watch(coloniasMasterProvider);

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 20,
        right: 20,
        top: 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Configurar Zona', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          
          masterColonias.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: LinearProgressIndicator(),
            ),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(8.0),
              child: Text('Error cargando colonias: $e', style: const TextStyle(color: Colors.redAccent)),
            ),
            data: (cols) {
              if (cols.isEmpty) {
                return _buildNoColoniasState(context);
              }
              return DropdownButtonFormField<String>(
                decoration: const InputDecoration(labelText: 'Selecciona Colonia / Barrio'),
                items: cols.map((c) => DropdownMenuItem(
                  value: c['id'] as String,
                  child: Text(c['nombre']),
                )).toList(),
                onChanged: (val) => setState(() => selectedColoniaId = val),
              );
            },
          ),
          
          const SizedBox(height: 16),
          SwitchListTile(
            title: const Text('¿Aplica Hora Feliz?'),
            subtitle: const Text('Si está activo, cobrará \$35 en el horario programado'),
            value: aplicaHoraFeliz,
            activeColor: Colors.orange,
            onChanged: (val) => setState(() => aplicaHoraFeliz = val),
          ),
          
          if (!aplicaHoraFeliz) ...[
            const SizedBox(height: 12),
            TextField(
              controller: precioCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Precio Estándar / Fijo',
                prefixText: '\$ ',
                helperText: 'Establece el precio que se cobrará siempre',
              ),
            ),
          ],
          
          const SizedBox(height: 24),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
              backgroundColor: Theme.of(context).colorScheme.primary,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: _guardar,
            child: const Text('Guardar Configuración', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _buildNoColoniasState(BuildContext context) {
    return Card(
      color: Colors.orange.withOpacity(0.1),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15), side: const BorderSide(color: Colors.orangeAccent)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            const Icon(Icons.location_off_rounded, color: Colors.orange),
            const SizedBox(height: 10),
            const Text('No hay colonias en el catálogo', style: TextStyle(fontWeight: FontWeight.bold)),
            const Text('Primero debes registrar los nombres de las colonias/barrios donde entregas.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12)),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: _dialogoNuevaColoniaMaster,
              icon: const Icon(Icons.add_location_alt_rounded),
              label: const Text('Registrar Primera Colonia'),
            ),
          ],
        ),
      ),
    );
  }

  void _dialogoNuevaColoniaMaster() {
    final ctrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Nueva Colonia Maestro'),
        content: TextField(controller: ctrl, decoration: const InputDecoration(labelText: 'Nombre de la Colonia (ej: Centro)')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          ElevatedButton(
            onPressed: () async {
              if (ctrl.text.trim().isEmpty) return;
              await ref.read(zonasServiceProvider).createColonia(ctrl.text.trim());
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('Registrar'),
          ),
        ],
      ),
    );
  }

  void _guardar() async {
    if (selectedColoniaId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Selecciona una colonia primero')));
      return;
    }
    
    await ref.read(zonasServiceProvider).upsertZona(
      restauranteTelefono: widget.restauranteTelefono,
      coloniaId: selectedColoniaId!,
      aplicaHoraFeliz: aplicaHoraFeliz,
      precioEstandar: aplicaHoraFeliz ? null : double.tryParse(precioCtrl.text),
    );
    
    widget.onSaved();
  }
}

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../services/gasto_service.dart';
import '../services/repartidor_service.dart';
import '../core/user_role.dart';
import '../core/supabase_config.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

final dateRangeProvider = StateProvider<DateTimeRange?>((ref) => null);

final gastosProvider = FutureProvider.autoDispose((ref) async {
  final isAdmin = ref.read(isAdminProvider);
  final dateRange = ref.watch(dateRangeProvider);
  
  if (isAdmin) {
    return ref.read(gastoServiceProvider).getGastos(startDate: dateRange?.start, endDate: dateRange?.end);
  } else {
    final user = supabase.auth.currentUser;
    if (user == null) return <Map<String, dynamic>>[];
    final myRepId = await ref.read(repartidorServiceProvider).getRepartidorIdByUserId(user.id);
    if (myRepId == null) return <Map<String, dynamic>>[];
    return ref.read(gastoServiceProvider).getGastos(repartidorId: myRepId, startDate: dateRange?.start, endDate: dateRange?.end);
  }
});



class GastosScreen extends ConsumerWidget {
  const GastosScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gastosAsync = ref.watch(gastosProvider);
    final isAdmin = ref.watch(isAdminProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text('Bitácora de Gastos'),
        actions: [
          if (isAdmin)
            IconButton(
              icon: Icon(Icons.two_wheeler_rounded),
              onPressed: () => _agregarMoto(context, ref),
              tooltip: 'Registrar Moto',
            ),
          IconButton(
            icon: Icon(Icons.date_range_rounded),
            tooltip: 'Filtrar Fechas',
            onPressed: () async {
              final val = await showDateRangePicker(
                context: context,
                firstDate: DateTime(2023),
                lastDate: DateTime.now(),
                initialDateRange: ref.read(dateRangeProvider),
                builder: (context, child) {
                  return Theme(
                    data: Theme.of(context).copyWith(
                      colorScheme: ColorScheme.dark(
                        primary: const Color(0xFFE11D48),
                        onPrimary: Colors.white,
                        surface: const Color(0xFF1E1E1E),
                        onSurface: Colors.white,
                      ),
                    ),
                    child: child!,
                  );
                },
              );
              if (val != null) {
                ref.read(dateRangeProvider.notifier).state = val;
              }
            },
          ),
          if (ref.watch(dateRangeProvider) != null)
            IconButton(
              icon: Icon(Icons.clear_rounded, color: const Color(0xFFF59E0B)),
              onPressed: () => ref.read(dateRangeProvider.notifier).state = null,
            ),
          IconButton(
            icon: Icon(Icons.refresh_rounded),
            onPressed: () => ref.refresh(gastosProvider),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _agregarGasto(context, ref, isAdmin),
        icon: Icon(Icons.add_rounded, color: Colors.white),
        backgroundColor: const Color(0xFFE11D48),
        label: Text(isAdmin ? 'Registrar Gasto' : 'Subir Ticket', style: const TextStyle(color: Colors.white)),
      ),
      body: gastosAsync.when(
        loading: () => Center(child: CircularProgressIndicator(color: Color(0xFFFF6B35))),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (gastos) {
          if (gastos.isEmpty) {
            return Center(
              child: Text('Sin gastos registrados', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
            );
          }

          final total = gastos.where((g) => g['estado'] == 'aprobado').fold<double>(0.0, (sum, g) => sum + (double.tryParse(g['monto'].toString()) ?? 0.0));

          return Column(
            children: [
              Container(
                margin: const EdgeInsets.all(16),
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFE11D48), Color(0xFF9F1239)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFFE11D48).withOpacity(0.3),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    Icon(Icons.account_balance_wallet_rounded, color: Theme.of(context).colorScheme.onSurface, size: 40),
                    SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Total Gastos Aprobados', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7), fontSize: 13, fontWeight: FontWeight.bold)),
                          Text('\$${total.toStringAsFixed(2)}', style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontSize: 32, fontWeight: FontWeight.w900, letterSpacing: -1)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                  itemCount: gastos.length,
                  separatorBuilder: (_, __) => SizedBox(height: 12),
                  itemBuilder: (ctx, i) {
                    final g = gastos[i];
                    final isGas = g['concepto'].toString().toLowerCase().contains('gas');
                    final isPendiente = g['estado'] == 'pendiente';
                    final isRechazado = g['estado'] == 'rechazado';
                    final onSurface = Theme.of(context).colorScheme.onSurface;
                    
                    Color statusColor = isPendiente ? const Color(0xFFF59E0B) : (isRechazado ? Colors.grey : const Color(0xFFE11D48));

                    return Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Theme.of(context).cardColor,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: isPendiente ? statusColor.withOpacity(0.5) : Colors.white10),
                      ),
                      child: InkWell(
                        onTap: () => _mostrarDetalleGasto(context, g),
                        borderRadius: BorderRadius.circular(16),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: (isGas ? const Color(0xFFF59E0B) : const Color(0xFF3B82F6)).withOpacity(0.2),
                                shape: BoxShape.circle,
                              ),
                              child: Icon(
                                isGas ? Icons.local_gas_station_rounded : Icons.build_rounded,
                                color: isGas ? const Color(0xFFF59E0B) : const Color(0xFF3B82F6),
                              ),
                            ),
                            SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Text(g['concepto'], style: TextStyle(
                                        color: isRechazado ? onSurface.withValues(alpha: 0.38) : onSurface, 
                                        fontWeight: FontWeight.bold, 
                                        fontSize: 16,
                                        decoration: isRechazado ? TextDecoration.lineThrough : null,
                                      )),
                                      if (isPendiente) ...[
                                        const SizedBox(width: 8),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(color: const Color(0xFFF59E0B), borderRadius: BorderRadius.circular(4)),
                                          child: const Text('Por Aprobar', style: TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold)),
                                        ),
                                      ]
                                    ],
                                  ),
                                  Text(g['fecha'].toString().split('T')[0], style: TextStyle(color: onSurface.withValues(alpha: 0.38), fontSize: 12)),
                                  if (g['comprobante_url'] != null) ...[
                                    const SizedBox(width: 8),
                                    Icon(Icons.image_search_rounded, size: 14, color: onSurface.withValues(alpha: 0.38)),
                                  ]
                                ],
                              ),
                            ),
                            if (isAdmin && isPendiente) ...[
                              IconButton(
                                icon: Icon(Icons.check_circle_rounded, color: Color(0xFF38EF7D)),
                                onPressed: () async {
                                  await ref.read(gastoServiceProvider).actGastoEstado(g['id'], 'aprobado');
                                  ref.refresh(gastosProvider);
                                },
                              ),
                              IconButton(
                                icon: Icon(Icons.cancel_rounded, color: Color(0xFFEF4444)),
                                onPressed: () async {
                                  await ref.read(gastoServiceProvider).actGastoEstado(g['id'], 'rechazado');
                                  ref.refresh(gastosProvider);
                                },
                              ),
                            ] else ...[
                              Text(
                                '-\$${g['monto']}',
                                style: TextStyle(color: isRechazado ? onSurface.withValues(alpha: 0.38) : statusColor, fontWeight: FontWeight.w900, fontSize: 18),
                              ),
                            ]
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
      ),
    );
  }

  Future<void> _agregarMoto(BuildContext context, WidgetRef ref) async {
    final placaCtrl = TextEditingController();
    final aliasCtrl = TextEditingController();
    
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Theme.of(context).cardColor,
        title: Text('Nueva Motocicleta', style: TextStyle(color: Theme.of(context).colorScheme.onSurface)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: placaCtrl,
              style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
              decoration: InputDecoration(labelText: 'Placas (Ej: X1A2B)'),
            ),
            SizedBox(height: 16),
            TextField(
              controller: aliasCtrl,
              style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
              decoration: InputDecoration(labelText: 'Apodo (Ej: Moto Roja)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text('Cancelar', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5)))),
          ElevatedButton(
            onPressed: () async {
              if (placaCtrl.text.isEmpty || aliasCtrl.text.isEmpty) return;
              final error = await ref.read(gastoServiceProvider).addMoto(placaCtrl.text, aliasCtrl.text);
              if (error == null && ctx.mounted) {
                Navigator.pop(ctx);
                ref.invalidate(motosProvider);
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Moto agregada correctamente')));
              } else if (ctx.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $error'), backgroundColor: Colors.red));
              }
            },
            child: Text('Registrar'),
          )
        ],
      ),
    );
    placaCtrl.dispose();
    aliasCtrl.dispose();
  }

  Future<void> _agregarGasto(BuildContext context, WidgetRef ref, bool isAdmin) async {
    final conceptoCtrl = TextEditingController();
    final montoCtrl = TextEditingController();
    String tipoGasto = 'otro';
    String? selectedMotoId;
    String? selectedRepId;
    File? tempFile;
    String categoria = 'flota';

    final user = supabase.auth.currentUser;
    final String? myRepId = user != null ? await ref.read(repartidorServiceProvider).getRepartidorIdByUserId(user.id) : null;
    
    final allMotos = await ref.read(gastoServiceProvider).getMotos();
    final allReps = await ref.read(repartidorServiceProvider).getRepartidores();

    // Lógica de filtrado para Repartidor
    List<Map<String, dynamic>> visibleReps = allReps;
    List<Map<String, dynamic>> visibleMotos = allMotos;
    
    if (!isAdmin && myRepId != null) {
      selectedRepId = myRepId;
      final myProfile = allReps.firstWhere((r) => r['id'].toString() == myRepId, orElse: () => {});
      if (myProfile['moto_id'] != null) {
        selectedMotoId = myProfile['moto_id'].toString();
        visibleMotos = allMotos.where((m) => m['id'].toString() == selectedMotoId).toList();
      } else {
        visibleMotos = [];
      }
      visibleReps = allReps.where((r) => r['id'].toString() == myRepId).toList();
    }

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          backgroundColor: Theme.of(context).cardColor,
          title: Text(isAdmin ? 'Nuevo Gasto' : 'Subir Gasto (Pendiente)', style: TextStyle(color: Theme.of(context).colorScheme.onSurface)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (isAdmin) ...[
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Flota', style: TextStyle(color: categoria == 'flota' ? const Color(0xFFE11D48) : Colors.white54)),
                      Switch(
                        value: categoria == 'caja_chica',
                        onChanged: (val) {
                          setState(() {
                            categoria = val ? 'caja_chica' : 'flota';
                            if (categoria == 'caja_chica') {
                              selectedMotoId = null;
                              selectedRepId = null;
                            }
                          });
                        },
                        activeColor: const Color(0xFF60A5FA),
                        inactiveThumbColor: const Color(0xFFE11D48),
                      ),
                      Text('Caja Chica', style: TextStyle(color: categoria == 'caja_chica' ? const Color(0xFF60A5FA) : Colors.white54)),
                    ],
                  ),
                  SizedBox(height: 16),
                ],
                TextField(
                  controller: conceptoCtrl,
                  style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
                  decoration: InputDecoration(labelText: 'Concepto (Ej: Gasolina)', labelStyle: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
                ),
                SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: tipoGasto,
                  dropdownColor: Theme.of(context).cardColor,
                  style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
                  decoration: InputDecoration(labelText: 'Tipo de Gasto', labelStyle: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
                  items: const [
                    DropdownMenuItem(value: 'gasolina', child: Text('Gasolina')),
                    DropdownMenuItem(value: 'mantenimiento', child: Text('Mantenimiento')),
                    DropdownMenuItem(value: 'repuesto', child: Text('Repuesto/Refacción')),
                    DropdownMenuItem(value: 'otro', child: Text('Otro')),
                  ],
                  onChanged: (val) => setState(() => tipoGasto = val!),
                ),
                SizedBox(height: 16),
                if (categoria == 'flota') ...[
                  DropdownButtonFormField<String?>(
                    value: selectedMotoId,
                    dropdownColor: Theme.of(context).cardColor,
                    style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
                    decoration: InputDecoration(labelText: 'Vehículo (Asignado)', labelStyle: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('Ninguna')),
                      ...visibleMotos.map((m) => DropdownMenuItem(
                        value: m['id'].toString(),
                        child: Text('${m['alias'] ?? m['placa']}'),
                      )),
                    ],
                    onChanged: isAdmin ? (val) => setState(() => selectedMotoId = val) : null,
                  ),
                  SizedBox(height: 16),
                  DropdownButtonFormField<String?>(
                    value: selectedRepId,
                    dropdownColor: Theme.of(context).cardColor,
                    style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
                    decoration: InputDecoration(labelText: 'Vincular a Repartidor', labelStyle: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('Ninguno')),
                      ...visibleReps.map((r) => DropdownMenuItem(
                        value: r['id'].toString(),
                        child: Text('${r['alias'] ?? r['nombre']}'),
                      )),
                    ],
                    onChanged: isAdmin ? (val) => setState(() => selectedRepId = val) : null,
                  ),
                  SizedBox(height: 16),
                ],
                _ImageSelectorDashboard(onImage: (file) => setState(() => tempFile = file)),
                SizedBox(height: 12),
                TextField(
                  controller: montoCtrl,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
                  decoration: InputDecoration(labelText: 'Monto (\$)', labelStyle: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: Text('Cancelar', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5)))),
            ElevatedButton(
              onPressed: () async {
                final monto = double.tryParse(montoCtrl.text);
                if (conceptoCtrl.text.isEmpty || monto == null) return;

                String? url;
                if (tempFile != null) {
                  url = await ref.read(repartidorServiceProvider).uploadComprobante(tempFile!);
                }

                final ok = await ref.read(gastoServiceProvider).addGasto(
                  conceptoCtrl.text, 
                  monto, 
                  isAdmin: isAdmin,
                  motoId: selectedMotoId,
                  repartidorId: selectedRepId,
                  tipoGasto: tipoGasto,
                  comprobanteUrl: url,
                  categoria: categoria,
                );
                if (ok && ctx.mounted) {
                  Navigator.pop(ctx);
                  ref.refresh(gastosProvider);
                } else if (ctx.mounted) {
                  ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content: Text('Error al enviar el gasto al servidor. Comprueba tu red.'), backgroundColor: Color(0xFFE11D48)));
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFE11D48)),
              child: Text('Guardar'),
            ),
          ],
        ),
      ),
    );
  }

  void _mostrarDetalleGasto(BuildContext context, Map<String, dynamic> g) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final repartidorData = g['repartidores'];
    final motoData = g['motos'];
    final repartidor = repartidorData != null ? '${repartidorData['alias'] ?? repartidorData['nombre']}' : 'N/A';
    final moto = motoData != null ? '${motoData['alias'] ?? motoData['placa']}' : 'N/A';
    final isRechazado = g['estado'] == 'rechazado';
    final isPendiente = g['estado'] == 'pendiente';

    showModalBottomSheet(
      context: context,
      backgroundColor: Theme.of(context).cardColor,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Detalles del Gasto', style: TextStyle(color: onSurface, fontSize: 20, fontWeight: FontWeight.bold)),
                if (g['comprobante_url'] != null)
                  IconButton(
                    icon: const Icon(Icons.image_rounded, color: Color(0xFFE11D48)),
                    onPressed: () {},
                  ),
              ],
            ),
            const SizedBox(height: 20),
            _DetalleRow(label: 'Concepto:', value: g['concepto'], onSurface: onSurface),
            _DetalleRow(label: 'Monto:', value: '\$${g['monto']}', onSurface: onSurface, color: const Color(0xFFE11D48)),
            _DetalleRow(label: 'Repartidor:', value: repartidor, onSurface: onSurface),
            _DetalleRow(label: 'Vehículo:', value: moto, onSurface: onSurface),
            _DetalleRow(label: 'Fecha:', value: g['fecha'].toString().split('T')[0], onSurface: onSurface),
            _DetalleRow(
              label: 'Estado:', 
              value: isPendiente ? 'Pendiente' : (isRechazado ? 'Rechazado' : 'Aprobado'), 
              onSurface: onSurface,
              color: isPendiente ? const Color(0xFFF59E0B) : (isRechazado ? Colors.grey : const Color(0xFF38EF7D)),
            ),
            if (g['comprobante_url'] != null) ...[
              const SizedBox(height: 16),
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.network(g['comprobante_url'], height: 150, width: double.infinity, fit: BoxFit.cover),
              ),
            ],
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cerrar'),
              ),
            )
          ],
        ),
      ),
    );
  }
}

class _DetalleRow extends StatelessWidget {
  final String label;
  final String value;
  final Color onSurface;
  final Color? color;
  const _DetalleRow({required this.label, required this.value, required this.onSurface, this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: onSurface.withValues(alpha: 0.5), fontSize: 13)),
          Text(value, style: TextStyle(color: color ?? onSurface, fontWeight: FontWeight.bold, fontSize: 14)),
        ],
      ),
    );
  }
}

class _ImageSelectorDashboard extends StatefulWidget {
  final Function(File?) onImage;
  const _ImageSelectorDashboard({required this.onImage});

  @override
  State<_ImageSelectorDashboard> createState() => _ImageSelectorDashboardState();
}

class _ImageSelectorDashboardState extends State<_ImageSelectorDashboard> {
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

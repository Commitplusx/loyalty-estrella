// lib/screens/repartidor_detail_screen.dart
import 'dart:io';
import 'package:animate_do/animate_do.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'repartidores_screen.dart';
import '../services/repartidor_service.dart';
import '../services/gasto_service.dart';
import '../services/pedido_service.dart';

final repartidorDetailProvider = FutureProvider.family.autoDispose((ref, String id) async {
  final reps = await ref.read(repartidorServiceProvider).getRepartidores();
  return reps.firstWhere((r) => r['id'].toString() == id, orElse: () => {});
});

// ── Historial con filtro por fecha ────────────────────────────────────────────
final historialFiltradoProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, String>((ref, id) {
  return ref.read(repartidorServiceProvider).getHistorialServicios(id);
});

class RepartidorDetailScreen extends ConsumerStatefulWidget {
  final String repartidorId;
  final String nombre;

  const RepartidorDetailScreen({
    super.key,
    required this.repartidorId,
    required this.nombre,
  });

  @override
  ConsumerState<RepartidorDetailScreen> createState() => _RepartidorDetailScreenState();
}

class _RepartidorDetailScreenState extends ConsumerState<RepartidorDetailScreen> {
  // Fecha seleccionada para filtrar (null = hoy)
  late DateTime _fechaSeleccionada;
  late DateTime _hoy;

  @override
  void initState() {
    super.initState();
    _hoy = DateTime.now();
    _fechaSeleccionada = DateTime(_hoy.year, _hoy.month, _hoy.day);
  }

  // Genera los últimos N días para los chips
  List<DateTime> _diasRecientes(int n) {
    return List.generate(n, (i) {
      final d = _hoy.subtract(Duration(days: i));
      return DateTime(d.year, d.month, d.day);
    });
  }

  // Filtra servicios por fecha seleccionada
  List<Map<String, dynamic>> _filtrarPorFecha(List<Map<String, dynamic>> all) {
    return all.where((s) {
      final rawFecha = s['creado_en'] ?? s['turno_fecha'];
      if (rawFecha == null) return false;
      final fecha = DateTime.parse(rawFecha.toString()).toLocal();
      return fecha.year == _fechaSeleccionada.year &&
          fecha.month == _fechaSeleccionada.month &&
          fecha.day == _fechaSeleccionada.day;
    }).toList();
  }

  bool _esHoy(DateTime d) => d.year == _hoy.year && d.month == _hoy.month && d.day == _hoy.day;

  @override
  Widget build(BuildContext context) {
    final historyAsync = ref.watch(historialFiltradoProvider(widget.repartidorId));
    final profileAsync = ref.watch(repartidorDetailProvider(widget.repartidorId));
    final motosAsync = ref.watch(motosProvider);
    final isAdmin = widget.nombre.toUpperCase() == 'ADMIN';
    
    final colorScheme = Theme.of(context).colorScheme;
    final onSurface = colorScheme.onSurface;
    final cardColor = Theme.of(context).cardColor;
    final surfaceColor = colorScheme.surface;
    
    final dias = _diasRecientes(7);

    return Scaffold(
      backgroundColor: surfaceColor,
      appBar: AppBar(
        title: Text(widget.nombre, style: TextStyle(color: onSurface, fontWeight: FontWeight.w800)),
        actions: [
          IconButton(
            icon: Icon(Icons.refresh_rounded, color: onSurface.withValues(alpha: 0.7)),
            onPressed: () {
              ref.invalidate(historialFiltradoProvider(widget.repartidorId));
              ref.invalidate(repartidorDetailProvider(widget.repartidorId));
            },
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'hacer_cuentas',
        onPressed: () => historyAsync.whenData((all) {
          final hoyServicios = _filtrarPorFecha(all);
          final completados = hoyServicios.where((s) => s['estado'] == 'completado').toList();
          final total = completados.fold<double>(0, (sum, s) => sum + (double.tryParse(s['monto'].toString()) ?? 0));
          _mostrarCuentas(context, widget.nombre, total, completados.length);
        }),
        backgroundColor: const Color(0xFF11998E),
        foregroundColor: Colors.white,
        elevation: 4,
        icon: const Icon(Icons.account_balance_wallet_rounded),
        label: Text(isAdmin ? 'LIQUIDAR EMPRESA' : 'HACER CUENTAS', style: const TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: historyAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFFFF6B35))),
        error: (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: Colors.red))),
        data: (allServicios) {
          final serviciosDia = _filtrarPorFecha(allServicios);
          final completados = serviciosDia.where((s) => s['estado'] == 'completado').toList();
          final totalDia = completados.fold<double>(0, (sum, s) => sum + (double.tryParse(s['monto'].toString()) ?? 0));

          return profileAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('Error Perfil: $e')),
            data: (profile) {
              final assignedMoto = profile['motos'];
              final String? currentMotoId = profile['moto_id']?.toString();

              return Column(
                children: [
                  // ── Header Stats ────────────────────────────────────────
                  Container(
                    margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: cardColor,
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(color: onSurface.withValues(alpha: 0.05), blurRadius: 10, offset: const Offset(0, 4))
                      ],
                      border: Border.all(color: onSurface.withValues(alpha: 0.06)),
                    ),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            CircleAvatar(
                              radius: 28,
                              backgroundColor: const Color(0xFFFF6B35).withValues(alpha: 0.15),
                              child: Text(
                                widget.nombre.substring(0, 1).toUpperCase(),
                                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFFFF6B35)),
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(isAdmin ? 'Servicios Empresa' : 'Total a Entregar',
                                      style: TextStyle(color: onSurface.withValues(alpha: 0.5), fontSize: 12)),
                                  Text('\$${totalDia.toStringAsFixed(2)}',
                                      style: TextStyle(color: const Color(0xFF11998E), fontSize: 26, fontWeight: FontWeight.w900)),
                                  Text('${completados.length} repartos — ${_labelFecha(_fechaSeleccionada)}',
                                      style: TextStyle(color: onSurface.withValues(alpha: 0.4), fontSize: 12)),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (!isAdmin) ...[
                          const SizedBox(height: 14),
                          Divider(color: onSurface.withValues(alpha: 0.06), height: 1),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Icon(Icons.two_wheeler_rounded, size: 16,
                                  color: assignedMoto != null ? const Color(0xFF3B82F6) : onSurface.withValues(alpha: 0.2)),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  assignedMoto != null
                                      ? 'Vehículo: ${assignedMoto['alias'] ?? assignedMoto['placa']}'
                                      : 'Sin vehículo asignado',
                                  style: TextStyle(
                                      color: assignedMoto != null ? onSurface : onSurface.withValues(alpha: 0.3),
                                      fontSize: 13, fontWeight: FontWeight.w600),
                                ),
                              ),
                              motosAsync.when(
                                data: (motos) => InkWell(
                                  onTap: () => _cambiarMoto(context, currentMotoId, motos),
                                  child: Text('CAMBIAR',
                                      style: TextStyle(
                                          color: const Color(0xFFFF6B35),
                                          fontSize: 11, fontWeight: FontWeight.bold)),
                                ),
                                loading: () => const SizedBox(width: 10, height: 10, child: CircularProgressIndicator(strokeWidth: 2)),
                                error: (_, __) => const SizedBox(),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),

                  // ── Selector de Fecha (chips horizontales) ──────────────
                  SizedBox(
                    height: 48,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: dias.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (ctx, i) {
                        final dia = dias[i];
                        final isSelected = dia == _fechaSeleccionada;
                        final serviciosEseDia = allServicios.where((s) {
                          final rawFecha = s['creado_en'] ?? s['turno_fecha'];
                          if (rawFecha == null) return false;
                          final f = DateTime.parse(rawFecha.toString()).toLocal();
                          return f.year == dia.year && f.month == dia.month && f.day == dia.day;
                        }).length;
                        return GestureDetector(
                          onTap: () => setState(() => _fechaSeleccionada = dia),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: isSelected ? const Color(0xFFFF6B35) : onSurface.withValues(alpha: 0.05),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                color: isSelected ? const Color(0xFFFF6B35) : Colors.transparent,
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  _esHoy(dia) ? 'Hoy' : DateFormat('dd MMM', 'es').format(dia),
                                  style: TextStyle(
                                    color: isSelected ? Colors.white : onSurface.withValues(alpha: 0.6),
                                    fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                                    fontSize: 13,
                                  ),
                                ),
                                if (serviciosEseDia > 0) ...[
                                  const SizedBox(width: 6),
                                  Container(
                                    width: 18,
                                    height: 18,
                                    decoration: BoxDecoration(
                                      color: isSelected ? Colors.white.withValues(alpha: 0.3) : const Color(0xFFFF6B35).withValues(alpha: 0.15),
                                      shape: BoxShape.circle,
                                    ),
                                    child: Center(
                                      child: Text(
                                        '$serviciosEseDia',
                                        style: TextStyle(
                                          color: isSelected ? Colors.white : const Color(0xFFFF6B35),
                                          fontSize: 10,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),

                  const SizedBox(height: 12),

                  // ── Lista de servicios del día seleccionado ─────────────
                  Expanded(
                    child: serviciosDia.isEmpty
                        ? _EmptyDayView(esHoy: _esHoy(_fechaSeleccionada))
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 140),
                            itemCount: serviciosDia.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 10),
                            itemBuilder: (ctx, i) {
                              final s = serviciosDia[i];
                              return FadeInLeft(
                                delay: Duration(milliseconds: i * 30),
                                child: _ServicioCard(servicio: s, onSurface: onSurface, cardColor: cardColor),
                              );
                            },
                          ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }

  String _labelFecha(DateTime d) {
    if (_esHoy(d)) return 'hoy';
    return DateFormat('dd MMM yyyy', 'es').format(d);
  }

  // Se eliminó _mostrarAsignarPedido para evitar redundancia y limpiar interfaz.


  // ── Hacer Cuentas / Corte ─────────────────────────────────────────────────
  void _mostrarCuentas(BuildContext context, String nombre, double total, int cant) {
    final isAdm = nombre.toUpperCase() == 'ADMIN';
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E1E1E),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Row(children: [
          const Icon(Icons.calculate_rounded, color: Color(0xFF11998E), size: 28),
          const SizedBox(width: 12),
          Text(isAdm ? 'Liquidación Empresa' : 'Corte de Caja', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        ]),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(isAdm ? 'Resumen de servicios propios' : 'Resumen para $nombre',
                style: const TextStyle(color: Colors.white54, fontSize: 13)),
            const SizedBox(height: 20),
            _infoRow('Envíos Finalizados', cant.toString()),
            const Divider(color: Colors.white12),
            _infoRow(isAdm ? 'Generado' : 'Total en Efectivo', '\$${total.toStringAsFixed(2)}', highlight: true),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF11998E).withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFF11998E).withOpacity(0.2)),
              ),
              child: Text(
                isAdm
                    ? 'Al cerrar turno, estos servicios se marcarán como auditados.'
                    : 'Entrega este monto al administrador para liquidar el turno.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF11998E), fontSize: 12),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('CANCELAR', style: TextStyle(color: Colors.white38))),
          FilledButton(
            onPressed: () async {
              final fecha = DateFormat('yyyy-MM-dd').format(DateTime.now());
              final ok = await ref.read(repartidorServiceProvider).cerrarTurno(widget.repartidorId, fecha);
              if (ok && ctx.mounted) {
                Navigator.pop(ctx);
                ref.invalidate(historialFiltradoProvider(widget.repartidorId));
                ref.invalidate(cuadreProvider);
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Turno liquidado y cerrado correctamente')));
              }
            },
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFE11D48)),
            child: const Text('LIQUIDAR Y CERRAR', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value, {bool highlight = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 13)),
          Text(value,
              style: TextStyle(
                color: highlight ? const Color(0xFF38EF7D) : Colors.white,
                fontSize: highlight ? 22 : 15,
                fontWeight: FontWeight.bold,
              )),
        ],
      ),
    );
  }

  // ── Cambiar Moto ──────────────────────────────────────────────────────────
  Future<void> _cambiarMoto(BuildContext context, String? currentId, List<Map<String, dynamic>> motos) async {
    String? tempId = currentId;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Theme.of(context).cardColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text('Asignar Vehículo', style: TextStyle(color: onSurface, fontWeight: FontWeight.bold)),
        content: StatefulBuilder(
          builder: (ctx, setSt) => DropdownButtonFormField<String?>(
            value: tempId,
            dropdownColor: Theme.of(context).cardColor,
            style: TextStyle(color: onSurface),
            decoration: InputDecoration(
              filled: true,
              fillColor: onSurface.withValues(alpha: 0.05),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            ),
            items: [
              const DropdownMenuItem(value: null, child: Text('Ninguno')),
              ...motos.map((m) => DropdownMenuItem(value: m['id'].toString(), child: Text('${m['alias'] ?? m['placa']}'))),
            ],
            onChanged: (val) => setSt(() => tempId = val),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text('CANCELAR', style: TextStyle(color: onSurface.withValues(alpha: 0.3)))),
          FilledButton(
            onPressed: () async {
              final ok = await ref.read(repartidorServiceProvider).assignMoto(widget.repartidorId, tempId);
              if (ok && ctx.mounted) {
                Navigator.pop(ctx);
                ref.invalidate(repartidorDetailProvider(widget.repartidorId));
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Vehículo asignado correctamente')));
              }
            },
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFFF6B35)),
            child: const Text('ASIGNAR', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}

// ── Tarjeta de Servicio ─────────────────────────────────────────────────────
class _ServicioCard extends StatelessWidget {
  final Map<String, dynamic> servicio;
  final Color onSurface;
  final Color cardColor;

  const _ServicioCard({required this.servicio, required this.onSurface, required this.cardColor});

  @override
  Widget build(BuildContext context) {
    final rawFecha = servicio['creado_en'] ?? DateTime.now().toIso8601String();
    final fecha = DateTime.parse(rawFecha).toLocal();
    final timeStr = DateFormat('hh:mm a').format(fecha);
    final isCompleto = servicio['estado'] == 'completado';
    final isBot = servicio['es_bot'] == true;
    
    final cliente = servicio['clientes']?['nombre'] ?? (isBot ? 'Cliente Estrella' : '');
    final restaurante = servicio['restaurantes']?['nombre'] ?? servicio['descripcion'];
    final tipoServicio = servicio['tipo_servicio'] ?? 'cliente';
    final esRestaurante = tipoServicio == 'restaurante' || (isBot && restaurante != null);
    final notas = servicio['notas'];

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: cardColor,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(color: onSurface.withValues(alpha: 0.03), blurRadius: 4, offset: const Offset(0, 2))
        ],
        border: Border.all(color: onSurface.withValues(alpha: 0.06)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: (esRestaurante ? const Color(0xFFF59E0B) : const Color(0xFF3B82F6)).withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(
              esRestaurante ? Icons.restaurant_rounded : Icons.person_rounded,
              size: 20,
              color: esRestaurante ? const Color(0xFFF59E0B) : const Color(0xFF3B82F6),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (esRestaurante)
                  Text(restaurante ?? 'Pedido Bot', style: TextStyle(color: onSurface, fontWeight: FontWeight.w700, fontSize: 14))
                else if (cliente.isNotEmpty)
                  Text(cliente, style: TextStyle(color: onSurface, fontWeight: FontWeight.w700, fontSize: 14)),
                
                if (isBot)
                   Container(
                     margin: const EdgeInsets.only(top: 2, bottom: 4),
                     padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                     decoration: BoxDecoration(color: const Color(0xFFFF6B35).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(4)),
                     child: const Text('BOT', style: TextStyle(color: Color(0xFFFF6B35), fontSize: 9, fontWeight: FontWeight.bold)),
                   ),

                if (servicio['descripcion'] != null && servicio['descripcion'].toString().isNotEmpty && !isBot)
                  Text(
                    servicio['descripcion'],
                    style: TextStyle(color: onSurface.withValues(alpha: 0.5), fontSize: 12),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                if (notas != null && notas.toString().isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text('📍 $notas', style: TextStyle(color: onSurface.withValues(alpha: 0.4), fontSize: 11)),
                  ),
                const SizedBox(height: 4),
                Text(timeStr, style: TextStyle(color: onSurface.withValues(alpha: 0.3), fontSize: 11)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('\$${servicio['monto']}',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                    color: isCompleto ? const Color(0xFFFF6B35) : onSurface.withValues(alpha: 0.2),
                  )),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: (isCompleto ? const Color(0xFF11998E) : Colors.orange).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  isCompleto ? 'Finalizado' : 'Pendiente',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.bold,
                    color: isCompleto ? const Color(0xFF11998E) : Colors.orange,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _EmptyDayView extends StatelessWidget {
  final bool esHoy;
  const _EmptyDayView({required this.esHoy});

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            esHoy ? Icons.hourglass_empty_rounded : Icons.event_available_rounded,
            color: onSurface.withValues(alpha: 0.05),
            size: 64,
          ),
          const SizedBox(height: 16),
          Text(
            esHoy ? 'Sin servicios hoy' : 'Sin servicios ese día',
            style: TextStyle(color: onSurface.withValues(alpha: 0.3), fontSize: 16),
          ),
          const SizedBox(height: 8),
          Text(
            esHoy ? 'Los pedidos asignados aparecerán aquí' : 'Selecciona otro día',
            style: TextStyle(color: onSurface.withValues(alpha: 0.2), fontSize: 13),
          ),
        ],
      ),
    );
  }
}

class _StatRow extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _StatRow({required this.label, required this.value, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: color.withValues(alpha: 0.1), shape: BoxShape.circle),
          child: Icon(icon, color: color, size: 20),
        ),
        const SizedBox(width: 12),
        Expanded(child: Text(label, style: TextStyle(color: onSurface.withValues(alpha: 0.5), fontSize: 14))),
        Text(value, style: TextStyle(color: onSurface, fontWeight: FontWeight.bold, fontSize: 16)),
      ],
    );
  }
}




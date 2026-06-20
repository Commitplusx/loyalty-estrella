// lib/screens/pedido_detail_screen.dart
// Pantalla de detalle de pedido para el REPARTIDOR
// Se abre via deep-link: https://www.app-estrella.shop/pedido/{id}

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:image_picker/image_picker.dart';
import '../models/pedido_model.dart';
import '../services/pedido_service.dart';
import '../core/user_role.dart';
import '../services/repartidor_service.dart';
import '../services/gasto_service.dart';
import '../core/ui_helpers.dart';
import 'package:flutter_map/flutter_map.dart';

final _pedidoProvider = FutureProvider.autoDispose.family<PedidoModel?, String>(
  (ref, id) => ref.read(pedidoServiceProvider).getPedido(id),
);

class PedidoDetailScreen extends ConsumerWidget {
  final String pedidoId;
  const PedidoDetailScreen({super.key, required this.pedidoId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pedidoAsync = ref.watch(_pedidoProvider(pedidoId));
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Detalle del Pedido'),
      ),
      body: pedidoAsync.when(
        loading: () => Center(child: CircularProgressIndicator(color: theme.colorScheme.primary)),
        error: (e, _) => Center(child: Text('Error: $e', style: TextStyle(color: theme.colorScheme.error))),
        data: (pedido) {
          if (pedido == null) {
            return Center(
              child: Text('Pedido no encontrado', style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurface.withOpacity(0.5))),
            );
          }
          return _PedidoBody(
            pedido: pedido,
            onEstadoActualizado: () => ref.invalidate(_pedidoProvider(pedidoId)),
          );
        },
      ),
    );
  }
}

class _PedidoBody extends ConsumerStatefulWidget {
  final PedidoModel pedido;
  final VoidCallback onEstadoActualizado;

  const _PedidoBody({required this.pedido, required this.onEstadoActualizado});

  @override
  ConsumerState<_PedidoBody> createState() => _PedidoBodyState();
}

class _PedidoBodyState extends ConsumerState<_PedidoBody> {
  bool _loading = false;

  Future<void> _avanzarEstado() async {
    final siguiente = widget.pedido.siguienteEstado;
    if (siguiente == null) return;

    final theme = Theme.of(context);
    final color = _estadoColor(siguiente);

    final confirm = await PremiumBottomSheet.showConfirm(
      context,
      title: widget.pedido.siguienteEstadoLabel ?? 'Confirmar',
      content: '¿Confirmar cambio de estado a "${_estadoLabel(siguiente)}"?',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
    );

    if (confirm != true) return;

    setState(() => _loading = true);

    // ── LÓGICA DE FOTO FACHADA PARA EL REPARTIDOR ──
    if (siguiente == 'entregado') {
      try {
        final sb = Supabase.instance.client;
        final clienteTel = widget.pedido.clienteTel.replaceAll(RegExp(r'\D'), '');
        final cliente = await sb.from('clientes').select('foto_fachada_url').eq('telefono', clienteTel).maybeSingle();
        
        if (cliente == null || cliente['foto_fachada_url'] == null) {
          final ImagePicker picker = ImagePicker();
          final XFile? photo = await picker.pickImage(source: ImageSource.camera, imageQuality: 70);
          if (photo != null) {
            final file = File(photo.path);
            final pathName = 'fachada_${clienteTel}_${DateTime.now().millisecondsSinceEpoch}.jpg';
            await sb.storage.from('fachadas_clientes').upload(pathName, file);
            final urlPublica = sb.storage.from('fachadas_clientes').getPublicUrl(pathName);
            await sb.from('clientes').update({'foto_fachada_url': urlPublica}).eq('telefono', clienteTel);
          }
        }
      } catch (e) {
        debugPrint('Aviso: Falla al subir fachada $e');
      }
    }

    final ok = await ref
        .read(pedidoServiceProvider)
        .actualizarEstado(widget.pedido.id, siguiente);
    setState(() => _loading = false);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(ok
            ? '✅ Estado actualizado — mensaje enviado al cliente por WhatsApp'
            : '❌ Error al actualizar el estado', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        backgroundColor: ok ? const Color(0xFF11998E) : const Color(0xFFE11D48),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ));
      if (ok) widget.onEstadoActualizado();
    }
  }

  Future<void> _reasignarRepartidor() async {
    final sb = Supabase.instance.client;
    
    setState(() => _loading = true);
    // Traemos TODOS los repartidores activos (con y sin cuenta auth)
    final data = await sb.from('repartidores').select('id, user_id, nombre').eq('activo', true).order('nombre');
    setState(() => _loading = false);

    if (!mounted) return;

    final repartidorElegido = await PremiumBottomSheet.showCustom<Map<String, dynamic>>(
      context,
      title: 'Reasignar Repartidor',
      child: ListView.separated(
        shrinkWrap: true,
        physics: const BouncingScrollPhysics(),
        itemCount: data.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (ctx, i) {
          final rep = data[i];
          final tieneCuenta = rep['user_id'] != null;
          return ListTile(
            enabled: tieneCuenta,
            leading: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: tieneCuenta
                    ? Theme.of(context).colorScheme.primary.withOpacity(0.1)
                    : Colors.orange.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                tieneCuenta ? Icons.two_wheeler_rounded : Icons.warning_amber_rounded,
                color: tieneCuenta ? Theme.of(context).colorScheme.primary : Colors.orange,
              ),
            ),
            title: Text(
              rep['nombre'] ?? 'Sin Nombre',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: tieneCuenta ? null : Colors.grey,
              ),
            ),
            subtitle: tieneCuenta
                ? null
                : const Text(
                    'Debe hacer login en la app primero',
                    style: TextStyle(fontSize: 11, color: Colors.orange),
                  ),
            trailing: tieneCuenta
                ? const Icon(Icons.chevron_right_rounded)
                : const Icon(Icons.lock_outline_rounded, color: Colors.orange, size: 18),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            onTap: tieneCuenta ? () => Navigator.pop(ctx, rep) : null,
          );
        },
      ),
    );

    if (repartidorElegido != null) {
      final repId = repartidorElegido['user_id'];
      if (repId != null) {
        setState(() => _loading = true);
        final ok = await ref.read(pedidoServiceProvider).reasignarPedido(widget.pedido.id, repId.toString());
        setState(() => _loading = false);

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(ok ? '✅ Pedido reasignado y notificado al repartidor' : '❌ Error al reasignar'),
            backgroundColor: ok ? const Color(0xFF11998E) : const Color(0xFFE11D48),
          ));
          if (ok) widget.onEstadoActualizado();
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final pedido = widget.pedido;
    final color = _estadoColor(pedido.estado);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final isAdmin = ref.watch(isAdminProvider);

    final minutosRetraso = DateTime.now().difference(pedido.createdAt).inMinutes;
    final estaAtrasado = pedido.estado != 'entregado' && pedido.estado != 'cancelado' && minutosRetraso > 20;
    
    // Forzar color rojo si está pendiente o atrasado
    final bannerColor = (pedido.estado == 'pendiente' || estaAtrasado) 
        ? const Color(0xFFE11D48) 
        : color;

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        // Estado visual (Banner)
        Container(
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                bannerColor.withOpacity(isDark ? 0.25 : 0.15), 
                bannerColor.withOpacity(isDark ? 0.08 : 0.05)
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: bannerColor.withOpacity(0.5), width: 1.5),
            boxShadow: [
              BoxShadow(
                color: bannerColor.withOpacity(0.1),
                blurRadius: 15,
                offset: const Offset(0, 8),
              )
            ],
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: bannerColor.withOpacity(0.2),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  estaAtrasado ? Icons.warning_amber_rounded : _estadoIcon(pedido.estado), 
                  color: bannerColor, 
                  size: 32
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      estaAtrasado ? '¡RETRASO DE ${minutosRetraso}M!' : pedido.estadoLabel.toUpperCase(),
                      style: TextStyle(
                        color: bannerColor,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      estaAtrasado ? 'Este pedido está tomando más tiempo del esperado.' : _estadoSubtitulo(pedido.estado),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 24),

        // ── GPS Card (si el pedido tiene coordenadas) ────────────────
        if (pedido.lat != null && pedido.lng != null)
          _GpsCard(lat: pedido.lat!, lng: pedido.lng!),

        // Datos del pedido
        Container(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: theme.dividerColor.withOpacity(0.5)),
            boxShadow: [
              BoxShadow(
                color: theme.colorScheme.shadow.withOpacity(0.05),
                blurRadius: 10,
                offset: const Offset(0, 4),
              )
            ],
          ),
          child: Column(
            children: [
              if (pedido.tipoPedido == 'mandadito') ...[
                _InfoCard(titulo: '📦 Tipo', valor: 'Mandadito', grande: true),
                if (pedido.origen != null) _InfoCard(titulo: '🛫 Origen', valor: pedido.origen!),
                if (pedido.destino != null) _InfoCard(titulo: '🛬 Destino', valor: pedido.destino!),
                _InfoCard(
                  titulo: '💳 Pago',
                  valor: pedido.metodoPago == 'transferencia' ? 'Transferencia' : 'Efectivo',
                ),
                _InfoCard(titulo: '💵 Precio', valor: '\$${pedido.precioEntrega ?? 0}'),
              ] else if (pedido.restaurante != null && pedido.restaurante!.isNotEmpty) ...[
                _InfoCard(titulo: '🍽️ Restaurante', valor: pedido.restaurante!, grande: true),
              ],
              _InfoCard(
                titulo: '📦 Descripción',
                valor: pedido.descripcion,
                grande: pedido.restaurante == null && pedido.tipoPedido != 'mandadito',
              ),
              if (pedido.clienteNombre != null && pedido.clienteNombre!.isNotEmpty)
                _InfoCard(titulo: '👤 Cliente', valor: pedido.clienteNombre!),
              if (pedido.direccion != null && pedido.direccion!.isNotEmpty)
                _InfoCard(titulo: '📍 Dirección', valor: pedido.direccion!),
              _InfoCard(
                titulo: '📱 Teléfono',
                valor: '•••• •••• ${pedido.clienteTel.length >= 4 ? pedido.clienteTel.substring(pedido.clienteTel.length - 4) : pedido.clienteTel}',
              ),
              _InfoCard(
                titulo: '🕐 Asignado',
                valor: _formatDateTime(pedido.createdAt),
              ),
              _InfoCard(
                titulo: '🔄 Última actualización',
                valor: _formatDateTime(pedido.updatedAt),
              ),
            ],
          ),
        ),

        const SizedBox(height: 28),

        // Barra de progreso de estados
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: theme.dividerColor.withOpacity(0.5)),
          ),
          child: _ProgressoEstados(estadoActual: pedido.estado),
        ),

        const SizedBox(height: 32),

        // Botón de acción
        if (pedido.siguienteEstado != null)
          _loading
              ? Center(child: CircularProgressIndicator(color: theme.colorScheme.primary))
              : ElevatedButton.icon(
                  onPressed: _avanzarEstado,
                  icon: Icon(_estadoIcon(pedido.siguienteEstado!)),
                  label: Text(
                    pedido.siguienteEstadoLabel ?? 'Actualizar',
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _estadoColor(pedido.siguienteEstado!),
                    foregroundColor: Colors.white,
                    minimumSize: const Size(double.infinity, 60),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    elevation: 8,
                    shadowColor: _estadoColor(pedido.siguienteEstado!).withOpacity(0.5),
                  ),
                )
        else
          Container(
            padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
            decoration: BoxDecoration(
              color: const Color(0xFF11998E).withOpacity(0.1),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF11998E).withOpacity(0.3)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.check_circle_rounded, color: Color(0xFF11998E), size: 32),
                const SizedBox(width: 12),
                Text(
                  '¡Pedido Entregado!',
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: const Color(0xFF11998E),
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),

        const SizedBox(height: 16),
        
        // Botón Reasignar (solo para administradores)
        if (isAdmin && pedido.estado != 'entregado' && pedido.estado != 'cancelado')
          OutlinedButton.icon(
            onPressed: _loading ? null : _reasignarRepartidor,
            icon: const Icon(Icons.sync_alt_rounded),
            label: const Text('Reasignar Repartidor', style: TextStyle(fontWeight: FontWeight.bold)),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(double.infinity, 50),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
          ),

        const SizedBox(height: 100), // Extra padding para que no tape el BottomNavBar
      ],
    );
  }
}

// ── Widgets auxiliares ────────────────────────────────────────────────────────

class _InfoCard extends StatelessWidget {
  final String titulo;
  final String valor;
  final bool grande;
  const _InfoCard({required this.titulo, required this.valor, this.grande = false});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      margin: const EdgeInsets.only(bottom: 2),
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(titulo,
              style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant, 
                  fontSize: 13, 
                  fontWeight: FontWeight.w600)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              valor,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.colorScheme.onSurface,
                fontSize: grande ? 17 : 14,
                fontWeight: grande ? FontWeight.w800 : FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProgressoEstados extends StatelessWidget {
  final String estadoActual;
  const _ProgressoEstados({required this.estadoActual});

  static const _estados = ['asignado', 'recibido', 'en_camino', 'entregado'];
  static const _labels = ['Asignado', 'Recibido', 'En Camino', 'Entregado'];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final currentIdx = _estados.indexOf(estadoActual);
    final inactiveColor = isDark ? Colors.white12 : Colors.black12;

    return Row(
      children: List.generate(_estados.length, (i) {
        final done = i <= currentIdx;
        return Expanded(
          child: Column(
            children: [
              Row(
                children: [
                  if (i > 0)
                    Expanded(
                      child: Container(
                        height: 3,
                        color: done ? const Color(0xFFFF6B35) : inactiveColor,
                      ),
                    ),
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: done ? const Color(0xFFFF6B35) : inactiveColor,
                    ),
                    child: Icon(
                      done ? Icons.check : Icons.circle,
                      size: done ? 16 : 8,
                      color: Colors.white,
                    ),
                  ),
                  if (i < _estados.length - 1)
                    Expanded(
                      child: Container(
                        height: 3,
                        color: i < currentIdx ? const Color(0xFFFF6B35) : inactiveColor,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                _labels[i],
                style: theme.textTheme.labelSmall?.copyWith(
                  color: done ? const Color(0xFFFF6B35) : theme.colorScheme.onSurfaceVariant,
                  fontSize: 10,
                  fontWeight: done ? FontWeight.bold : FontWeight.w500,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        );
      }),
    );
  }
}

// ── Helpers de estilo ─────────────────────────────────────────────────────────

Color _estadoColor(String estado) {
  switch (estado) {
    case 'pendiente': return const Color(0xFFEF4444);
    case 'asignado':  return const Color(0xFF60A5FA);
    case 'recibido':  return const Color(0xFFF59E0B);
    case 'en_camino': return const Color(0xFFFF6B35);
    case 'entregado': return const Color(0xFF11998E);
    default:          return Colors.grey;
  }
}

IconData _estadoIcon(String estado) {
  switch (estado) {
    case 'pendiente': return Icons.warning_rounded;
    case 'asignado':  return Icons.assignment_rounded;
    case 'recibido':  return Icons.handshake_rounded;
    case 'en_camino': return Icons.delivery_dining_rounded;
    case 'entregado': return Icons.check_circle_rounded;
    default:          return Icons.help_outline;
  }
}

String _estadoLabel(String estado) {
  switch (estado) {
    case 'pendiente': return 'Pendiente';
    case 'asignado':  return 'Asignado';
    case 'recibido':  return 'Recibido';
    case 'en_camino': return 'En Camino';
    case 'entregado': return 'Entregado';
    default:          return estado;
  }
}

String _estadoSubtitulo(String estado) {
  switch (estado) {
    case 'pendiente': return 'Aún no se ha asignado a ningún repartidor.';
    case 'asignado':  return 'El pedido fue asignado. Confírmalo al recibirlo.';
    case 'recibido':  return 'Tienes el pedido. Sal a entregarlo cuando estés listo.';
    case 'en_camino': return 'Estás en camino. ¡El cliente ya fue notificado!';
    case 'entregado': return '¡Entregado exitosamente! El cliente lo sabe. 🎉';
    default:          return '';
  }
}

String _formatDateTime(DateTime dt) {
  final d = '${dt.day.toString().padLeft(2,'0')}/${dt.month.toString().padLeft(2,'0')}/${dt.year}';
  final t = '${dt.hour.toString().padLeft(2,'0')}:${dt.minute.toString().padLeft(2,'0')}';
  return '$d a las $t';
}

// ── Tarjeta GPS ───────────────────────────────────────────────────────────────
class _GpsCard extends StatelessWidget {
  final double lat;
  final double lng;
  const _GpsCard({required this.lat, required this.lng});

  Future<void> _abrirMapa() async {
    final uri = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return GestureDetector(
      onTap: _abrirMapa,
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: isDark 
                ? [const Color(0xFF1A3A5C), const Color(0xFF0F2340)]
                : [const Color(0xFFEFF6FF), const Color(0xFFDBEAFE)],
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF3B82F6).withOpacity(isDark ? 0.4 : 0.2)),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: const Color(0xFF3B82F6).withOpacity(0.15),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.location_on_rounded, color: Color(0xFF3B82F6), size: 28),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('📍 Ubicación GPS del cliente',
                      style: theme.textTheme.titleSmall?.copyWith(color: isDark ? Colors.white : const Color(0xFF1E3A8A), fontWeight: FontWeight.w700, fontSize: 14)),
                  const SizedBox(height: 2),
                  Text('${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)}',
                      style: theme.textTheme.bodySmall?.copyWith(color: isDark ? Colors.white70 : const Color(0xFF3B82F6), fontSize: 12, fontFamily: 'monospace')),
                  const SizedBox(height: 4),
                  Text('TAP para abrir en Google Maps 🗺️',
                      style: theme.textTheme.labelSmall?.copyWith(color: const Color(0xFF60A5FA), fontSize: 11, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
            const Icon(Icons.open_in_new_rounded, color: Color(0xFF3B82F6), size: 20),
          ],
        ),
      ),
    );
  }
}


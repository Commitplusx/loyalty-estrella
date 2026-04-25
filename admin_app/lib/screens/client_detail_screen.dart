import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:go_router/go_router.dart';
import '../services/cliente_service.dart';
import '../models/cliente_model.dart';
import '../core/supabase_config.dart';
import '../core/user_role.dart';

final clienteDetailProvider =
    FutureProvider.autoDispose.family<ClienteModel?, String>((ref, id) async {
  final data = await supabase.from('clientes').select().eq('id', id).single();
  return ClienteModel.fromMap(data);
});

final clientHistoryProvider =
    FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, id) async {
  final history = await supabase
      .from('registros_puntos')
      .select('created_at, tipo')
      .eq('cliente_id', id)
      .order('created_at', ascending: false)
      .limit(10);
      
  return List<Map<String, dynamic>>.from(history);
});

class ClientDetailScreen extends ConsumerWidget {
  final String clienteId;
  const ClientDetailScreen({super.key, required this.clienteId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clienteAsync = ref.watch(clienteDetailProvider(clienteId));
    final isAdmin = ref.watch(isAdminProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text('Detalle Cliente'),
        actions: [
          IconButton(
            icon: Icon(Icons.refresh_rounded),
            onPressed: () => ref.invalidate(clienteDetailProvider(clienteId)),
          ),
        ],
      ),
      body: clienteAsync.when(
        loading: () => Center(
            child: CircularProgressIndicator(color: Color(0xFFFF6B35))),
        error: (e, _) =>
            Center(child: Text('Error: $e', style: TextStyle(color: Colors.red))),
        data: (cliente) {
          if (cliente == null) {
            return Center(child: Text('Cliente no encontrado'));
          }
          return _ClienteDetail(
            cliente: cliente,
            isAdmin: isAdmin,
            onRedimir: () async {
              await ref.read(clienteServiceProvider).redimirGratis(cliente.id);
              ref.invalidate(clienteDetailProvider(clienteId));
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('✅ Envío gratis redimido'),
                    backgroundColor: Color(0xFF11998E),
                  ),
                );
              }
            },
            onCanjearSaldo: (monto) async {
              final ok = await ref.read(clienteServiceProvider).canjearSaldo(cliente.id, monto);
              ref.invalidate(clienteDetailProvider(clienteId));
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(ok ? '💳 Canjeado \$${monto.toStringAsFixed(2)} de la Billetera VIP' : '❌ Error al canjear saldo'),
                    backgroundColor: ok ? const Color(0xFFF59E0B) : const Color(0xFFE11D48),
                  ),
                );
              }
            },
            onToggleVip: (val) async {
              final ok = await ref.read(clienteServiceProvider).toggleVip(cliente.id, val);
              if (ok) {
                ref.invalidate(clienteDetailProvider(clienteId));
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(val ? '👑 Cliente ascendido a VIP' : '⬇️ Nivel VIP removido'),
                      backgroundColor: val ? const Color(0xFFF59E0B) : Colors.grey[800],
                    ),
                  );
                }
              }
            },
            onDelete: () async {
              final confirm = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  backgroundColor: Theme.of(context).cardColor,
                  title: Text('Eliminar Cliente', style: TextStyle(color: Theme.of(context).colorScheme.onSurface)),
                  content: Text(
                    '¿Estás seguro de que deseas eliminar permanentemente a este cliente y todo su historial de puntos?',
                    style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7)),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(ctx, false),
                      child: Text('Cancelar', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
                    ),
                    ElevatedButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFE11D48)),
                      child: Text('Sí, eliminar', style: TextStyle(color: Theme.of(context).colorScheme.onSurface)),
                    ),
                  ],
                ),
              );

              if (confirm == true) {
                final ok = await ref.read(clienteServiceProvider).deleteCliente(cliente.id);
                if (ok && context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Cliente eliminado exitosamente', style: TextStyle(color: Theme.of(context).colorScheme.onSurface)), backgroundColor: Colors.black87),
                  );
                  context.pop();
                } else if (!ok && context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Error al eliminar cliente', style: TextStyle(color: Theme.of(context).colorScheme.onSurface)), backgroundColor: Color(0xFFE11D48)),
                  );
                }
              }
            },
            onEditCosto: (nuevoCosto) async {
              final ok = await ref.read(clienteServiceProvider).updateCostoEnvio(cliente.id, nuevoCosto);
              if (ok) {
                ref.refresh(clienteDetailProvider(clienteId));
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Costo de envío actualizado', style: TextStyle(color: Theme.of(context).colorScheme.onSurface)), backgroundColor: Color(0xFF11998E)),
                  );
                }
              }
            },
            onEditNotas: (nuevasNotas) async {
              final ok = await ref.read(clienteServiceProvider).updateNotasCrm(cliente.id, nuevasNotas);
              if (ok) {
                ref.refresh(clienteDetailProvider(clienteId));
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Notas actualizadas', style: TextStyle(color: Theme.of(context).colorScheme.onSurface)), backgroundColor: Color(0xFF11998E)),
                  );
                }
              }
            },
            onShareQR: () {
              Share.share('Aquí tienes tu código de cliente para Estrella Delivery: ${cliente.codigoQr}');
            },
          );
        },
      ),
    );
  }
}

class _ClienteDetail extends StatelessWidget {
  final ClienteModel cliente;
  final bool isAdmin;
  final VoidCallback onRedimir;
  final ValueChanged<double> onCanjearSaldo;
  final ValueChanged<bool> onToggleVip;
  final VoidCallback onDelete;
  final ValueChanged<double> onEditCosto;
  final ValueChanged<String> onEditNotas;
  final VoidCallback onShareQR;

  const _ClienteDetail({
    required this.cliente,
    required this.isAdmin,
    required this.onRedimir,
    required this.onCanjearSaldo,
    required this.onToggleVip,
    required this.onDelete,
    required this.onEditCosto,
    required this.onEditNotas,
    required this.onShareQR,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        // Header card
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.10)),
          ),
          child: Column(
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: const Color(0xFFFF6B35).withOpacity(0.15),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    cliente.telefono.substring(cliente.telefono.length - 2),
                    style: TextStyle(
                      color: Color(0xFFFF6B35),
                      fontWeight: FontWeight.w900,
                      fontSize: 28,
                    ),
                  ),
                ),
              ),
              SizedBox(height: 16),
              Text(
                cliente.nombre ?? cliente.telefono,
                style: TextStyle(
                    fontSize: 22, fontWeight: FontWeight.w800, color: Theme.of(context).colorScheme.onSurface),
              ),
              if (cliente.nombre != null) ...[
                SizedBox(height: 4),
                Text(cliente.telefono,
                    style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.38), fontSize: 14)),
              ],
              SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: _getRangoColor(cliente.rango).withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _getRangoColor(cliente.rango).withOpacity(0.5)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(_getRangoIcon(cliente.rango), size: 14, color: _getRangoColor(cliente.rango)),
                    SizedBox(width: 4),
                    Text(
                      'Rango ${cliente.rango.toUpperCase()}',
                      style: TextStyle(color: _getRangoColor(cliente.rango), fontWeight: FontWeight.bold, fontSize: 12),
                    ),
                  ],
                ),
              ),
              SizedBox(height: 16),
              Divider(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.10)),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Icon(Icons.workspace_premium_rounded,
                          color: cliente.esVip
                              ? const Color(0xFFF59E0B)
                              : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.24),
                          size: 24),
                      SizedBox(width: 8),
                      Text(
                        'Cliente VIP',
                        style: TextStyle(
                            color: cliente.esVip ? const Color(0xFFF59E0B) : Colors.white54,
                            fontWeight: cliente.esVip ? FontWeight.w800 : FontWeight.normal),
                      ),
                    ],
                  ),
              if (isAdmin)
                Switch(
                  value: cliente.esVip,
                  onChanged: onToggleVip,
                  activeThumbColor: const Color(0xFFF59E0B),
                  activeTrackColor: const Color(0xFFF59E0B).withValues(alpha: 0.4),
                ),
              // VIP label (ambos temas)
              if (!isAdmin)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: cliente.esVip
                        ? const Color(0xFFF59E0B).withValues(alpha: 0.15)
                        : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    cliente.esVip ? 'VIP' : 'Normal',
                    style: TextStyle(
                      color: cliente.esVip ? const Color(0xFFF59E0B) : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4),
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                ],
              ),
              SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Icon(Icons.attach_money_rounded, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5), size: 24),
                      SizedBox(width: 8),
                      Text(
                        'Costo de Envío',
                        style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5)),
                      ),
                    ],
                  ),
                  if (isAdmin)
                    TextButton.icon(
                      onPressed: () => _mostrarDialogoCosto(context),
                      icon: Icon(Icons.edit_rounded, size: 16, color: Color(0xFF60A5FA)),
                      label: Text(
                        (cliente.costoEnvio ?? 0) <= 0 ? 'Fijar' : '\$${(cliente.costoEnvio ?? 0).toStringAsFixed(2)}',
                        style: TextStyle(color: Color(0xFF60A5FA), fontWeight: FontWeight.bold),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),

        SizedBox(height: 16),

        // CRM Notas Box — respeta tema
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.errorContainer.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE11D48).withValues(alpha: 0.3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Icon(Icons.notes_rounded, color: Color(0xFFE11D48), size: 20),
                      SizedBox(width: 8),
                      Text('Notas CRM', style: TextStyle(color: Color(0xFFE11D48), fontWeight: FontWeight.bold)),
                    ],
                  ),
                  InkWell(
                    onTap: () => _mostrarDialogoNotas(context),
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(Icons.edit_note_rounded, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6), size: 20),
                    ),
                  ),
                ],
              ),
              SizedBox(height: 12),
              Text(
                (cliente.notasCrm?.isEmpty ?? true)
                    ? 'Sin notas. Toca el botón para agregar instrucciones especiales.'
                    : cliente.notasCrm!,
                style: TextStyle(
                  color: (cliente.notasCrm?.isEmpty ?? true)
                      ? Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.38)
                      : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.75),
                  fontSize: 13,
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),

        SizedBox(height: 16),

        // VIP Billetera Card (solo para clientes VIP)
        if (cliente.esVip) ...[
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFFD97706), Color(0xFFF59E0B), Color(0xFFEF9D0D)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(20),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFF59E0B).withOpacity(0.35),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    const Icon(Icons.account_balance_wallet_rounded, color: Colors.white, size: 22),
                    const SizedBox(width: 8),
                    const Text('Billetera VIP', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16, letterSpacing: 0.5)),
                    const Spacer(),
                    const Icon(Icons.workspace_premium_rounded, color: Colors.white70, size: 18),
                  ],
                ),
                const SizedBox(height: 16),
                Text(
                  '\$${cliente.saldoBilletera.toStringAsFixed(2)}',
                  style: const TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w900, height: 1),
                ),
                const SizedBox(height: 4),
                const Text('Saldo disponible', style: TextStyle(color: Colors.white70, fontSize: 13)),
                const SizedBox(height: 16),
                const Divider(color: Colors.white24, height: 1),
                const SizedBox(height: 14),
                ElevatedButton.icon(
                  onPressed: cliente.saldoBilletera > 0 ? () => _mostrarDialogoCanjeVip(context) : null,
                  icon: const Icon(Icons.redeem_rounded, size: 18),
                  label: const Text('Canjear Saldo'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: const Color(0xFFD97706),
                    disabledBackgroundColor: Colors.white30,
                    disabledForegroundColor: Colors.white54,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                  ),
                ),
              ],
            ),
          ),
          SizedBox(height: 16),
        ],

        // Stats
        Row(
          children: [
            Expanded(
                child: _StatMini(
                    label: 'Envíos', value: '${cliente.totalEnvios}',
                    icon: Icons.local_shipping_rounded, color: const Color(0xFFFF6B35))),
            SizedBox(width: 12),
            Expanded(
                child: _StatMini(
                    label: 'Gratis', value: '${cliente.enviosGratis}',
                    icon: Icons.card_giftcard_rounded, color: const Color(0xFF38EF7D))),
            SizedBox(width: 12),
            Expanded(
                child: _StatMini(
                    label: 'Faltan', value: '${cliente.enviosParaGratis}',
                    icon: Icons.hourglass_top_rounded, color: const Color(0xFF60A5FA))),
          ],
        ),

        SizedBox(height: 16),

        // Progress
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.10)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Progreso hacia gratis', style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontWeight: FontWeight.w600)),
              SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: List.generate(5, (i) {
                  final filled = i < (cliente.totalEnvios % 5);
                  return Expanded(
                    child: Container(
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      height: 14,
                      decoration: BoxDecoration(
                        color: filled
                            ? const Color(0xFFFF6B35)
                            : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(7),
                      ),
                    ),
                  );
                }),
              ),
              SizedBox(height: 10),
              Text(
                '${cliente.totalEnvios % 5} / 5 — Faltan ${cliente.enviosParaGratis}',
                style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.38), fontSize: 12),
              ),
            ],
          ),
        ),

        // QR Code Card
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.10)),
          ),
          child: Column(
            children: [
              Text(
                'Código QR de Lealtad',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: Theme.of(context).colorScheme.onSurface),
              ),
              SizedBox(height: 16),
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: QrImageView(
                  data: cliente.codigoQr,
                  version: QrVersions.auto,
                  size: 200,
                  backgroundColor: Colors.white,
                  eyeStyle: const QrEyeStyle(color: Colors.black),
                  dataModuleStyle: const QrDataModuleStyle(color: Colors.black),
                ),
              ),
              SizedBox(height: 16),
              Text(
                cliente.codigoQr,
                style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.38), fontSize: 10),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
              SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: onShareQR,
                  icon: const Icon(Icons.share_rounded, size: 18),
                  label: const Text('Compartir QR'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF3B82F6),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    textStyle: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ],
          ),
        ),

        // Render free delivery button
        if (cliente.tieneGratisDisponible) ...[
          SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: onRedimir,
            icon: Icon(Icons.card_giftcard_rounded),
            label: Text(
                'Redimir Gratis (${cliente.enviosGratis} disponible${cliente.enviosGratis > 1 ? 's' : ''})'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF11998E),
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
          ),
        ],

        SizedBox(height: 24),
        
        // Historial
        Text('Escaneos Recientes', style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontWeight: FontWeight.w600, fontSize: 16)),
        SizedBox(height: 12),
        _ClientHistoryList(clienteId: cliente.id),

        SizedBox(height: 24),
        
        // Delete button at the bottom
        if (isAdmin)
          OutlinedButton.icon(
            onPressed: onDelete,
            icon: Icon(Icons.delete_outline_rounded, color: Color(0xFFEF4444)),
            label: Text('Eliminar Cliente', style: TextStyle(color: Color(0xFFEF4444))),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: Color(0xFFEF4444)),
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
          ),

        SizedBox(height: 12),
        Text(
          'Cliente desde: ${_formatDate(cliente.creadoEn)}',
          textAlign: TextAlign.center,
          style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.24), fontSize: 12),
        ),
        SizedBox(height: 24),
      ],
    );
  }

  Future<void> _mostrarDialogoCosto(BuildContext context) async {
    final ctrl = TextEditingController(text: (cliente.costoEnvio ?? 0) > 0 ? cliente.costoEnvio.toString() : '');
    final val = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Theme.of(context).cardColor,
        title: Text('Costo de Envío', style: TextStyle(color: Theme.of(context).colorScheme.onSurface)),
        content: TextField(
          controller: ctrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
          decoration: InputDecoration(
            labelText: 'Monto (\$)',
            hintText: 'Ej: 30.00',
            hintStyle: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.38)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Cancelar', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF60A5FA)),
            child: Text('Guardar'),
          ),
        ],
      ),
    );
    ctrl.dispose();

    if (val != null) {
      final monto = double.tryParse(val) ?? 0.0;
      onEditCosto(monto);
    }
  }

  Future<void> _mostrarDialogoNotas(BuildContext context) async {
    final ctrl = TextEditingController(text: cliente.notasCrm);
    final val = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Theme.of(context).cardColor,
        title: Text('Editar Notas (CRM)', style: TextStyle(color: Theme.of(context).colorScheme.onSurface)),
        content: TextField(
          controller: ctrl,
          maxLines: 4,
          style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
          decoration: InputDecoration(
            labelText: 'Notas / Instrucciones',
            hintText: 'Ej: Puerta verde, perro bravo...',
            hintStyle: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.38)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Cancelar', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFE11D48)),
            child: Text('Guardar'),
          ),
        ],
      ),
    );
    ctrl.dispose();

    if (val != null) {
      onEditNotas(val);
    }
  }

  Future<void> _mostrarDialogoCanjeVip(BuildContext context) async {
    final ctrl = TextEditingController();
    final val = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Theme.of(context).cardColor,
        title: Row(
          children: [
            const Icon(Icons.account_balance_wallet_rounded, color: Color(0xFFF59E0B)),
            const SizedBox(width: 8),
            Text('Canjear Saldo VIP', style: TextStyle(color: Theme.of(context).colorScheme.onSurface)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Saldo actual: \$${cliente.saldoBilletera.toStringAsFixed(2)}',
              style: TextStyle(color: const Color(0xFFF59E0B), fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
              decoration: InputDecoration(
                labelText: 'Monto a canjear (\$)',
                hintText: 'Ej: 45.00 para un envío gratis',
                hintStyle: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.38)),
                prefixText: '\$ ',
                prefixStyle: const TextStyle(color: Color(0xFFF59E0B), fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Cancelar', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFF59E0B), foregroundColor: Colors.white),
            child: const Text('Canjear'),
          ),
        ],
      ),
    );
    ctrl.dispose();

    if (val != null) {
      final monto = double.tryParse(val);
      if (monto != null && monto > 0 && monto <= cliente.saldoBilletera) {
        onCanjearSaldo(monto);
      } else if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Monto inválido o mayor al saldo disponible'),
            backgroundColor: Color(0xFFE11D48),
          ),
        );
      }
    }
  }

  String _formatDate(DateTime dt) {
    return '${dt.day}/${dt.month}/${dt.year}';
  }
}

class _StatMini extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _StatMini(
      {required this.label,
      required this.value,
      required this.icon,
      required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(0.25)),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 22),
          SizedBox(height: 6),
          Text(value,
              style: TextStyle(
                  color: color, fontWeight: FontWeight.w800, fontSize: 20)),
          Text(label,
              style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.38), fontSize: 11)),
        ],
      ),
    );
  }
}

Color _getRangoColor(String rango) {
  switch (rango.toLowerCase()) {
    case 'oro':
      return const Color(0xFFFBBF24); // Gold
    case 'plata':
      return const Color(0xFF94A3B8); // Silver
    case 'bronce':
    default:
      return const Color(0xFFB45309); // Bronze
  }
}

IconData _getRangoIcon(String rango) {
  switch (rango.toLowerCase()) {
    case 'oro':
      return Icons.military_tech_rounded;
    case 'plata':
      return Icons.star_half_rounded;
    case 'bronce':
    default:
      return Icons.star_border_rounded;
  }
}

class _ClientHistoryList extends ConsumerWidget {
  final String clienteId;
  const _ClientHistoryList({required this.clienteId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final historyAsync = ref.watch(clientHistoryProvider(clienteId));

    return historyAsync.when(
      loading: () => Center(child: CircularProgressIndicator(color: Color(0xFFFF6B35))),
      error: (e, _) => Text('Error al cargar historial: $e', style: TextStyle(color: Colors.red)),
      data: (history) {
        if (history.isEmpty) {
          return Container(
            padding: const EdgeInsets.all(16),
            alignment: Alignment.center,
            decoration: BoxDecoration(color: Theme.of(context).cardColor, borderRadius: BorderRadius.all(Radius.circular(12))),
            child: Text('Aún no hay puntos registrados', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5), fontSize: 13)),
          );
        }

        return Column(
          children: history.map((mov) {
            final isGratis = mov['tipo'] != 'acumulacion';
            final dt = DateTime.parse(mov['created_at']);
            
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.10)),
              ),
              child: Row(
                children: [
                  Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      color: isGratis ? const Color(0xFF11998E).withOpacity(0.2) : const Color(0xFFFF6B35).withOpacity(0.2),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      isGratis ? Icons.card_giftcard_rounded : Icons.star_rounded,
                      color: isGratis ? const Color(0xFF11998E) : const Color(0xFFFF6B35),
                      size: 20,
                    ),
                  ),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(isGratis ? 'Canje Gratis' : '+1 Punto Acumulado', style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontWeight: FontWeight.w600, fontSize: 14)),
                        Text('${dt.day}/${dt.month}/${dt.year} a las ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5), fontSize: 12)),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
        );
      },
    );
  }
}


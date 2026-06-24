import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:go_router/go_router.dart';
import '../core/ui_helpers.dart';
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

  static Future<void> show(BuildContext context, String clienteId) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      useRootNavigator: true,
      builder: (ctx) => ClientDetailScreen(clienteId: clienteId),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clienteAsync = ref.watch(clienteDetailProvider(clienteId));
    final isAdmin = ref.watch(isAdminProvider);

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      minChildSize: 0.5,
      builder: (ctx, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Color(0xFFF8FAFC),
            borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
          ),
          child: Column(
            children: [
              // Handle
              Center(
                child: Container(
                  margin: const EdgeInsets.only(top: 16, bottom: 8),
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.withOpacity(0.3),
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
              // Header
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Detalle Cliente', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.black87)),
                    IconButton(
                      icon: const Icon(Icons.refresh_rounded, color: Colors.black87),
                      onPressed: () => ref.invalidate(clienteDetailProvider(clienteId)),
                    ),
                  ],
                ),
              ),
              // Content
              Expanded(
                child: clienteAsync.when(
                  loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFFFF6B35))),
                  error: (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: Colors.red))),
                  data: (cliente) {
                    if (cliente == null) {
                      return const Center(child: Text('Cliente no encontrado', style: TextStyle(color: Colors.black87)));
                    }
                    return _ClienteDetail(
                      cliente: cliente,
                      isAdmin: isAdmin,
                      scrollController: scrollController,
                      onRedimir: () async {
                        await ref.read(clienteServiceProvider).redimirGratis(cliente.id);
                        ref.invalidate(clienteDetailProvider(clienteId));
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('✅ Envío gratis redimido'), backgroundColor: Color(0xFF11998E)),
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
                              SnackBar(content: Text(val ? '👑 Cliente ahora es VIP' : 'Retirado VIP', style: const TextStyle(color: Colors.white)), backgroundColor: const Color(0xFF11998E)),
                            );
                          }
                        }
                      },
                      onDelete: () async {
                        final ok = await ref.read(clienteServiceProvider).deleteCliente(cliente.id);
                        if (ok && context.mounted) {
                          Navigator.pop(context);
                        }
                      },
                      onEditCosto: (nuevoCosto) async {
                        final ok = await ref.read(clienteServiceProvider).updateCostoEnvio(cliente.id, nuevoCosto);
                        if (ok) {
                          ref.refresh(clienteDetailProvider(clienteId));
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Costo de envío actualizado', style: TextStyle(color: Theme.of(context).colorScheme.onSurface)), backgroundColor: const Color(0xFF11998E)),
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
                              SnackBar(content: Text('Notas actualizadas', style: TextStyle(color: Theme.of(context).colorScheme.onSurface)), backgroundColor: const Color(0xFF11998E)),
                            );
                          }
                        }
                      },
                      onShareQR: () {
                        Share.share('Aquí tienes tu código de cliente para Estrella Delivery: ${cliente.codigoQr}');
                      },
                      onEditNombre: (nuevoNombre) async {
                        final ok = await ref.read(clienteServiceProvider).actualizarNombre(cliente.id, nuevoNombre);
                        if (ok) {
                          ref.refresh(clienteDetailProvider(clienteId));
                          if (context.mounted) {
                            PremiumToast.show(context, title: 'Nombre actualizado', icon: Icons.check_circle_rounded);
                          }
                        }
                      },
                      onEnviarTerminos: () async {
                        final ok = await ref.read(clienteServiceProvider).enviarTerminos(cliente.telefono, cliente.nombre ?? 'Cliente Express');
                        if (ok) {
                          if (context.mounted) {
                            PremiumToast.show(context, title: 'Términos enviados por WhatsApp', icon: Icons.send_rounded);
                          }
                        } else {
                          if (context.mounted) {
                            PremiumToast.show(context, title: 'Error al enviar términos', isError: true);
                          }
                        }
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
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
  final ValueChanged<String> onEditNombre;
  final VoidCallback onEnviarTerminos;
  final ScrollController scrollController;

  const _ClienteDetail({
    required this.cliente,
    required this.isAdmin,
    required this.scrollController,
    required this.onRedimir,
    required this.onCanjearSaldo,
    required this.onToggleVip,
    required this.onDelete,
    required this.onEditCosto,
    required this.onEditNotas,
    required this.onShareQR,
    required this.onEditNombre,
    required this.onEnviarTerminos,
  });

  void _showEditNombre(BuildContext context, String? currentName, ValueChanged<String> onSave) {
    final ctrl = TextEditingController(text: currentName);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Theme.of(context).colorScheme.surface,
        title: Text('Editar Nombre', style: TextStyle(color: Theme.of(context).colorScheme.onSurface)),
        content: TextField(
          controller: ctrl,
          style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
          decoration: InputDecoration(
            hintText: 'Nombre del cliente',
            hintStyle: TextStyle(color: Theme.of(context).colorScheme.onSurface.withOpacity(0.5)),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text('Cancelar', style: TextStyle(color: Theme.of(context).colorScheme.onSurface))),
          FilledButton(
            onPressed: () {
              if (ctrl.text.trim().isNotEmpty) {
                Navigator.pop(ctx);
                onSave(ctrl.text.trim());
              }
            },
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFFF6B35)),
            child: Text('Guardar'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      controller: scrollController,
      padding: const EdgeInsets.only(left: 20, right: 20, bottom: 40),
      children: [
        // Header card
        ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.7),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Colors.black.withOpacity(0.05)),
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
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        cliente.nombre ?? 'Cliente Express',
                        style: TextStyle(
                            fontSize: 22, fontWeight: FontWeight.w800, color: Colors.black87),
                      ),
                      IconButton(
                        icon: Icon(Icons.edit_rounded, size: 18, color: Colors.black87.withOpacity(0.5)),
                        onPressed: () => _showEditNombre(context, cliente.nombre, onEditNombre),
                      ),
                    ],
                  ),
                  if (cliente.nombre != null) ...[
                    SizedBox(height: 4),
                    Text(cliente.telefono,
                        style: TextStyle(color: Colors.black87.withOpacity(0.5), fontSize: 14)),
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
                  Divider(color: Colors.black.withOpacity(0.05)),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.workspace_premium_rounded,
                              color: cliente.esVip
                                  ? const Color(0xFFF59E0B)
                                  : Colors.black87.withOpacity(0.24),
                              size: 24),
                          SizedBox(width: 8),
                          Text(
                            'Cliente VIP',
                            style: TextStyle(
                                color: cliente.esVip ? const Color(0xFFF59E0B) : Colors.black54,
                                fontWeight: cliente.esVip ? FontWeight.w800 : FontWeight.normal),
                          ),
                        ],
                      ),
                  if (isAdmin)
                    Switch(
                      value: cliente.esVip,
                      onChanged: onToggleVip,
                      activeThumbColor: const Color(0xFFF59E0B),
                      activeTrackColor: const Color(0xFFF59E0B).withOpacity(0.4),
                    ),
                  if (!isAdmin)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: cliente.esVip
                            ? const Color(0xFFF59E0B).withOpacity(0.15)
                            : Colors.black87.withOpacity(0.06),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        cliente.esVip ? 'VIP' : 'Normal',
                        style: TextStyle(
                          color: cliente.esVip ? const Color(0xFFF59E0B) : Colors.black87.withOpacity(0.4),
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
                          Icon(Icons.attach_money_rounded, color: Colors.black87.withOpacity(0.5), size: 24),
                          SizedBox(width: 8),
                          Text(
                            'Costo de Envío',
                            style: TextStyle(color: Colors.black87.withOpacity(0.5)),
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
          ),
        ),
        if (!cliente.aceptaTerminos) ...[
          SizedBox(height: 16),
          InkWell(
            onTap: onEnviarTerminos,
            borderRadius: BorderRadius.circular(16),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFF6B35).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFFFF6B35).withOpacity(0.5)),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFFFF6B35).withOpacity(0.2),
                        blurRadius: 10,
                        spreadRadius: 2,
                      )
                    ],
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.chat_bubble_rounded, color: const Color(0xFFFF6B35), size: 28),
                      SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Cliente Express (Silencioso)', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold, fontSize: 16)),
                            SizedBox(height: 4),
                            Text('Toca aquí para enviarle los Términos y Condiciones por WhatsApp para afiliarlo al programa de lealtad.', style: TextStyle(color: Colors.black87.withOpacity(0.7), fontSize: 13)),
                          ],
                        ),
                      ),
                      Icon(Icons.send_rounded, color: const Color(0xFFFF6B35)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
        SizedBox(height: 24),
        // AI / Bot Instructions Box
        ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFF4C1D95).withOpacity(0.2), // Dark violet glass
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFF8B5CF6).withOpacity(0.4)),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF8B5CF6).withOpacity(0.1),
                    blurRadius: 15,
                    spreadRadius: 1,
                  )
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.auto_awesome_rounded, color: const Color(0xFFD8B4FE), size: 20),
                          SizedBox(width: 8),
                          Text('Instrucciones para el Bot', style: TextStyle(color: const Color(0xFFD8B4FE), fontWeight: FontWeight.bold, letterSpacing: 0.5)),
                        ],
                      ),
                      InkWell(
                        onTap: () => _mostrarDialogoNotas(context),
                        child: Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            color: Colors.black.withOpacity(0.05),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Icon(Icons.edit_note_rounded, color: Colors.black87.withOpacity(0.8), size: 20),
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: 12),
                  Text(
                    (cliente.notasCrm?.isEmpty ?? true)
                        ? 'Sin reglas. Toca el botón para inyectar comportamiento personalizado a la IA para este cliente.'
                        : cliente.notasCrm!,
                    style: TextStyle(
                      color: (cliente.notasCrm?.isEmpty ?? true)
                          ? Colors.black87.withOpacity(0.5)
                          : Colors.black87.withOpacity(0.9),
                      fontSize: 13,
                      height: 1.5,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),

        SizedBox(height: 16),

        // VIP Billetera Card (solo para clientes VIP)
        if (cliente.esVip) ...[
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFFFFFFFF), Color(0xFFF1F5F9)], // Black premium card
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFFF59E0B).withOpacity(0.5), width: 1.5),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFF59E0B).withOpacity(0.2),
                  blurRadius: 20,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    const Icon(Icons.account_balance_wallet_rounded, color: Color(0xFFFCD34D), size: 24),
                    const SizedBox(width: 8),
                    const Text('Billetera VIP', style: TextStyle(color: Color(0xFFFCD34D), fontWeight: FontWeight.w900, fontSize: 18, letterSpacing: 1.0)),
                    const Spacer(),
                    const Icon(Icons.workspace_premium_rounded, color: Color(0xFFF59E0B), size: 22),
                  ],
                ),
                const SizedBox(height: 20),
                Text(
                  '\$${cliente.saldoBilletera.toStringAsFixed(2)}',
                  style: const TextStyle(color: Colors.black87, fontSize: 44, fontWeight: FontWeight.w900, height: 1, letterSpacing: -1),
                ),
                const SizedBox(height: 4),
                const Text('Saldo disponible', style: TextStyle(color: Colors.black54, fontSize: 14)),
                const SizedBox(height: 20),
                const Divider(color: Colors.black12, height: 1),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: cliente.saldoBilletera > 0 ? () => _mostrarDialogoCanjeVip(context) : null,
                  icon: const Icon(Icons.redeem_rounded, size: 18),
                  label: const Text('Canjear Saldo'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFF59E0B),
                    foregroundColor: Colors.black,
                    disabledBackgroundColor: Colors.black12,
                    disabledForegroundColor: Colors.black38,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    textStyle: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
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
        ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.7),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.black.withOpacity(0.05)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Progreso hacia gratis', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.w600)),
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
                            gradient: filled ? const LinearGradient(colors: [Color(0xFFFF6B35), Color(0xFFF97316)]) : null,
                            color: filled ? null : Colors.black.withOpacity(0.05),
                            borderRadius: BorderRadius.circular(7),
                            boxShadow: filled ? [
                              BoxShadow(color: const Color(0xFFFF6B35).withOpacity(0.4), blurRadius: 6, offset: const Offset(0, 2))
                            ] : [],
                          ),
                        ),
                      );
                    }),
                  ),
                  SizedBox(height: 10),
                  Text(
                    '${cliente.totalEnvios % 5} / 5 — Faltan ${cliente.enviosParaGratis}',
                    style: TextStyle(color: Colors.black87.withOpacity(0.6), fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
        ),
        SizedBox(height: 16),

        // QR Code Card
        ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.7),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Colors.black.withOpacity(0.05)),
              ),
              child: Column(
                children: [
                  Text(
                    'Código QR de Lealtad',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: Colors.black87),
                  ),
                  SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.08),
                          blurRadius: 20,
                          spreadRadius: 2,
                        )
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: QrImageView(
                        data: cliente.codigoQr,
                        version: QrVersions.auto,
                        size: 200,
                        backgroundColor: Colors.white,
                        eyeStyle: const QrEyeStyle(color: Colors.black),
                        dataModuleStyle: const QrDataModuleStyle(color: Colors.black),
                      ),
                    ),
                  ),
                  SizedBox(height: 16),
                  Text(
                    cliente.codigoQr,
                    style: TextStyle(color: Colors.black87.withOpacity(0.5), fontSize: 11, letterSpacing: 1.5),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                  ),
                  SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: onShareQR,
                      icon: const Icon(Icons.share_rounded, size: 18),
                      label: const Text('Compartir QR'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF3B82F6),
                        foregroundColor: Colors.black87,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        textStyle: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                ],
              ),
            ),
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
        Text('Escaneos Recientes', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.w600, fontSize: 16)),
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
          style: TextStyle(color: Colors.black87.withOpacity(0.4), fontSize: 12),
        ),
        SizedBox(height: 24),
      ],
    );
  }

  Future<void> _mostrarDialogoCosto(BuildContext context) async {
    final val = await PremiumBottomSheet.showInput(
      context,
      title: 'Costo de Envío',
      initialValue: (cliente.costoEnvio ?? 0) > 0 ? cliente.costoEnvio.toString() : '',
      hintText: 'Monto (\$) Ej: 30.00',
      confirmText: 'Guardar',
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
    );

    if (val != null) {
      final monto = double.tryParse(val) ?? 0.0;
      onEditCosto(monto);
    }
  }

  Future<void> _mostrarDialogoNotas(BuildContext context) async {
    final val = await PremiumBottomSheet.showInput(
      context,
      title: 'Programar Bot',
      content: 'El bot leerá esto antes de contestarle al cliente.',
      initialValue: cliente.notasCrm,
      hintText: 'Ej: "Siempre recoge en la terminal..."',
      confirmText: 'Inyectar al Bot',
      maxLines: 4,
    );

    if (val != null) {
      onEditNotas(val);
    }
  }

  Future<void> _mostrarDialogoCanjeVip(BuildContext context) async {
    final val = await PremiumBottomSheet.showInput(
      context,
      title: 'Canjear Saldo VIP',
      content: 'Saldo actual: \$${cliente.saldoBilletera.toStringAsFixed(2)}',
      hintText: 'Monto a canjear (\$) Ej: 45.00',
      confirmText: 'Canjear',
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
    );

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
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.7),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: color.withOpacity(0.4)),
            boxShadow: [
              BoxShadow(
                color: color.withOpacity(0.1),
                blurRadius: 10,
                spreadRadius: 1,
              ),
            ],
          ),
          child: Column(
            children: [
              Icon(icon, color: color, size: 24),
              SizedBox(height: 6),
              Text(value,
                  style: TextStyle(
                      color: Colors.black87, fontWeight: FontWeight.w900, fontSize: 22)),
              Text(label,
                  style: TextStyle(color: Colors.black87.withOpacity(0.6), fontSize: 11, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
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
          return ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
              child: Container(
                padding: const EdgeInsets.all(16),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.7),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.black.withOpacity(0.05)),
                ),
                child: Text('Aún no hay puntos registrados', style: TextStyle(color: Colors.black87.withOpacity(0.5), fontSize: 13)),
              ),
            ),
          );
        }

        return Column(
          children: history.map((mov) {
            final isGratis = mov['tipo'] != 'acumulacion';
            final dt = DateTime.parse(mov['created_at']);
            
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.7),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.black.withOpacity(0.05)),
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
                              Text(isGratis ? 'Canje Gratis' : '+1 Punto Acumulado', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.w600, fontSize: 14)),
                              Text('${dt.day}/${dt.month}/${dt.year} a las ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}', style: TextStyle(color: Colors.black87.withOpacity(0.5), fontSize: 12)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        );
      },
    );
  }
}


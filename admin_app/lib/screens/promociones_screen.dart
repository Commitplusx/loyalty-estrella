// lib/screens/promociones_screen.dart — Panel de Marketing / Promociones
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/promocion_service.dart';
import '../core/ui_helpers.dart';

class PromocionesScreen extends ConsumerWidget {
  const PromocionesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final promosAsync = ref.watch(promocionesAdminProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0A0A0A) : const Color(0xFFF5F5F7),
      appBar: AppBar(
        backgroundColor: isDark ? const Color(0xFF0A0A0A) : const Color(0xFFF5F5F7),
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Promociones',
                style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    color: isDark ? Colors.white : Colors.black)),
            Text('Centro de Marketing',
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: isDark ? Colors.white38 : Colors.black38,
                    letterSpacing: 0.5)),
          ],
        ),
        actions: [
          // Botón para ver métricas de inversión
          GestureDetector(
            onTap: () => _showInversionDialog(context, ref),
            child: Container(
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: isDark
                    ? Colors.white.withOpacity(0.08)
                    : Colors.black.withOpacity(0.06),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.analytics_rounded,
                  size: 20,
                  color: isDark ? Colors.white60 : Colors.black54),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCrearPromoDialog(context, ref),
        backgroundColor: const Color(0xFFEC4899),
        icon: const Icon(Icons.add_rounded, color: Colors.white),
        label: const Text('Nueva Promo',
            style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.3)),
      ),
      body: RefreshIndicator(
        color: isDark ? Colors.white : Colors.black,
        backgroundColor: isDark ? const Color(0xFF1A1A1A) : Colors.white,
        onRefresh: () async => ref.invalidate(promocionesAdminProvider),
        child: promosAsync.when(
          loading: () => const Center(
              child: CircularProgressIndicator(strokeWidth: 2)),
          error: (e, _) => Center(
              child: Text('Error: $e',
                  style: TextStyle(color: Theme.of(context).colorScheme.error))),
          data: (promos) {
            if (promos.isEmpty) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(40),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEC4899).withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.local_offer_rounded,
                            color: Color(0xFFEC4899), size: 48),
                      ),
                      const SizedBox(height: 20),
                      Text('Sin Promociones',
                          style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                              color: isDark ? Colors.white : Colors.black)),
                      const SizedBox(height: 8),
                      Text(
                          'Crea tu primera promoción para atraer más clientes.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 13,
                              color: isDark ? Colors.white38 : Colors.black38)),
                    ],
                  ),
                ),
              );
            }

            return ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(
                  parent: BouncingScrollPhysics()),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
              itemCount: promos.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (ctx, i) => _PromoCard(
                promo: promos[i],
                isDark: isDark,
              ),
            );
          },
        ),
      ),
    );
  }

  void _showInversionDialog(BuildContext context, WidgetRef ref) async {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final service = ref.read(promocionServiceProvider);

    showDialog(
      context: context,
      builder: (ctx) => FutureBuilder<double>(
        future: service.getInversionCupones(
            desde: DateTime.now().subtract(const Duration(days: 30))),
        builder: (ctx, snap) {
          final total = snap.data ?? 0;
          return AlertDialog(
            backgroundColor:
                isDark ? const Color(0xFF1A1A1A) : Colors.white,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24)),
            title: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF06B6D4).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.analytics_rounded,
                      color: Color(0xFF06B6D4), size: 22),
                ),
                const SizedBox(width: 12),
                Text('ROI Marketing',
                    style: TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 17,
                        color: isDark ? Colors.white : Colors.black)),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _MetricRow(
                    label: 'Inversión (30 días)',
                    value: '\$${total.toStringAsFixed(0)}',
                    color: const Color(0xFFEC4899)),
                const SizedBox(height: 8),
                Text(
                  'Total de descuentos otorgados en los últimos 30 días.',
                  style: TextStyle(
                      fontSize: 12,
                      color: isDark ? Colors.white38 : Colors.black38),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: Text('Cerrar',
                    style: TextStyle(
                        color: isDark ? Colors.white54 : Colors.black54,
                        fontWeight: FontWeight.w700)),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showCrearPromoDialog(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _CrearPromoSheet(ref: ref),
    );
  }
}

// ── Tarjeta de Promoción ──
class _PromoCard extends ConsumerWidget {
  final Map<String, dynamic> promo;
  final bool isDark;
  const _PromoCard({required this.promo, required this.isDark});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bool activa = promo['activa'] == true;
    final int usosActuales = promo['usos_actuales'] ?? 0;
    final int? usoMaximo = promo['uso_maximo'];
    final double progreso =
        usoMaximo != null && usoMaximo > 0 ? (usosActuales / usoMaximo).clamp(0.0, 1.0) : 0.0;
    final bool agotada = usoMaximo != null && usoMaximo > 0 && usosActuales >= usoMaximo;
    final String? codigo = promo['codigo'];
    final String tipo = promo['tipo'] ?? '';
    final double valor = ((promo['valor'] ?? 0) as num).toDouble();

    final Color accentColor = agotada
        ? Colors.grey
        : activa
            ? const Color(0xFF22C55E)
            : const Color(0xFFF59E0B);

    String tipoLabel;
    String valorLabel;
    switch (tipo) {
      case 'envio_fijo':
        tipoLabel = 'ENVÍO FIJO';
        valorLabel = '\$${valor.toStringAsFixed(0)}';
        break;
      case 'porcentaje':
        tipoLabel = 'DESCUENTO';
        valorLabel = '${valor.toStringAsFixed(0)}%';
        break;
      case 'monto_fijo':
        tipoLabel = 'DESCUENTO FIJO';
        valorLabel = '-\$${valor.toStringAsFixed(0)}';
        break;
      default:
        tipoLabel = tipo.toUpperCase();
        valorLabel = '\$${valor.toStringAsFixed(0)}';
    }

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A1A1A) : Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: isDark
              ? Colors.white.withOpacity(0.07)
              : Colors.black.withOpacity(0.08),
        ),
        boxShadow: isDark
            ? []
            : [
                BoxShadow(
                    color: Colors.black.withOpacity(0.04),
                    blurRadius: 12,
                    offset: const Offset(0, 4))
              ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: Tipo + Toggle
          Row(
            children: [
              // Ícono
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: accentColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  agotada
                      ? Icons.block_rounded
                      : activa
                          ? Icons.local_offer_rounded
                          : Icons.pause_circle_outline_rounded,
                  color: accentColor,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              // Texto
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: accentColor.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(tipoLabel,
                              style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 1,
                                  color: accentColor)),
                        ),
                        if (codigo != null)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: isDark
                                  ? Colors.white.withOpacity(0.08)
                                  : Colors.black.withOpacity(0.06),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(codigo,
                                style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 1.2,
                                    color: isDark
                                        ? Colors.white54
                                        : Colors.black54)),
                          ),
                        if (codigo == null)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: const Color(0xFF8B5CF6).withOpacity(0.12),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text('AUTO',
                                style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 1,
                                    color: Color(0xFF8B5CF6))),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      promo['descripcion'] ?? 'Sin descripción',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: isDark ? Colors.white : Colors.black),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              // Valor grande
              Text(valorLabel,
                  style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                      color: accentColor,
                      letterSpacing: -1)),
            ],
          ),

          const SizedBox(height: 16),

          // Barra de progreso de usos
          if (usoMaximo != null && usoMaximo > 0) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('$usosActuales de $usoMaximo usos',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: isDark ? Colors.white38 : Colors.black38)),
                Text('${(progreso * 100).toStringAsFixed(0)}%',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: accentColor)),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: progreso,
                minHeight: 8,
                backgroundColor: isDark
                    ? Colors.white.withOpacity(0.06)
                    : Colors.black.withOpacity(0.06),
                valueColor: AlwaysStoppedAnimation(accentColor),
              ),
            ),
            const SizedBox(height: 12),
          ],

          // Acciones: Toggle + Eliminar
          Row(
            children: [
              // Toggle activa/inactiva
              Expanded(
                child: GestureDetector(
                  onTap: agotada
                      ? null
                      : () async {
                          final error = await ref
                              .read(promocionServiceProvider)
                              .toggleCupon(
                                  promo['id'].toString(), !activa);
                          if (error != null && context.mounted) {
                            PremiumToast.show(context,
                                title: 'Error',
                                description: error,
                                isError: true);
                          } else {
                            ref.invalidate(promocionesAdminProvider);
                          }
                        },
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      color: agotada
                          ? Colors.grey.withOpacity(0.1)
                          : activa
                              ? const Color(0xFFF59E0B).withOpacity(0.1)
                              : const Color(0xFF22C55E).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          agotada
                              ? Icons.block_rounded
                              : activa
                                  ? Icons.pause_rounded
                                  : Icons.play_arrow_rounded,
                          color: agotada
                              ? Colors.grey
                              : activa
                                  ? const Color(0xFFF59E0B)
                                  : const Color(0xFF22C55E),
                          size: 18,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          agotada
                              ? 'Agotada'
                              : activa
                                  ? 'Pausar'
                                  : 'Activar',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: agotada
                                ? Colors.grey
                                : activa
                                    ? const Color(0xFFF59E0B)
                                    : const Color(0xFF22C55E),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              // Eliminar
              GestureDetector(
                onTap: () async {
                  final confirmar = await PremiumBottomSheet.showConfirm(
                    context,
                    title: '¿Eliminar Promoción?',
                    content:
                        'Se eliminará "${promo['descripcion']}". Esta acción no se puede deshacer.',
                    confirmText: 'Eliminar',
                    cancelText: 'Cancelar',
                  );
                  if (confirmar == true) {
                    final error = await ref
                        .read(promocionServiceProvider)
                        .eliminarCupon(promo['id'].toString());
                    if (context.mounted) {
                      if (error != null) {
                        PremiumToast.show(context,
                            title: 'Error',
                            description: error,
                            isError: true);
                      } else {
                        PremiumToast.show(context,
                            title: 'Eliminada',
                            description: 'Promoción eliminada correctamente',
                            isError: false);
                        ref.invalidate(promocionesAdminProvider);
                      }
                    }
                  }
                },
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Theme.of(context)
                        .colorScheme
                        .error
                        .withOpacity(0.1),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(Icons.delete_outline_rounded,
                      color: Theme.of(context).colorScheme.error, size: 20),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Metric Row (para dialog de ROI) ──
class _MetricRow extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _MetricRow(
      {required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: isDark ? Colors.white70 : Colors.black54)),
          Text(value,
              style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  color: color,
                  letterSpacing: -0.5)),
        ],
      ),
    );
  }
}

// ── Sheet para Crear Promoción ──
class _CrearPromoSheet extends StatefulWidget {
  final WidgetRef ref;
  const _CrearPromoSheet({required this.ref});

  @override
  State<_CrearPromoSheet> createState() => _CrearPromoSheetState();
}

class _CrearPromoSheetState extends State<_CrearPromoSheet> {
  final _descripcionCtrl = TextEditingController();
  final _valorCtrl = TextEditingController();
  final _limiteCtrl = TextEditingController();
  final _codigoCtrl = TextEditingController();

  String _tipoDescuento = 'envio_fijo';
  bool _esCodigo = false;
  bool _loading = false;

  @override
  void dispose() {
    _descripcionCtrl.dispose();
    _valorCtrl.dispose();
    _limiteCtrl.dispose();
    _codigoCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      margin: EdgeInsets.only(bottom: bottomInset),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1A1A1A) : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Handle bar
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: isDark ? Colors.white24 : Colors.black12,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Título
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEC4899).withOpacity(0.12),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.local_offer_rounded,
                      color: Color(0xFFEC4899), size: 22),
                ),
                const SizedBox(width: 12),
                Text('Nueva Promoción',
                    style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        color: isDark ? Colors.white : Colors.black)),
              ],
            ),
            const SizedBox(height: 24),

            // Descripción
            _buildTextField(
              controller: _descripcionCtrl,
              label: 'Descripción',
              hint: 'Ej: Envío a \$20 para los primeros 20 clientes',
              isDark: isDark,
            ),
            const SizedBox(height: 16),

            // Tipo de Descuento
            Text('Tipo de Descuento',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: isDark ? Colors.white38 : Colors.black38)),
            const SizedBox(height: 8),
            Row(
              children: [
                _buildTipoChip('envio_fijo', '🚛 Envío Fijo', isDark),
                const SizedBox(width: 8),
                _buildTipoChip('porcentaje', '📦 % Descuento', isDark),
                const SizedBox(width: 8),
                _buildTipoChip('monto_fijo', '💰 \$ Fijo', isDark),
              ],
            ),
            const SizedBox(height: 16),

            // Valor + Límite en una Row
            Row(
              children: [
                Expanded(
                  child: _buildTextField(
                    controller: _valorCtrl,
                    label: _tipoDescuento == 'porcentaje'
                        ? 'Porcentaje (%)'
                        : 'Valor (\$)',
                    hint: _tipoDescuento == 'porcentaje'
                        ? 'Ej: 15'
                        : 'Ej: 20',
                    isDark: isDark,
                    isNumeric: true,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildTextField(
                    controller: _limiteCtrl,
                    label: 'Límite de Usos',
                    hint: 'Ej: 20 (0 = ilimitado)',
                    isDark: isDark,
                    isNumeric: true,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Toggle Automática / Con Código
            GestureDetector(
              onTap: () => setState(() => _esCodigo = !_esCodigo),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: isDark
                      ? Colors.white.withOpacity(0.06)
                      : Colors.black.withOpacity(0.04),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: _esCodigo
                        ? const Color(0xFF8B5CF6).withOpacity(0.5)
                        : (isDark
                            ? Colors.white.withOpacity(0.08)
                            : Colors.black.withOpacity(0.08)),
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                        _esCodigo
                            ? Icons.vpn_key_rounded
                            : Icons.auto_awesome_rounded,
                        color: _esCodigo
                            ? const Color(0xFF8B5CF6)
                            : const Color(0xFF22C55E),
                        size: 20),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                              _esCodigo
                                  ? 'Requiere Código'
                                  : 'Automática',
                              style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: isDark
                                      ? Colors.white
                                      : Colors.black)),
                          Text(
                              _esCodigo
                                  ? 'El cliente debe escribir un código'
                                  : 'Se aplica sola a todos los pedidos',
                              style: TextStyle(
                                  fontSize: 11,
                                  color: isDark
                                      ? Colors.white38
                                      : Colors.black38)),
                        ],
                      ),
                    ),
                    Container(
                      width: 44,
                      height: 26,
                      decoration: BoxDecoration(
                        color: _esCodigo
                            ? const Color(0xFF8B5CF6)
                            : (isDark
                                ? Colors.white.withOpacity(0.15)
                                : Colors.black.withOpacity(0.12)),
                        borderRadius: BorderRadius.circular(13),
                      ),
                      child: AnimatedAlign(
                        duration: const Duration(milliseconds: 200),
                        curve: Curves.easeInOut,
                        alignment: _esCodigo
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          width: 20,
                          height: 20,
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          decoration: const BoxDecoration(
                            color: Colors.white,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Campo de Código (condicional)
            if (_esCodigo) ...[
              const SizedBox(height: 12),
              _buildTextField(
                controller: _codigoCtrl,
                label: 'Código Promocional',
                hint: 'Ej: HOLA20',
                isDark: isDark,
                capitalize: true,
              ),
            ],

            const SizedBox(height: 24),

            // Botón CREAR
            GestureDetector(
              onTap: _loading ? null : () => _crearPromo(context),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(vertical: 18),
                decoration: BoxDecoration(
                  color: _loading
                      ? Colors.grey
                      : const Color(0xFFEC4899),
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: _loading
                      ? []
                      : [
                          BoxShadow(
                              color:
                                  const Color(0xFFEC4899).withOpacity(0.4),
                              blurRadius: 16,
                              offset: const Offset(0, 6))
                        ],
                ),
                child: Center(
                  child: _loading
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Text('Crear Promoción',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.3)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTipoChip(String value, String label, bool isDark) {
    final selected = _tipoDescuento == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _tipoDescuento = value),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: selected
                ? const Color(0xFFEC4899).withOpacity(0.12)
                : (isDark
                    ? Colors.white.withOpacity(0.06)
                    : Colors.black.withOpacity(0.04)),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected
                  ? const Color(0xFFEC4899).withOpacity(0.5)
                  : Colors.transparent,
            ),
          ),
          child: Center(
            child: Text(label,
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: selected
                        ? const Color(0xFFEC4899)
                        : (isDark ? Colors.white54 : Colors.black54))),
          ),
        ),
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required bool isDark,
    bool isNumeric = false,
    bool capitalize = false,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: isDark ? Colors.white38 : Colors.black38)),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType:
              isNumeric ? TextInputType.number : TextInputType.text,
          textCapitalization: capitalize
              ? TextCapitalization.characters
              : TextCapitalization.sentences,
          inputFormatters: isNumeric
              ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))]
              : [],
          style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: isDark ? Colors.white : Colors.black),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(
                color: isDark ? Colors.white24 : Colors.black26,
                fontWeight: FontWeight.w500),
            filled: true,
            fillColor: isDark
                ? Colors.white.withOpacity(0.06)
                : Colors.black.withOpacity(0.04),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide.none,
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          ),
        ),
      ],
    );
  }

  Future<void> _crearPromo(BuildContext context) async {
    final desc = _descripcionCtrl.text.trim();
    final valorStr = _valorCtrl.text.trim();
    final limiteStr = _limiteCtrl.text.trim();

    if (desc.isEmpty || valorStr.isEmpty) {
      PremiumToast.show(context,
          title: 'Campos requeridos',
          description: 'Completa la descripción y el valor.',
          isError: true);
      return;
    }

    final valor = double.tryParse(valorStr);
    if (valor == null || valor <= 0) {
      PremiumToast.show(context,
          title: 'Valor inválido',
          description: 'Ingresa un número mayor a 0.',
          isError: true);
      return;
    }

    final limite = int.tryParse(limiteStr) ?? 0;
    final codigo = _esCodigo ? _codigoCtrl.text.trim() : null;

    if (_esCodigo && (codigo == null || codigo.isEmpty)) {
      PremiumToast.show(context,
          title: 'Código requerido',
          description: 'Ingresa el código promocional.',
          isError: true);
      return;
    }

    setState(() => _loading = true);

    final error =
        await widget.ref.read(promocionServiceProvider).crearCupon(
              descripcion: desc,
              tipoDescuento: _tipoDescuento,
              valor: valor,
              limiteUsos: limite,
              codigo: codigo,
            );

    if (mounted) {
      setState(() => _loading = false);

      if (error != null) {
        PremiumToast.show(context,
            title: 'Error', description: error, isError: true);
      } else {
        widget.ref.invalidate(promocionesAdminProvider);
        Navigator.pop(context);
        PremiumToast.show(context,
            title: '¡Promoción Creada!',
            description:
                'Ya está disponible para tus clientes.',
            isError: false);
      }
    }
  }
}

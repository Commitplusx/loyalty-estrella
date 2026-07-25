const fs = require('fs');

const path = 'C:/Users/Kaleb/Desktop/loyalty-estrella/admin_app/lib/screens/driver_dashboard_view.dart';
let content = fs.readFileSync(path, 'utf8');
let lines = content.split('\n');

// Find the end of _toggleStatus
let toggleStatusEndIndex = lines.findIndex((l, i) => l === "  }" && lines[i-1] === "    }" && lines[i-2] === "      }");

// Find the corrupted _TopToastWidget
let topToastIndex = lines.findIndex(l => l.includes("  final Color color;") && lines.indexOf(l) > toggleStatusEndIndex);

// Find TipItem
let tipItemIndex = lines.findIndex(l => l.includes("class _TipItem extends StatelessWidget {"));

let part1 = lines.slice(0, toggleStatusEndIndex + 1);

let mainBuildMethod = `
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ganancias = widget.stats?['ganancias'] ?? 0.0;
    
    // Si está en línea, mostrar el MODO RADAR (Mapa completo + BottomSheet)
    if (_isOnline) {
      return _buildRadarMode(context, isDark, cs, ganancias);
    } else {
      return _buildOfflineDashboard(context, isDark, cs, ganancias);
    }
  }

  Widget _buildRadarMode(BuildContext context, bool isDark, ColorScheme cs, dynamic ganancias) {
    final nextStop = _calcularProximaParada();
    
    return Stack(
      children: [
        // Mapa 100% de fondo (sin mapController para evitar conflicto con el mapa del dashboard offline)
        Positioned.fill(
          child: FlutterMap(
            options: MapOptions(
              initialCenter: _currentLocation,
              initialZoom: 15,
              interactionOptions: const InteractionOptions(flags: InteractiveFlag.all),
            ),
            children: [
              TileLayer(
                urlTemplate: isDark
                    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                subdomains: const ['a', 'b', 'c', 'd'],
              ),
              MarkerLayer(
                markers: [
                  // Hotspot animado (Zonas de alta demanda)
                  if (_pedidosActivos.isEmpty)
                    Marker(
                      point: _currentLocation,
                      width: 250, height: 250,
                      child: SafePulse(
                        child: Container(
                          decoration: BoxDecoration(
                            color: Colors.red.withOpacity(0.15),
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.red.withOpacity(0.5), width: 2),
                          ),
                        ),
                      ),
                    ),
                  
                  // Marcador del repartidor animado
                  Marker(
                    point: _currentLocation,
                    width: 60, height: 60,
                    child: SafePulse(
                      child: Container(
                        decoration: BoxDecoration(
                          color: Colors.blueAccent,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 3),
                          boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 6, offset: Offset(0, 3))]
                        ),
                        child: const Icon(Icons.two_wheeler_rounded, color: Colors.white, size: 28),
                      ),
                    ),
                  ),
                  // Marcador de destino animado
                  if (nextStop != null)
                    Marker(
                      point: LatLng(nextStop['targetLat'], nextStop['targetLng']),
                      width: 50, height: 50,
                      child: SafePulse(
                        child: Icon(
                          nextStop['isPickup'] ? Icons.storefront_rounded : Icons.person_pin_circle_rounded,
                          color: nextStop['isPickup'] ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
                          size: 44,
                          shadows: const [Shadow(color: Colors.black38, blurRadius: 8)],
                        ),
                      ),
                    )
                ]
              )
            ]
          )
        ),
        
        // Cabecera: Ganancias
        Positioned(
          top: 16, left: 16, right: 16,
          child: SafeArea(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(
                    color: isDark ? Colors.black87 : Colors.white,
                    borderRadius: BorderRadius.circular(30),
                    boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 10)],
                  ),
                  child: GestureDetector(
                    onTap: () => context.push('/ganancias'),
                    child: Row(
                      children: [
                        const Icon(Icons.monetization_on_rounded, color: Color(0xFFF59E0B), size: 20),
                        const SizedBox(width: 8),
                        Text('\\$${(ganancias as num).toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                        const SizedBox(width: 4),
                        Icon(Icons.chevron_right_rounded, size: 16, color: isDark ? Colors.white38 : Colors.black38),
                      ]
                    ),
                  ),
                ),
                GestureDetector(
                  onTap: _sosSending ? null : () async {
                    final confirm = await showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                        title: const Text('🆘 Enviar Emergencia', style: TextStyle(fontWeight: FontWeight.bold)),
                        content: const Text('Se enviará una alerta de emergencia al Administrador con tu ubicación actual.\\n\\n¿Confirmas que estás en una situación de emergencia?'),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar', style: TextStyle(color: Colors.grey))),
                          FilledButton(
                            onPressed: () => Navigator.pop(ctx, true), 
                            style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
                            child: const Text('ENVIAR SOS', style: TextStyle(fontWeight: FontWeight.bold)),
                          ),
                        ],
                      ),
                    );
                      if (confirm == true) {
                        setState(() => _sosSending = true);
                        final success = await ref.read(repartidorServiceProvider).enviarSOS(
                          _repartidorNombre,
                          lat: _currentLocation.latitude,
                          lng: _currentLocation.longitude,
                        );
                      setState(() => _sosSending = false);
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                          content: Text(success ? 'ALERTA SOS ENVIADA' : 'Error al enviar alerta'),
                          backgroundColor: success ? Colors.redAccent : Colors.orange,
                        ));
                      }
                    }
                  },
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.redAccent,
                      shape: BoxShape.circle,
                      boxShadow: [BoxShadow(color: Colors.redAccent.withOpacity(0.5), blurRadius: 10)],
                    ),
                    child: _sosSending 
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Icon(Icons.shield_rounded, color: Colors.white, size: 20)
                  )
                )
              ]
            )
          )
        ),
        
        // Panel Inferior
        Align(
          alignment: Alignment.bottomCenter,
          child: nextStop != null 
             ? _buildActiveOrderCard(nextStop) 
             : _buildSearchingOrdersSheet(isDark),
        )
      ]
    );
  }

  Widget _buildSearchingOrdersSheet(bool isDark) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
        borderRadius: BorderRadius.circular(32),
        boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 20, offset: Offset(0, 10))]
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Autoaceptación', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              Switch(value: false, onChanged: (v) {}, activeColor: Colors.redAccent),
            ],
          ),
          const Divider(),
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(Icons.trending_up_rounded, color: Colors.grey),
              const SizedBox(width: 12),
              const Expanded(child: Text('Gana más en las zonas rojas', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600))),
            ]
          ),
          const SizedBox(height: 24),
          AnimatedScale(
            scale: _isSuccess ? 1.05 : 1.0,
            duration: const Duration(milliseconds: 400),
            curve: Curves.elasticOut,
            child: GestureDetector(
              onTap: (_isPressed || _isSuccess) ? null : () => _toggleStatus(false),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                width: double.infinity,
                height: 56,
                decoration: BoxDecoration(
                  color: _isSuccess
                      ? const Color(0xFF10B981)
                      : _isPressed
                          ? Colors.grey.withOpacity(0.1)
                          : Colors.transparent,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: _isSuccess
                        ? const Color(0xFF10B981)
                        : _isPressed
                            ? Colors.grey
                            : Colors.redAccent,
                    width: 2,
                  ),
                ),
                alignment: Alignment.center,
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 300),
                  child: _isSuccess
                      ? Row(
                          mainAxisSize: MainAxisSize.min,
                          key: const ValueKey('success'),
                          children: const [
                            Icon(Icons.check_circle_rounded, color: Colors.white),
                            SizedBox(width: 8),
                            Text(
                              '¡DESCONECTADO!',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1,
                              ),
                            ),
                          ],
                        )
                      : _isPressed
                          ? Row(
                              mainAxisSize: MainAxisSize.min,
                              key: const ValueKey('loading'),
                              children: const [
                                SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.grey, strokeWidth: 2)),
                                SizedBox(width: 8),
                                Text(
                                  'DESCONECTANDO...',
                                  style: TextStyle(
                                    color: Colors.grey,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 1,
                                  ),
                                ),
                              ],
                            )
                          : Row(
                              mainAxisSize: MainAxisSize.min,
                              key: const ValueKey('idle'),
                              children: const [
                                Icon(Icons.power_settings_new_rounded, color: Colors.redAccent),
                                SizedBox(width: 8),
                                Text(
                                  'APAGAR TURNO',
                                  style: TextStyle(
                                    color: Colors.redAccent,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 1,
                                  ),
                                ),
                              ],
                            ),
                ),
              ),
            ),
          )
        ]
      )
    );
  }

  Widget _buildActiveOrderCard(Map<String, dynamic> nextStop) {
    final pedido = nextStop['pedido'];
    final isPickup = nextStop['isPickup'];
    
    return Container(
      margin: const EdgeInsets.only(bottom: 16, left: 16, right: 16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isPickup ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: (isPickup ? const Color(0xFFF59E0B) : const Color(0xFF10B981)).withOpacity(0.4),
            blurRadius: 15,
            offset: const Offset(0, 8)
          )
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(isPickup ? Icons.storefront_rounded : Icons.person_pin_circle_rounded, color: Colors.white, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  nextStop['action'], 
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16, letterSpacing: 1)
                )
              ),
              if (_pedidosActivos.length > 1)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(12)),
                  child: Text('+${_pedidosActivos.length - 1} en cola', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                )
            ],
          ),
          const SizedBox(height: 12),
          Text(nextStop['title'], style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(nextStop['subtitle'], maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70, fontSize: 14)),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                 context.push('/pedidos/${pedido['id']}');
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: isPickup ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: const Text('VER DETALLES', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOfflineDashboard(BuildContext context, bool isDark, ColorScheme cs, dynamic ganancias) {
    final deuda = widget.stats?['deuda'] ?? 0.0;
    
    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      child: Padding(
        padding: const EdgeInsets.only(bottom: 120, top: 40, left: 16, right: 16),
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0.0, end: 1.0),
          duration: const Duration(milliseconds: 700),
          curve: Curves.easeOutCubic,
          builder: (context, value, child) {
            return Transform.translate(
              offset: Offset(0, 40 * (1 - value)),
              child: Opacity(
                opacity: value,
                child: child,
              ),
            );
          },
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Texto de Estado
              Center(
                child: Text(
                  'Estás desconectado',
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.5,
                    color: cs.onSurface,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Center(
                child: Text(
                  'Conéctate para empezar a recibir\\npedidos y generar ganancias.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 15,
                    color: cs.onSurfaceVariant.withOpacity(0.7),
                    fontWeight: FontWeight.w500,
                    height: 1.4,
                  ),
                ),
              ),
              const SizedBox(height: 64),
              // Botón Circular "INICIAR"
              Center(
                child: GestureDetector(
                  onTap: () => _toggleStatus(true),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    width: 160,
                    height: 160,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        colors: [Color(0xFF3B82F6), Color(0xFF2563EB)], // Azul brillante
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF3B82F6).withOpacity(0.4),
                          blurRadius: 30,
                          spreadRadius: 10,
                          offset: const Offset(0, 10),
                        ),
                        BoxShadow(
                          color: Colors.white.withOpacity(isDark ? 0.05 : 0.2),
                          blurRadius: 0,
                          spreadRadius: 8,
                        ),
                      ],
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: const [
                        Icon(Icons.power_settings_new_rounded, color: Colors.white, size: 48),
                        SizedBox(height: 8),
                        Text(
                          'INICIAR',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 2,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 72),
              // Tarjeta de Billetera (Rediseñada)
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1E293B) : Colors.white,
                  borderRadius: BorderRadius.circular(32),
                  border: Border.all(color: isDark ? Colors.white10 : Colors.black.withOpacity(0.05)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(isDark ? 0.3 : 0.05),
                      blurRadius: 20,
                      offset: const Offset(0, 10),
                    )
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: const Color(0xFF10B981).withOpacity(0.15),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(Icons.account_balance_wallet_rounded, color: Color(0xFF10B981), size: 20),
                            ),
                            const SizedBox(width: 12),
                            Text(
                              'MI BILLETERA',
                              style: TextStyle(
                                fontSize: 14,
                                color: isDark ? Colors.white70 : Colors.black54,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.2,
                              ),
                            ),
                          ],
                        ),
                        GestureDetector(
                          onTap: () => context.push('/ganancias'),
                          child: Icon(Icons.chevron_right_rounded, color: isDark ? Colors.white38 : Colors.black38, size: 24),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    Row(
                      children: [
                        // Ganancias (tap a /ganancias)
                        Expanded(
                          child: GestureDetector(
                            onTap: () => context.push('/ganancias'),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Ganancias', style: TextStyle(fontSize: 13, color: isDark ? Colors.white70 : Colors.black54, fontWeight: FontWeight.w600)),
                                const SizedBox(height: 4),
                                Text('\\$${(ganancias as num).toStringAsFixed(2)}', style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Color(0xFF10B981), letterSpacing: -1)),
                              ],
                            ),
                          ),
                        ),
                        Container(width: 1, height: 50, color: isDark ? Colors.white12 : Colors.black12),
                        // Efectivo a entregar (tap abre desglose)
                        Expanded(
                          child: GestureDetector(
                            onTap: (deuda as num) > 0 ? () => _mostrarDeudaDetalle(isDark) : null,
                            child: Padding(
                              padding: const EdgeInsets.only(left: 16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Text('Efectivo a entregar', style: TextStyle(fontSize: 13, color: isDark ? Colors.white70 : Colors.black54, fontWeight: FontWeight.w600)),
                                      if ((deuda as num) > 0) ...[
                                        const SizedBox(width: 4),
                                        const Icon(Icons.info_outline_rounded, size: 14, color: Color(0xFFF43F5E)),
                                      ],
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  Text('\\$${(deuda as num).toStringAsFixed(2)}', style: TextStyle(\n                                    fontSize: 24, fontWeight: FontWeight.w900,\n                                    color: (deuda as num) > 0 ? const Color(0xFFF43F5E) : (isDark ? Colors.white54 : Colors.black38),\n                                    letterSpacing: -1,\n                                    decoration: (deuda as num) > 0 ? TextDecoration.underline : null,\n                                    decorationColor: const Color(0xFFF43F5E),\n                                  )),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
`;

let part2_start = `
class _TopToastWidget extends StatefulWidget {
  final String message;
`;

let topToastContent = lines.slice(topToastIndex, tipItemIndex).join('\n');
// We need to add a closing brace } to _TopToastWidgetState's build method just before TipItem.
// Actually, _TopToastWidgetState lacks a closing brace for the CLASS itself.
let part2 = part2_start + topToastContent + "\n}\n\n";

let tipItemClassDef = lines[tipItemIndex]; // class _TipItem extends StatelessWidget {
let tipItemConstructorIndex = lines.findIndex((l, i) => i > tipItemIndex && l.includes("const _TipItem("));

let tipItemStartBlock = lines.slice(tipItemIndex, tipItemConstructorIndex + 1).join('\n');

let tipItemBuild = `
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 14, 
                fontWeight: FontWeight.w500,
                color: isCheck == false ? Colors.red : null,
              ),
            ),
          ),
          if (isCheck != null)
            Icon(
              isCheck! ? Icons.check_circle_rounded : Icons.cancel_rounded,
              color: isCheck! ? const Color(0xFF10B981) : Colors.red,
              size: 20,
            ),
        ],
      ),
    );
  }
}
`;

let finalContent = part1.join('\n') + '\n' + mainBuildMethod + '\n' + part2 + tipItemStartBlock + '\n' + tipItemBuild;

fs.writeFileSync(path, finalContent);
console.log("File reconstructed perfectly.");

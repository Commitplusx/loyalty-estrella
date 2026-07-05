import re

with open('lib/screens/driver_dashboard_view.dart', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the start of build method
build_start = content.find('  @override\n  Widget build(BuildContext context) {')
# Find the end of _DriverDashboardViewState
class_end = content.find('class _StatBadge')
if class_end != -1:
    # Find the last closing brace before class _StatBadge
    last_brace = content.rfind('}', build_start, class_end)
    if last_brace != -1:
        end_idx = last_brace + 1

new_build = '''  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final ganancias = widget.stats?['ganancias'] ?? 0.0;
    
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
        // Mapa 100% de fondo
        Positioned.fill(
          child: FlutterMap(
            mapController: _mapController,
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
              if (_pedidosActivos.isEmpty)
                CircleLayer(
                  circles: [
                    CircleMarker(
                      point: _currentLocation,
                      color: Colors.red.withOpacity(0.15),
                      borderColor: Colors.red.withOpacity(0.5),
                      borderStrokeWidth: 2,
                      useRadiusInMeter: true,
                      radius: 400,
                    ),
                  ]
                ),
              MarkerLayer(
                markers: [
                  Marker(
                    point: _currentLocation,
                    width: 60, height: 60,
                    child: Pulse(
                      infinite: true,
                      child: Container(
                        decoration: BoxDecoration(
                          color: Colors.blueAccent,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 3),
                          boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 4)]
                        ),
                        child: const Icon(Icons.two_wheeler_rounded, color: Colors.white, size: 24),
                      )
                    ),
                  ),
                  if (nextStop != null)
                    Marker(
                      point: LatLng(nextStop['targetLat'], nextStop['targetLng']),
                      width: 50, height: 50,
                      child: Pulse(
                        infinite: true,
                        child: Icon(
                          nextStop['isPickup'] ? Icons.storefront_rounded : Icons.person_pin_circle_rounded,
                          color: nextStop['isPickup'] ? const Color(0xFFF59E0B) : const Color(0xFF10B981),
                          size: 40,
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
                  child: Row(
                    children: [
                      const Icon(Icons.monetization_on_rounded, color: Color(0xFFF59E0B), size: 20),
                      const SizedBox(width: 8),
                      Text('\{ganancias.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                    ]
                  )
                ),
                GestureDetector(
                  onTap: _sosSending ? null : () async {
                    // Mismo SOS
                    final confirm = await showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                        title: const Text('?? Enviar Emergencia', style: TextStyle(fontWeight: FontWeight.bold)),
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
                      final success = await ref.read(repartidorServiceProvider).sendSosAlert(_repartidorId!, lat: _currentLocation.latitude, lng: _currentLocation.longitude);
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
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => _toggleStatus(false),
              icon: const Icon(Icons.power_settings_new_rounded, color: Colors.redAccent),
              label: const Text('APAGAR TURNO', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w900, letterSpacing: 1)),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                side: const BorderSide(color: Colors.redAccent, width: 2),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              )
            )
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
                  child: Text('+ en cola', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
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
                 context.push('/pedidos/');
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
    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      child: Padding(
        padding: const EdgeInsets.only(bottom: 120),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 500),
              curve: Curves.fastOutSlowIn,
              width: double.infinity,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(32),
                gradient: LinearGradient(
                  colors: [Colors.grey.shade300, Colors.grey.shade400],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 10, offset: const Offset(0, 5))],
              ),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () => _toggleStatus(true),
                  borderRadius: BorderRadius.circular(32),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.power_settings_new_rounded, color: cs.onSurfaceVariant, size: 36),
                        const SizedBox(width: 14),
                        Text(
                          'INICIAR TURNO',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            color: cs.onSurfaceVariant,
                            letterSpacing: 1.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 28),
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF1E293B), Color(0xFF0F172A)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(32),
                boxShadow: [
                  BoxShadow(color: const Color(0xFF0F172A).withOpacity(0.3), blurRadius: 20, offset: const Offset(0, 10))
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('MI BILLETERA', style: TextStyle(fontSize: 14, color: Colors.white70, fontWeight: FontWeight.w900, letterSpacing: 1.2)),
                      const Icon(Icons.account_balance_wallet_rounded, color: Color(0xFF38EF7D), size: 24),
                    ],
                  ),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Ganancias', style: TextStyle(fontSize: 13, color: Colors.white70, fontWeight: FontWeight.w600)),
                            const SizedBox(height: 4),
                            Text('\{ganancias.toStringAsFixed(2)}', style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Color(0xFF38EF7D), letterSpacing: -1)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ]
        )
      )
    );
  }
'''

content = content[:build_start] + new_build + '\n}\n' + content[end_idx:]

with open('lib/screens/driver_dashboard_view.dart', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replaced build method.")

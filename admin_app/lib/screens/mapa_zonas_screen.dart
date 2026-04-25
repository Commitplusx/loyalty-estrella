// lib/screens/mapa_zonas_screen.dart
// Centro de Comando — Google Maps optimizado, fluido y estable

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../core/supabase_config.dart';

// ── Provider ──────────────────────────────────────────────────────────────────
final coloniasMapProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final data = await supabase
      .from('colonias')
      .select('id, nombre, etiqueta_zona, lat, lng, precio')
      .order('nombre');

  const genericLat = 16.2514;
  const genericLng = -92.1345;
  const tolerance = 0.005;

  return (data as List).map((c) {
    final map = Map<String, dynamic>.from(c as Map);
    double lat = map['lat'] != null ? (map['lat'] as num).toDouble() : genericLat;
    double lng = map['lng'] != null ? (map['lng'] as num).toDouble() : genericLng;
    
    // Si es exactamente la genérica o fue null, es "no reconocida"
    final isGeneric = map['lat'] == null || ((lat - genericLat).abs() < tolerance && (lng - genericLng).abs() < tolerance);
    map['is_generic'] = isGeneric;
    
    // Pequeño offset para que los puntos nulos no se superpongan exactamente
    if (isGeneric) {
      final offsetId = (map['id'] as int) % 30;
      lat += offsetId * 0.00015;
      lng -= offsetId * 0.00015;
    }
    
    map['lat'] = lat;
    map['lng'] = lng;
    return map;
  }).toList();
});

// ── Helpers de zona ───────────────────────────────────────────────────────────
double _hueDeZona(String? zona) {
  switch (zona?.toLowerCase()) {
    case 'verde':    return BitmapDescriptor.hueGreen;
    case 'azul':     return BitmapDescriptor.hueBlue;
    case 'amarilla': return BitmapDescriptor.hueYellow;
    default:         return BitmapDescriptor.hueRed;
  }
}

Color _colorDeZona(String? zona) {
  switch (zona?.toLowerCase()) {
    case 'verde':    return const Color(0xFF10B981);
    case 'azul':     return const Color(0xFF3B82F6);
    case 'amarilla': return const Color(0xFFF59E0B);
    default:         return const Color(0xFFEF4444);
  }
}

String _emojiDeZona(String? zona) {
  switch (zona?.toLowerCase()) {
    case 'verde':    return '🟢';
    case 'azul':     return '🔵';
    case 'amarilla': return '🟡';
    default:         return '🔴';
  }
}

const _zonasDef = [
  {'id': 'verde',    'label': 'Verde',    'precio': '\$45'},
  {'id': 'azul',     'label': 'Azul',     'precio': '\$50'},
  {'id': 'amarilla', 'label': 'Amarilla', 'precio': '\$55-60'},
  {'id': 'roja',     'label': 'Roja',     'precio': '\$70+'},
];

// ── Pantalla principal ────────────────────────────────────────────────────────
class MapaZonasScreen extends ConsumerStatefulWidget {
  const MapaZonasScreen({super.key});
  @override
  ConsumerState<MapaZonasScreen> createState() => _MapaZonasScreenState();
}

class _MapaZonasScreenState extends ConsumerState<MapaZonasScreen> {
  GoogleMapController? _mapCtrl;
  final TextEditingController _searchCtrl = TextEditingController();

  // Estado UI — no tocan el mapa directamente
  String _filtro = '';
  String? _zonaFiltro;
  Map<String, dynamic>? _coloniaSeleccionada;

  // Cache de marcadores — solo se reconstruyen cuando cambian datos o filtro
  Set<Marker> _markersCache = {};
  List<Map<String, dynamic>> _coloniasData = [];
  String? _lastZonaFiltro = 'INIT'; // sentinel

  static const LatLng _comitan = LatLng(16.2514, -92.1345);

  @override
  void dispose() {
    _searchCtrl.dispose();
    _mapCtrl?.dispose();
    super.dispose();
  }

  // ── Rebuild marcadores solo si cambió filtro o datos ─────────────────────
  Set<Marker> _getMarkers(List<Map<String, dynamic>> colonias) {
    final dataChanged = !identical(_coloniasData, colonias);
    final filtroChanged = _lastZonaFiltro != (_zonaFiltro ?? '__all__');

    if (!dataChanged && !filtroChanged) return _markersCache;

    _coloniasData = colonias;
    _lastZonaFiltro = _zonaFiltro ?? '__all__';

    _markersCache = colonias
        .where((c) {
          if (_zonaFiltro == null) return true;
          final z = c['etiqueta_zona'] as String? ?? '';
          return z == _zonaFiltro || (z == 'rojo' && _zonaFiltro == 'roja');
        })
        .map((c) {
          final lat = (c['lat'] as num).toDouble();
          final lng = (c['lng'] as num).toDouble();
          final zona = c['etiqueta_zona'] as String?;
          final isGeneric = c['is_generic'] == true;
          
          return Marker(
            markerId: MarkerId(c['id'].toString()),
            position: LatLng(lat, lng),
            icon: BitmapDescriptor.defaultMarkerWithHue(isGeneric ? BitmapDescriptor.hueViolet : BitmapDescriptor.hueRed),
            draggable: true,
            onDragEnd: (newPos) => _actualizarUbicacion(c, newPos),
            infoWindow: InfoWindow(
              title: c['nombre'] as String,
              snippet: isGeneric 
                  ? '📍 ¡Desconocida! Mantén presionado para mover' 
                  : '📍 Mantén presionado para mover de lugar',
            ),
            consumeTapEvents: true,
            onTap: () => _onMarkerTap(c),
          );
        })
        .toSet();

    return _markersCache;
  }

  // ── Actualizar Ubicacion al Soltar el Marcador ────────────────────────────
  Future<void> _actualizarUbicacion(Map<String, dynamic> colonia, LatLng newPos) async {
    // Actualizamos en base de datos
    await supabase
        .from('colonias')
        .update({'lat': newPos.latitude, 'lng': newPos.longitude})
        .eq('id', colonia['id'] as int);
        
    ref.invalidate(coloniasMapProvider);
    
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('✅ Ubicación de ${colonia['nombre']} guardada.'),
        backgroundColor: Colors.green.shade700,
        behavior: SnackBarBehavior.floating,
      ));
    }
  }

  // ── Ir a colonia en el mapa ───────────────────────────────────────────────
  void _irAColonia(Map<String, dynamic> c) {
    final lat = (c['lat'] as num).toDouble();
    final lng = (c['lng'] as num).toDouble();
    _mapCtrl?.animateCamera(CameraUpdate.newLatLngZoom(LatLng(lat, lng), 16));
    setState(() {
      _coloniaSeleccionada = c;
      _filtro = '';
    });
    _searchCtrl.clear();
  }

  // ── Cambiar zona de colonia ────────────────────────────────────────────────
  Future<void> _onMarkerTap(Map<String, dynamic> colonia) async {
    setState(() => _coloniaSeleccionada = colonia);

    final nueva = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _ZonaSelectorSheet(
        nombre: colonia['nombre'] as String,
        zonaActual: colonia['etiqueta_zona'] as String? ?? 'rojo',
      ),
    );

    if (nueva == null || !mounted) return;

    final precio = {'verde': 45, 'azul': 50, 'amarilla': 55, 'roja': 70, 'rojo': 70}[nueva] ?? 45;

    await supabase
        .from('colonias')
        .update({'etiqueta_zona': nueva, 'precio': precio})
        .eq('id', colonia['id'] as int);

    ref.invalidate(coloniasMapProvider);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('${_emojiDeZona(nueva)} ${colonia['nombre']} → ${nueva.toUpperCase()} (\$$precio)'),
        backgroundColor: _colorDeZona(nueva),
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.all(16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final coloniasAsync = ref.watch(coloniasMapProvider);
    final theme = Theme.of(context);
    final topPad = MediaQuery.of(context).padding.top;

    return Scaffold(
      body: coloniasAsync.when(
        loading: () => const Center(child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Cargando colonias de Comitán...'),
          ],
        )),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (colonias) {
          // Resultados de búsqueda (solo para el listado, no toca el mapa)
          final resultados = _filtro.isEmpty
              ? <Map<String, dynamic>>[]
              : colonias
                  .where((c) => (c['nombre'] as String)
                      .toLowerCase()
                      .contains(_filtro.toLowerCase()))
                  .take(8)
                  .toList();

          return Stack(
            children: [

              // ── MAPA: solo se reconstruye cuando cambian markers ─────────
              GoogleMap(
                initialCameraPosition:
                    const CameraPosition(target: _comitan, zoom: 13),
                onMapCreated: (ctrl) => _mapCtrl = ctrl,
                markers: _getMarkers(colonias),
                myLocationButtonEnabled: false,
                zoomControlsEnabled: true,
                mapToolbarEnabled: false,
                compassEnabled: true,
                onTap: (_) {
                  if (_coloniaSeleccionada != null) {
                    setState(() => _coloniaSeleccionada = null);
                  }
                },
              ),

              // ── HEADER flotante ──────────────────────────────────────────
              Positioned(
                top: 0, left: 0, right: 0,
                child: Container(
                  padding: EdgeInsets.fromLTRB(4, topPad + 4, 12, 8),
                  decoration: BoxDecoration(
                    color: theme.scaffoldBackgroundColor,
                    boxShadow: [
                      BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 6)
                    ],
                  ),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back_rounded),
                        onPressed: () => Navigator.pop(context),
                      ),
                      const Expanded(
                        child: Text('🗺️ Centro de Comando',
                            style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          '${colonias.length} colonias',
                          style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withOpacity(0.6)),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // ── BUSCADOR ────────────────────────────────────────────────
              Positioned(
                top: topPad + 64,
                left: 12, right: 12,
                child: Column(
                  children: [
                    Container(
                      decoration: BoxDecoration(
                        color: theme.cardColor,
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: [
                          BoxShadow(
                              color: Colors.black.withOpacity(0.12),
                              blurRadius: 10,
                              offset: const Offset(0, 3))
                        ],
                      ),
                      child: TextField(
                        controller: _searchCtrl,
                        onChanged: (v) => setState(() => _filtro = v),
                        decoration: InputDecoration(
                          hintText: 'Buscar colonia...',
                          prefixIcon: const Icon(Icons.search_rounded),
                          suffixIcon: _filtro.isNotEmpty
                              ? IconButton(
                                  icon: const Icon(Icons.close_rounded),
                                  onPressed: () {
                                    _searchCtrl.clear();
                                    setState(() => _filtro = '');
                                  })
                              : null,
                          border: InputBorder.none,
                          contentPadding:
                              const EdgeInsets.symmetric(vertical: 13),
                        ),
                      ),
                    ),

                    // Resultados dropdown
                    if (resultados.isNotEmpty)
                      Container(
                        margin: const EdgeInsets.only(top: 4),
                        decoration: BoxDecoration(
                          color: theme.cardColor,
                          borderRadius: BorderRadius.circular(14),
                          boxShadow: [
                            BoxShadow(
                                color: Colors.black.withOpacity(0.12),
                                blurRadius: 10)
                          ],
                        ),
                        child: ListView.separated(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          itemCount: resultados.length,
                          separatorBuilder: (_, __) =>
                              Divider(height: 1, color: theme.dividerColor),
                          itemBuilder: (_, i) {
                            final c = resultados[i];
                            final zona = c['etiqueta_zona'] as String?;
                            return ListTile(
                              dense: true,
                              leading: Text(_emojiDeZona(zona),
                                  style: const TextStyle(fontSize: 20)),
                              title: Text(c['nombre'].toString(),
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 14)),
                              subtitle: Text(
                                '${(zona ?? '?').toUpperCase()} · \$${c['precio'] ?? '?'}',
                                style: TextStyle(
                                    color: _colorDeZona(zona),
                                    fontSize: 11,
                                    fontWeight: FontWeight.w500),
                              ),
                              trailing: const Icon(
                                  Icons.arrow_forward_ios_rounded,
                                  size: 12),
                              onTap: () => _irAColonia(c),
                            );
                          },
                        ),
                      ),
                  ],
                ),
              ),

              // ── PANEL de colonia seleccionada ────────────────────────────
              if (_coloniaSeleccionada != null && _filtro.isEmpty)
                Positioned(
                  bottom: 90, left: 12, right: 12,
                  child: GestureDetector(
                    onTap: () => _onMarkerTap(_coloniaSeleccionada!),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: theme.cardColor,
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(
                              color: Colors.black.withOpacity(0.18),
                              blurRadius: 14,
                              offset: const Offset(0, 4))
                        ],
                        border: Border.all(
                          color: _colorDeZona(
                              _coloniaSeleccionada!['etiqueta_zona'] as String?)
                              .withOpacity(0.4),
                          width: 1.5,
                        ),
                      ),
                      child: Row(
                        children: [
                          Text(
                            _emojiDeZona(_coloniaSeleccionada!['etiqueta_zona'] as String?),
                            style: const TextStyle(fontSize: 28),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _coloniaSeleccionada!['nombre'].toString(),
                                  style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 15),
                                ),
                                if (_coloniaSeleccionada!['is_generic'] == true)
                                  const Text(
                                    '🟣 Ubicación pendiente. Mantén presionado el pin morado en el mapa para arrastrarlo.',
                                    style: TextStyle(color: Colors.purple, fontSize: 11, fontWeight: FontWeight.bold),
                                  )
                                else
                                  const Text(
                                    '🔴 Ubicación guardada. Mantén presionado el pin rojo para moverlo.',
                                    style: TextStyle(color: Colors.red, fontSize: 11),
                                  ),
                                Text(
                                  'Zona ${(_coloniaSeleccionada!['etiqueta_zona'] as String? ?? '?').toUpperCase()} · \$${_coloniaSeleccionada!['precio'] ?? '?'}',
                                  style: TextStyle(
                                    color: _colorDeZona(_coloniaSeleccionada!['etiqueta_zona'] as String?),
                                    fontWeight: FontWeight.w500,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: _colorDeZona(_coloniaSeleccionada!['etiqueta_zona'] as String?),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Text('Cambiar',
                                style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13)),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

              // ── CHIPS de zona ─────────────────────────────────────────────
              Positioned(
                bottom: 16, left: 12, right: 12,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _ZonaChip(
                        label: '⚪ Todas',
                        color: Colors.grey.shade600,
                        activa: _zonaFiltro == null,
                        onTap: () => setState(() => _zonaFiltro = null),
                      ),
                      const SizedBox(width: 8),
                      ..._zonasDef.map((z) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: _ZonaChip(
                          label:
                              '${_emojiDeZona(z['id'])} ${z['label']} ${z['precio']}',
                          color: _colorDeZona(z['id']),
                          activa: _zonaFiltro == z['id'],
                          onTap: () => setState(() => _zonaFiltro =
                              _zonaFiltro == z['id'] ? null : z['id']),
                        ),
                      )),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ── Chip de zona ──────────────────────────────────────────────────────────────
class _ZonaChip extends StatelessWidget {
  final String label;
  final Color color;
  final bool activa;
  final VoidCallback onTap;
  const _ZonaChip(
      {required this.label,
      required this.color,
      required this.activa,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: activa ? color : color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withOpacity(activa ? 1 : 0.35)),
          boxShadow: activa
              ? [BoxShadow(color: color.withOpacity(0.35), blurRadius: 8, offset: const Offset(0, 2))]
              : [],
        ),
        child: Text(label,
            style: TextStyle(
              color: activa ? Colors.white : color,
              fontWeight: FontWeight.bold,
              fontSize: 12,
            )),
      ),
    );
  }
}

// ── Sheet de selección de zona ────────────────────────────────────────────────
class _ZonaSelectorSheet extends StatelessWidget {
  final String nombre;
  final String zonaActual;
  const _ZonaSelectorSheet(
      {required this.nombre, required this.zonaActual});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Container(
        margin: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: theme.scaffoldBackgroundColor,
          borderRadius: BorderRadius.circular(24),
        ),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                    color: Colors.grey.shade400,
                    borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 14),
            Text('Asignar zona a:',
                style: TextStyle(
                    color: theme.colorScheme.onSurface.withOpacity(0.5),
                    fontSize: 12)),
            Text(nombre,
                style: const TextStyle(
                    fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            ..._zonasDef.map((z) {
              final zId = z['id']!;
              final isActual = zonaActual == zId ||
                  (zonaActual == 'rojo' && zId == 'roja');
              final color = _colorDeZona(zId);
              return GestureDetector(
                onTap: () => Navigator.pop(context, zId),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 140),
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 13),
                  decoration: BoxDecoration(
                    color: isActual
                        ? color.withOpacity(0.1)
                        : theme.cardColor,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                        color:
                            isActual ? color : color.withOpacity(0.18),
                        width: isActual ? 2 : 1),
                  ),
                  child: Row(
                    children: [
                      Text(_emojiDeZona(zId),
                          style: const TextStyle(fontSize: 22)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Zona ${z['label']}',
                                style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: color,
                                    fontSize: 15)),
                            Text('Envío: ${z['precio']}',
                                style: TextStyle(
                                    color: theme.colorScheme.onSurface
                                        .withOpacity(0.5),
                                    fontSize: 12)),
                          ],
                        ),
                      ),
                      if (isActual)
                        Icon(Icons.check_circle_rounded, color: color),
                    ],
                  ),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}

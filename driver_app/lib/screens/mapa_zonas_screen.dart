// lib/screens/mapa_zonas_screen.dart
// Centro de Comando — Google Maps + Polígonos KML + Magia OSM

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;
import '../core/supabase_config.dart';

// ── Helpers y Constantes ───────────────────────────────────────────────────────────
Color _colorDeZona(String? zona) {
  final z = zona?.toLowerCase().replaceAll('zona', '').trim();
  switch (z) {
    case 'verde':    return const Color(0xFF10B981);
    case 'azul':     return const Color(0xFF3B82F6);
    case 'amarilla': 
    case 'amarillo': return const Color(0xFFF59E0B);
    case 'naranja':  return const Color(0xFFF97316);
    case 'roja':
    case 'rojo':     return const Color(0xFFEF4444);
    case 'negra':
    case 'negro':    return const Color(0xFF1F2937); // Dark grey/black
    default:         return const Color(0xFF8B5CF6); // Por defecto si no tiene (Morado)
  }
}

String _emojiDeZona(String? zona) {
  final z = zona?.toLowerCase().replaceAll('zona', '').trim();
  switch (z) {
    case 'verde':    return '🟢';
    case 'azul':     return '🔵';
    case 'amarilla': 
    case 'amarillo': return '🟡';
    case 'naranja':  return '🟠';
    case 'roja':
    case 'rojo':     return '🔴';
    case 'negra':
    case 'negro':    return '⚫';
    default:         return '🟣';
  }
}

const _zonasDef = [
  {'id': 'verde',    'label': 'Verde'},
  {'id': 'azul',     'label': 'Azul'},
  {'id': 'amarilla', 'label': 'Amarilla'},
  {'id': 'naranja',  'label': 'Naranja'},
  {'id': 'roja',     'label': 'Roja'},
  {'id': 'negra',    'label': 'Negra'},
];

// Helper para decodificar GeoJSON
List<Position> _parseGeoJson(String geojsonStr) {
  try {
    final geojson = jsonDecode(geojsonStr);
    final type = geojson['type'];
    final coords = geojson['coordinates'];
    
    List<Position> points = [];
    if (type == 'Polygon') {
      final ring = coords[0] as List;
      for (var p in ring) {
        points.add(Position((p[0] as num).toDouble(), (p[1] as num).toDouble()));
      }
    } else if (type == 'MultiPolygon') {
      final polygon = coords[0] as List;
      final ring = polygon[0] as List;
      for (var p in ring) {
        points.add(Position((p[0] as num).toDouble(), (p[1] as num).toDouble()));
      }
    }
    return points;
  } catch (e) {
    debugPrint('Error parsing geojson: $e');
    return [];
  }
}

// ── Providers ──────────────────────────────────────────────────────────────────

// 1. Proveedor de los Polígonos guardados en BD
final poligonosMapProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final data = await supabase
      .from('vw_poligonos')
      .select('*')
      .order('nombre');
  return List<Map<String, dynamic>>.from(data);
});

// 2. Proveedor para Mapeo Mágico (OpenStreetMap Nominatim)
final osmSearchProvider = FutureProvider.family.autoDispose<Map<String, dynamic>?, String>((ref, query) async {
  if (query.isEmpty) return null;
  final url = Uri.parse('https://nominatim.openstreetmap.org/search?q=${Uri.encodeComponent("$query, Comitan")}&format=json&polygon_geojson=1&limit=1');
  final response = await http.get(url, headers: {'User-Agent': 'EstrellaDriverApp/1.0'});
  
  if (response.statusCode == 200) {
    final data = jsonDecode(response.body) as List;
    if (data.isNotEmpty) {
      return data.first as Map<String, dynamic>;
    }
  }
  return null;
});

// ── Pantalla Principal ────────────────────────────────────────────────────────
class MapaZonasScreen extends ConsumerStatefulWidget {
  const MapaZonasScreen({super.key});
  @override
  ConsumerState<MapaZonasScreen> createState() => _MapaZonasScreenState();
}

class _MapaZonasScreenState extends ConsumerState<MapaZonasScreen> {
  GoogleMapController? _mapCtrl;
  final TextEditingController _searchCtrl = TextEditingController();

  String _filtro = '';
  String? _zonaFiltro;
  
  // Interacción
  Map<String, dynamic>? _poligonoSeleccionado;
  Map<String, dynamic>? _resultadoMagico; // Polígono extraído de OSM
  bool _modoMagico = false;
  bool _mostrarCapas = true; // Toggle para mostrar/ocultar colonias empalmadas
  bool _isSaving = false;

  static const LatLng _comitan = LatLng(16.2514, -92.1345);

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  double _calcBboxArea(List<Position> pts) {
    if (pts.isEmpty) return 0;
    double minX = 999, maxX = -999, minY = 999, maxY = -999;
    for (var p in pts) {
      if (p.lng < minX) minX = p.lng.toDouble();
      if (p.lng > maxX) maxX = p.lng.toDouble();
      if (p.lat < minY) minY = p.lat.toDouble();
      if (p.lat > maxY) maxY = p.lat.toDouble();
    }
    return (maxX - minX) * (maxY - minY);
  }

  // 🌍 Renderizado de Polígonos en Mapbox 🌍
  Future<void> _drawMapboxPolygons(List<Map<String, dynamic>> data) async {
    if (_polygonManager == null) return;
    await _polygonManager!.deleteAll();

    List<PolygonAnnotationOptions> optionsList = [];

    for (var p in data) {
      if (!_mostrarCapas && p['tipo'] == 'colonia') continue; // Filtro de capas
      
      final zonaRaw = p['etiqueta_zona'] as String?;
      final zona = zonaRaw != null && zonaRaw.isNotEmpty ? zonaRaw : p['nombre'] as String?;
      final isSelected = _poligonoSeleccionado?['id'] == p['id'];
      
      if (_zonaFiltro != null) {
        final zClean = zona?.toLowerCase().replaceAll('zona', '').trim() ?? '';
        final fClean = _zonaFiltro!.toLowerCase().replaceAll('zona', '').trim();
        
        final isMatch = zClean == fClean || 
                        (zClean == 'rojo' && fClean == 'roja') || 
                        (zClean == 'amarillo' && fClean == 'amarilla') || 
                        (zClean == 'negro' && fClean == 'negra');
                        
        if (!isMatch) continue;
      }

      final geojsonStr = p['geojson'] != null ? jsonEncode(p['geojson']) : null;
      if (geojsonStr == null) continue;

      final points = _parseGeoJson(geojsonStr);
      if (points.isEmpty) continue;

      final color = _colorDeZona(zona);
      
      optionsList.add(PolygonAnnotationOptions(
        geometry: Polygon(coordinates: [points]),
        fillColor: isSelected ? color.withOpacity(0.5).value : color.withOpacity(0.2).value,
        fillOutlineColor: isSelected ? Colors.white.value : color.value,
      ));
    }

    // Agregar Polígono Mágico si existe
    if (_modoMagico && _resultadoMagico != null && _resultadoMagico!['geojson'] != null) {
      final points = _parseGeoJson(jsonEncode(_resultadoMagico!['geojson']));
      if (points.isNotEmpty) {
        optionsList.add(PolygonAnnotationOptions(
          geometry: Polygon(coordinates: [points]),
          fillColor: Colors.deepPurpleAccent.withOpacity(0.4).value,
          fillOutlineColor: Colors.deepPurpleAccent.value,
        ));
      }
    }

    if (optionsList.isNotEmpty) {
      await _polygonManager!.createMulti(optionsList);
    }
  }

  // ── Buscar Mágicamente en OSM ───────────────────────────────────────────
  Future<void> _buscarMagicamente() async {
    if (_filtro.isEmpty) return;
    FocusScope.of(context).unfocus();
    
    // Mostramos un SnackBar de carga
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('🔍 Buscando en OpenStreetMap...'), duration: Duration(seconds: 1)),
    );

    // Leemos el provider
    final res = await ref.read(osmSearchProvider(_filtro).future);
    
    if (res != null) {
      setState(() {
        _resultadoMagico = res;
        _modoMagico = true;
        _poligonoSeleccionado = null;
      });
      
      final lat = double.parse(res['lat'].toString());
      final lon = double.parse(res['lon'].toString());
      
      _mapboxMap?.flyTo(CameraOptions(center: Point(coordinates: Position(lon, lat)), zoom: 15.0), MapAnimationOptions(duration: 1000));
      
      if (res['geojson']?['type'] != 'Polygon' && res['geojson']?['type'] != 'MultiPolygon') {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('⚠️ La API solo devolvió el centro, no el polígono completo.')),
        );
      }
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('❌ No se encontró esa colonia en OSM.'), backgroundColor: Colors.red),
      );
    }
  }

  Future<void> _uploadKml() async {
    try {
      final result = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['kml'],
        withData: true,
      );

      if (result == null || result.files.isEmpty) return;

      final bytes = result.files.first.bytes;
      if (bytes == null) {
        throw Exception("No se pudo leer el archivo. (Asegúrate de darle permisos a la app)");
      }
      
      final kmlText = utf8.decode(bytes);

      setState(() => _isSaving = true);
      
      // Llamar a la Edge Function
      final response = await supabase.functions.invoke(
        'upload-kml',
        body: {'kmlText': kmlText},
      );

      if (response.status == 200) {
        final count = response.data['count'];
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('✅ KML subido exitosamente: $count zonas creadas.'),
            backgroundColor: Colors.green,
          ));
        }
        ref.invalidate(poligonosMapProvider);
      } else {
        throw Exception(response.data?['error'] ?? 'Error desconocido');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('❌ Error al subir KML: $e'),
          backgroundColor: Colors.red,
        ));
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  // ── Construir Polígonos para el Mapa ─────────────────────────────────────────────
  Future<void> _guardarPoligonoMagico() async {
    if (_resultadoMagico == null || _resultadoMagico!['geojson'] == null) return;
    
    final points = _parseGeoJson(jsonEncode(_resultadoMagico!['geojson']));
    if (points.isEmpty) return;

    // Preguntar zona y precio
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _ZonaSelectorSheet(
        nombre: _resultadoMagico!['name'] ?? _filtro,
        zonaActual: 'amarilla',
        precioActual: 50,
      ),
    );

    if (result == null || !mounted) return;
    
    setState(() => _isSaving = true);
    final zClean = (result['zona'] as String).toLowerCase().replaceAll('zona', '').trim();
    final precio = result['precio'] as int;
    
    // Crear la colonia en base de datos
    final insertRes = await supabase.from('colonias').insert({
      'nombre': _resultadoMagico!['name'] ?? _filtro,
      'etiqueta_zona': 'ZONA ${zClean.toUpperCase()}',
      'precio': precio,
      'lat': double.parse(_resultadoMagico!['lat'].toString()),
      'lng': double.parse(_resultadoMagico!['lon'].toString()),
    }).select('id').single();

    // Actualizar su geometría
    final coordsArray = points.map((p) => [p.lng, p.lat]).toList();
    await supabase.rpc('update_poligono_geom', params: {
      'p_id': insertRes['id'],
      'p_tipo': 'colonia',
      'p_coords': coordsArray,
    });

    ref.invalidate(poligonosMapProvider);
    
    if (mounted) {
      setState(() {
        _isSaving = false;
        _modoMagico = false;
        _resultadoMagico = null;
        _filtro = '';
        _searchCtrl.clear();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('✅ Polígono Mágico guardado exitosamente.'), backgroundColor: Colors.green),
      );
    }
  }

  // ── Cambiar zona de polígono existente ──────────────────────────────────
  Future<void> _onPoligonoTap(Map<String, dynamic> pol) async {
//     debugPrint('Abriendo BottomSheet para polígono: ${pol['nombre']} (ID: ${pol['id']})');
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _ZonaSelectorSheet(
        nombre: pol['nombre'] as String,
        zonaActual: (pol['etiqueta_zona'] as String?) ?? (pol['nombre'] as String?) ?? 'rojo',
        precioActual: (pol['precio'] as num?)?.toInt() ?? 50,
      ),
    );

    if (result == null || !mounted) {
//       debugPrint('BottomSheet cerrado sin guardar o widget no montado.');
      return;
    }
    
//     debugPrint('Datos recibidos del BottomSheet: $result');

    final zClean = (result['zona'] as String).toLowerCase().replaceAll('zona', '').trim();
    final precio = result['precio'] as int;

    final esColonia = pol['tipo'] == 'colonia';
    final tabla = esColonia ? 'colonias' : 'zonas_kml';
    final nuevaZona = 'ZONA ${zClean.toUpperCase()}';

    final updates = esColonia 
        ? {'etiqueta_zona': nuevaZona, 'precio': precio}
        : {'nombre': nuevaZona, 'precio': precio};

//     debugPrint('[SUPABASE] Actualizando tabla "$tabla" (ID: ${pol['id']}) -> $updates');

    try {
      await supabase.from(tabla).update(updates).eq('id', pol['id']);
//       debugPrint('[SUPABASE] Actualización exitosa.');
      ref.invalidate(poligonosMapProvider);

      if (mounted) {
        final String zStr = result['zona'] as String;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('✅ Actualizado a $nuevaZona ($precio pesos)'),
          backgroundColor: _colorDeZona(zStr),
          behavior: SnackBarBehavior.floating,
        ));
      }
    } catch (e) {
      debugPrint('[SUPABASE ERROR] Falló la actualización: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('❌ Error al actualizar: $e'),
          backgroundColor: Colors.red,
          behavior: SnackBarBehavior.floating,
        ));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final poligonosAsync = ref.watch(poligonosMapProvider);
    final theme = Theme.of(context);
    final topPad = MediaQuery.of(context).padding.top;

    return Scaffold(
      body: poligonosAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (data) {
          if (_polygonManager != null) {
            _drawMapboxPolygons(data);
          }
          return Stack(
            children: [
              // ── MAPA ────────────────────────────────────────────────────────
              MapWidget(
                cameraOptions: CameraOptions(
                  center: Point(coordinates: Position(-92.13, 16.25)), // Comitan
                  zoom: 13,
                ),
                onMapCreated: (mapboxMap) async {
                  _mapboxMap = mapboxMap;
                  await mapboxMap.compass.updateSettings(CompassSettings(enabled: true));
                  await mapboxMap.scaleBar.updateSettings(ScaleBarSettings(enabled: false));
                  await mapboxMap.logo.updateSettings(LogoSettings(position: OrnamentPosition.BOTTOM_LEFT, marginBottom: 30));
                  await mapboxMap.attribution.updateSettings(AttributionSettings(position: OrnamentPosition.BOTTOM_LEFT, marginBottom: 10));
                  
                  _polygonManager = await mapboxMap.annotations.createPolygonAnnotationManager();
                  
                  if (mounted) {
                    _drawMapboxPolygons(data);
                  }
                },
                onTapListener: (ctx) {
                  if (_poligonoSeleccionado != null) {
                    setState(() => _poligonoSeleccionado = null);
                  }
                },
                resourceOptions: ResourceOptions(
                  accessToken: const String.fromEnvironment("MAPBOX_ACCESS_TOKEN", defaultValue: "pk.eyJ1IjoiZGVpZmZ4ZCIsImEiOiJjbW9ha2UybG4wNzJiMnJwcHJteXFua3BmIn0.hASM0wsh3h4QYqnBNHwa1A"),
                ),
              ),

              // ── HEADER ──────────────────────────────────────────────────────
              Positioned(
                top: 0, left: 0, right: 0,
                child: Container(
                  padding: EdgeInsets.fromLTRB(4, topPad + 4, 12, 8),
                  decoration: BoxDecoration(
                    color: theme.scaffoldBackgroundColor,
                    boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 6)],
                  ),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back_rounded),
                        onPressed: () => Navigator.pop(context),
                      ),
                      const Expanded(
                        child: Text('🗺️ Territorios & Zonas', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text('${data.length} polígonos', style: TextStyle(fontSize: 12, color: theme.colorScheme.onSurface.withOpacity(0.6))),
                      ),
                      const SizedBox(width: 8),
                      IconButton(
                        icon: Icon(_mostrarCapas ? Icons.layers : Icons.layers_clear),
                        color: _mostrarCapas ? theme.primaryColor : Colors.grey,
                        tooltip: _mostrarCapas ? 'Ocultar Capas (Colonias)' : 'Mostrar Capas (Colonias)',
                        onPressed: () {
                          setState(() {
                            _mostrarCapas = !_mostrarCapas;
                            if (!_mostrarCapas && _poligonoSeleccionado?['tipo'] == 'colonia') {
                              _poligonoSeleccionado = null; // Deseleccionar si se oculta
                            }
                          });
                        },
                      ),
                      IconButton(
                        icon: const Icon(Icons.upload_file),
                        color: theme.primaryColor,
                        tooltip: 'Subir KML Maestro',
                        onPressed: _isSaving ? null : _uploadKml,
                      ),
                    ],
                  ),
                ),
              ),

              // ── BUSCADOR MÁGICO OSM ─────────────────────────────────────────
              Positioned(
                top: topPad + 64,
                left: 12, right: 12,
                child: Container(
                  decoration: BoxDecoration(
                    color: theme.cardColor,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.12), blurRadius: 10, offset: const Offset(0, 3))],
                  ),
                  child: TextField(
                    controller: _searchCtrl,
                    onChanged: (v) => setState(() => _filtro = v),
                    decoration: InputDecoration(
                      hintText: 'Mapeo Mágico (Ej. San Sebastian)',
                      prefixIcon: const Icon(Icons.auto_awesome, color: Colors.deepPurpleAccent),
                      suffixIcon: IconButton(
                        icon: const Icon(Icons.search_rounded),
                        onPressed: _buscarMagicamente,
                      ),
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(vertical: 13),
                    ),
                    onSubmitted: (_) => _buscarMagicamente(),
                  ),
                ),
              ),

              // ── PANEL DE POLÍGONO MÁGICO (GUARDAR) ──────────────────────────
              if (_modoMagico && _resultadoMagico != null)
                Positioned(
                  bottom: 90, left: 12, right: 12,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                    decoration: BoxDecoration(
                      color: Colors.deepPurpleAccent.withOpacity(0.95),
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [BoxShadow(color: Colors.deepPurpleAccent.withOpacity(0.4), blurRadius: 15, offset: const Offset(0, 5))],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text('🪄 Polígono Encontrado en OSM', style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 4),
                        Text(_resultadoMagico!['name'] ?? 'Zona Desconocida', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 12),
                        ElevatedButton.icon(
                          onPressed: _isSaving ? null : _guardarPoligonoMagico,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.white,
                            foregroundColor: Colors.deepPurpleAccent,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          icon: _isSaving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.save_rounded),
                          label: Text(_isSaving ? 'Guardando...' : 'Guardar y Asignar Tarifa', style: const TextStyle(fontWeight: FontWeight.bold)),
                        )
                      ],
                    ),
                  ),
                ),

              // ── PANEL DE POLÍGONO EXISTENTE ─────────────────────────────────
              if (_poligonoSeleccionado != null)
                Positioned(
                  bottom: 90, left: 12, right: 12,
                  child: GestureDetector(
                    onTap: () => _onPoligonoTap(_poligonoSeleccionado!),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: theme.cardColor,
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.15), blurRadius: 15, offset: const Offset(0, 5))],
                        border: Border.all(color: _colorDeZona(_poligonoSeleccionado!['etiqueta_zona'] as String? ?? _poligonoSeleccionado!['nombre'] as String?).withOpacity(0.5), width: 2),
                      ),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: _colorDeZona(_poligonoSeleccionado!['etiqueta_zona'] as String? ?? _poligonoSeleccionado!['nombre'] as String?).withOpacity(0.15),
                              shape: BoxShape.circle,
                            ),
                            child: Text(_emojiDeZona(_poligonoSeleccionado!['etiqueta_zona'] as String? ?? _poligonoSeleccionado!['nombre'] as String?), style: const TextStyle(fontSize: 22)),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        _poligonoSeleccionado!['nombre'] as String, 
                                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                                        overflow: TextOverflow.ellipsis,
                                      )
                                    ),
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(color: theme.primaryColor.withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
                                      child: Text(_poligonoSeleccionado!['tipo'] == 'colonia' ? 'Colonia (Capa)' : 'KML (Base)', style: TextStyle(fontSize: 10, color: theme.primaryColor, fontWeight: FontWeight.bold)),
                                    )
                                  ]
                                ),
                                Text('\$${_poligonoSeleccionado!['precio']} · Zona ${((_poligonoSeleccionado!['etiqueta_zona'] as String?) ?? (_poligonoSeleccionado!['nombre'] as String? ?? '?')).toUpperCase()}', style: TextStyle(color: theme.colorScheme.onSurface.withOpacity(0.6), fontSize: 13)),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: _colorDeZona(_poligonoSeleccionado!['etiqueta_zona'] as String? ?? _poligonoSeleccionado!['nombre'] as String?),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Text('Editar', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

              // ── CHIPS de zona ───────────────────────────────────────────────
              Positioned(
                bottom: 16, left: 12, right: 12,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _ZonaChip(label: '🗺️ Todas', color: Colors.grey.shade600, activa: _zonaFiltro == null, onTap: () => setState(() => _zonaFiltro = null)),
                      const SizedBox(width: 8),
                      ..._zonasDef.map((z) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: _ZonaChip(
                          label: '${_emojiDeZona(z['id'])} ${z['label']}',
                          color: _colorDeZona(z['id']),
                          activa: _zonaFiltro == z['id'],
                          onTap: () => setState(() => _zonaFiltro = _zonaFiltro == z['id'] ? null : z['id']),
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

// ── Componentes UI Secundarios ───────────────────────────────────────────────
class _ZonaChip extends StatelessWidget {
  final String label;
  final Color color;
  final bool activa;
  final VoidCallback onTap;
  const _ZonaChip({required this.label, required this.color, required this.activa, required this.onTap});

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
          boxShadow: activa ? [BoxShadow(color: color.withOpacity(0.35), blurRadius: 8, offset: const Offset(0, 2))] : [],
        ),
        child: Text(label, style: TextStyle(color: activa ? Colors.white : color, fontWeight: FontWeight.bold, fontSize: 12)),
      ),
    );
  }
}

class _ZonaSelectorSheet extends StatefulWidget {
  final String nombre;
  final String zonaActual;
  final int precioActual;
  const _ZonaSelectorSheet({required this.nombre, required this.zonaActual, required this.precioActual});

  @override
  State<_ZonaSelectorSheet> createState() => _ZonaSelectorSheetState();
}

class _ZonaSelectorSheetState extends State<_ZonaSelectorSheet> {
  late String _zonaSeleccionada;
  late TextEditingController _precioCtrl;

  @override
  void initState() {
    super.initState();
    _zonaSeleccionada = widget.zonaActual;
    _precioCtrl = TextEditingController(text: widget.precioActual.toString());
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Container(
          margin: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: theme.scaffoldBackgroundColor, borderRadius: BorderRadius.circular(24)),
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey.shade400, borderRadius: BorderRadius.circular(2)))),
              const SizedBox(height: 14),
              Text('Asignar zona y precio a:', style: TextStyle(color: theme.colorScheme.onSurface.withOpacity(0.5), fontSize: 12)),
              Text(widget.nombre, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              
              // Campo de precio editable
              TextField(
                controller: _precioCtrl,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Precio de Envío (\$)',
                  prefixIcon: const Icon(Icons.monetization_on_rounded),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 16),

              ...['verde', 'azul', 'amarilla', 'naranja', 'roja', 'negra'].map((zId) {
                final isActual = _zonaSeleccionada.toLowerCase().contains(zId);
                final color = _colorDeZona(zId);
                return GestureDetector(
                  onTap: () => setState(() => _zonaSeleccionada = zId),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 140),
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
                    decoration: BoxDecoration(
                      color: isActual ? color.withOpacity(0.1) : theme.cardColor,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: isActual ? color : color.withOpacity(0.18), width: isActual ? 2 : 1),
                    ),
                    child: Row(
                      children: [
                        Text(_emojiDeZona(zId), style: const TextStyle(fontSize: 22)),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text('ZONA ${zId.toUpperCase()}', style: TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 15)),
                        ),
                        if (isActual) Icon(Icons.check_circle_rounded, color: color),
                      ],
                    ),
                  ),
                );
              }),
              
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {
                  final p = int.tryParse(_precioCtrl.text) ?? widget.precioActual;
                  Navigator.pop(context, {'zona': _zonaSeleccionada, 'precio': p});
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: _colorDeZona(_zonaSeleccionada),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text('Confirmar Cambios', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              )
            ],
          ),
        ),
      ),
    );
  }
}

import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart' as geo;
import 'dart:async';
import 'dart:ui' as ui;
import 'package:flutter/services.dart';
import 'dart:typed_data';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
class MapboxNavigationMap extends StatefulWidget {
  final double? driverLat;
  final double? driverLng;
  final double? destLat;
  final double? destLng;
  final double? driverHeading;
  final bool isPickup;
  final Map<String, dynamic>? routeGeometry; // GeoJSON from Directions API
  final List<dynamic>? trafficSignals; // Coordenadas de semáforos [lng, lat]
  final bool followMode;
  final int frameRouteTrigger;
  final VoidCallback? onPanMap; // Cuando el usuario toca el mapa para salir del follow mode

  const MapboxNavigationMap({
    super.key,
    this.driverLat,
    this.driverLng,
    this.driverHeading,
    this.isPickup = false,
    this.destLat,
    this.destLng,
    this.routeGeometry,
    this.trafficSignals,
    this.followMode = false,
    this.frameRouteTrigger = 0,
    this.onPanMap,
  });

  @override
  State<MapboxNavigationMap> createState() => _MapboxNavigationMapState();
}

class _MapboxNavigationMapState extends State<MapboxNavigationMap> {
  MapboxMap? _mapboxMap;
  PointAnnotationManager? _pointAnnotationManager; // Destino
  PointAnnotationManager? _trafficSignalAnnotationManager; // Semáforos
  PolylineAnnotationManager? _polylineAnnotationManager;
  PolylineAnnotation? _activeRouteAnnotation;

  @override
  void didUpdateWidget(covariant MapboxNavigationMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_mapboxMap != null) {
      bool routeChanged = oldWidget.routeGeometry != widget.routeGeometry;
      bool locationChanged = oldWidget.driverLat != widget.driverLat || oldWidget.driverLng != widget.driverLng;
      bool headingChanged = oldWidget.driverHeading != widget.driverHeading;
      bool followModeTurnedOn = widget.followMode && !oldWidget.followMode;
      
      if (routeChanged || locationChanged) {
        _updateAnnotations();
      }
      
      if (widget.followMode && (locationChanged || headingChanged || followModeTurnedOn) && widget.driverLat != null && widget.driverLng != null) {
        // Seguimiento activo: deslizar suavemente la cámara al conductor
        _mapboxMap!.easeTo(
          CameraOptions(
            center: Point(coordinates: Position(widget.driverLng!, widget.driverLat!)),
            zoom: 16.0, // Nivel neutro (no tan agresivo)
            pitch: 50.0, // Ángulo isométrico de pájaro
            bearing: widget.driverHeading ?? 0.0,
          ),
          MapAnimationOptions(duration: 1000, startDelay: 0),
        );
      }
      
      if (widget.frameRouteTrigger != oldWidget.frameRouteTrigger) {
        _frameRoute();
      }
    }
  }

  Future<void> _onMapCreated(MapboxMap mapboxMap) async {
    _mapboxMap = mapboxMap;
    
    // UI Settings robustos: Ocultar compás y logo de Mapbox para vista limpia tipo Uber
    await mapboxMap.compass.updateSettings(CompassSettings(enabled: false));
    await mapboxMap.scaleBar.updateSettings(ScaleBarSettings(enabled: false));
    await mapboxMap.logo.updateSettings(LogoSettings(position: OrnamentPosition.BOTTOM_LEFT, marginBottom: 30));
    await mapboxMap.attribution.updateSettings(AttributionSettings(position: OrnamentPosition.BOTTOM_LEFT, marginBottom: 10));

    // Al crearlos en este orden, la polilínea (ruta) se dibuja abajo, y los puntos (iconos) encima.
    _polylineAnnotationManager = await mapboxMap.annotations.createPolylineAnnotationManager();
    _trafficSignalAnnotationManager = await mapboxMap.annotations.createPointAnnotationManager();
    _pointAnnotationManager = await mapboxMap.annotations.createPointAnnotationManager();
    
    // Cargar estilo optimizado (streets-v12 es limpio y no tiene las líneas verdes de tráfico)
    await mapboxMap.loadStyleURI('mapbox://styles/mapbox/streets-v12');
    
    // Activar el punto de ubicación con un PNG personalizado (Moto)
    await mapboxMap.location.updateSettings(LocationComponentSettings(
      enabled: true,
      pulsingEnabled: false, // Apagamos el pulso azul para que luzca limpio como Uber
      showAccuracyRing: false,
      puckBearingEnabled: true, // Esto hace que el modelo rote con la brújula/movimiento
      puckBearing: PuckBearing.HEADING, // Sigue usando la brújula para indicar la dirección
    ));

    _updateAnnotations();
    
    if (widget.followMode) {
      _enableFollowMode();
    } else {
      _frameRoute();
    }
  }

  Future<void> _enableFollowMode() async {
    if (_mapboxMap == null) return;
    
    if (widget.driverLat != null && widget.driverLng != null) {
      _mapboxMap!.easeTo(
        CameraOptions(
          center: Point(coordinates: Position(widget.driverLng!, widget.driverLat!)),
          zoom: 16.0,
          pitch: 50.0,
          bearing: widget.driverHeading ?? 0.0,
        ),
        MapAnimationOptions(duration: 1000, startDelay: 0),
      );
    }
  }

  Future<void> _frameRoute() async {
    if (_mapboxMap == null) return;
    
    if (widget.driverLat != null && widget.destLat != null) {
      final minLat = math.min(widget.driverLat!, widget.destLat!);
      final maxLat = math.max(widget.driverLat!, widget.destLat!);
      final minLng = math.min(widget.driverLng!, widget.destLng!);
      final maxLng = math.max(widget.driverLng!, widget.destLng!);
      
      double latDiff = (maxLat - minLat).abs();
      double lngDiff = (maxLng - minLng).abs();
      double maxDiff = math.max(latDiff, lngDiff);

      // Si están prácticamente en el mismo lugar, forzamos una diferencia mínima para que no haga zoom microscópico
      if (maxDiff < 0.002) {
        maxDiff = 0.002;
      }

      // Cálculo matemático del zoom ideal basado en la diferencia de grados
      double calculatedZoom = (math.log(360.0 / maxDiff) / math.ln2) - 1.5; // Offset para dejar margen a los lados
      
      // Limitamos el zoom (máximo 16.5 para que no se pegue al asfalto, mínimo 12 para no ver toda la ciudad)
      calculatedZoom = calculatedZoom.clamp(12.0, 16.5);

      _mapboxMap!.easeTo(
        CameraOptions(
          center: Point(coordinates: Position((minLng+maxLng)/2, (minLat+maxLat)/2)),
          zoom: calculatedZoom,
          pitch: 35.0, // Ligera inclinación para ver 3D sin perder panorama
          bearing: 0.0,
        ),
        MapAnimationOptions(duration: 1500, startDelay: 0),
      );
    } else if (widget.driverLat != null) {
      // Si no hay destino, pero hay driver
      _enableFollowMode();
    }
  }
  double _haversineDistance(double lat1, double lon1, double lat2, double lon2) {
    const R = 6371000.0;
    final dLat = (lat2 - lat1) * math.pi / 180;
    final dLon = (lon2 - lon1) * math.pi / 180;
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1 * math.pi / 180) * math.cos(lat2 * math.pi / 180) *
        math.sin(dLon / 2) * math.sin(dLon / 2);
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  Future<void> _updateAnnotations() async {
    if (_pointAnnotationManager == null || _polylineAnnotationManager == null) return;
    
    // 1. Dibujar y recortar ruta dinámica (Borrando lo que queda atrás)
    if (widget.routeGeometry != null) {
      try {
        final List<dynamic> coords = widget.routeGeometry!['coordinates'];
        List<dynamic> remainingCoords = List.from(coords);

        if (widget.driverLat != null && widget.driverLng != null) {
          int closestIndex = 0;
          double minDistance = double.infinity;
          
          // Limitar búsqueda a los próximos ~100 nodos para evitar saltos en rutas que se cruzan.
          int searchLimit = math.min(coords.length, 100); 
          for (int i = 0; i < searchLimit; i++) {
            final double pLng = coords[i][0].toDouble();
            final double pLat = coords[i][1].toDouble();
            final dist = _haversineDistance(widget.driverLat!, widget.driverLng!, pLat, pLng);
            if (dist < minDistance) {
              minDistance = dist;
              closestIndex = i;
            }
          }
          
          // Truncamos lo que ya pasó y anclamos la línea al GPS actual
          remainingCoords = coords.sublist(closestIndex);
          remainingCoords.insert(0, [widget.driverLng!, widget.driverLat!]);
        }
        
        final positions = remainingCoords.map((c) => Position(c[0].toDouble(), c[1].toDouble())).toList();
        
        final options = PolylineAnnotationOptions(
          geometry: LineString(coordinates: positions),
          lineColor: 0xFF111111, // Negro (charcoal oscuro) solicitado por el usuario
          lineWidth: 8.0,
          lineJoin: LineJoin.ROUND,
        );

        if (_activeRouteAnnotation != null) {
          // Si ya existe, la actualizamos para que sea súper fluido y no parpadee
          _activeRouteAnnotation!.geometry = LineString(coordinates: positions);
          await _polylineAnnotationManager!.update(_activeRouteAnnotation!);
        } else {
          _activeRouteAnnotation = await _polylineAnnotationManager!.create(options);
        }
      } catch (e) {
        debugPrint('Error dibujando polilínea Mapbox: $e');
      }
    } else {
      // Si llega nulo, borramos la ruta
      await _polylineAnnotationManager!.deleteAll();
      _activeRouteAnnotation = null;
    }

    // 2. Dibujar destino (Solo lo actualizamos si cambia, para no parpadear)
    await _pointAnnotationManager!.deleteAll();
    if (widget.destLat != null && widget.destLng != null) {
      try {
        final imageBytes = await _createMarkerImage(widget.isPickup);

        await _pointAnnotationManager!.create(PointAnnotationOptions(
          geometry: Point(coordinates: Position(widget.destLng!, widget.destLat!)),
          image: imageBytes,
          iconSize: 0.8, // Tamaño aumentado para que se vea más claro
        ));
      } catch (e) {
        debugPrint('Error creando marcador: $e');
      }
    }

    // 3. Dibujar semáforos
    await _trafficSignalAnnotationManager!.deleteAll();
    if (widget.trafficSignals != null && widget.trafficSignals!.isNotEmpty) {
      try {
        final trafficSignalBytes = await _createTrafficSignalImage();
        List<PointAnnotationOptions> signalOptions = [];
        for (var signal in widget.trafficSignals!) {
          signalOptions.add(PointAnnotationOptions(
            geometry: Point(coordinates: Position(signal[0].toDouble(), signal[1].toDouble())),
            image: trafficSignalBytes,
            iconSize: 0.25, // Un poco más pequeño que el destino
          ));
        }
        await _trafficSignalAnnotationManager!.createMulti(signalOptions);
      } catch (e) {
        debugPrint('Error dibujando semáforos: $e');
      }
    }
  }

  Future<Uint8List> _createTrafficSignalImage() async {
    final ui.PictureRecorder pictureRecorder = ui.PictureRecorder();
    final Canvas canvas = Canvas(pictureRecorder);
    const double width = 60.0;
    const double height = 160.0;
    
    // Sombra
    final RRect shadowRect = RRect.fromRectAndRadius(const Rect.fromLTWH(0, 5, width, height), const Radius.circular(30));
    canvas.drawRRect(shadowRect, Paint()..color = Colors.black.withOpacity(0.3));

    // Caja del semáforo
    final RRect rrect = RRect.fromRectAndRadius(const Rect.fromLTWH(0, 0, width, height), const Radius.circular(30));
    canvas.drawRRect(rrect, Paint()..color = const Color(0xFF2C3E50));
    
    // Luces (Rojo, Amarillo, Verde)
    canvas.drawCircle(const Offset(width/2, 35), 18, Paint()..color = Colors.redAccent);
    canvas.drawCircle(const Offset(width/2, 80), 18, Paint()..color = Colors.amber);
    canvas.drawCircle(const Offset(width/2, 125), 18, Paint()..color = Colors.greenAccent);
    
    final ui.Image img = await pictureRecorder.endRecording().toImage(width.toInt(), height.toInt()+5);
    final ByteData? byteData = await img.toByteData(format: ui.ImageByteFormat.png);
    return byteData!.buffer.asUint8List();
  }

  Future<Uint8List> _createMarkerImage(bool isPickup) async {
    final ui.PictureRecorder pictureRecorder = ui.PictureRecorder();
    final Canvas canvas = Canvas(pictureRecorder);
    const double size = 130.0;
    
    // Sombra suave
    canvas.drawCircle(const Offset(size/2, size/2 + 6), size/2 - 6, Paint()..color = Colors.black.withOpacity(0.2));
    
    // Borde exterior blanco grueso
    canvas.drawCircle(const Offset(size/2, size/2), size/2 - 8, Paint()..color = Colors.white);
    
    // Círculo interior color
    final color = isPickup ? const Color(0xFFFF6B35) : const Color(0xFF10B981);
    canvas.drawCircle(const Offset(size/2, size/2), size/2 - 16, Paint()..color = color);
    
    // Dibujar el Icono de Material
    final iconData = isPickup ? Icons.storefront_rounded : Icons.person_rounded;
    final textPainter = TextPainter(textDirection: TextDirection.ltr);
    
    textPainter.text = TextSpan(
      text: String.fromCharCode(iconData.codePoint),
      style: TextStyle(
        fontSize: size / 2.2, // Ajustar el tamaño del icono
        fontFamily: iconData.fontFamily,
        package: iconData.fontPackage,
        color: Colors.white,
      ),
    );
    textPainter.layout();
    
    // Centrar exactamente en el círculo
    final offset = Offset(
      (size - textPainter.width) / 2,
      (size - textPainter.height) / 2,
    );
    textPainter.paint(canvas, offset);
    
    final ui.Image img = await pictureRecorder.endRecording().toImage(size.toInt(), size.toInt());
    final ByteData? byteData = await img.toByteData(format: ui.ImageByteFormat.png);
    return byteData!.buffer.asUint8List();
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      onPointerDown: (_) {
        // Al tocar el mapa, desactiva el Follow Mode y notifica a la vista padre
        if (widget.followMode && widget.onPanMap != null) {
          widget.onPanMap!();
        }
      },
      child: MapWidget(
        onMapCreated: _onMapCreated,
        cameraOptions: CameraOptions(
          center: Point(coordinates: Position(-92.13, 16.25)), // Centro fallback
          zoom: 17.5,
          pitch: 50.0,
        ),
      ),
    );
  }
}

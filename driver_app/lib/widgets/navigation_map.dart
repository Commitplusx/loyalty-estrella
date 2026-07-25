import 'dart:async';
import 'dart:ui' as ui;
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_polyline_points/flutter_polyline_points.dart';

class NavigationMap extends StatefulWidget {
  final double destLat;
  final double destLng;
  final String destinationName;
  final double? clientLat;
  final double? clientLng;
  final String? clientName;
  final String? googleMapsApiKey;

  const NavigationMap({
    super.key,
    required this.destLat,
    required this.destLng,
    required this.destinationName,
    this.clientLat,
    this.clientLng,
    this.clientName,
    this.googleMapsApiKey,
  });

  @override
  State<NavigationMap> createState() => _NavigationMapState();
}

class _NavigationMapState extends State<NavigationMap> {
  final Completer<GoogleMapController> _controller = Completer();
  LatLng? _currentPosition;
  Set<Polyline> _polylines = {};
  Set<Marker> _markers = {};
  StreamSubscription<Position>? _positionStream;
  BitmapDescriptor? _blackMarkerIcon;
  List<LatLng> _fullRoute = [];

  Future<BitmapDescriptor> _createBlackMarker() async {
    final ui.PictureRecorder pictureRecorder = ui.PictureRecorder();
    final Canvas canvas = Canvas(pictureRecorder);
    final Paint paint = Paint()..color = Colors.black;
    final double radius = 12.0;
    
    canvas.drawCircle(Offset(radius, radius), radius, paint);
    
    final Paint borderPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0;
    canvas.drawCircle(Offset(radius, radius), radius, borderPaint);
    
    final ui.Image image = await pictureRecorder.endRecording().toImage(
          (radius * 2).toInt(),
          (radius * 2).toInt(),
        );
    final ByteData? byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    final Uint8List uint8List = byteData!.buffer.asUint8List();
    return BitmapDescriptor.fromBytes(uint8List);
  }

  @override
  void initState() {
    super.initState();
    _createBlackMarker().then((icon) {
      if (mounted) {
        setState(() => _blackMarkerIcon = icon);
        _updateMarkers();
      }
    });
    _checkLocationPermissionAndStart();
  }

  @override
  void didUpdateWidget(NavigationMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.destLat != widget.destLat || oldWidget.destLng != widget.destLng) {
      _updateMarkers();
      if (widget.googleMapsApiKey != null && widget.googleMapsApiKey!.isNotEmpty) {
        _fullRoute = []; // Clear old route bounds
        _getPolyline();
      } else {
        _moveCamera(LatLng(widget.destLat, widget.destLng));
      }
    }
  }

  Future<void> _checkLocationPermissionAndStart() async {
    bool serviceEnabled;
    LocationPermission permission;

    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return;

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return;
    }
    if (permission == LocationPermission.deniedForever) return;

    final position = await Geolocator.getCurrentPosition();
    if (mounted) {
      setState(() {
        _currentPosition = LatLng(position.latitude, position.longitude);
        _updateMarkers();
      });
      if (widget.googleMapsApiKey != null && widget.googleMapsApiKey!.isNotEmpty) {
        _getPolyline();
      }
    }

    _positionStream = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      ),
    ).listen((Position position) {
      if (mounted) {
        setState(() {
          _currentPosition = LatLng(position.latitude, position.longitude);
          _updateMarkers();
        });
        // Si no hay ruta aún, o queremos centrar, podemos hacerlo aquí
      }
    });
  }

  void _updateMarkers() {
    _markers = {
      if (_currentPosition != null)
        Marker(
          markerId: const MarkerId('currentLocation'),
          position: _currentPosition!,
          icon: _blackMarkerIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
          infoWindow: const InfoWindow(title: 'Mi Ubicación'),
          zIndex: 3,
        ),
      Marker(
        markerId: const MarkerId('destination'),
        position: LatLng(widget.destLat, widget.destLng),
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
        infoWindow: InfoWindow(title: widget.destinationName),
        zIndex: 2,
      ),
      if (widget.clientLat != null && widget.clientLng != null && widget.clientLat != 0.0)
        Marker(
          markerId: const MarkerId('clientLocation'),
          position: LatLng(widget.clientLat!, widget.clientLng!),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
          infoWindow: InfoWindow(title: widget.clientName ?? 'Cliente'),
          zIndex: 1,
        ),
    };
  }

  LatLngBounds _boundsFromLatLngList(List<LatLng> list) {
    double? x0, x1, y0, y1;
    for (LatLng latLng in list) {
      if (x0 == null) {
        x0 = x1 = latLng.latitude;
        y0 = y1 = latLng.longitude;
      } else {
        if (latLng.latitude > x1!) x1 = latLng.latitude;
        if (latLng.latitude < x0) x0 = latLng.latitude;
        if (latLng.longitude > y1!) y1 = latLng.longitude;
        if (latLng.longitude < y0!) y0 = latLng.longitude;
      }
    }
    return LatLngBounds(
      northeast: LatLng(x1!, y1!),
      southwest: LatLng(x0!, y0!),
    );
  }

  Future<void> _getPolyline() async {
    if (_currentPosition == null || widget.googleMapsApiKey == null) return;
    
    PolylinePoints polylinePoints = PolylinePoints();
    PolylineResult result = await polylinePoints.getRouteBetweenCoordinates(
      googleApiKey: widget.googleMapsApiKey!,
      request: PolylineRequest(
        origin: PointLatLng(_currentPosition!.latitude, _currentPosition!.longitude),
        destination: PointLatLng(widget.destLat, widget.destLng),
        mode: TravelMode.driving,
      )
    );

    if (result.points.isNotEmpty) {
      List<LatLng> polylineCoordinates = [];
      for (var point in result.points) {
        polylineCoordinates.add(LatLng(point.latitude, point.longitude));
      }
      _fullRoute = polylineCoordinates;

      List<LatLng> animatedCoordinates = [];
      int i = 0;
      
      Timer.periodic(const Duration(milliseconds: 30), (timer) async {
        if (!mounted) {
          timer.cancel();
          return;
        }
        if (i < polylineCoordinates.length) {
          animatedCoordinates.add(polylineCoordinates[i]);
          setState(() {
            _polylines.removeWhere((p) => p.polylineId == const PolylineId('route'));
            _polylines.add(
              Polyline(
                polylineId: const PolylineId('route'),
                color: Colors.black87,
                width: 6,
                points: List.from(animatedCoordinates),
              ),
            );
          });
          i++;
        } else {
          timer.cancel();
          // Al terminar la animación, ajustamos el zoom a los bordes
          final GoogleMapController controller = await _controller.future;
          LatLngBounds bounds = _boundsFromLatLngList(polylineCoordinates);
          controller.animateCamera(CameraUpdate.newLatLngBounds(bounds, 80)); // Padding de 80
        }
      });
    }
  }

  Future<void> _moveCamera(LatLng pos) async {
    final GoogleMapController controller = await _controller.future;
    if (_fullRoute.isNotEmpty) {
      LatLngBounds bounds = _boundsFromLatLngList(_fullRoute);
      controller.animateCamera(CameraUpdate.newLatLngBounds(bounds, 80));
    } else {
      controller.animateCamera(CameraUpdate.newCameraPosition(
        CameraPosition(target: pos, zoom: 17, tilt: 45),
      ));
    }
  }

  @override
  void dispose() {
    _positionStream?.cancel();
    super.dispose();
  }

  String _getMapStyle(bool isDark) {
    if (isDark) {
      return '''[{"elementType":"geometry","stylers":[{"color":"#212121"}]},{"elementType":"labels.icon","stylers":[{"visibility":"off"}]},{"elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"elementType":"labels.text.stroke","stylers":[{"color":"#212121"}]},{"featureType":"administrative","elementType":"geometry","stylers":[{"color":"#757575"}]},{"featureType":"administrative.country","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]},{"featureType":"administrative.land_parcel","stylers":[{"visibility":"off"}]},{"featureType":"administrative.locality","elementType":"labels.text.fill","stylers":[{"color":"#bdbdbd"}]},{"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#181818"}]},{"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"featureType":"poi.park","elementType":"labels.text.stroke","stylers":[{"color":"#1b1b1b"}]},{"featureType":"road","elementType":"geometry.fill","stylers":[{"color":"#2c2c2c"}]},{"featureType":"road","elementType":"labels.text.fill","stylers":[{"color":"#8a8a8a"}]},{"featureType":"road.arterial","elementType":"geometry","stylers":[{"color":"#373737"}]},{"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#3c3c3c"}]},{"featureType":"road.highway.controlled_access","elementType":"geometry","stylers":[{"color":"#4e4e4e"}]},{"featureType":"road.local","elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"featureType":"transit","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"water","elementType":"geometry","stylers":[{"color":"#000000"}]},{"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#3d3d3d"}]}]''';
    }
    return '''[{"elementType":"geometry","stylers":[{"color":"#f5f5f5"}]},{"elementType":"labels.icon","stylers":[{"visibility":"off"}]},{"elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"elementType":"labels.text.stroke","stylers":[{"color":"#f5f5f5"}]},{"featureType":"administrative.land_parcel","elementType":"labels.text.fill","stylers":[{"color":"#bdbdbd"}]},{"featureType":"poi","elementType":"geometry","stylers":[{"color":"#eeeeee"}]},{"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#e5e5e5"}]},{"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]},{"featureType":"road","elementType":"geometry","stylers":[{"color":"#ffffff"}]},{"featureType":"road.arterial","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#dadada"}]},{"featureType":"road.highway","elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"featureType":"road.local","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]},{"featureType":"transit.line","elementType":"geometry","stylers":[{"color":"#e5e5e5"}]},{"featureType":"transit.station","elementType":"geometry","stylers":[{"color":"#eeeeee"}]},{"featureType":"water","elementType":"geometry","stylers":[{"color":"#c9c9c9"}]},{"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]}]''';
  }

  @override
  Widget build(BuildContext context) {
    if (_currentPosition == null) {
      return Container(
        height: 300,
        decoration: BoxDecoration(
          color: Theme.of(context).brightness == Brightness.dark 
            ? const Color(0xFF1E293B) : Colors.grey[200],
          borderRadius: BorderRadius.circular(24),
        ),
        child: const Center(child: CircularProgressIndicator()),
      );
    }

    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      height: 350,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 20,
            offset: const Offset(0, 10),
          )
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
      children: [
        GoogleMap(
          initialCameraPosition: CameraPosition(
            target: _currentPosition!,
            zoom: 12.5,
          ),
            markers: _markers,
            polylines: _polylines,
            myLocationEnabled: false, 
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
            onMapCreated: (GoogleMapController controller) {
              if (!_controller.isCompleted) {
                _controller.complete(controller);
              }
              controller.setMapStyle(_getMapStyle(isDark));
            },
          ),
          Positioned(
            bottom: 16,
            right: 16,
            child: FloatingActionButton(
              heroTag: 'recenter_map',
              mini: true,
              backgroundColor: Theme.of(context).colorScheme.primary,
              child: const Icon(Icons.my_location_rounded),
              onPressed: () {
                if (_currentPosition != null) {
                  _moveCamera(_currentPosition!);
                }
              },
            ),
          ),
        ],
      ),
    );
  }
}

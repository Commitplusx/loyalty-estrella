import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_polyline_points/flutter_polyline_points.dart';

class NavigationMap extends StatefulWidget {
  final double destLat;
  final double destLng;
  final String destinationName;
  final String? googleMapsApiKey;

  const NavigationMap({
    super.key,
    required this.destLat,
    required this.destLng,
    required this.destinationName,
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

  @override
  void initState() {
    super.initState();
    _checkLocationPermissionAndStart();
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
    setState(() {
      _currentPosition = LatLng(position.latitude, position.longitude);
      _updateMarkers();
    });

    if (widget.googleMapsApiKey != null && widget.googleMapsApiKey!.isNotEmpty) {
      _getPolyline();
    }

    _positionStream = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
      ),
    ).listen((Position position) {
      setState(() {
        _currentPosition = LatLng(position.latitude, position.longitude);
        _updateMarkers();
      });
      if (mounted) {
        _moveCamera(_currentPosition!);
      }
    });
  }

  void _updateMarkers() {
    _markers = {
      if (_currentPosition != null)
        Marker(
          markerId: const MarkerId('currentLocation'),
          position: _currentPosition!,
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
          infoWindow: const InfoWindow(title: 'Mi Ubicación'),
        ),
      Marker(
        markerId: const MarkerId('destination'),
        position: LatLng(widget.destLat, widget.destLng),
        icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
        infoWindow: InfoWindow(title: widget.destinationName),
      ),
    };
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

      List<LatLng> animatedCoordinates = [];
      int i = 0;
      
      Timer.periodic(const Duration(milliseconds: 30), (timer) {
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
                color: const Color(0xFF3B82F6), // Azul vibrante
                points: List.from(animatedCoordinates),
                width: 6,
                jointType: JointType.round,
                startCap: Cap.roundCap,
                endCap: Cap.roundCap,
              ),
            );
          });
          i++;
        } else {
          timer.cancel();
        }
      });
    }
  }

  Future<void> _moveCamera(LatLng pos) async {
    final GoogleMapController controller = await _controller.future;
    controller.animateCamera(CameraUpdate.newCameraPosition(
      CameraPosition(target: pos, zoom: 17, tilt: 45),
    ));
  }

  @override
  void dispose() {
    _positionStream?.cancel();
    super.dispose();
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
              zoom: 16,
            ),
            markers: _markers,
            polylines: _polylines,
            myLocationEnabled: false, 
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            mapToolbarEnabled: false,
            onMapCreated: (GoogleMapController controller) {
              _controller.complete(controller);
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

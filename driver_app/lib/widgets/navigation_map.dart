import 'package:flutter/material.dart';

class NavigationMap extends StatelessWidget {
  final double destLat;
  final double destLng;
  final String destinationName;
  final double? clientLat;
  final double? clientLng;
  final String? clientName;

  const NavigationMap({
    Key? key,
    required this.destLat,
    required this.destLng,
    required this.destinationName,
    this.clientLat,
    this.clientLng,
    this.clientName,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) => const SizedBox();
}

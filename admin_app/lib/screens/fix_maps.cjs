const fs = require('fs');

const pathDart = 'C:/Users/Kaleb/Desktop/loyalty-estrella/admin_app/lib/screens/pedido_detail_screen.dart';
const pathTxt = 'C:/Users/Kaleb/Desktop/loyalty-estrella/admin_app/lib/screens/map_code.txt';

let code = fs.readFileSync(pathDart, 'utf8');
const newClass = fs.readFileSync(pathTxt, 'utf8');

// 1. Replace imports
code = code.replace("import 'package:flutter_map/flutter_map.dart';", "");
code = code.replace("import 'package:latlong2/latlong.dart';", "import 'package:google_maps_flutter/google_maps_flutter.dart';\nimport 'package:flutter_polyline_points/flutter_polyline_points.dart';");

// 2. Extract class _DriverRouteMode
const startMarker = 'class _DriverRouteMode extends ConsumerStatefulWidget {';
const startIndex = code.indexOf(startMarker);
if (startIndex !== -1) {
    code = code.substring(0, startIndex);
}

code += newClass;
fs.writeFileSync(pathDart, code);
console.log('Google Maps restored successfully');

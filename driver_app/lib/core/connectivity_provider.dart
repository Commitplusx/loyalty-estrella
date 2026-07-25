import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

final connectivityProvider = StreamProvider<bool>((ref) async* {
  // 🚀 FORZADO A TRUE TEMPORALMENTE 
  // Hay un bug conocido con connectivity_plus en algunos emuladores/Windows 
  // que siempre devuelve false aunque haya internet.
  yield true;
});

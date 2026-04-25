import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

final connectivityProvider = StreamProvider<bool>((ref) async* {
  final connectivity = Connectivity();
  
  // Emit initial state
  final current = await connectivity.checkConnectivity();
  yield !(current.contains(ConnectivityResult.none) || current.isEmpty);

  // Yield stream updates
  await for (final results in connectivity.onConnectivityChanged) {
    yield !(results.contains(ConnectivityResult.none) || results.isEmpty);
  }
});

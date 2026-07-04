import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CacheHelper {
  static const String CACHE_PREFIX = 'estrella_cache_';

  /// Guarda una lista de mapas en caché
  static Future<void> saveList(String key, List<Map<String, dynamic>> data) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final jsonString = jsonEncode(data);
      await prefs.setString('$CACHE_PREFIX$key', jsonString);
    } catch (e) {
      debugPrint('Error saving cache for $key: $e');
    }
  }

  /// Recupera una lista de mapas desde caché
  static Future<List<Map<String, dynamic>>?> getList(String key) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final jsonString = prefs.getString('$CACHE_PREFIX$key');
      if (jsonString != null) {
        final List<dynamic> decoded = jsonDecode(jsonString);
        return decoded.map((e) => e as Map<String, dynamic>).toList();
      }
    } catch (e) {
      debugPrint('Error reading cache for $key: $e');
    }
    return null;
  }
}

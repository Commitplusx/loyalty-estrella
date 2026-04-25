import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum AppThemeMode { light, dark, amoled }

final themeProvider = StateNotifierProvider<ThemeNotifier, AppThemeMode>((ref) {
  return ThemeNotifier();
});

class ThemeNotifier extends StateNotifier<AppThemeMode> {
  static const _themeKey = 'theme_mode_admin_pref_v2';

  ThemeNotifier() : super(AppThemeMode.dark) {
    _loadTheme();
  }

  Future<void> _loadTheme() async {
    final prefs = await SharedPreferences.getInstance();
    final savedTheme = prefs.getString(_themeKey);
    if (savedTheme != null) {
      if (savedTheme == 'light') {
        state = AppThemeMode.light;
      } else if (savedTheme == 'dark') {
        state = AppThemeMode.dark;
      } else if (savedTheme == 'amoled') {
        state = AppThemeMode.amoled;
      }
    }
  }

  Future<void> setMode(AppThemeMode mode) async {
    final prefs = await SharedPreferences.getInstance();
    state = mode;
    await prefs.setString(_themeKey, mode.name);
  }

  Future<void> cycleTheme() async {
    if (state == AppThemeMode.dark) {
      await setMode(AppThemeMode.amoled);
    } else if (state == AppThemeMode.amoled) {
      await setMode(AppThemeMode.light);
    } else {
      await setMode(AppThemeMode.dark);
    }
  }
}

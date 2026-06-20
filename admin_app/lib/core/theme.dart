import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  // Brand Core - Estrella Red
  static const brandRed = Color(0xFFC71E24);
  static const brandLightRed = Color(0xFFE53935);
  static const brandRedGlow = Color(0x66C71E24);

  // Dark Mode - Deep Midnight
  static const darkBg = Color(0xFF070711);
  static const darkSurface = Color(0xFF0F0F1C);
  static const darkCard = Color(0xFF14141F);
  static const darkBorder = Color(0xFF1E1E2E);
  static const darkBorderSubtle = Color(0xFF252535);

  // Text
  static const textWhite = Color(0xFFFFFFFF);
  static const textMuted = Color(0xFF8B8BA8);
  static const textFaint = Color(0xFF4A4A6A);

  // Status
  static const success = Color(0xFF10B981);
  static const warning = Color(0xFFF59E0B);
  static const danger = Color(0xFFEF4444);
  static const info = Color(0xFF3B82F6);
}

class AppGradients {
  static const brand = LinearGradient(
    colors: [AppColors.brandRed, AppColors.brandLightRed],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const brandVertical = LinearGradient(
    colors: [AppColors.brandRed, AppColors.brandLightRed],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  static const darkBg = LinearGradient(
    colors: [Color(0xFF070711), Color(0xFF0F0F20)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  static const card = LinearGradient(
    colors: [Color(0xFF16162A), Color(0xFF0F0F1C)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const success = LinearGradient(
    colors: [Color(0xFF10B981), Color(0xFF059669)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // Kept for backward compat
  static const primary = brand;
  static const cardDark = card;
}

class AppTheme {
  // Common Text Theme
  static TextTheme _baseTextTheme(Color color) => GoogleFonts.interTextTheme().apply(
    bodyColor: color,
    displayColor: color,
  );

  // Common Button Style
  static ElevatedButtonThemeData _buttonTheme(Color primary) => ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      backgroundColor: primary,
      foregroundColor: Colors.white,
      elevation: 0,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      textStyle: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w700, letterSpacing: 0.5),
    ),
  );

  // Common Input Style
  static InputDecorationTheme _inputTheme(Color surface, Color border, Color primary) => InputDecorationTheme(
    filled: true,
    fillColor: surface,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: border)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: border)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: primary, width: 2)),
    errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: AppColors.danger)),
    contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
  );

  // ---------------------------------------------------------------------------
  // LIGHT THEME (Clean & Crisp)
  // ---------------------------------------------------------------------------
  static ThemeData light() {
    const bg = Color(0xFFF4F6F8); // A very clean, slightly cooler gray for contrast
    const surface = Color(0xFFFFFFFF);
    const border = Color(0xFFE2E8F0);
    const textPrimary = Color(0xFF0F172A);
    const textSecondary = Color(0xFF64748B);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: const ColorScheme.light(
        primary: AppColors.brandRed,
        secondary: AppColors.brandLightRed,
        surface: surface,
        onSurface: textPrimary,
        surfaceContainerHighest: border,
        outline: border,
        outlineVariant: Color(0xFFCBD5E1),
        error: AppColors.danger,
        onSurfaceVariant: textSecondary,
      ),
      scaffoldBackgroundColor: bg,
      textTheme: _baseTextTheme(textPrimary),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        iconTheme: const IconThemeData(color: textPrimary),
        titleTextStyle: GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w900, color: textPrimary, letterSpacing: -0.5),
        systemOverlayStyle: const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.dark,
          statusBarBrightness: Brightness.light,
        ),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 10, // Gives the card a nice floating effect
        shadowColor: Colors.black.withOpacity(0.08),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24), side: BorderSide.none), // Removed harsh borders for clean look
      ),
      inputDecorationTheme: _inputTheme(const Color(0xFFF8FAFC), border, AppColors.brandRed),
      elevatedButtonTheme: _buttonTheme(AppColors.brandRed),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: surface,
        selectedItemColor: AppColors.brandRed,
        unselectedItemColor: textSecondary,
        type: BottomNavigationBarType.fixed,
        elevation: 16, // Stronger shadow for the bottom nav
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // DARK THEME (Midnight Red)
  // ---------------------------------------------------------------------------
  static ThemeData dark() {
    const bg = AppColors.darkBg;
    const surface = AppColors.darkCard;
    const border = AppColors.darkBorder;
    const textPrimary = AppColors.textWhite;
    const textSecondary = AppColors.textMuted;

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.brandRed,
        secondary: AppColors.brandLightRed,
        surface: surface,
        onSurface: textPrimary,
        surfaceContainerHighest: border,
        outline: border,
        outlineVariant: AppColors.darkBorderSubtle,
        error: AppColors.danger,
        onSurfaceVariant: textSecondary,
      ),
      scaffoldBackgroundColor: bg,
      textTheme: _baseTextTheme(textPrimary),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        iconTheme: const IconThemeData(color: textPrimary),
        titleTextStyle: GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w900, color: textPrimary, letterSpacing: -0.5),
        systemOverlayStyle: const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.light,
          statusBarBrightness: Brightness.dark,
        ),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24), side: const BorderSide(color: border, width: 1.5)),
      ),
      inputDecorationTheme: _inputTheme(AppColors.darkSurface, border, AppColors.brandRed),
      elevatedButtonTheme: _buttonTheme(AppColors.brandRed),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: surface,
        selectedItemColor: AppColors.brandRed,
        unselectedItemColor: textSecondary,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // AMOLED THEME (Pure Black & Red)
  // ---------------------------------------------------------------------------
  static ThemeData amoled() {
    const bg = Color(0xFF000000);
    const surface = Color(0xFF0A0A0A);
    const border = Color(0xFF1A1A1A);
    const textPrimary = Color(0xFFFFFFFF);
    const textSecondary = Color(0xFFAAAAAA);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: const ColorScheme.dark(
        primary: AppColors.brandRed,
        secondary: AppColors.brandLightRed,
        surface: surface,
        onSurface: textPrimary,
        surfaceContainerHighest: border,
        outline: border,
        outlineVariant: Color(0xFF222222),
        error: AppColors.danger,
        onSurfaceVariant: textSecondary,
      ),
      scaffoldBackgroundColor: bg,
      textTheme: _baseTextTheme(textPrimary),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        iconTheme: const IconThemeData(color: textPrimary),
        titleTextStyle: GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w900, color: textPrimary, letterSpacing: -0.5),
        systemOverlayStyle: const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.light,
          statusBarBrightness: Brightness.dark,
        ),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24), side: const BorderSide(color: border, width: 1.5)),
      ),
      inputDecorationTheme: _inputTheme(surface, border, AppColors.brandRed),
      elevatedButtonTheme: _buttonTheme(AppColors.brandRed),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: bg,
        selectedItemColor: AppColors.brandRed,
        unselectedItemColor: textSecondary,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
    );
  }
}

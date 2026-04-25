import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme.dart';
import 'core/theme_provider.dart';
import 'router.dart';

import 'services/sync_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: 'https://jdrrkpvodnqoljycixbg.supabase.co',
    anonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcnJrcHZvZG5xb2xqeWNpeGJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDkyOTEsImV4cCI6MjA5MDYyNTI5MX0.WEKqdL2p99cy8XvyqY31EP8-KbdOnhx2-fx9qz_iQtQ',
  );

  SyncService().init();

  runApp(
    const ProviderScope(
      child: EstrellaAdminApp(),
    ),
  );
}

class EstrellaAdminApp extends ConsumerWidget {
  const EstrellaAdminApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeProvider);

    ThemeData activeTheme;
    switch (themeMode) {
      case AppThemeMode.light:
        activeTheme = AppTheme.light();
        break;
      case AppThemeMode.dark:
        activeTheme = AppTheme.dark();
        break;
      case AppThemeMode.amoled:
        activeTheme = AppTheme.amoled();
        break;
    }

    return MaterialApp.router(
      title: 'Estrella Admin',
      debugShowCheckedModeBanner: false,
      theme: activeTheme,
      routerConfig: router,
    );
  }
}

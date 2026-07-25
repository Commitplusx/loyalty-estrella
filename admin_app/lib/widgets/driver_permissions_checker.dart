import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import '../services/origin_island_service.dart';

class DriverPermissionsChecker extends StatefulWidget {
  final Widget child;

  const DriverPermissionsChecker({super.key, required this.child});

  @override
  State<DriverPermissionsChecker> createState() => _DriverPermissionsCheckerState();
}

class _DriverPermissionsCheckerState extends State<DriverPermissionsChecker> with WidgetsBindingObserver {
  bool _isLoading = true;
  bool _hasNotifications = false;
  bool _hasAlertWindow = false;
  bool _hasAlertWindowOverride = false;
  bool _hasBatteryOpt = false;
  bool _hasAutoStartAck = false;

  bool _isBBK = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initDevice();
  }

  Future<void> _initDevice() async {
    final bbk = await OriginIslandService.isBBKDevice();
    if (mounted) {
      setState(() {
        _isBBK = bbk;
      });
      _checkPermissions();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _checkPermissions();
    }
  }

  Future<void> _checkPermissions() async {
    final notifications = await Permission.notification.isGranted;
    final alertWindow = await Permission.systemAlertWindow.isGranted;
    final batteryOpt = await Permission.ignoreBatteryOptimizations.isGranted;

    if (mounted) {
      setState(() {
        _hasNotifications = notifications;
        _hasAlertWindow = alertWindow;
        _hasBatteryOpt = batteryOpt;
        _isLoading = false;
      });
    }
  }

  bool get _allGranted {
    if (_isBBK) {
      return _hasNotifications && _hasBatteryOpt && _hasAutoStartAck;
    } else {
      return _hasNotifications && (_hasAlertWindow || _hasAlertWindowOverride) && _hasBatteryOpt;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_allGranted) {
      return widget.child;
    }

    final theme = Theme.of(context);
    
    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 40),
              Icon(Icons.warning_amber_rounded, size: 80, color: theme.colorScheme.error),
              const SizedBox(height: 24),
              Text(
                'Configuración Incompleta',
                style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                'Para garantizar que no te pierdas ningún pedido, debes habilitar los siguientes permisos en tu dispositivo.',
                style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 40),
              Expanded(
                child: ListView(
                  children: [
                    _PermissionItem(
                      title: 'Notificaciones',
                      subtitle: 'Para avisarte de nuevos pedidos.',
                      icon: Icons.notifications_active_rounded,
                      isGranted: _hasNotifications,
                      onTap: () async {
                        final status = await Permission.notification.request();
                        if (status.isPermanentlyDenied) {
                          if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Permiso denegado permanentemente. Redirigiendo a Ajustes...')));
                          await openAppSettings();
                        }
                        _checkPermissions();
                      },
                    ),
                    if (!_isBBK) ...[
                      const SizedBox(height: 16),
                      _PermissionItem(
                        title: 'Mostrar sobre otras apps',
                        subtitle: 'Permite que la alerta se muestre a pantalla completa.',
                        icon: Icons.layers_rounded,
                        isGranted: _hasAlertWindow || _hasAlertWindowOverride,
                        onTap: () async {
                          final status = await Permission.systemAlertWindow.request();
                          if (!status.isGranted) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Si no te deja activarlo, por favor búscalo manualmente en Configuración.')));
                            }
                            await openAppSettings();
                          }
                          setState(() {
                            _hasAlertWindowOverride = true; // Bypass automático
                          });
                          _checkPermissions();
                        },
                      ),
                    ],
                    const SizedBox(height: 16),
                    _PermissionItem(
                      title: 'Sin restricción de batería',
                      subtitle: 'Evita que el celular apague la app y pierdas pedidos.',
                      icon: Icons.battery_charging_full_rounded,
                      isGranted: _hasBatteryOpt,
                      onTap: () async {
                        final status = await Permission.ignoreBatteryOptimizations.request();
                        if (status.isPermanentlyDenied) {
                          if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Permiso denegado. Redirigiendo a Ajustes...')));
                          await openAppSettings();
                        }
                        _checkPermissions();
                      },
                    ),
                    if (_isBBK) ...[
                      const SizedBox(height: 16),
                      _PermissionItem(
                        title: 'Auto-Inicio Inteligente',
                        subtitle: 'VITAL: Abre los ajustes y activa el "Inicio automático" o "Autostart" para que el sistema no mate la app.',
                        icon: Icons.rocket_launch_rounded,
                        isGranted: _hasAutoStartAck,
                        onTap: () async {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Por favor busca "Inicio automático" o "Autostart" y actívalo manualmente.'),
                                duration: Duration(seconds: 4),
                              ),
                            );
                          }
                          await openAppSettings();
                          setState(() {
                            _hasAutoStartAck = true;
                          });
                          _checkPermissions();
                        },
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {
                  openAppSettings();
                },
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  backgroundColor: theme.colorScheme.primaryContainer,
                  foregroundColor: theme.colorScheme.onPrimaryContainer,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                child: const Text('Abrir Configuración Manualmente', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}

class _PermissionItem extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final bool isGranted;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  const _PermissionItem({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.isGranted,
    required this.onTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = isGranted ? Colors.green : theme.colorScheme.error;

    return InkWell(
      onTap: isGranted ? null : onTap,
      onLongPress: isGranted ? null : onLongPress,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          border: Border.all(color: color.withOpacity(0.5)),
          borderRadius: BorderRadius.circular(16),
          color: color.withOpacity(0.1),
        ),
        child: Row(
          children: [
            Icon(icon, color: color, size: 32),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(fontWeight: FontWeight.bold, color: theme.colorScheme.onSurface, fontSize: 16)),
                  Text(subtitle, style: TextStyle(color: theme.colorScheme.onSurfaceVariant, fontSize: 13)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            if (isGranted)
              const Icon(Icons.check_circle_rounded, color: Colors.green)
            else
              const Icon(Icons.arrow_forward_ios_rounded, size: 16),
          ],
        ),
      ),
    );
  }
}

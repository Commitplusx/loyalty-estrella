# 📱 Estrella Admin — Flutter App

App de administración para el sistema de fidelización Estrella Delivery.

## Características

- 🔐 **Login seguro** con Supabase Auth
- 📊 **Dashboard** con estadísticas en tiempo real
- 📷 **Scanner QR** para registrar envíos con linterna y vibración
- 👥 **Lista de clientes** con búsqueda
- 👤 **Detalle de cliente** con QR, progreso y redención de envíos gratis

## Requisitos previos

```bash
# Instalar Flutter SDK
https://docs.flutter.dev/get-started/install

# Verificar instalación
flutter doctor
```

## Instalación

```bash
cd admin_app

# Instalar dependencias
flutter pub get

# Ejecutar en dispositivo conectado
flutter run

# Compilar APK de release
flutter build apk --release
# El APK queda en: build/app/outputs/flutter-apk/app-release.apk
```

## Configuración

Las credenciales de Supabase ya están configuradas en:
- `lib/main.dart` (URL y anonKey)
- `lib/core/supabase_config.dart` (helper `supabase`)

## Permisos necesarios (Android)

Ya incluidos en `AndroidManifest.xml`:
- `CAMERA` — para el escáner QR
- `FLASHLIGHT` — para la linterna
- `INTERNET` — para conectar con Supabase

## Estructura del proyecto

```
lib/
├── main.dart              # Entry point
├── router.dart            # Navegación (GoRouter)
├── core/
│   ├── theme.dart         # Tema oscuro con naranja
│   └── supabase_config.dart
├── models/
│   └── cliente_model.dart
├── services/
│   └── cliente_service.dart  # CRUD Supabase
└── screens/
    ├── login_screen.dart
    ├── main_shell.dart        # Bottom nav
    ├── dashboard_screen.dart
    ├── scanner_screen.dart    # Escáner QR
    ├── clients_screen.dart
    └── client_detail_screen.dart
```

## RPCs requeridas en Supabase

Asegurate de tener ejecutadas en el SQL editor:
- `registrar_envio(p_cliente_id UUID)`
- `redimir_envio_gratis(p_cliente_id UUID)`
- `get_or_create_cliente(p_telefono TEXT)`

(Todo incluido en `app/supabase/update_schema.sql`)

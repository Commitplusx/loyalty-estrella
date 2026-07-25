# Flutter wrapper
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# Biometrics / local_auth — Evitar crash en release mode
-keep class androidx.biometric.** { *; }
-keep class android.hardware.biometrics.** { *; }
-keep class android.hardware.fingerprint.** { *; }

# Supabase / OkHttp / Gson
-keep class com.squareup.okhttp3.** { *; }
-dontwarn com.squareup.okhttp3.**
-keep class com.google.gson.** { *; }
-dontwarn com.google.gson.**

# Geolocator
-keep class com.baseflow.geolocator.** { *; }

# Mobile Scanner / CameraX
-keep class androidx.camera.** { *; }
-dontwarn androidx.camera.**

# Google Maps
-keep class com.google.android.gms.maps.** { *; }
-keep class com.google.maps.android.** { *; }

# Connectivity Plus
-keep class com.github.florent37.** { *; }

# Deferred Components / Play Core (Evita el fallo de compilation R8)
-dontwarn com.google.android.play.core.**

# General: No ofuscar clases de modelos de datos Kotlin/Java
-keepattributes Signature
-keepattributes *Annotation*
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

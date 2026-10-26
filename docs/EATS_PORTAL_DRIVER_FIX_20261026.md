# Correcciones portal → repartidor — 26 de octubre de 2026

Corrige los fallos reproducidos en `EATS_PORTAL_DRIVER_AUDIT_20261026.md`. Proyecto Eats `jdrrkpvodnqoljycixbg`; bot Robin’s, números/WABA, cocina, asignación y cobros conservan sus contratos. El ejemplo aprobado sigue siendo pollo **$180**, envío **$45**, aporte Robin’s **$15**: cliente **$210**, sucursal **$165**, repartidor **$45**.

## Cambios comprobados

- `PedidoModel` conserva `referencias_entrega` como `referenciasEntrega`, independiente de `destino`, notas y referencias enviadas posteriormente por el cliente. Persiste en `toMap`/`copyWith` y se muestra en la vista activa y el detalle original.
- `restauranteDireccion` se carga por el ID exacto de sucursal en el feed y en el detalle. El itinerario utiliza esa dirección; nunca utiliza `origen=portal_restaurante` ni la dirección del cliente como dirección de recogida. Si no existe, pide confirmarla.
- `RouteStop` representa explícitamente una parada sin coordenadas. El ordenamiento conserva esas tareas, no las envía al proveedor de rutas, no calcula distancias con coordenadas inventadas y no coloca una entrega antes de una recogida pendiente sin ubicación. El itinerario muestra **Ubicación por confirmar** y abre el mismo pedido para usar sus contactos existentes.
- `driver_ready` comprueba que `snapshot.driver_id` coincida con el dueño vigente del pedido y que siga en recogida. El outbox vuelve a comprobarlo después de consultar ventana/plantilla y antes de iniciar el envío; un aviso anterior se marca `superseded`. No se crea otro notificador ni se reenvían avisos antiguos.
- Se retiraron el servicio cliente de DeepSeek y su widget de resumen. El detalle muestra `descripcionFormateada` original, seleccionable, sin llamadas al modelo ni caché generativa capaz de recortar importes. La credencial desapareció de la ruta compilada nueva. Kaleb indicó que no tiene saldo y aplazó revocarla; no se afirma que esté revocada ni que las APK antiguas hayan sido reparadas remotamente.

## Evidencia y publicación

Las tres reproducciones Flutter fallidas de la auditoría y el contrato monetario original pasan ahora; el conjunto ampliado cubre persistencia de referencias, cambio de estado, recogida desconocida y entrega sin pin sin coordenadas ficticias. **127 pruebas Flutter** aprobadas en las fuentes reales de la APK: 126 regresiones y una comprobación visual adicional a 320/390 píxeles con texto y fuentes reales. La captura es un render de widget de prueba, no una recepción física en el teléfono. Análisis dirigido de ocho archivos modificado/nuevo sin problemas. El análisis de todo el proyecto sigue reportando 391 incidencias de archivos heredados, incluyendo mapas Google antiguos; no se oculta ese resultado ni se declara todo el árbol libre de avisos. El build release de la aplicación utilizada sí termina correctamente.

**66 pruebas Deno tipadas** de avisos y regresiones aprobadas primero sobre el candidato y después sobre la descarga publicada. Entrada `notificar-whatsapp` comprobada con `deno check`. Dos nuevas pruebas cubren cambio de dueño y reasignación durante la preparación del aviso. Los **29 contratos SQL aislados** de la auditoría, incluido $180/$45/$15, ya estaban aprobados; esta corrección no altera SQL ni vuelve a contar su ejecución como una prueba nueva.

Servidor: `notificar-whatsapp` **v211 ACTIVE**, catorce fuentes de ejecución descargadas y verificadas por SHA256; sólo dos cambian frente a v210. Respaldo previo y plan conservados. RPC de asignación/aceptación/cocina/seguimiento/portal y las demás Edge sin cambios; cuatro cron críticos con última ejecución fechada exitosa y cero pedidos activos/avisos pendientes. Sin pedidos, WhatsApps ni push reales de QA.

APK ARM64 **2026102601**, firma idéntica a la instalada; 144 entradas de fuente/configuración estables durante el build, siete fuentes de ejecución revisadas modificadas y dos archivos cliente del proveedor retirados. SHA256 `14be2bc49cdb966462581ad95003d0fbecb70ff34a5ecac80fcad39869796b61`. Artefacto local:

`C:/Users/Kaleb/Desktop/loyalty-estrella/driver_app/build/release-20261026/estrella-eats-driver-2026102601-release-arm64.apk`

Cierre posterior por USB: **APK 2026102601 instalada** en el Samsung de pruebas mediante actualización, sin borrar datos; versión y proceso confirmados. Al iniciar abrió el permiso Android existente de exclusión de optimización de batería. Lectura acotada del proceso sin FATAL EXCEPTION, Unhandled Exception ni señal nativa fatal. Esta comprobación de arranque no sustituye la recepción física de un servicio, aún pendiente. Las fuentes corregidas de APK se conservan en su checkout real; no se mezcla el resto de cambios locales del monorepo ni se declara que el viejo árbol Flutter de GitHub reproduzca la APK instalada. Fuentes/notificador y documentación de publicación se conservan por separado. Copia de la guía al VPS pendiente por timeout SSH ya documentado.

Evidencia privada y manifest de build: `.codex-tmp/eats-portal-driver-fix-20261026/` en la raíz operativa. Los respaldos de fuentes cliente omiten valores de credenciales. La auditoría anterior conserva los logs rojos como antecedente; no se sobrescribieron para aparentar que nunca existieron los defectos.

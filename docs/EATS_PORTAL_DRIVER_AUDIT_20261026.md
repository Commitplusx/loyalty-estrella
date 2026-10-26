> Correcciones posteriores: servidor v211 activo y APK 2026102601 compilada, pendiente de instalación. Ver [publicación y límites](EATS_PORTAL_DRIVER_FIX_20261026.md). La auditoría siguiente conserva su evidencia histórica.

# Auditoría del envío del portal hacia el repartidor — 26 de octubre de 2026

## Alcance y evidencia

Revisión solicitada por Kaleb; no es una publicación de correcciones. Eats `jdrrkpvodnqoljycixbg`, origen `portal_restaurante`. Se siguió creación → asignación → aviso → modelo y pantallas de la APK → recogida/entrega. Sin mutaciones de producción, ofertas, WhatsApps, compras ni viajes de prueba; sin nuevo build/instalación.

La APK documentada como instalada el 25 de octubre es `2026102502`, compilada desde `C:/Users/Kaleb/Desktop/loyalty-estrella/driver_app`. Sus 146 entradas de fuente/configuración siguen iguales al manifiesto de compilación, antes y después del análisis. **El checkout aislado del backend conserva versiones antiguas de varias pantallas de Flutter y no sirve como autoridad de la APK instalada.** Se inspeccionaron las fuentes exactas del manifiesto; las capturas/pruebas del modelo anteriores no prueban un recorrido físico nuevo.

Notificador activo v210 descargado de nuevo: catorce fuentes de ejecución iguales a las verificadas al publicar. El descriptor de tipos, que no forma parte de la descarga de ejecución, se añadió sólo al entorno de la prueba tipada. Cuatro cron críticos con última ejecución fechada exitosa. La lectura agregada encontró cero servicios del portal, de modo que no se afirma que algún cliente haya sufrido ya estos defectos.

## Fallos confirmados, pendientes de corregir

1. **P1 — Las referencias de entrega se pierden en la APK.** PostgreSQL guarda el campo `referencias_entrega` de este formulario, pero `PedidoModel.fromMap` no lo conserva como campo propio. Sólo lo usa como alternativa de `destino`; el envío del portal siempre trae `destino` con la dirección, por lo que esa alternativa no se usa. La vista activa sólo muestra `notas` y `referenciasCliente`, que son otros campos. Reproducción: casa azul/portón blanco capturados en el panel → ninguna referencia visible en la vista activa. Debe conservarse y mostrarse la referencia original, sin confundirla con una respuesta posterior del cliente.
   - Backend: `supabase/migrations/20261026144246_eats_restaurant_delivery_location_modes.sql`, inserción de `referencias_entrega`.
   - APK real: `driver_app/lib/models/pedido_model.dart:105` y `driver_app/lib/widgets/driver_active_delivery_content.dart:148`.

2. **P2 — La entrega sin pin desaparece del itinerario de paradas.** El contrato admite dirección escrita con coordenadas nulas. `RouteStop.getStopsForPedido` agrega una entrega sólo si tiene coordenadas; ya `en_camino`, retorna cero paradas para ese servicio. El itinerario puede informar que no hay paradas pendientes aunque el pedido siga activo. La pantalla principal del pedido permanece disponible: no se afirma que desaparezca de toda la APK. Debe conservarse una tarea pendiente sin ruta y pedir ubicación, sin inventar coordenadas.
   - APK real: `driver_app/lib/models/route_stop.dart:62` y consumidor `driver_app/lib/providers/route_optimizer_provider.dart`.

3. **P2 — La recogida presenta una etiqueta interna como dirección.** El portal guarda `origen=portal_restaurante` como fuente del pedido. El itinerario usa `p.origen` como dirección legible del restaurante; la parada queda con el texto `portal_restaurante`, aunque sus coordenadas sean correctas. Hay que separar fuente y dirección de origen; no sustituirla por la dirección del cliente.
   - APK real: `driver_app/lib/models/route_stop.dart:54`.

4. **P2 — Un aviso «comida lista» puede aprobarse para el repartidor anterior.** `OrderNotificationGateway.current` comprueba cocina/estado para `driver_ready`, pero no compara el dueño vigente con `snapshot.driver_id`. Tras reasignar antes de procesar un aviso pendiente, el aviso antiguo sigue siendo válido para el gateway. Prueba sobre el archivo descargado: snapshot de A y pedido ya asignado a B → `current` devuelve `true` cuando debe devolver `false`. No se envió ningún aviso real.
   - Backend activo: `supabase/functions/_shared/eats-order-notification-gateway.ts:30`.

5. **P1 adicional — Credencial privada de proveedor codificada en la APK.** `AiFormatterService` contiene una credencial literal y se invoca desde el detalle del pedido para resumir el texto. La fuente pertenece al manifiesto exacto de la APK compilada. No se reproduce el valor en este informe ni se usó para llamar al proveedor; no se comprobó si ya fue revocada. Debe retirarse del cliente y rotarse si continúa vigente. Los cobros e instrucciones de liquidación también deben mostrarse desde los datos originales, sin depender de un resumen generativo.
   - APK real: `driver_app/lib/services/ai_formatter_service.dart:7`; uso en `driver_app/lib/screens/driver_active_pedido_view.dart:1389`.

## Dinero: ejemplo exacto confirmado

Pollo **$180**, envío completo **$45**, aporte Robin’s **$15**, envío cliente **$30**. El repartidor cobra **$210**, deja **$165** a la sucursal y conserva **$45**. El aporte se descuenta una sola vez; no se añaden otros $15 al cliente. El ejemplo pasó en PostgreSQL aislado, en el recibo persistido y en el modelo financiero de la APK real.

Pruebas de auditoría: **29 contratos SQL aislados aprobados**, incluidos el ejemplo exacto y regresiones de cotización/idempotencia/permisos. Flutter: un caso monetario aprobado y **tres expectativas de contrato fallidas** que conservan la reproducción de los defectos 1–3. Deno con comprobación de tipos, fuente publicada y transporte simulado: **una expectativa fallida** por el defecto 4. No se rebajaron expectativas para obtener verde.

La auditoría conserva las pruebas rojas y logs privados bajo `.codex-tmp/eats-portal-driver-audit-20261026/`; prueba Flutter de seguimiento en `C:/Users/Kaleb/Desktop/loyalty-estrella/driver_app/test/portal_delivery_audit_test.dart`. Sólo se añadió una prueba monetaria al harness SQL; ninguna función de negocio cambió. No se subió ni desplegó una corrección como parte de esta revisión. Copia de la guía del VPS sigue pendiente por el timeout SSH ya documentado.

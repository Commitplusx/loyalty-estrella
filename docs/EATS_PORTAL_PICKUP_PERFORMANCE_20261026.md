# Portal de restaurantes: PIN, avisos y lecturas — 26 de octubre de 2026

## Contrato solicitado y causas verificadas

Kaleb pidió corregir los envíos del portal, mostrar el PIN de recolección que usa la APK, reducir la lentitud del panel y no enviar plantillas al cliente cuando el restaurante captura el servicio. Los avisos del checkout del cliente se conservan.

- El PIN ya estaba persistido y era válido. `eats_restaurant_delivery_receipt` no lo incluía; confirmación e historial no podían mostrarlo. No se genera otro PIN.
- `eats_capture_order_event` admitía los avisos de estado del cliente también para el origen `portal_restaurante`. Se observó un aviso `asignado` ya leído del servicio real. No se borra ese historial ni se vuelve a enviar.
- El portal consultaba de nuevo al usuario, repetía la búsqueda de sucursales en cocina y solicitaba todas las columnas de pedidos. Las estadísticas se volvían a pedir al cambiar de pestaña y cada evento podía iniciar lecturas concurrentes. La salida de la pestaña anterior bloqueaba la entrada de la siguiente.
- En las dos horas consultadas hubo 77 lecturas exitosas de restaurantes y dos 503; 51 lecturas recientes de servicios fueron exitosas. El cotizador registró cuatro 503 y dos 200, con duración de origen cercana a ocho segundos. El código anterior no clasificaba la etapa del fallo: esto no prueba cuál dependencia falló ni que los 503 de infraestructura hayan desaparecido.

## Servidor publicado

Proyecto Eats `jdrrkpvodnqoljycixbg`, migración `20261026165038_eats_portal_pickup_notice_policy.sql` aplicada y registrada:

1. El recibo devuelve `pickupPin` con el valor exacto de `pedidos.pickup_pin`, incluidos ceros iniciales, mientras el servicio está buscando, ofrecido, asignado o en recolección. Después de recogerlo, cancelarlo o entregarlo devuelve nulo. El acceso sigue pasando por las RPC autenticadas de resultado/recientes y la comprobación de propietario/sucursal. La función interna del recibo no se concede a anon/authenticated.
2. Los avisos al cliente `asignado`, `preparing`, `en_camino`, `entregado`, `cancelado` y `pickup_ready` sólo se encolan para origen `web`. Los servicios `portal_restaurante` conservan despacho y aviso al repartidor cuando la comida está lista.

`notificar-whatsapp` **v212 ACTIVE**: vuelve a comprobar el origen persistido antes de enviar, también para trabajos que ya estuvieran en cola. La segunda comprobación antes del envío se aplica a todos los tipos. No se acepta el origen declarado por el navegador o por una instantánea antigua.

`restaurant-delivery-quote` **v3 ACTIVE**: verifica sesión y permiso en paralelo antes de resolver enlaces Maps, conservando autorización, presupuestos de tiempo y tarifa del servidor. Los fallos de transporte distinguen sesión, acceso y cálculo, sin registrar credenciales o datos del destinatario. No añade reintentos automáticos.

Se descargaron y contrastaron por SHA256 las catorce fuentes del notificador y las cinco del cotizador. Sólo cambiaron cuatro archivos de ejecución. Asignación v75, timeout v42, rescate v29 y RPC de aceptación/recolección/cierre permanecieron iguales. PIN exclusivamente de recolección; no cambia la APK.

## Web

- El recibo confirmado y la lista de envíos muestran el PIN de recolección, usando el mismo campo del servidor. La etiqueta anterior «PIN de Entrega» de cocina se corrige. El parser valida cuatro dígitos y no convierte el PIN en número ni inventa uno si falta.
- La sesión de la ruta aporta el ID como filtro de consulta; PostgreSQL/RLS sigue autorizando los datos. Un cambio de usuario desmonta el portal. Se elimina la consulta repetida de identidad y el fallback que repetía la lectura ante cualquier error de red.
- Cocina reutiliza los IDs de sucursales ya consultados por el portal y selecciona sólo las columnas utilizadas. Mantiene el monitor montado, permisos, alarmas y notificaciones. La carga tiene plazo de doce segundos.
- Las lecturas simultáneas se agrupan por sucursal. Una reconexión ocurrida durante una lectura exige otra posterior: no se omite por considerar que la caché es reciente. Los eventos que llegan durante la lectura siguen reconciliándose con revisiones y tombstones existentes. Al salir se descarta el seguimiento pendiente.
- Conteos y ventas usan memoria por restaurante durante veinte segundos, como máximo dieciséis entradas; nada se guarda en almacenamiento del navegador. Cambio de autenticación vacía la caché y un evento Realtime fuerza una lectura nueva, serializada y agrupada. Los fallos no se cachean ni se presentan como cero ventas.
- Las consultas de ventas se acotan a treinta días y mil filas; cocina a mil pedidos activos. Alcanzar el límite produce un error visible y conserva la información anterior en vez de presentar una lista incompleta como completa. Un volumen mayor necesita agregación/paginación específica antes de ampliar esos límites.
- QR se importa de forma diferida y las pestañas ya no esperan la animación de salida anterior. Se conserva la identidad visual y se reduce la transición a 160 ms.

## Validación y evidencia

- **31 comprobaciones PostgreSQL aisladas**: acceso matriz/sucursal, idempotencia, H3/dirección, cobros, PIN exacto/ceros iniciales/ocultación posterior y política de avisos. El escenario de comida ya lista distingue el aviso del cambio de estado del cambio real de cocina; no se rebaja la expectativa para ocultar duplicados.
- Ensayo PostgreSQL real con triggers y `ROLLBACK`: sin pedidos, mensajes ni ofertas de QA comprometidos. Permisos del recibo interno y origen del PIN verificados.
- **85 pruebas Deno con tipos** del notificador/cotizador, repetidas sobre sus fuentes descargadas de producción. Dos puntos de entrada comprobados con `deno check` y configuración aislada; no se usó `--no-check`.
- **52 pruebas web con tipos**: recibo/cobros/PIN, caché/cola, reconexión durante lectura, fallo sin reintento automático, descarte al salir, alarma, estado de cocina, notificaciones y ubicación/tarifas. Build TypeScript/Vite aprobado. ESLint de módulos nuevos/recibo limpio; comparación con HEAD sin incidencias nuevas. Portal pasa de tres a cero; Dashboard de seis a tres. Persisten ocho incidencias heredadas en cocina y una en App, fuera de la lógica nueva.
- UI local Opera a **1366×900 y 390×844**, con API de demostración: PIN `0042` visible en confirmación e historial, sin desbordamiento horizontal. No fue un servicio real ni una prueba de aceptación física del repartidor. Capturas privadas `pickup-desktop.png` y `pickup-mobile.png`.
- Salud posterior al servidor: cuatro cron críticos con última ejecución exitosa, cero avisos pendientes y un servicio real activo del usuario. No se alteró/canceló ese servicio.

Evidencia privada en la raíz operativa: `.codex-tmp/eats-portal-complete-20261026/`: respaldos anteriores, `plan.json`, hashes SQL/runtime, intentos duraderos, descargas posteriores, logs tipados, salud, comparación de lint, publicación GitHub y verificación de módulos públicos. Los archivos contienen evidencia operativa y no se suben indiscriminadamente al repositorio.

## Publicación y límites

Supabase ya está publicado y verificado. Las fuentes web/backend se publican por listas explícitas desde sus checkouts aislados, con HEAD/main previo comprobado; el recibo de GitHub conserva el SHA final. La comprobación pública exige equivalencia de los cuatro módulos PortalPage/EnviosView/DashboardView/PedidosView; sólo normaliza nombres generados de módulos y el token público Mapbox. Un commit no sustituye esa comprobación.

No hay medición nueva de segundos de carga en un dispositivo de cliente y no se promete ausencia de fallos futuros del proveedor. No se enviaron nuevos WhatsApps, pushes o pedidos reales de prueba. La recepción física del PIN/servicio en cada sucursal sigue siendo una prueba distinta. Bot Robin’s, WABA, worker, facturación y APK no se modificaron. La guía del VPS sigue pendiente mientras SSH no responde; no se declara sincronizada por una edición local.

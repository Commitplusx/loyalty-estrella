# Asignación Eats por presencia y tiempo de llegada

Entrega del 25 de octubre de 2026 para Eats/Loyalty `jdrrkpvodnqoljycixbg`. El proyecto independiente Robin’s y el worker no se modifican. El PIN sigue exclusivamente en recolección; `avanzar_pedido_repartidor` y cocina conservan las definiciones publicadas anteriores.

## Contrato implementado

La ruta existente sigue siendo trigger → Edge de asignación/rescate → PostgreSQL → oferta atómica → lectura confirmada → avisos. `eats_dispatch_context` toma el pedido duradero y el origen de su sucursal exacta, excluye rechazados/ocupados y genera un contexto por pedido e intento. La estimación por calles se obtiene en Edge, pero la selección y revalidación se ejecutan en `eats_rank_dispatch`/`eats_offer_ranked` dentro de PostgreSQL. No hay otro algoritmo en Flutter ni en el panel.

- Hasta diez candidatos, radio de cinco kilómetros, batería mínima de 15%, una oferta por conductor. Se excluyen del nuevo reparto automático quienes ya tienen viajes aceptados: no hay agrupación que pueda alterar una entrega comprometida sin una ruta compatible verificada.
- La RPC revalida disponibilidad, carga, rechazos, propiedad, contexto de hasta veinte segundos y movimiento de hasta 150 metros respecto al punto estimado antes de ofrecer. La reserva conserva la RPC existente y su token/vencimiento de 25 segundos.
- El nuevo costo se expresa en segundos: el mayor entre llegada al restaurante y preparación restante, menos una bonificación por espera limitada a treinta segundos. En empate se prefiere la llegada menor y luego el ID estable. La tasa de aceptación no penaliza el ranking nuevo.
- La hora de aceptación de cocina se registra desde su transición real. No se inventa para órdenes anteriores ni se toma de `updated_at`. Sin hora conocida se declara desconocida y se compara llegada; no se retrasa artificialmente la búsqueda.
- Mapbox Matrix usa un perfil `driving`, muchos orígenes hacia una sucursal; hasta diez elementos y mínimo dos exigido por API. No se afirma que sea un modelo específico de motocicletas ni una medición de tráfico en vivo.
- Tiempo de proveedor de 3.5 segundos; tres consultas simultáneas por instancia, caché exacta de coordenadas por treinta segundos/máximo 128 entradas y deduplicación concurrente. Tres fallos abren circuito un minuto; 401/403 lo abren cinco minutos. Sin token, error o circuito abierto: estimación geográfica explícita, no un tiempo por calles ficticio. Una ruta `null`/`NoRoute` se excluye, no se convierte en cero ni en una ruta exitosa.
- Sin origen válido en modo activo no se crea una supuesta ruta; queda la incidencia y recuperación existente, que termina en revisión manual tras su presupuesto finito.

## Presencia y APK

Se separan intención Online, contacto autenticado recibido por el servidor y medición GPS con fecha/precisión propias. `driver_presence_begin`/`driver_presence_report` validan usuario, perfil, dispositivo y sesión. Secuencias atrasadas, otro dispositivo, un envío demasiado viejo/futuro o un conductor Offline no alteran presencia vigente. Una repetición de la misma coordenada no rejuvenece su fecha. GPS de más de 120 segundos, futuro o con precisión peor de cien metros no entra como GPS fresco. Contacto requerido de hasta noventa segundos.

La APK `2026102502` conserva diseño, sonidos y acciones del pedido; cambia el transporte del servicio periódico existente. Reporta cada quince segundos, sin trabajos superpuestos, aun estando quieto. Relee la identidad antes de enviar, respeta Offline, conserva timestamp real del GPS, detecta muestras simuladas y no usa una clave pública como sustituto de sesión expirada. Si no obtiene GPS reciente comunica presencia sin inventarlo. Fallos de transporte retroceden a 30/60/120 segundos y emiten códigos de diagnóstico sin payloads personales.

Las APK anteriores pueden seguir proporcionando contacto autenticado por su actualización de ubicación existente; se identifica `protocol=0`, sin inventar fecha ni precisión de la medición. Sólo es compatible durante noventa segundos desde una actualización real y no desde un cambio administrativo. `strict_presence=false` conserva esa transición. `protocol=1` exige medición fresca; un perfil nunca observado no se considera conectado por tener `activo=true` guardado. No se rellenó ninguna presencia con datos antiguos.

Una sesión Auth expirada no cuenta como conectada. Abrir la APK para renovar su sesión forma parte de la recuperación; no se comparte un token de servidor con el teléfono ni se reactiva por un reporte pendiente.

## Errores de aceptación corregidos

Se conservó una reproducción del RPC publicado anterior: un conductor rechazado podía aceptar después mediante la rama de pedidos disponibles. La nueva aceptación respeta el rechazo persistido y evita ignorar otra oferta pendiente; en modo activo revalida presencia. Repetir una aceptación ya confirmada sigue devolviendo éxito sin contarla dos veces, incluso si después baja batería o se pone Offline. No se exige un PIN nuevo de entrega.

## Evidencia y límites

Migración aplicada/registrada: `20261025150138_eats_dispatch_presence_eta`. Publicación inicialmente en `observe`, con la selección anterior y propuesta nueva registradas en un contexto único, sin una segunda oferta. Edge de asignación v74, timeout v41 y rescate v28 ACTIVE: doce archivos de ejecución verificados por hash. La configuración de la credencial de rutas provoca también actualización de versión de Supabase; las cifras son las leídas después, no un número de despliegue supuesto.

Pruebas: 22 PostgreSQL aisladas de presencia/ETA, 65 regresiones SQL, seis recorridos con **dos conexiones reales** a PostgreSQL local, 26 Deno tipadas repetidas sobre la descarga publicada y 117 Flutter. Se probaron doble asignación, aceptación contra vencimiento, Offline contra heartbeat, permisos privados, rechazos tardíos, Mapbox fallido/lento/null, circuitos, caché, datos inválidos y presupuesto. Las pruebas geométricas aisladas son sustitutos deterministas; además se comprobó el contrato PostGIS real en Supabase. Esto no es un benchmark de carga ni una prueba de calles con tráfico real.

Migración ensayada con ROLLBACK; definiciones y ausencia de tablas confirmadas tras revertir. Después se aplicó en transacción junto con su registro y se publicaron sólo las tres funciones revisadas. Salud HTTPS: POST sin autorización 401, contrato SQL posterior aprobado, cero pedidos activos/inválidos en las lecturas anterior/posterior. Las definiciones de entrega y cocina conservan sus hashes. Una consulta real a Matrix dio HTTP 200/Ok; no se imprime ni versiona la credencial.

APK release ARM64: `build/release-20261025/estrella-eats-driver-2026102502-release-arm64.apk`, SHA256 `8cf2d5ab5e04da30c25a1bf47e815850042bbe6b1d947893cff24522feda18d1`, certificado `3f82412f0512efc9f97235881e838dcd80869fa14c88c914dd7075f4240462ac`. 146 entradas de fuente/configuración con hashes sin cambios durante compilación. Instalada por USB conservando datos; Android confirmó versión y proceso vivo después de que Kaleb permitiera el aviso Play Protect. El comando inicial había agotado espera: no se supuso fallo ni se reinstaló a ciegas. Arranque acotado sin señales FATAL/Unhandled/RenderFlex; servidor confirmó contacto y GPS de protocolo nuevo y su avance en segundo plano y con pantalla apagada. La pantalla volvió a encenderse al cerrar la comprobación.

Tras estas comprobaciones se activó `mode=active`, `strict_presence=false`, versión 2, mediante una transacción que exigía presencia actual de protocolo nuevo, política todavía en observación y cero pedidos activos. No se activó la exclusión global de las APK anteriores: siguen identificadas por protocolo y contacto real reciente. Las comprobaciones suman 236 casos entre las suites anteriores, sin contar consultas administrativas como pruebas adicionales. No hubo pedido físico de punta a punta en esta entrega.

No se crearon pedidos, no se enviaron WhatsApps/push, no se comprobó un viaje físico ni se midió precisión final de ETA en campo. No se entrenó un modelo con las escasas órdenes recientes. No se promete ausencia total de fallos ni la escala de otra plataforma.

## Operación, privacidad y reversión

Tablas de política, presencia, reloj de cocina y contextos sólo para servidor; el cliente sólo puede ejecutar sus RPC de presencia. Contextos conservan versión, fuente, razón y propuesta por intento; limpieza horaria en lotes de hasta mil para datos mayores a siete días, sin invocar otra Edge. Si el volumen supera ese presupuesto, revisar retención antes de afirmar una caducidad estricta de siete días. No registrar teléfonos, tokens ni descripciones en el contexto.

Cambiar `eats_dispatch_policy.mode` a `legacy` revierte explícitamente la elección al ranking anterior; `observe` calcula pero no utiliza la propuesta. No borrar ofertas ni eventos y no ejecutar migraciones históricas a ciegas. Para revertir binarios, usar respaldos individuales compatibles de las tres funciones y la APK con firma igual. Tablas/columnas son aditivas; no eliminarlas mientras exista un consumidor instalado. La protección adicional de aceptación es independiente del modo.

Evidencia privada, respaldo de RPC/Edges y recibos: `C:/Users/Kaleb/Desktop/pollo-robins-panel/.codex-tmp/eats-dispatch-v2-20261025/`. No subirla al repositorio. La guía local se actualiza al cerrar; la copia del VPS sigue pendiente por SSH inaccesible.

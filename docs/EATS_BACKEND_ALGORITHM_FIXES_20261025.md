# Correcciones de algoritmos Eats — 25 de octubre de 2026

**Versionado posterior:** esta entrega de `main` incorpora únicamente las fuentes de despacho publicadas, la migración, sus antecedentes necesarios y pruebas reproducibles. La referencia anterior a «sin nueva subida GitHub» describe el corte inicial de Supabase; queda sustituida por esta copia versionada. No se rediseñó ni compiló la APK. [Ejecución de pruebas](DRIVER_DISPATCH_TESTS.md) y [plan del siguiente algoritmo](DRIVER_ASSIGNMENT_EVOLUTION_20261025.md).

Publicado exclusivamente en Eats/Loyalty `jdrrkpvodnqoljycixbg`, por la petición de corregir los defectos de la [auditoría](EATS_BACKEND_ALGORITHM_AUDIT_20261025.md). Kaleb precisó después: **el PIN sólo sirve para recoger en el restaurante; no se exige al entregar al cliente y la APK se conserva**. Esta instrucción prevalece sobre la propuesta del primer informe.

## Cambios publicados

1. El ranking excluye los rechazos persistidos del pedido y a quienes ya tienen otra oferta antes de ordenar y limitar a diez. Conserva puntuación, batería mínima, capacidad y revalidación atómica de la oferta. La selección sin coordenadas utiliza la misma RPC y elegibilidad; no inventa GPS ni mantiene otra lista en Edge. La firma anterior de cinco argumentos sigue disponible; la nueva firma de seis recibe `p_excluidos` y sólo permite ejecución de servidor.
2. `pedidos_oferta_completa` impide guardar `ofrecido` sin repartidor, token o vencimiento finito. La migración aborta si encuentra una oferta heredada inválida; no adivina su propietario ni la reasigna. La comprobación previa encontró cero filas inválidas y el constraint quedó validado.
3. `eats_notification_status` conserva un fallo de WhatsApp ante callbacks tardíos `accepted/sent`. Un callback válido de entrega/lectura sí puede aportar evidencia posterior. Se conserva la vinculación exacta de proveedor, emisor y destinatario; no se reescribió el historial.
4. `eats_notifications_due` y `eats_notification_claim` comparten la elegibilidad de las partes ordenadas. Las dependientes todavía sin enviar cuyo predecesor terminó `failed/uncertain/superseded`, o cuyo presupuesto se agotó, se cierran con error explícito y log, hasta cien por invocación. No despiertan indefinidamente ni se reenvía una parte incierta. Se mantienen tres leases simultáneos y los presupuestos existentes.

No se modificaron `aceptar_pedido_atomico`, `avanzar_pedido_repartidor` ni `eats_kitchen_action`: sus hashes antes/después son idénticos. El PIN de recolección, la entrega final y la APK permanecen intactos. Sin cambios al proyecto independiente Robin’s, worker, WABA, teléfonos, web o Vercel; sin nueva subida GitHub.

## Publicación y respaldo

- Migración aplicada y registrada atómicamente: `20261025143743_eats_dispatch_notification_algorithms.sql`. SHA256 `a8d9287ad74afa19a5f7f65dd29fe0677982fd813a652ae4ef416f4bae71d94a`.
- `asignar-repartidor`: v71 → **v72 ACTIVE**.
- `asignacion-timeout`: v38 → **v39 ACTIVE**.
- `cron-rescate`: v25 → **v26 ACTIVE**.
- Nueve archivos de ejecución descargados después del despliegue coinciden por SHA256 con los candidatos revisados. Cada función cambia sólo `_shared/driver-dispatch-gateway.ts`; entradas y coordinador conservan sus hashes. Autenticación propia y `verify_jwt=false` preservados.
- `auth-otp` v91 y `notificar-whatsapp` v208 no se volvieron a desplegar en esta entrega. Los cambios de callbacks/outbox son PostgreSQL.

Antes de publicar se descargaron por separado las tres funciones activas y las definiciones RPC; se compararon otra vez justo antes del corte. La migración completa se ensayó en la base real con `ROLLBACK`, incluidos permisos, firma heredada y consulta PostGIS. Una segunda lectura confirmó que las RPC activas seguían idénticas tras el ensayo. SQL y registro se publicaron en una transacción con plazos de bloqueo/ejecución; primero el contrato compatible de base y después las tres funciones.

Respaldo, plan, hashes, ensayos y recibos privados: `C:/Users/Kaleb/Desktop/pollo-robins-panel/.codex-tmp/eats-algorithm-fix-20261025/`. No subir esa carpeta a GitHub. `sql-publish.json` y los recibos por función conservan cada intento; un envío administrativo incierto requiere inspección, no repetir a ciegas.

## Verificación

**79 comprobaciones pertinentes aprobadas:** veinte nuevas PostgreSQL aisladas, catorce Deno tipadas y 45 regresiones existentes (18 despacho, 18 avisos y nueve cocina). Las veinte nuevas cargan el snapshot publicado anterior y la migración nueva: undécimo candidato tras rechazos/ofertas, elegibilidad, contrato heredado, permisos, datos inválidos, rollback de migración, integridad de oferta, callbacks desordenados, dependencias terminales/temporales, limpieza acotada y concurrencia limitada. Incluyen la conservación del cierre de entrega sin un PIN final.

Las catorce Deno se repitieron sobre la fuente descargada publicada; `deno check` pasó para las tres entradas publicadas. Control de calidad Robin’s: 280 archivos sin tipos/supresiones prohibidos. La instalación privada de dependencias para comprobar Deno no cambió versiones ni configuración productiva.

El contrato PostgreSQL real pasó antes del corte con rollback, dentro de la publicación y después. Consulta por PostgREST de sólo lectura: firma nueva, exclusiones, selección sin origen y firma heredada devuelven HTTP 200. Tres candidatos iniciales, cero tras excluir esos mismos tres; acceso anónimo denegado con HTTP 401. No se guardaron IDs personales en el recibo de transporte.

Salud antes/después: cero pedidos activos, ofertas inválidas y avisos pendientes en los instantes consultados; migración registrada exactamente una vez. Las tres entradas rechazan POST sin autorización con HTTP 401. Hashes de RPC no modificadas:

| Contrato | MD5 de la definición, antes = después |
| --- | --- |
| Aceptación | `5c4eedefab38739fedfb630032ec37c8` |
| Recolección y entrega | `56b8c4334bfd018c6dc2fcdf92b1dab6` |
| Acción de cocina | `d73fe1b1bf551d9421f379c86f8c0fea` |

No se crearon pedidos ni se enviaron WhatsApps/push de prueba. Estas comprobaciones no equivalen a recepción física ni a una prueba de carga o contención entre sesiones. PGlite usa una conexión y sustitutos espaciales; la consulta PostGIS real verifica contrato y datos actuales, no un benchmark con once conductores reales.

## Límites y reversión

La presencia sigue sin timestamp de última conexión/GPS; no se cambió esta regla ni se inventó actividad reciente. Los fallos históricos de cron y WhatsApp conservan la evidencia del informe anterior; no se atribuye su causa a recursos, cuota o VPS sin medición.

Para revertir, revisar primero pedidos/ofertas y leases nuevos. Restaurar las tres funciones Edge desde sus respaldos individuales, confirmar hashes y salud, y sólo entonces revisar la reversión SQL desde `rpc-before.json`: la firma de seis argumentos debe conservarse mientras exista un consumidor que la utilice. No borrar historial, avisos, registro de migración ni constraint como operación automática. No hay un rollback masivo autorizado por esta nota.

La guía local y los documentos de publicación se actualizaron. La copia de la guía en el VPS sigue pendiente: SSH a `estrella` agotó la conexión en esta sesión. No se verificó allí el runtime ni se afirmó sincronización de esa copia.

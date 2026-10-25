# Auditoría de algoritmos Eats — 25 de octubre de 2026

**Estado posterior:** Kaleb confirmó que el PIN es sólo de recolección y que la APK se conserva; el apartado 1 describe el contrato deliberado y deja de ser una corrección pendiente. Los cuatro defectos restantes ya fueron corregidos y publicados con migración `20261025143743`, despacho v72, timeout v39 y rescate v26. [Pruebas, publicación y límites](EATS_BACKEND_ALGORITHM_FIXES_20261025.md). El informe siguiente conserva la evidencia anterior al corte.

Kaleb pidió buscar posibles bugs en el backend. Esta entrega es una revisión con reproducciones aisladas: **no corrige ni publica cambios de producción**. Alcance: asignación, aceptación, vencimiento/rescate, cierre de entrega y outbox de WhatsApp del proyecto Eats/Loyalty `jdrrkpvodnqoljycixbg`. No es una certificación de todos los endpoints, permisos o carga del sistema.

## Fuente realmente revisada

Descargas actuales: `asignar-repartidor` v71, `asignacion-timeout` v38, `cron-rescate` v25, `auth-otp` v91 y `notificar-whatsapp` v208, todas ACTIVE. Las tres funciones de despacho y sus dependencias coinciden por hash con sus fuentes locales. Se leyeron 17 RPC reales más las dos funciones de programación de avisos. Respaldos de lectura, hashes y casos sintéticos privados en `C:/Users/Kaleb/Desktop/pollo-robins-panel/.codex-tmp/eats-algorithm-audit-20261025/`.

El script `reproduce-published.cjs` ejecuta directamente las definiciones PostgreSQL descargadas en PGlite aislado. Afirma el comportamiento defectuoso para conservar evidencia; **no son pruebas de una corrección**. No inserta datos en Supabase ni envía mensajes. Seis escenarios reproducen cinco hallazgos:

## 1. Contrato confirmado — PIN sólo para recolección

La propuesta inicial de exigir otra validación final fue descartada por instrucción posterior de Kaleb: «el pin, que solo sea de recoleccion bro, no para la entrega, la apk esta bien». No se cambia esa regla ni se considera un fallo pendiente de esta entrega. La reproducción siguiente verifica el comportamiento existente.

`avanzar_pedido_repartidor` valida propietario y secuencia; el PIN que comprueba corresponde a la recogida en restaurante al pasar a `en_camino`. Al pasar de `en_camino` a `entregado` no exige `pin_seguridad` del cliente, GPS ni otro comprobante. `validar_geocerca_entrega` publicado sólo devuelve NEW.

Reproducción: pedido sintético a domicilio con PIN de cliente existente, conductor autenticado y estado `en_camino`; llamada al RPC con únicamente ID, conductor, estado anterior y nuevo devuelve true y guarda `entregado`. No se proporcionó PIN ni ubicación. La APK actual también llama al cierre sin un PIN final; no es una regresión introducida por el cambio de nombres de sucursal.

Impacto: el propietario del servicio puede confirmar entrega sin acreditar recepción del cliente. No significa que un usuario ajeno pueda cerrar pedidos: esa comprobación sí funciona. Para corregirlo se necesita un contrato compatible servidor/APK/tracker, tratamiento explícito de pedidos anteriores y recuperación idempotente; no cerrar sólo la UI ni activar una exigencia incompatible en producción.

## 2. P2 — el ranking recorta antes de excluir candidatos inutilizables

`buscar_repartidores_cercanos` limita a diez y sólo exige carga menor que tres. No recibe los rechazos del pedido ni excluye a quien ya tiene una oferta. El coordinador elimina rechazados después de recibir esos diez; la RPC de oferta rechaza al que ya tiene otra oferta. Por tanto puede anunciar falta de candidatos sin llegar al undécimo disponible.

Dos reproducciones con once conductores sintéticos dentro de cobertura:

- Los diez primeros ya constan como rechazados en el pedido: el ranking devuelve sólo esos diez. Ninguno queda utilizable; la oferta atómica directa al undécimo sí funciona.
- Los diez primeros tienen otra oferta vigente y mejor puntuación; el undécimo está libre: las diez ofertas intentadas fallan y la del undécimo funciona. Esta variante no depende de acumular diez rechazos ni de superar el límite de seis reclamaciones del pedido.

Las funciones geométricas del ensayo son sustitutos deterministas usados únicamente para aislar orden/LIMIT; **no se midieron distancias PostGIS ni planes reales**. Las definiciones de selección, puntuación y oferta son las publicadas. Con los tres conductores actualmente Online no se demostró este caso en tráfico real; afecta al crecimiento/picos con más candidatos.

Corrección propuesta: excluir rechazos y ofertas vigentes antes de LIMIT en la consulta autoritativa, manteniendo bloqueo y revalidación de capacidad en la RPC. No aumentar el lote sin límite ni duplicar ranking en Flutter.

## 3. P2 — un callback tardío puede borrar un fallo de WhatsApp

`eats_notification_status` protege `read`, `delivered` y parcialmente `sent`, pero no protege `failed` frente a un `accepted` anterior recibido después. Para el mismo ID de proveedor: callback `failed/131026` seguido de `accepted` termina con `state=accepted` y `error_code=NULL`.

Reproducido con la RPC real y remitente/destinatario válidos sintéticos. Puede ocultar una entrega fallida como aceptación del proveedor y distorsionar la cola/diagnóstico. No se afirmó entrega física; el bug es la pérdida del fallo. Corregir con una política explícita de precedencia de estados: un acuse anterior no debe borrar un fallo definitivo; una evidencia posterior de entrega/lectura debe tratarse por separado.

## 4. P2 — una oferta inválida queda fuera del rescate

La aceptación rechaza ofertas sin token o vencimiento, pero `dispatch_recovery_due` y la selección de `cron-rescate` sólo encuentran ofrecidos con vencimiento menor/igual al momento actual. Si `oferta_vence_at=NULL`, la oferta no se acepta, no expira por token y no despierta el rescate.

La base sólo tiene checks de estados/pago/método; no hay check que vincule `ofrecido` con propietario/token/vencimiento. Se reprodujo una fila heredada/inconsistente sin token/fecha: aceptación false, expiración false y recuperación false. La ruta normal de asignación genera ambos datos correctamente. **No se encontraron filas activas así en producción.** Es una falta de integridad/recuperación ante datos inválidos, no un fallo demostrado de creación normal.

Corregir con una regla de integridad compatible y un tratamiento visible/acotado de datos previos, sin soltar una asignación aceptada ni inventar una oferta nueva.

## 5. P2 — una parte bloqueada puede despertar Edge indefinidamente

`eats_notification_claim` impide enviar la segunda parte de un recibo si la primera falló o quedó incierta. Esa precaución es correcta. Sin embargo `eats_notifications_due` considera ejecutable cualquier `queued` vencido sin comprobar ese predecesor. La segunda parte queda queued, sin intentos y con fecha vencida; el cron puede llamar Edge cada minuto aunque ninguna fila sea reclamable.

Reproducción: parte cero `failed`, parte uno `queued`, mismo grupo; tres comprobaciones consecutivas dan due=true y claim=NULL. No avanza ni agota un presupuesto porque nunca reclama la fila. Puede aumentar consumo de Edge y dejar el recibo incompleto sin cierre de grupo.

Corregir la elegibilidad del despertador para que coincida con la de claim, y registrar explícitamente el bloqueo terminal de las partes dependientes. No reenviar automáticamente una primera parte de resultado incierto.

## Riesgo adicional: presencia no caduca

La tabla productiva de repartidores no tiene timestamp de última presencia/GPS. El ranking usa `activo`, batería y coordenadas guardadas; no puede distinguir un teléfono conectado de uno que dejó de reportar. Esto ya estaba documentado y sigue vigente. Hay tres conductores con activo/batería/GPS configurados, pero no se puede declarar su conexión reciente. No se marcó a ninguno como desconectado ni se inventaron timestamps.

## Estado operativo observado y pruebas existentes

- Cero pedidos activos, ofertas vencidas/inválidas o incidencias manuales en el instante consultado. Los casos anteriores son reproducciones, no afirmaciones de pedidos reales perdidos.
- 18 pruebas PostgreSQL existentes de despacho y 10 Deno tipadas del coordinador pasan. Esas 28 comprobaciones no cubrían los escenarios nuevos. El motor de pruebas usa una conexión; no demuestra ausencia de deadlocks entre sesiones.
- En las 24 horas consultadas, cron `rescate` registró 357 fallos y `eats-order-notifications` 358. Los últimos fallos fueron `job startup timeout` entre el 24 de octubre 23:21 y el 25 05:20 UTC; las ejecuciones recientes de ambos ya son exitosas. Esto verifica un incidente histórico del arranque de cron, **no identifica su causa ni demuestra un fallo actual de la lógica**. No atribuirlo al VPS ni cambiar recursos/facturación por suposición.
- Los fallos de WhatsApp históricos siguen visibles (131026, ventana de cocina cerrada y datos de destinatario inválidos). No se reenviaron ni se cambiaron destinatarios.

No hubo SQL persistido, cambios de funciones Edge/worker, APK, GitHub, Vercel, WABA o mensajes reales. Guía local actualizada; su copia al VPS sigue pendiente por la conectividad SSH ya documentada.

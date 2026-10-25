# Envíos solicitados por Robin’s desde el portal

## Alcance y operación

Servicio exclusivo de la matriz de Pollo Robin’s y sus tres sucursales verificadas en **Estrella Eats**. No afecta al proyecto independiente del bot Robin’s. El número/WABA no otorga permisos: se comprueban la habilitación de la matriz y la propiedad de la sucursal en el servidor.

En **Portal → Solicitar envío**, el operador captura cliente y WhatsApp, elige el destino con el selector Mapbox existente, escribe detalle/referencias, tiempo de preparación, comida **pendiente de cobro** y costo **completo** del envío. El origen es la sucursal seleccionada; su dueño sólo opera su acceso y la matriz usa el selector de sucursales existente.

Por ahora el precio es **manual**: `50`, `50 pesos`, `cincuenta pesos`. Una gramática finita valida números y palabras; no se llama a un modelo para decidir cuánto cobrar. Cantidades ambiguas, rangos, instrucciones, importes negativos o con fracciones de centavo se rechazan. No hay precio automático por zona en esta versión.

Robin’s aporta normalmente $15 del envío. El operador puede indicar otra aportación **para ese servicio**; nunca negativa ni mayor que el envío. Si el envío cuesta menos de $15, la regla habitual cubre sólo el costo completo. Comida ya pagada se captura como **0**, sin volver a cobrarla.

## Contrato de dinero

Sean I = comida pendiente, F = envío completo y C = aportación del restaurante:

| Concepto | Importe |
|---|---:|
| Envío del cliente | F − C |
| Efectivo por cobrar al cliente (`pedidos.total`) | I + F − C |
| Envío del repartidor (`pedidos.precio_entrega`) | F |
| Liquidación a la sucursal | I − C |

Ejemplo: I=$200, F=$50, C=$15. Cliente **$235**, sucursal **$185**, envío **$50**. Si I=$0, el cliente paga **$35** y la sucursal **entrega $15 al repartidor**. El detalle persistido indica expresamente cuándo entregar dinero a la sucursal y cuándo recibirlo de ella; el formulario muestra la misma separación. El dashboard excluye estos servicios de las ventas del menú para no contarlas dos veces.

## Ruta existente

1. `eats_restaurant_delivery_capability` confirma permiso y origen de la sucursal.
2. Edge `restaurant-delivery-quote` verifica el JWT mediante `/auth/v1/user`; deriva el actor de esa respuesta, nunca del cuerpo. Usa la clave de servidor sólo para `eats_restaurant_delivery_prepare`.
3. PostgreSQL conserva una cotización de cinco minutos con destino, origen e importes. Límites: envío $10,000, comida pendiente $100,000, hasta 20 cotizaciones/minuto y 100/hora por actor. Se podan como máximo 50 cotizaciones propias, no usadas y mayores a un día; los recibos consumidos permanecen.
4. `eats_restaurant_delivery_create` valida sesión, propiedad vigente, cotización, origen actual y cuerpo canónico. Bloqueos de filas estabilizan sucursal/matriz/habilitación frente a pausas o cambios de dueño concurrentes. Una referencia idempotente y una restricción única por cotización impiden dos servicios por reintento.
5. Inserta el pedido existente como `restaurante_delivery`, `origen=portal_restaurante`, efectivo pendiente, `buscando_repartidor` y cocina aceptada (`en_cocina` o `listo_para_recoger`). El trigger existente encola la asignación de PostgreSQL; no existe otro clasificador en React o Flutter.
6. PIN sólo de **recolección**; la entrega final conserva su contrato actual. La APK instalada interpreta los mismos campos financieros. Cuando el saldo con la sucursal es negativo, la instrucción explícita está en la descripción del servicio.
7. Seguimiento utiliza el pedido y su acceso privado existente. Los eventos entran en el outbox de Eats sólo si el enlace transaccional coincide con pedido y sucursal. La gateway reconoce ese mismo enlace para evitar que las llamadas manuales de la APK activen también la ruta antigua. No vuelve a pedir al restaurante aceptar un servicio que él mismo solicitó.

## Privacidad y recuperación

Tres tablas nuevas con RLS y sin permisos directos de `anon`/`authenticated`: habilitación, cotizaciones y recibos. Una política **restrictiva** protege el nuevo origen también ante las políticas antiguas de lectura anónima; no reescribe el alcance de los pedidos históricos. Sólo la marca autorizada, el repartidor asignado o el conjunto de repartidores activos que busca ofertas pueden leer el servicio según su estado. Se conservan las restricciones de sucursales existentes.

La UI almacena sólo el UUID de la solicitud en `sessionStorage`, nunca cliente, dirección o importe. Una respuesta incierta conserva referencia y cuerpo; consulta el recibo o reintenta el mismo servicio, sin inventar éxito. El resumen vencido se invalida y habilita **Revisar importes**, conservando los campos. Recientes: máximo 20 servicios/30 días, consulta de una sola ejecución cada 30 segundos con la pestaña visible, más actualización manual. Los fallos conservan los datos previos y se muestran.

`verify_jwt=false` de ambas Edge conserva el patrón de autenticación explícita: el cotizador verifica al usuario con Auth y el notificador mantiene su autorización de servidor/usuario. No significa acceso anónimo a creación; comprobado con HTTP401 usando un cuerpo válido.

## Evidencia y publicación

- Migración `20261025202620` instalada en el proyecto Eats; `notificar-whatsapp` **v210** y `restaurant-delivery-quote` **v1** ACTIVE.
- Catorce fuentes descargadas del notificador y cuatro del cotizador verificadas por SHA256. Del notificador activo v209 sólo cambia una fuente de ejecución, la gateway del outbox. Las fuentes actuales v209 ausentes en Git main se incorporan como antecedentes exactos; no se despliega el contenido pendiente de la carpeta de trabajo.
- Habilitación: una matriz explícita verificada, tres sucursales, aportación habitual $15. Cero servicios o cotizaciones persistidos durante QA.
- Diez RPC existentes de asignación/aceptación/cocina/presencia/seguimiento y las demás Edge sin cambios. Sólo se amplía el guard de `eats_capture_order_event` para recibos auténticos del portal.
- **204 comprobaciones automatizadas:** 116 Deno tipadas (14 del flujo nuevo, 69 regresiones de avisos y 33 de despacho), 49 SQL aisladas, siete con dos sesiones PostgreSQL reales, 30 web (seis del contrato nuevo y 24 de cocina/alarma/seguimiento) y dos de compatibilidad financiera Flutter. Las 83 Deno de cotización/avisos se repiten sobre la descarga publicada. Dos entradas Edge tipadas y build web aprobados.
- Ensayo con las tablas/triggers reales, importes, permiso, idempotencia, seguimiento y lectura anónima, seguido de **ROLLBACK**: cero pedidos, avisos o tareas de red comprometidos. Las pruebas concurrentes usan sólo una base local aislada.
- QA visual local en 1366×900 y 390×844: formulario, resumen, confirmación y comida pagada con aportación especial. El recorrido físico de un servicio real en la APK **sigue pendiente**; no se compila ni instala otra APK en esta tarea.
- Se conservó una ejecución histórica de `rescate` fallida por **server restarted**, sin fecha de inicio. Una primera consulta de auditoría la ordenó antes que las recientes; se corrigió la consulta con `NULLS LAST`. La última ejecución fechada de los cuatro cron críticos está **succeeded**. Cero pedidos activos o avisos pendientes tras publicar; no se cambió infraestructura/facturación.
- GitHub/web: pendiente de cierre. VPS/PM2 y el proyecto independiente Robin’s no se modifican. Copia de la guía al VPS pendiente si SSH sigue inaccesible.

## Deshabilitar nuevas solicitudes

Desactivar `eats_restaurant_delivery_access.enabled` para la matriz explícita apaga el acceso a nuevas solicitudes. No borrar tablas/pedidos/recibos ni revertir el algoritmo de despacho: los servicios ya confirmados conservan su flujo operativo y aparecen en pedidos activos. Rehabilitar requiere comprobar propiedad/sucursales y conservar las cotizaciones/recibos anteriores.

# Evolución de la asignación de Estrella Eats

**Actualización posterior:** la primera versión por presencia y tiempo de llegada ya está implementada y activa; [contrato, APK y evidencia](DRIVER_ASSIGNMENT_V2_20261025.md). Este documento conserva el plan inicial. Agrupación de viajes y entrenamiento predictivo no están activados; los viajes aceptados se protegen de desvíos automáticos.

Propuesta técnica del 25 de octubre de 2026, basada en el código y PostgreSQL publicados. **No está activada una versión nueva del ranking por ETA.** Las correcciones vigentes están descritas en [la publicación](EATS_BACKEND_ALGORITHM_FIXES_20261025.md). No se conoce ni se intenta reproducir el algoritmo propietario de Uber, Rappi o DiDi.

## Punto de partida medido

Ruta existente: `encolar_despacho_pedido` → Edge `asignar-repartidor` → `dispatchOrder` → `buscar_repartidores_cercanos` → `asignar_pedido_atomico` → lectura del propietario/token/vencimiento → Realtime/FCM y timeout. La base de datos conserva la última palabra sobre capacidad y propiedad. Una oferta expira en 25 segundos, hay hasta seis reclamaciones por pedido, diez candidatos por búsqueda y lote de rescate de hasta cincuenta con concurrencia de tres. No crear otro despachador en Flutter o en la web.

El ranking actual filtra batería mínima de 15%, estado activo, menos de tres trabajos, ninguna oferta simultánea y los rechazos del pedido antes del límite. Usa distancia geográfica, carga, aceptación y espera; esos factores se suman en escalas diferentes. No es una estimación de minutos por calles. La espera y la aceptación pueden superar una diferencia de proximidad: los comentarios históricos de «porcentajes» no convierten las magnitudes en porcentajes normalizados.

La lectura agregada del 25 de octubre encontró siete perfiles, tres marcados activos con batería y coordenadas, pero ningún campo de última presencia/medición GPS. En los catorce días había tres pedidos: dos cancelados y uno entregado. Este tamaño de muestra no permite entrenar un modelo de demanda, estimar confiabilidad por conductor ni afirmar una mejora estadística. Los perfiles activos no equivalen a teléfonos conectados ahora.

La APK instalada envía ubicación al ponerse Online y mediante un stream con filtro de movimiento de cinco metros. Un repartidor quieto puede estar conectado y no emitir GPS nuevo. No activar una exclusión por antigüedad hasta disponer de una señal periódica comprobada también en segundo plano.

## Orden de implementación

### 1. Presencia y calidad de la ubicación

Separar tres conceptos: intención Online, último contacto autenticado del teléfono y momento/precisión de la medición GPS. Registrar recepción con reloj del servidor; no aceptar que el teléfono declare una presencia futura. Un heartbeat no rejuvenece una coordenada antigua. No rellenar las filas existentes con `now()` ni confundir un cambio administrativo de nombre con actividad del teléfono.

Agregar una RPC autenticada ligada a `auth.uid()` con validación de batería, coordenadas, precisión y orden de mediciones. Reintentos idempotentes por sesión y secuencia, frecuencia y escritura acotadas. La APK conserva interfaz y flujo; necesitará un cambio pequeño de telemetría para reportar aun estando quieta. Primero verificar pantalla encendida/apagada, app en segundo plano, reconexión y apagado Online/Offline simultáneo. La caducidad se habilita por versión compatible y medición observada; no dejar sin servicio a teléfonos anteriores de golpe. Si no hay candidatos recientes, registrar la razón y escalar de forma visible; no inventar que están presentes.

### 2. Llegada por calles, con costo acotado

PostGIS hace la preselección barata de hasta diez candidatos elegibles. Consultar tiempos por calles de esos candidatos al origen exacto de la sucursal con Mapbox Matrix; una matriz muchos-a-uno evita pedir rutas entre todos los pares. No usar el centro de la marca ni el destino del cliente como punto de recolección.

El proveedor tiene presupuesto de tiempo, concurrencia y elementos. Usar caché corta por coordenadas/ruta/perfil y antigüedad de GPS, sujeta a los términos vigentes. Una ruta imposible (`null`) no equivale a cero minutos. Un fallo del proveedor conserva un resultado marcado como estimación geográfica en la ruta existente; no presentarlo como ETA por calles. No aumentar llamadas sin límite ni afirmar que el perfil de automóvil modela exactamente una motocicleta.

### 3. Preparación y carga real

Una persona con dos entregas pendientes no está a la misma disponibilidad que otra libre a la misma distancia. Evaluar el tiempo hasta poder llegar a cocina respetando sus compromisos actuales; si esa ruta no se puede estimar, no fingir disponibilidad inmediata.

Combinar llegada al restaurante y preparación restante: `salida estimada = max(llegada estimada, comida lista estimada)`. Para el cliente sumar recorrido y servicio de entrega. El tiempo anunciado por cocina requiere guardar su instante de aceptación; `updated_at` general no sustituye ese dato. No posponer la asignación únicamente porque la comida tarde: una espera controlada necesita presupuesto, plazo y recuperación duradera.

Al principio mantener una oferta por conductor y no cambiar automáticamente el orden de viajes aceptados. Agrupar dos o tres pedidos sólo después de simular inserciones que respeten recogida antes de entrega, capacidad y límites de retraso de **cada** cliente. Rechazar una inserción incompatible; nunca aceptar por el simple hecho de ir «en la misma zona».

### 4. Orden explicable y reparto justo

Aplicar primero los filtros obligatorios: identidad/proyecto, modalidad válida, pago/cocina listos, presencia y GPS válidos, batería, capacidad, ausencia de otra oferta y rechazos del pedido. Ninguna bonificación puede recuperar a un candidato excluido.

Comparar después costo temporal estimado en segundos: demora del pedido nuevo y retraso añadido a los ya aceptados. El reparto justo debe desempatar entre candidatos con llegada comparable o aportar una bonificación estrictamente acotada; no hacer que alguien muy lejano gane por llevar más tiempo esperando. Inicialmente no usar la tasa de aceptación como penalización dominante: el historial escaso y las ofertas que no llegaron al teléfono sesgan esa tasa. Si se incorpora después, distinguir rechazo, vencimiento y fallo de notificación, suavizar muestras pequeñas y declarar el límite de su efecto.

### 5. Oferta, recuperación y auditoría

Conservar el compare-and-set y bloqueo por pedido/conductor. Revalidar presencia, carga y disponibilidad al reservar, no sólo durante el ranking; entre ambas consultas puede cambiar la situación. Cada decisión guarda versión de política, razones y fuentes/antigüedad de estimación con retención limitada; no volcar datos privados ni rutas de todos los clientes en logs.

Los reintentos vuelven a consultar candidatos actuales, excluyen rechazos exactos y conservan token/deadline. No liberan un pedido aceptado desde un timeout antiguo. El radio puede ampliarse por etapas configuradas sólo dentro de la cobertura operativa, con límite y razón visible. Al agotar presupuesto, aviso operativo/manual; nunca fingir asignación ni mantener un bucle infinito.

## Cómo comprobar la mejora antes de activarla

Primero simulaciones deterministas y comparador offline del ranking actual contra el propuesto. Después, modo observación: calcular y guardar qué habría elegido el candidato sin emitir otra oferta, sin notificar ni cambiar propietario. La comparación comparte un mismo snapshot; no atribuir al algoritmo diferencias de datos de entrada. Una estimación contrafactual no demuestra qué habría tardado realmente un repartidor que no tomó ese pedido.

Medir con eventos duraderos: tiempo de búsqueda hasta aceptación, recepción/apertura de oferta cuando se pueda confirmar, vencimientos, rechazos, llegada a cocina y error de ETA. Mostrar tamaño de muestra, ventana, percentiles y datos desconocidos. No publicar una «tasa de éxito» que mezcle pedidos de prueba, cancelaciones previas a cocina y oportunidades que nunca recibieron oferta.

Matriz mínima:

- Dos pedidos intentan reservar al mismo repartidor desde conexiones distintas: una sola oferta vigente.
- Aceptación y vencimiento simultáneos: propietario consistente y métricas una sola vez.
- GPS viejo/futuro/impreciso, conductor quieto, sin permisos, Offline y heartbeat retrasado.
- Mapbox lento, 429, caída, ruta `null`, respuesta inválida y caché vencida: límite y fuente visibles.
- Rechazados antes del límite; once o más candidatos; cero disponibles; pérdida de red y proceso reiniciado después del commit.
- Sucursales distintas de la misma marca; recogida sin reparto; PIN únicamente al recoger, sin PIN final nuevo.
- Pedido ya aceptado y nueva ruta incompatible: no desplazar ni perjudicar la entrega existente.

Activar gradualmente por configuración y conservar una forma explícita de volver al ranking anterior, sin borrar ofertas, eventos o compromisos aceptados. Las métricas determinan cuándo ampliar; no prometer precisión absoluta ni equiparación a la escala de otra plataforma por pasar pruebas unitarias.

## Fuentes primarias para las decisiones propuestas

- [Uber: matching](https://www.uber.com/gb/en/marketplace/matching/): comparación de asignaciones y espera global; no especifica su implementación completa ni la de Rappi/DiDi.
- [Mapbox Matrix](https://docs.mapbox.com/api/navigation/matrix/): tiempos por calles, matrices asimétricas, rutas sin resultado y facturación por elementos.

Estas fuentes orientan la propuesta. No hay nuevas llamadas pagadas a Matrix ni un modelo entrenado en esta entrega.

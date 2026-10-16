# Reglas de promociones y copia del menú — 16 de octubre de 2026

## Menú de la marca Pollo Robins en Estrella Eats

Por petición de Kaleb se copió el catálogo de Belisario a las sucursales Itaes y San Agustín. Cada destino recibió 3 categorías, 12 productos, 6 combos y 5 promociones. Ambas estaban vacías; la operación rechazaba destinos con un catálogo propio o cambios del origen desde el respaldo revisado.

Los IDs y relaciones de categorías son independientes. Precios, opciones, disponibilidad, vigencias y subsidios se conservaron. Se copiaron 38 objetos de fotos a prefijos propios de las sucursales y se comprobaron sus bytes por SHA256: eliminar una foto del origen no rompe la copia. No se modificaron teléfonos, accesos, estados de las sucursales ni el proyecto independiente de Robin’s.

Se ensayó la transacción con ROLLBACK, se aplicaron 52 filas y se repitió en modo ROLLBACK: cero inserciones nuevas y todas las filas comparadas con el resultado esperado. El origen conservó su huella de catálogo `c66729fd1cdb4a199aaf2faedf3843e1` antes de añadir la nueva columna de reglas. Respaldo, mapa de IDs, recibos de Storage y SQL exacto: carpeta privada `branch-menu-copy-20261016`; no publicar ese archivo operativo como herramienta general.

Esto es una copia solicitada, no sincronización automática: cada sucursal puede editar su catálogo por separado. Crear sucursales sigue sin copiar ni sobrescribir menús automáticamente.

## Contrato de promociones

`public.menu_promociones.tipos_pedido` es `text[] NOT NULL`, con una o ambas modalidades:

| Valor | Significado |
| --- | --- |
| `tienda` | El cliente recoge en sucursal |
| `domicilio` | Entrega en la dirección del cliente |

El valor predeterminado es `['tienda','domicilio']`, también para las promociones existentes. No se impuso una restricción comercial a ninguna oferta concreta. PostgreSQL rechaza listas vacías, repetidas, con nulos o modalidades desconocidas. No existe un nuevo modo de consumo en mesa.

Se conservan `activa`, `dias_aplicacion` y `fecha_fin`. La fecha final incluye todo ese día; días y vigencia se evalúan en `America/Mexico_City`, no en la zona del dispositivo. Un arreglo histórico vacío de días mantiene su contrato previo de todos los días. El editor exige al menos un día para guardar.

## Ruta existente y autoridad

Editor de promociones → actualización por REST con RLS de sucursal → catálogo público → carrito → `auth-otp`/checkout canónico → `checkout_cash_order` → `storefront_checked_cash_checkout` → pedido/avisos existentes.

La migración `20261016000001_promotion_delivery_rules.sql` añade la columna y comprueba las reglas dentro del bucle existente que bloquea y compara las filas del catálogo. Se reemplaza sólo esa función interna sobre su definición activa revisada; la migración aborta si la huella del origen difiere. El wrapper del cupón ESTRELLA, OTP, idempotencia, beneficios, outbox, roles y demás funciones permanecen iguales. No se desplegaron Edge Functions ni worker.

Una modificación concurrente de reglas se vuelve a comprobar bajo el bloqueo de fila antes del INSERT. Un rechazo devuelve `promotion_delivery_restricted` o `promotion_unavailable`, sin crear pedido ni consumir la verificación. Una respuesta perdida de un pedido ya confirmado sigue recuperándose aunque después cambien las reglas.

La web consulta sólo las promociones del carrito, filtradas por restaurante e IDs, máximo 100 y plazo de ocho segundos. Ignora respuestas de selecciones anteriores, permite reintentar un fallo y vuelve a consultar al recuperar el foco y antes de solicitar OTP. No añade suscripciones Realtime ni polling. Un fallo de lectura bloquea la confirmación; no equivale a una promoción válida.

El carrito explica qué oferta no aplica y permite cambiar la entrega o quitar únicamente las promociones incompatibles. Nunca las elimina al cambiar de modalidad sin acción del cliente. La confirmación SQL conserva la autoridad aun con una pestaña antigua o petición manipulada. Las tarjetas públicas indican las ofertas exclusivas por modalidad.

## Publicación y pruebas

Backend aplicado y registrado el 16 de octubre en `jdrrkpvodnqoljycixbg`. Las 16 promociones existentes quedaron en ambas modalidades, cero configuraciones inválidas. Función interna activa SHA256: `b1b1d83667903a3005442bb65426419ba65cf4dd6da020540d82e23ade89a067`. Sigue sin permiso de ejecución para `anon`/`authenticated`.

`supabase/tests/promotion-delivery-rules.sql`: 16 verificaciones transaccionales aprobadas antes y después, incluidos ambos modos, exclusividad, vigencia, día local, aislamiento, código no consumido y replay. Todos los fixtures y posibles solicitudes pg_net se revirtieron; cero restaurantes QA persistidos. Cinco pruebas web tipadas comprueban fronteras de datos, cambios de modalidad y medianoche local. Compilación TypeScript/Vite aprobada; advertencias heredadas de tamaño de bundle, Browserslist y lottie conservadas.

Web publicada en `main` de `Commitplusx/restaurantes-estrella`, commit `98b7ed8950997d920056f6f376c96527e6f89691`; Vercel `J3aGS7cwXyK5jP9WwgGmDgn6yNDU` terminó en success. El dominio real sirvió `MenuPromosView-BW7j2pnk.js` con el editor de modalidades y `CartPage-ZUD3tlL8.js` con la comprobación del carrito. La revisión independiente aprobó su alcance; editor observado a 1440×1000 y 390×844, sin desbordamiento horizontal. No se guardó una oferta real sólo para la revisión ni se envió un pedido. La alerta del carrito se revisó en código, sin captura de ese estado. Quince pruebas web tipadas (cinco nuevas y diez regresiones), build y ESLint de módulos nuevos aprobados.

# Sucursales de restaurantes en Estrella Eats — 15 de octubre de 2026

## Alcance y estado

Esta entrega amplía el modelo existente de `restaurantes`, `matriz_id`, `nombre_sucursal` y los menús por `restaurante_id`. La decisión adoptada es **una marca con varias sucursales y acceso propio por local**: la marca se presenta una vez en el catálogo; cada local conserva su ubicación, teléfono, horarios, menú, precios y pedidos. Cada sucursal entra con su teléfono y una contraseña generada, mientras la cuenta principal administra el grupo. No se crea otro sistema de restaurantes ni otro checkout.

**Backend publicado; GitHub/web y aviso en cierre.** Migraciones `20261015000003`/`20261015000004` aplicadas atómicamente en `jdrrkpvodnqoljycixbg`; `branch-access` v1 ACTIVE. Una identidad temporal real confirmó creación, login, aislamiento de pedido ajeno, rotación explícita e invalidez de la clave anterior. Las filas y cuentas temporales se eliminaron y se comprobó cero remanente. El usuario autorizó publicar en `main` y avisar al dispatcher terminado en 9156; La web ya está en main del repositorio restaurantes-estrella (ad65b50); Vercel y el aviso están en comprobación. Una vista local o una prueba aislada no confirman disponibilidad en producción. El proyecto independiente de Pollo Robin’s queda fuera de esta entrega.

El candidato web se prepara en el checkout aislado `C:/Users/Kaleb/.codex/tmp/eats-branches-release-20261015`, basado en `origin/main` `ac9add3`. Conserva el checkout publicado e integra en `CartPage` únicamente la selección y pertenencia del carrito a la sucursal. La recuperación del checkout y el rediseño posterior del tracker que existen en el árbol de trabajo principal no forman parte de este release.

La arquitectura central sigue en [`arquitectura_sistema_v2.md`](../arquitectura_sistema_v2.md). La web es el repositorio independiente `estrella-eats`, con su propia [guía](../estrella-eats/docs/GUIA_WEB.md). Este documento describe el contrato de la extensión y su estado comprobado; no sustituye esas fuentes.

## Modelo y reglas de negocio

- La principal es la raíz de la marca. Cada sucursal referencia esa raíz mediante `matriz_id`; no se permite crear una jerarquía de sucursales de sucursales.
- Cada local tiene una identidad UUID estable y su propio `restaurante_id`. La navegación, el carrito y los pedidos conservan ese identificador, aunque el cliente vea la misma marca.
- Imágenes, categorías, descripción y horarios iniciales se toman de la principal al crear la sucursal. Los horarios y el perfil de cada local se administran después en su propio contexto, sin sincronización posterior de esos campos. El nombre de la marca se conserva común: sólo la principal puede cambiarlo y ese cambio se propaga a sus sucursales; `nombre_sucursal` identifica cada local.
- La creación exige que la principal tenga `perfil_completo=true`; la sucursal hereda ese valor para evitar un alta invisible al selector público. Una nueva ubicación comienza pausada y requiere al menos un producto disponible, combo disponible o promoción activa propios para poder activarse. Heredar el perfil no crea un menú.
- El menú, sus precios, combos y promociones pertenecen a cada local. Esta entrega no copia ni clona catálogos.
- Pausar conserva la sucursal y su historial; no hay borrado físico desde esta función.
- El esquema real no tenía una restricción UNIQUE de teléfono. La RPC y el trigger de INSERT/UPDATE ahora serializan el número normalizado y rechazan duplicados; el índice de expresión acelera la comprobación. No se alteran filas históricas al agregar el índice. La RPC impide nombres de sucursal repetidos dentro de la marca, comparando texto sin espacios externos y sin distinguir mayúsculas.
- Desde la primera reserva de acceso, el teléfono identifica también la cuenta de la sucursal y queda protegido por un trigger. Cambiarlo requiere una operación de soporte que coordine restaurante y Auth; editar el perfil no puede dejar ambos con números distintos.

## Recorrido del cliente

| Superficie | Comportamiento local |
| --- | --- |
| Catálogo | `oneRestaurantPerBrand` agrupa por `matriz_id || id` después de los filtros existentes. Si la principal no está disponible, una sucursal activa puede representar la marca. |
| Cerca de mí | El mapa conserva los locales como ubicaciones independientes; no agrupa sus coordenadas bajo la principal. |
| Menú | El selector muestra sucursales activas y con perfil completo de la misma marca, dirección y estado abierto/cerrado. Un error de consulta ofrece reintento. |
| Enlaces | `restaurantMenuPath` usa el slug del local o su UUID. Elegir una sucursal no redirige silenciosamente al menú de la principal. |
| Cambio de local | Con productos en el carrito se pide confirmar el nuevo pedido. Cancelar conserva la selección; confirmar limpia el borrador anterior antes de navegar. |
| Carrito | `restaurantId` se persiste en `estrella-cart-storage`. La recuperación antigua consulta `est_carrito_restaurante`; `/menu/global/carrito` resuelve el UUID de ese origen o permite vaciar explícitamente. Un origen desconocido exige confirmación antes de mezclar productos. |

Los precios finales y la creación del pedido siguen siendo responsabilidad del checkout y las RPC existentes. El selector no convierte los productos de una sucursal en productos de otra ni acepta un total del navegador como autoridad.

## Operación del restaurante

`PortalPage` ofrece a la cuenta principal el contexto **Administrando** para dashboard, platillos, combos, promociones, cupones y perfil. Cada vista recibe la sucursal elegida y se remonta por su identificador para no reutilizar estado de otro local. La sección **Sucursales** conserva la raíz como contexto de administración de la marca. Un login de sucursal opera su propio restaurante y no recibe el selector del grupo ni las herramientas para generar accesos de otras ubicaciones.

La cocina de la principal reúne pedidos de la principal y las sucursales vinculadas; cada tarjeta muestra `nombre_sucursal` o, cuando falta, el nombre del restaurante. La sesión propia de un local sólo lee sus pedidos. El selector de administración no limita la alarma de la principal a un solo local. El monitor permanece montado al cambiar de sección para conservar la supervisión existente; la incorporación de sucursales refresca su grupo. Se mantienen los filtros y la corrección de pedidos terminales descritos en [la nota de la alarma](../estrella-eats/docs/KITCHEN_ALARM_STALE_ORDER_FIX_2026-10-15.md).

`SucursalesView` permite crear, editar, pausar y abrir el menú de una ubicación. El UUID se genera al abrir el formulario y se conserva durante los reintentos. El guardado se bloquea mientras hay una solicitud pendiente; la UI sólo anuncia éxito si la RPC devuelve el mismo identificador. Un error `PGRST202` informa que falta habilitar el soporte en el servidor y conserva el formulario, sin simular un guardado.

Para marcar la ubicación se reutiliza `DeliveryLocationPicker` con `purpose="restaurant"`: mantiene Mapbox, el pin y las búsquedas existentes, con textos de sucursal. Se retiró la integración Google Maps de esta sección. Esto no reemplaza la cobertura ni los algoritmos de asignación.

### Accesos por sucursal

Al guardar una sucursal nueva, la interfaz solicita su acceso a `branch-access`. Para las existentes ofrece **Acceso**. El login común `/login` admite el número del local y conserva la normalización de correo canónico `aliado_<telefono>@app-estrella.shop`; ese correo interno no obliga al operador a usar una bandeja de correo.

La contraseña se genera criptográficamente en el servidor y se devuelve sólo después de confirmar la cuenta Auth y su vínculo durable. La tarjeta permite mostrarla y copiar el acceso por acción explícita. El frontend la mantiene en memoria; no la escribe en `localStorage`, `sessionStorage`, la tabla de reservas ni los logs. Cerrarla o salir pierde esa copia: **Acceso** no recupera la contraseña anterior. **Generar nueva contraseña** pide confirmación y ejecuta una rotación explícita.

Si se pierde una respuesta después de crear Auth, un reintento comprueba y enlaza la misma identidad reservada, sin inventar una contraseña ni reemplazarla automáticamente. Devuelve **ya tiene acceso**; si la contraseña se perdió, la principal debe rotarla expresamente. La generación bloqueada informa si hay una operación en curso o si hay que esperar; no entra en reintentos ilimitados ni anuncia éxito por haber guardado sólo el restaurante.

`PerfilView` recibe `ownAccount`: la principal puede administrar el perfil de otra sucursal, pero no ve ahí el formulario que ejecuta `auth.updateUser` para cambiar su propia contraseña por error. El cambio de contraseña personal sólo aparece cuando el contexto administrado coincide con la cuenta de la sesión; la principal restablece accesos de sucursal desde **Acceso**.

## Contrato de servidor candidato

Archivos: [`20261015000003_restaurant_branches.sql`](../supabase/migrations/20261015000003_restaurant_branches.sql) y [`20261015000004_branch_login.sql`](../supabase/migrations/20261015000004_branch_login.sql). La segunda amplía autorización e identidad; debe revisarse y aplicarse después de la primera.

RPC: `restaurant_upsert_branch(p_parent, p_branch, p_name, p_phone, p_address, p_lat, p_lng, p_active)`.

1. Exige sesión autenticada y resuelve la autorización en el servidor mediante el propietario de la principal o `loyalty_is_admin()`; el navegador no proporciona un `admin_id` confiable.
2. Bloquea la principal y la sucursal con `FOR UPDATE`. La principal serializa altas/ediciones de la misma marca, incluida la validación del nombre y el límite de 100 sucursales. La migración establece `lock_timeout` de cinco segundos para su aplicación.
3. Valida nombre, teléfono mexicano de diez dígitos, dirección y coordenadas. Comprueba que la principal sea raíz y que una sucursal existente pertenezca a esa misma marca. El administrador raíz conserva permiso de edición aunque la sucursal ya tenga su propia identidad Auth.
4. Usa el UUID del formulario como identidad estable: un reintento sobre la misma sucursal no crea otro registro. Una colisión con otra marca falla.
5. Crea la ubicación con datos públicos iniciales de la principal o actualiza únicamente los campos operativos aceptados. No altera el propietario, relaciones existentes, credenciales de pago ni saldos/contadores financieros de una ubicación existente.
6. Devuelve sólo `id` y `matriz_id`; las lecturas de perfil siguen sujetas a las políticas existentes.

La migración 003 añade el índice de `matriz_id` y la RPC con `SECURITY DEFINER`, `search_path` vacío y permiso de ejecución limitado a `authenticated`; revoca el acceso de `PUBLIC` y `anon`. El guard de identidad existente se conserva. La migración 004 y la Edge realizan únicamente la creación/vinculación o rotación autorizada de la cuenta de la sucursal; no cambian la cuenta principal, credenciales financieras ni roles globales. Las claves de servidor no se introducen en la web.

### Reserva, Auth y aislamiento

`restaurant_branch_access` guarda una reserva por sucursal: raíz, propietario, teléfono, UUID Auth estable, estado de vínculo, token de operación y tiempos. No guarda la contraseña. Tiene RLS habilitada y no es legible ni modificable directamente por `anon` o `authenticated`.

1. `begin_branch_access` se llama con el JWT real de la principal. Verifica que sea su propietario, bloquea principal → sucursal → reserva y devuelve **exists** o reserva de **90 segundos**. Sólo la principal puede generar el acceso: una cuenta de sucursal no puede emitir credenciales de la raíz o de sus hermanas.
2. La reserva mantiene el UUID Auth entre reintentos y aplica **60 segundos** entre inicios de generación. Otra solicitud concurrente falla mientras el lease siga vigente. No se adopta una cuenta preexistente de otro acceso ni se reemplaza una sucursal que ya tenga otro administrador sin revisión.
3. La Edge usa Auth Admin API en servidor para consultar ese UUID, crear la cuenta confirmada o cambiar su contraseña por una rotación explícita. Verifica correo canónico y `app_metadata.restaurant_branch_id` antes de reutilizar una cuenta. Cada llamada externa tiene un plazo de diez segundos; el HTTP entrante acepta POST autenticado y JSON acotado a 4096 bytes.
4. Sólo `service_role` puede ejecutar `complete_branch_access` o `release_branch_access`. La finalización revalida propietario, sucursal, teléfono, token y vigencia; confirma en `auth.users` el UUID, correo y metadata, y cambia únicamente `admin_id` del local a su propia identidad Auth. Un token anterior, nulo o vencido no finaliza otra operación.
5. El fallo libera únicamente su propio token. Si no puede confirmar esa liberación, informa que hay que esperar 90 segundos. Las respuestas de credenciales llevan `Cache-Control: no-store` y `Pragma: no-cache`; no hay éxito ficticio si falla Auth o el vínculo.
6. `loyalty_manages_restaurant` reconoce al administrador del local, al propietario raíz del grupo y al administrador global según su regla existente. Las políticas de menú y lectura de pedidos conservan acceso de la principal después de separar las identidades.
7. `branch_login_order_isolation` es una política RLS **restrictiva** para SELECT autenticado en `pedidos`: un actor identificado como login de sucursal sólo puede leer pedidos que administra, incluso cuando coexista una política permisiva heredada `USING (true)`. Esta entrega no afirma haber cerrado todas las lecturas públicas de tracking ni sustituye su migración independiente.

Fuentes: [`branch-access/index.ts`](../supabase/functions/branch-access/index.ts), [`branch-access.ts`](../supabase/functions/_shared/branch-access.ts), [`branch-access-gateway.ts`](../supabase/functions/_shared/branch-access-gateway.ts).

Las consultas de familia y administración están acotadas a 101 filas (principal más hasta 100 sucursales), y las entradas externas se validan antes de usarlas. La producción debe revisar el esquema y las políticas reales antes de aplicar la migración revisada.

## Archivos principales

| Frontera | Archivo en `estrella-eats` |
| --- | --- |
| Contratos y validación | `src/lib/restaurantBranches.ts` |
| Agrupación pública | `src/lib/catalogRequest.ts`, `src/pages/PublicLandingPage.tsx` |
| Familia de locales | `src/hooks/useRestaurantFamily.ts` |
| Selector del cliente | `src/components/RestaurantBranchPicker.tsx` y su CSS |
| Menú y carrito | `src/pages/PublicMenuView.tsx`, `src/pages/CartPage.tsx`, `src/store/useCartStore.ts` |
| Gestión y contexto | `src/pages/PortalPage.tsx`, `src/pages/views/SucursalesView.tsx` y su CSS |
| Cocina del grupo | `src/pages/views/PedidosView.tsx` |
| Ubicación Mapbox | `src/components/DeliveryLocationPicker.tsx` |
| Login y credenciales | `src/lib/restaurantLogin.ts`, `src/pages/LoginPage.tsx`, `src/components/BranchAccessNotice.tsx` |
| Perfil de la cuenta propia | `src/pages/views/PerfilView.tsx` (`ownAccount`) |
| Vista de diseño DEV | `src/dev/BranchDesignPreview.tsx`, ruta `/sucursales?vista=diseno` |

La vista DEV utiliza fixtures y no guarda sucursales en el servidor. La ruta sólo se registra con `import.meta.env.DEV`; no es un acceso público nuevo al panel productivo.

## Validación y evidencia local

Se aprobaron **31 comprobaciones de PostgreSQL aislado** con PGlite. Las 13 originales cubren alta por propietario; reintento con UUID estable; herencia de perfil; rechazo de alta desde una principal incompleta; rechazo de activación sin menú; identidad/datos iniciales; rechazo de otro propietario; prohibición de sucursal como raíz; coordenadas/teléfono inválidos; rechazo de reparentado; nombre duplicado; edición/pausa sin borrado; y ausencia de ejecución anónima. Las adicionales comprueban reserva exclusiva, identidad Auth confirmada antes del vínculo, metadata, token nulo/vencido, rotación, teléfono fijo, marca compartida, permisos de la principal y aislamiento real RLS bajo una política permisiva heredada. El harness carga el guard de identidad exacto de `20261012000001_internal_security_boundaries.sql`, sin retirarlo para permitir la prueba.

Reproducción desde la raíz de Loyalty, con la dependencia local `@electric-sql/pglite` ya instalada:

```powershell
$env:NODE_PATH = 'C:\Users\Kaleb\Desktop\loyalty-estrella\.codex-tmp\driver-reliability-20261006\pg-tests\node_modules'
node supabase/tests/restaurant-branches.test.cjs
```

Se aprobaron **11 pruebas Deno de la Edge** en `supabase/tests/branch-access_test.ts`: solicitud externa, entropía de contraseña, creación, acceso existente, recuperación de respuesta perdida sin rotar, rotación explícita, rechazo de otra identidad, fallos sin éxito ficticio y frontera HTTP/JWT/headers. Son contratos con dobles controlados. Además, la prueba productiva temporal del 15 de octubre confirmó diez escenarios con Auth real y limpieza completa (sin pedidos ni WhatsApps de prueba).

Se aprobaron **35 pruebas web** con comprobación de tipos DOM mediante `tests/deno.web.json`. Dentro de esa batería, `estrella-eats/tests/restaurantBranches_test.ts` cubre agrupación de marca, selección con principal ausente, familia pública válida, rutas de local, validación externa, origen de carritos antiguos e identidad estable de guardado; las de login cubren normalización y respuesta de credenciales. ESLint pasó para el código nuevo y `npm run build` terminó correctamente, incluida la generación PWA. Los resultados no sustituyen la revisión y prueba del candidato aislado antes de publicarlo.

La vista DEV se revisó con listado a 1366px y 320px, selector a 390px y confirmación/cancelación del cambio de sucursal, sin desbordamiento horizontal en esos tamaños. Se verificó el foco: la confirmación prioriza **Conservar mi pedido**, cancelarla devuelve el foco al local seleccionado y cerrar el selector lo devuelve al botón que lo abrió. Capturas y detector: `estrella-eats/.codex-tmp/branches-20261015/` (`desktop.png`, `mobile-list-320.png`, `mobile-picker.png`, `mobile-confirm.png`, `design-detector.json`). Las capturas del listado se actualizaron sin avisos globales superpuestos. Estas capturas prueban presentación e interacción con fixtures, no autorización real ni un pedido productivo.

El detector emitió avisos sobre tamaños, colores y radios frente al `DESIGN.md` de la landing. La extensión conserva el lenguaje ya existente del portal; no se redefinieron `DESIGN.md`, sus tokens ni el sistema global para resolver avisos fuera de ese alcance. Esos avisos y los cambios previos ajenos siguen presentes como evidencia, sin reparaciones oportunistas.

La tarjeta de acceso se revisó también en **1366px y 320px**; capturas sin credenciales reales en `estrella-eats/.codex-tmp/branch-login-20261015/desktop.png` y `mobile.png`. Esta QA revisa ajuste y presentación con fixtures; no certifica el primer login de una cuenta productiva.

## Secuencia de publicación y comprobaciones

- Comparar esquema, guards y políticas reales; respaldar, aplicar en orden las migraciones 003/004 y conservar evidencia de cada operación. Verificar especialmente aislamiento RLS con políticas heredadas.
- Desplegar `branch-access` junto con sus fuentes compartidas revisadas, usando las variables de servidor existentes sin exponerlas; registrar versión activa y comprobar errores de autorización y salud.
- Revisar, compilar y publicar en `main` únicamente el candidato de `C:/Users/Kaleb/.codex/tmp/eats-branches-release-20261015`, sin arrastrar la recuperación de checkout ni el tracker locales ajenos al alcance; comprobar Vercel Ready y el dominio real.
- Verificar el alta/acceso de un local autorizado, lectura y escritura de su menú/pedidos, administración raíz y rechazo de otra sucursal. Registrar por separado la evidencia de Auth, SQL, Edge y web; no declarar una identidad real probada hasta hacerlo.
- Verificar menú, horarios y contacto de cada local antes de activarlo; la entrega local no configura sucursales reales ni promete continuidad por haber aprobado pruebas aisladas.
- Al terminar y comprobar la publicación, enviar el aviso autorizado exclusivamente al dispatcher terminado en 9156 por la ruta existente y registrar el resultado real. El aviso sigue pendiente al editar esta nota.

### Evidencia productiva de backend

El recibo privado sin contraseñas está en C:/Users/Kaleb/.codex/tmp/eats-branch-backend-20261015/provider-smoke.json. Creación y login de una sucursal temporal por su número; perfil correcto; rechazo de administración por sucursal; reconsulta sin rotar; cooldown HTTP429; RLS ante pedido ajeno; rotación real con rechazo de clave antigua. Cero filas/cuentas temporales restantes. Respaldo de funciones/políticas, dry run con ROLLBACK y aplicación atómica registrados en ese directorio. No se hicieron pedidos ni mensajes a clientes.

El release web aislado pasó 24 pruebas de sucursales/login/cocina, ESLint de módulos nuevos y build. La vista DEV y sus fixtures son evidencia local; no se publican como ruta del producto.

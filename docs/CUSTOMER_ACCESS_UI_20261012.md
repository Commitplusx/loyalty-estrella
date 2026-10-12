# Acceso privado a la tarjeta de cliente — 12-10-2026

## Alcance y estado

Extensión de la interfaz existente de Estrella: la tarjeta de entrada conserva su composición, colores y tipografía; el acceso por PIN y caché de perfil se sustituye por un código de WhatsApp de seis dígitos presentado dentro de la página. El perfil, saldo, puntos e historial se cargan después de verificar una sesión de cliente con Supabase Auth.

El contexto de diseño fue `SCOPED_EXISTING_ALLOWED`. En la raíz de este proyecto no hay `PRODUCT.md` ni `DESIGN.md`. Esta entrega no define una identidad nueva ni cambia el sistema visual: conserva `src/loyalty.css` y no crea archivos de diseño normativos. La documentación compara el resultado con el sistema local incumbente; no hay un snapshot inicial del CSS para afirmar igualdad histórica byte a byte.

Estado comunicado por la coordinación al cerrar esta documentación:

| Superficie | Estado comprobado o comunicado | Límite |
| --- | --- | --- |
| Frontend de acceso y canjes | Implementado y validado localmente | Sin publicación del frontend en este cierre |
| Migración `20261012000004_customer_login_identity.sql` | Aplicada y registrada; evidencia de publicación comunicada por la coordinación | Su publicación no prueba la experiencia completa del navegador |
| Edge Function `auth-otp` | Versión 84 `ACTIVE`; hash de entrada candidata y descargada coincidentes; GET devuelve 405 | No se verificó recepción de un OTP real en WhatsApp |
| Migración `20261012000005_authenticated_redemptions.sql` y fase de canjes | Local | Publicación y validación real pendientes |

La evidencia de publicación de `auth-otp` es independiente de la revisión visual. El hash de entrada comunicado es `E72590E2693553C63ECE5D8A4610FE146C2721641A342C29D75709A63C80F8E1`. No constituye un hash de todo el paquete ni una certificación integral del backend.

## Continuidad con la interfaz incumbente

La fuente local de estilo es `src/loyalty.css`: Inter con alternativas Segoe UI/Arial, texto `#171717`, texto secundario `#515151`, papel `#f4f4f2`, superficie blanca, líneas `#d8d8d5`, acento carmesí `#bd1822` y hover `#9f111a`. El código OTP reutiliza la tarjeta blanca de radio 20 px, los campos de radio 10 px, los botones y los tratamientos de foco existentes. No introduce una segunda paleta ni una fuente adicional.

La entrada mantiene relato y formulario en dos columnas en escritorio. A 900 px o menos se apila; a 640 px o menos ajusta espaciado y relleno. La tarjeta OTP se centra con un ancho máximo de 480 px y un único campo numérico. El encabezado Estrella y el pie de contacto siguen presentes. La revisión pidió retirar el nuevo kicker del OTP; el resultado final comienza con el icono y «Revisa tu WhatsApp».

Deriva previa observada, fuera de esta extensión y sin reparación en este cierre:

- El documentador encontró copia anterior de PIN en `src/pages/Home.tsx`. Después de esa revisión, la coordinación ajustó únicamente esa ayuda y el paso de acceso a código de WhatsApp; no rediseñó la portada en esta fase.
- Las ramas existentes de carga y errores, el modal de canje y la billetera expandida conservan clases y tratamientos azules, naranjas, ámbar o verdes heredados. Las capturas finales de este cierre cubren la entrada y el OTP, no una revisión visual completa de esas ramas.
- El detector de patrones se ejecutó una vez y emitió únicamente la advertencia de Inter. Se conservó por pertenecer al sistema incumbente; no se adoptó como motivo para rediseñar.

## Ruta y responsabilidades

| Archivo | Responsabilidad del contrato |
| --- | --- |
| `src/pages/client/ClienteView.tsx` | Lee el teléfono del enlace o consulta, presenta entrada/OTP/resultado/errores y enlaza acciones de recuperación |
| `src/components/client/CustomerOtpCard.tsx` | Presenta código, vencimiento, error, reenvío y cambio de número |
| `src/hooks/useLoyaltyAccess.ts` | Restaura sesión, coordina estados y solicitudes, conserva la intención pendiente y descarta respuestas tardías |
| `src/lib/customer-loyalty.ts` | Valida respuestas externas, intercambia la credencial con Auth y llama a las RPC de perfil/historial y a la función de canje |
| `src/components/client/CanjeModal.tsx` | Solicita el beneficio mediante el cliente autenticado y presenta el resultado validado |
| `src/components/client/WalletSection.tsx` | Valida el importe local, solicita el canje y actualiza la tarjeta con los valores devueltos por el servidor |

Las rutas `/cliente`, `/clientes` y `/loyalty/:tel` usan `ClienteView`. Un teléfono recibido por ruta o `?tel=` solo prellena el formulario con sus diez últimos dígitos; no envía automáticamente el código y no acredita identidad.

El acceso sigue esta secuencia: `request-customer-login` en `auth-otp` → desafío validado → `verify-customer-login` → credencial validada → `auth.verifyOtp` → RPC `get_my_loyalty_customer` → RPC `get_my_loyalty_history`. La tarjeta no se abre con una respuesta de verificación incompleta, un rol diferente de `loyalty_customer` o un perfil cuyo teléfono no coincida con el número verificado.

Las respuestas entran como `unknown` y se validan mediante Zod. El perfil proyectado contiene solo los campos utilizados por la tarjeta; campos como PIN o notas CRM no se conservan aunque aparezcan en una respuesta. El historial admite como máximo 100 movimientos. El transporte del cliente tiene un plazo de 15 segundos.

## Estados, copia y recuperación

| Estado | Presentación y acciones | Condición |
| --- | --- | --- |
| `loading` | «Verificando tu acceso…» y presentación de carga | Restauración de la sesión antes de elegir entrada o tarjeta |
| `search` | «Consulta tus puntos», «Número celular», prefijo +52, ayuda «Te enviaremos un código por WhatsApp para proteger tu tarjeta.» y «Recibir código por WhatsApp» | Sin sesión de cliente restaurable |
| Envío en curso | «Enviando tu código…»; entrada y envío deshabilitados | Una solicitud activa |
| `otp` | «Revisa tu WhatsApp», «Código de 6 dígitos», «Ver mi tarjeta», cuenta de vencimiento y «No lo compartas.» | El servidor confirmó un desafío válido |
| Verificación en curso | «Verificando tu acceso…»; campo y acciones deshabilitados | Una verificación activa |
| Código incorrecto | Error en línea y código escrito conservado | Rechazo del servidor; permite corregir y volver a enviar manualmente |
| Código vencido | «El código venció. Solicita uno nuevo para continuar.»; verificación deshabilitada | Cuenta local de vencimiento en cero; el servidor conserva la autoridad |
| Reenvío | «Puedes reenviar en …s», después «Enviar un código nuevo» | Espera local basada en el vencimiento; genera otra clave de intención |
| Cambiar número / Salir | Limpia tarjeta, código e intención pendiente y regresa al formulario | Cierre local de la sesión de cliente exitoso |
| `error-not-found` | «Número no registrado», registro por WhatsApp y búsqueda de otro número | Código de error `customer_not_registered` |
| `error-generic` | «Error de conexión» e «Intentar de nuevo» | Fallo al restaurar/verificar la sesión existente |
| `result` | Perfil, puntos, billetera y movimientos; actualización y cierre de sesión | Perfil del cliente validado por el servidor |
| Fallo de actualización | Error visible y «Actualizar tarjeta» | Conserva los datos cargados sin afirmar que están actualizados |
| Fallo de historial | Error visible y «Reintentar movimientos» | No sustituye el fallo por una lista vacía de éxito |
| Sesión invalidada | Retira tarjeta e historial y solicita acceso nuevamente | Error de propiedad `42501` o evento `SIGNED_OUT` |

Envío y verificación comparten un bloqueo de solicitud activa. La clave de envío se conserva ante una respuesta perdida; un reintento manual usa la misma intención. El reenvío explícito crea otra. Una generación de estado impide que una respuesta tardía restaure el perfil después de salir. Los cambios realtime, el regreso a la pestaña y la recuperación de conexión provocan una actualización con concurrencia controlada.

El desafío confirmado tiene vigencia máxima de cinco minutos. La interfaz limita el reenvío durante la espera mostrada; los límites reales pertenecen al servidor. La fuente backend consultada configura ventanas de diez minutos, tres envíos por teléfono y límites por IP/verificación; PostgreSQL limita los intentos incorrectos del desafío a cinco. Esta lectura de contratos no es una prueba de capacidad productiva.

## Canjes y certeza de la respuesta

Canje de beneficio y billetera utilizan `customerSupabase`, con la sesión del cliente y `idempotency_key`. La clave permanece asociada al mismo teléfono, tipo e importes mientras la respuesta sea incierta; no se marca éxito por pérdida de conexión. El resultado se acepta solo con código de cupón, valores financieros, vencimiento, estado de notificación y señal de repetición válidos.

La UI del beneficio usa cinco puntos o un envío disponible, conforme al contrato de canje revisado; las metas visuales de progreso por rango tienen otra finalidad. Billetera valida saldo, importe positivo con dos decimales, máximo de $300 por transacción y ausencia de cupón activo. La base de datos conserva la autoridad sobre propiedad, disponibilidad, bloqueo e idempotencia. El saldo visible se actualiza con los valores devueltos, no con una resta optimista inventada.

La copia de éxito dice «Tu cupón quedó guardado. Puedes consultarlo aquí aunque no llegue el aviso de WhatsApp.» El estado del cupón y el de la notificación son distintos. Ninguna captura ni prueba sintética acredita entrega del aviso al teléfono. La fase productiva de estos contratos de canje sigue pendiente.

## Accesibilidad, respuesta y privacidad

- Teléfono y código tienen etiquetas asociadas, límites de longitud, patrón numérico e `inputMode="numeric"`. El código conserva un solo campo con `autoComplete="one-time-code"` y foco al entrar al desafío.
- La sección OTP se identifica por su encabezado; el formulario expone `aria-busy`, el campo expone `aria-invalid` y los errores usan `role="alert"`. Los iconos decorativos se ocultan de la lectura asistida.
- El estilo incumbente tiene foco visible de 3 px, foco del contenedor de teléfono, acciones auxiliares de al menos 44 px y botón principal de al menos 58 px. Cuenta con reglas de contraste aumentado y movimiento reducido. Estas reglas no equivalen a una auditoría completa WCAG ni validan todas las animaciones de Framer Motion o los diálogos heredados.
- Las capturas a 320, 390 y 1440 px muestran tarjetas dentro del ancho disponible, texto que se ajusta y acciones visibles. En 320 px la entrada requiere desplazamiento vertical normal. Las pruebas comprueban que documento y cuerpo no desbordan horizontalmente en la captura OTP.
- `estrella_cliente` y `pin_verified` se eliminan al iniciar y nunca se usan como prueba de acceso. El código queda en memoria de la interfaz; la intención pendiente guarda teléfono, clave y metadatos del desafío en `sessionStorage`, sin conceder acceso por sí misma.
- La sesión Auth del cliente usa `estrella-loyalty-customer-auth`, separada de la sesión administrativa, y desactiva detección de sesión en la URL. Salir afecta a la sesión local del cliente.
- Compartir tarjeta conserva el enlace de teléfono existente. El destinatario debe verificar su propio acceso; el enlace no contiene una sesión ni permite leer la tarjeta por sí solo. El teléfono en un enlace sigue siendo un dato personal y no se reproduce en esta evidencia.
- Las capturas emplean un cliente y número sintéticos. No contienen datos de clientes reales, secretos, OTP reales ni credenciales productivas.

## Evidencia de revisión y pruebas

El handoff reporta tres pruebas Playwright, 16 pruebas Vitest y compilación Vite aprobadas. Esta pasada de documentación leyó las pruebas y sus contratos; no repitió ejecuciones ni desplegó código. Las pruebas Playwright interceptan HTTP/WebSocket y fuerzan un código incorrecto. Verifican que el caché/PIN anterior no abra la tarjeta, foco del campo, error visible, conservación del código, recuperación del botón, cambio de número y anchos 320/390/1440.

Las 16 pruebas de gateway y hook usan el SDK Supabase con transporte sintético o dobles tipados. Cubren ausencia de sesión, claves de intención, errores concretos, respuestas inválidas, intercambio Auth antes del perfil, rechazo de otro rol, proyección de datos, fallo de historial, invalidación de propiedad y respuesta tardía tras salir. No prueban una entrega real de WhatsApp ni una sesión productiva de principio a fin.

El chequeo TypeScript del proyecto completo falló en archivos heredados ajenos a esta extensión; el handoff no reportó errores en los nuevos archivos de acceso. Por tanto, «build Vite aprobado» no debe comunicarse como «TypeScript de todo el proyecto aprobado».

La revisión visual completa emitió `fix` por un único kicker nuevo en el OTP. Se retiró y el mismo revisor emitió `pass`/`ship` en la revisión de esa corrección, con el único fix resuelto. El alcance del veredicto posterior es esa corrección; no constituye una certificación integral de backend, canjes, todas las ramas visuales o accesibilidad.

Se inspeccionaron visualmente las seis capturas finales generadas a las 22:44 UTC del 12-10-2026:

| Captura | Estado | SHA-256 |
| --- | --- | --- |
| `.impeccable/review/customer-entry-320.png` | Entrada, 320 px | `28DFC96A5D18BFD844EC857A4B9B2857F7CCD550B8113EB26B2F3F97A2203459` |
| `.impeccable/review/customer-entry-390.png` | Entrada, 390 px | `3F27B12084723A92B6231F0BC72C59A9AC9D2C102D9368F8F560027CDB78B1FF` |
| `.impeccable/review/customer-entry-1440.png` | Entrada, 1440 px | `97F7488382E2A79941AAF28BD8E45165422618CA4FC52D7F3E99FA078C629025` |
| `.impeccable/review/customer-otp-320.png` | OTP con error, 320 px | `91C4CA5040DD23AD20B288E6451091CDF38C969ADD18CA8B2D18D70F5B44D166` |
| `.impeccable/review/customer-otp-390.png` | OTP con error, 390 px | `7CA2D1FDEF901DE605C6784E726A8AD8F875420303761F4EF8AE36C509C70363` |
| `.impeccable/review/customer-otp-1440.png` | OTP con error, 1440 px | `ECB80B17B18E76B8B48007FBCA732DB76F5AFCF706BB354A9BEAD886A1851CEF` |

## Huella de fuentes y límite de escritura

Se leyeron los seis archivos del alcance, `src/loyalty.css`, las rutas de `src/App.tsx`, la copia de `src/pages/Home.tsx`, ambas pruebas Vitest, la prueba Playwright, las migraciones 004/005 y los módulos de login. El siguiente registro identifica las fuentes locales de UI consultadas; no prueba su publicación ni su estado antes de esta tarea.

| Fuente | SHA-256 |
| --- | --- |
| `src/loyalty.css` | `13EB2C90C6A76EA3DB43AF84B1E82DAD84458CF4D3FEA18526C3A17266BE1EC4` |
| `src/pages/client/ClienteView.tsx` | `869A314DC4F2DAA2A0FFE529E59384EFB78E26885F692B77222484F4D4080FD2` |
| `src/components/client/CustomerOtpCard.tsx` | `488AD308913FFEC167DA8517E54B70BF2289B473472037DC83AE8B98C419CBEA` |
| `src/components/client/CanjeModal.tsx` | `380E0C5B42653B8A20FB923B2E78B674AD75CF2F0F33375BA73B69675A1A1685` |
| `src/components/client/WalletSection.tsx` | `2BE3EE1205C6FB38A67AFF46CDFCABD5531BA52B4D3671FA1760883BDB807699` |
| `src/hooks/useLoyaltyAccess.ts` | `CF7B2460E40B9A4F77ECB79C9F1EBC369B2FD9206CC46AB57E40D8023FF9C35D` |
| `src/lib/customer-loyalty.ts` | `7F6AD10F457237AD7FBB832D2EFE925AAEE1C2C31DC4C2DCCF4430C2E7960AB7` |

Esta pasada solo escribe `docs/CUSTOMER_ACCESS_UI_20261012.md`. Conserva los demás archivos, registra la deriva previa sin corregirla y no ejecuta ninguna mutación o publicación externa. Quedan pendientes la publicación compatible del frontend/canjes y una comprobación autorizada de OTP real, sesión, propiedad e historial en el sistema activo.

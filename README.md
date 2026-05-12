# Estrella Delivery Pro

Sistema profesional de puntos y lealtad para delivery, con WhatsApp Bot, QR, horarios de atención y hora feliz.

## Características

- **Sistema de Puntos**: Por cada 5 envíos, el 6to es gratis
- **WhatsApp Bot**: Bot inteligente con IA (DeepSeek) para clientes, repartidores y admins
- **Códigos QR**: Cada cliente tiene un QR único para escanear y canjear
- **Panel de Administrador**: Registro de clientes, suma de puntos y cancelación de cupones
- **Hora Feliz**: Lunes, Miércoles y Sábado de 5-8pm, envíos a $35
- **Horario de Atención**: Lunes a Domingo, 9am a 10pm
- **Tiempo Real**: Actualización en tiempo real con Supabase Realtime
- **100% Responsive**: Funciona perfecto en móvil, tablet y desktop
- **PWA Ready**: Instalable como app en iOS y Android

## Tecnologías

- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui + Framer Motion
- Supabase (Database + Realtime + Edge Functions)
- WhatsApp Cloud API + DeepSeek AI
- QR Code generation & scanning
- Deploy en Vercel

## Configuración

### 1. Crear proyecto en Supabase

1. Ve a [https://supabase.com](https://supabase.com) y crea una cuenta
2. Crea un nuevo proyecto
3. Ve a SQL Editor > New query
4. Copia y pega el contenido de `supabase/schema.sql`
5. Ejecuta el script

### 2. Configurar Auth en Supabase

1. Ve a Authentication > Settings
2. En "Site URL" pon la URL de tu app en Vercel (o `http://localhost:5173` para desarrollo)
3. Habilita "Email" provider
4. Crea un usuario admin en Authentication > Users > Add user
5. Inserta el admin en la tabla `admins`:

```sql
INSERT INTO admins (id, email, nombre, role) 
VALUES ('uuid-del-usuario', 'tu-email@ejemplo.com', 'Tu Nombre', 'superadmin');
```

### 3. Obtener credenciales

1. Ve a Project Settings > API
2. Copia "Project URL" y "anon public"
3. Pega en tu archivo `.env`:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

### 4. Configurar WhatsApp Bot (Edge Function)

Configura los siguientes secrets en Supabase > Edge Functions > Secrets:

```
WHATSAPP_TOKEN=tu-token-de-meta
WHATSAPP_PHONE_ID=tu-phone-id
VERIFY_TOKEN=tu-verify-token
DEEPSEEK_API_KEY=tu-api-key
ADMIN_PHONES=9631234567,9631234568
```

### 5. Desplegar en Vercel

1. Sube el código a GitHub
2. Ve a [https://vercel.com](https://vercel.com)
3. Importa tu repositorio
4. En "Environment Variables" agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy!

## Estructura del Proyecto

```
src/
├── components/
│   ├── SplashScreen.tsx       # Splash animado de bienvenida (Framer Motion)
│   ├── client/
│   │   ├── OnboardingWelcome.tsx  # Onboarding primera visita (3 pasos)
│   │   ├── ProgressCard.tsx   # Tarjeta de progreso de puntos
│   │   ├── CanjeModal.tsx     # Modal de canje de cupón
│   │   ├── WalletSection.tsx  # Billetera digital
│   │   └── HistorialTimeline.tsx # Historial de movimientos
│   └── ui/                    # Componentes base (shadcn/ui)
├── hooks/
│   ├── useSchedule.ts         # Lógica de horarios y hora feliz
│   └── useDarkMode.ts         # Dark mode persistente
├── lib/
│   └── supabase.ts            # Cliente y funciones de Supabase
├── pages/
│   ├── Home.tsx               # Página principal
│   └── client/
│       ├── ClienteView.tsx    # Vista del cliente con PIN
│       └── RestaurantesPage.tsx
├── types/
│   └── index.ts               # Tipos TypeScript
└── App.tsx                    # Router principal + SplashScreen
supabase/
└── functions/
    └── whatsapp-bot/
        ├── index.ts           # Entry point del bot (webhook + routing)
        ├── admin-handler.ts   # Lógica de comandos de admin
        ├── rep-handler.ts     # Lógica de comandos de repartidor
        ├── db.ts              # Helpers de base de datos
        └── chatwoot-sync.ts   # Sincronización con Chatwoot CRM
```

## Flujo de Uso

### Para el Cliente:
1. Entra a la web → ve el splash animado
2. Si es primera visita: onboarding de 3 pasos (Pide → Suma → Gana)
3. Ingresa su número de teléfono y PIN
4. Ve su progreso, historial y puede descargar/compartir su QR

### Para el Admin (WhatsApp):
El bot reconoce al admin por `ADMIN_PHONES` (variable de entorno en Supabase Secrets).
- `/ver` — Ver pedidos activos
- `/cancelar CODIGO` — Cancelar un cupón
- `/agregar_cliente` — Registrar nuevo cliente
- `/stats` — Estadísticas generales

### Para el Repartidor (WhatsApp):
El repartidor interactúa con el bot enviando mensajes de texto natural procesados por IA.

## Seguridad

- Autenticación de admin por `ADMIN_PHONES` (env var en Supabase Secrets)
- Verificación de webhook con `VERIFY_TOKEN`
- Idempotencia en el bot: cada mensaje se procesa exactamente una vez
- Rate limiting: máximo 12 mensajes por minuto por número
- RLS (Row Level Security) habilitado en todas las tablas de Supabase
- PINs de cliente para acceso al perfil web

## Precios

- **Precio normal**: $50 por envío
- **Hora feliz** (Lunes, Miércoles y Sábado 5-8pm): $35 por envío

## Horarios

- **Lunes a Domingo**: 9:00 AM - 10:00 PM
- **Hora feliz**: Lunes, Miércoles y Sábado, 5:00 PM - 8:00 PM

## Scripts

```bash
# Instalar dependencias
npm install

# Desarrollo local
npm run dev

# Build para producción
npm run build

# Desplegar Edge Functions
supabase functions deploy whatsapp-bot
```

## Variables de Entorno

### Frontend (Vercel)

| Variable | Descripción |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL de tu proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave anónima de Supabase |

### Bot (Supabase Secrets)

| Variable | Descripción |
|----------|-------------|
| `WHATSAPP_TOKEN` | Token de acceso de Meta |
| `WHATSAPP_PHONE_ID` | ID del número de WhatsApp |
| `VERIFY_TOKEN` | Token de verificación del webhook |
| `DEEPSEEK_API_KEY` | API key de DeepSeek AI |
| `ADMIN_PHONES` | Números de admin separados por coma (10 dígitos) |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (permisos completos) |

## Changelog

### 2026-05-12 — UX & Bot Fixes
- **Splash Screen**: Nuevo splash animado en React (Framer Motion) — logo circular con anillos orbitales, sonar rings, chispas burst, ticker "Pide → Suma → Gana" de 4 segundos
- **Onboarding**: Pantalla de bienvenida en 3 pasos para primera visita (Gift, QrCode, Star icons)
- **Bot Fix**: Unificada la tabla de admins en `/cancelar` — corregida referencia errónea a `admin_users` → `admins`
- **Bot Audit**: Auditoria completa de bugs; validado `pedidos_estado_check` constraint

### 2026-05-09 — Zonas de entrega
- Sistema de zonas de entrega con 310 colonias de Comitán categorizadas manualmente
- Precios diferenciados por zona

### 2026-05-06 — WhatsApp Bot v2
- Integración con DeepSeek AI para procesamiento de lenguaje natural
- Soporte para repartidores, restaurantes y clientes
- Rate limiting e idempotencia

---
*Último despliegue: 2026-05-12*

# Estrella Delivery Pro

Sistema profesional de puntos para delivery con QR, horarios de atención y hora feliz.

## Características

- **Sistema de Puntos**: Por cada 5 envíos, el 6to es gratis
- **Códigos QR**: Cada cliente tiene un QR único para escanear
- **Panel de Administrador**: Solo tú puedes registrar clientes y sumar puntos
- **Hora Feliz**: Lunes, Miércoles y Sábado de 5-8pm, envíos a $35
- **Horario de Atención**: Lunes a Domingo, 9am a 10pm
- **Tiempo Real**: Actualización en tiempo real con Supabase
- **100% Responsive**: Funciona perfecto en móvil, tablet y desktop

## Tecnologías

- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Supabase (Auth + Database + Realtime)
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

### 4. Desplegar en Vercel

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
│   ├── qr/
│   │   ├── QRGenerator.tsx    # Genera QR del cliente
│   │   └── QRScanner.tsx      # Escáner de QR para admin
│   └── schedule/
│       └── ScheduleDisplay.tsx # Muestra horarios y hora feliz
├── contexts/
│   └── AuthContext.tsx        # Autenticación global
├── hooks/
│   ├── usePuntos.ts           # Lógica de puntos
│   └── useSchedule.ts         # Lógica de horarios
├── lib/
│   └── supabase.ts            # Cliente y funciones de Supabase
├── pages/
│   ├── Home.tsx               # Página principal
│   ├── Login.tsx              # Login de admin
│   ├── admin/
│   │   └── AdminDashboard.tsx # Panel de admin
│   └── client/
│       └── ClienteView.tsx    # Vista del cliente
├── types/
│   └── index.ts               # Tipos TypeScript
└── App.tsx                    # Router principal
```

## Flujo de Uso

### Para el Cliente:
1. Entra a la web
2. Clic en "Ver Mis Puntos"
3. Ingresa su número de teléfono
4. Ve su progreso y puede descargar/compartir su QR

### Para el Admin (Tú):
1. Entra a `/login`
2. Inicia sesión con tu email y contraseña
3. En el panel tienes 4 pestañas:
   - **Escanear**: Escanea el QR del cliente para sumar puntos
   - **Registrar**: Registra nuevos clientes y genera su QR
   - **Clientes**: Lista completa de clientes con búsqueda
   - **Horario**: Ver estado actual y horarios

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

# Preview del build
npm run preview
```

## Variables de Entorno

| Variable | Descripción |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL de tu proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave anónima de Supabase |

## Seguridad

- Solo usuarios autenticados como `admin` pueden registrar clientes
- Solo usuarios autenticados pueden sumar puntos
- Los clientes solo pueden consultar sus propios puntos
- RLS (Row Level Security) habilitado en todas las tablas

## Licencia

---
*Último despliegue: 2026-04-07*

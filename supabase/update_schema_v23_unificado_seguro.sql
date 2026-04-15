-- ============================================================
-- ESTRELLA DELIVERY - ESQUEMA UNIFICADO SEGURO (V23)
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ⚠️  Este script SOLO AGREGA columnas/tablas, NO borra datos.
-- ============================================================

-- ============================================================
-- 1. TABLA: restaurantes
-- Usada por: Bot (restaurant-portal.ts), Admin App, notificar-whatsapp
-- ============================================================
CREATE TABLE IF NOT EXISTS restaurantes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   UUID REFERENCES auth.users(id),
  nombre     TEXT NOT NULL,
  telefono   TEXT,
  activo     BOOLEAN DEFAULT true,
  direccion  TEXT,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Agregar columnas si no existen (seguro para tablas existentes)
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS telefono   TEXT;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS activo     BOOLEAN DEFAULT true;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS direccion  TEXT;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS lat        DOUBLE PRECISION;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS lng        DOUBLE PRECISION;

-- Hacer telefono UNIQUE solo si no hay duplicados
-- (Si da error, hay teléfonos duplicados; en ese caso, limpiar manualmente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'restaurantes_telefono_key' AND table_name = 'restaurantes'
  ) THEN
    BEGIN
      ALTER TABLE restaurantes ADD CONSTRAINT restaurantes_telefono_key UNIQUE (telefono);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'No se pudo agregar UNIQUE en telefono - puede haber duplicados. Se continuará sin restricción.';
    END;
  END IF;
END $$;

-- ⚠️  IMPORTANTE: Actualizar restaurantes existentes que tienen columnas con NULL
-- Esto restaura los restaurantes que se volvieron invisibles para el Bot
UPDATE restaurantes SET activo = true   WHERE activo IS NULL;
UPDATE restaurantes SET direccion = ''  WHERE direccion IS NULL;
-- Nota: lat/lng y telefono pueden quedar NULL - el Admin deberá llenarlos manualmente

-- ============================================================
-- 2. TABLA: colonias (Catálogo maestro de barrios/zonas)
-- Usada por: Admin App, Bot (restaurant-portal.ts)
-- ============================================================
CREATE TABLE IF NOT EXISTS colonias (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     VARCHAR(255) NOT NULL UNIQUE,
  ciudad     VARCHAR(255) DEFAULT 'Comitán',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Poblar colonias base si no existen
INSERT INTO colonias (nombre) VALUES 
  ('Centro'),
  ('Mariano Ruiz'),
  ('La Cueva'),
  ('Chichima'),
  ('Los Desamparados'),
  ('Yajalon'),
  ('Cerrito de la Concepcion'),
  ('Guadalupe'),
  ('San Sebastian'),
  ('Insurgentes'),
  ('Las Fincas'),
  ('La Manga')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- 3. TABLA: restaurante_colonias
-- Usada por: Bot, Admin App (Zona Feliz config)
-- ============================================================
CREATE TABLE IF NOT EXISTS restaurante_colonias (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_telefono TEXT NOT NULL,
  colonia_id           UUID NOT NULL REFERENCES colonias(id) ON DELETE CASCADE,
  aplica_hora_feliz    BOOLEAN DEFAULT false,
  precio_estandar      DECIMAL(10,2),
  UNIQUE(restaurante_telefono, colonia_id)
);

-- ============================================================
-- 4. TABLA: app_config (Horarios, Horas Felices, Contacto)
-- Usada por: Web App, Bot
-- ============================================================
CREATE TABLE IF NOT EXISTS app_config (
  id           VARCHAR(50) PRIMARY KEY DEFAULT 'default',
  horarios     JSONB NOT NULL DEFAULT '{}',
  horas_felices JSONB NOT NULL DEFAULT '[]',
  contacto     JSONB NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. TABLA: anuncios_flash
-- Usada por: Web App (FlashBanner)
-- ============================================================
CREATE TABLE IF NOT EXISTS anuncios_flash (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensaje    TEXT NOT NULL,
  activo     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. TABLA: calificaciones_servicio
-- Usada por: Web App
-- ============================================================
CREATE TABLE IF NOT EXISTS calificaciones_servicio (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID REFERENCES clientes(id),
  pedido_id   UUID REFERENCES pedidos(id),
  calificacion INT CHECK (calificacion BETWEEN 1 AND 5),
  comentario  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- RLS: Políticas de seguridad por tabla
-- ============================================================
ALTER TABLE restaurantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE colonias ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurante_colonias ENABLE ROW LEVEL SECURITY;
ALTER TABLE anuncios_flash ENABLE ROW LEVEL SECURITY;

-- Admins: acceso total a restaurantes y zonas
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'restaurantes' AND policyname = 'Admins_Full_Access_Restaurantes') THEN
    CREATE POLICY "Admins_Full_Access_Restaurantes" ON restaurantes FOR ALL
      USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'colonias' AND policyname = 'Admins_Full_Access_Colonias') THEN
    CREATE POLICY "Admins_Full_Access_Colonias" ON colonias FOR ALL
      USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'restaurante_colonias' AND policyname = 'Admins_Full_Access_Restaurante_Colonias') THEN
    CREATE POLICY "Admins_Full_Access_Restaurante_Colonias" ON restaurante_colonias FOR ALL
      USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'anuncios_flash' AND policyname = 'Admins_Full_Access_Anuncios') THEN
    CREATE POLICY "Admins_Full_Access_Anuncios" ON anuncios_flash FOR ALL
      USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));
  END IF;
END $$;

-- Edge functions (service_role) pueden leer restaurantes sin autenticación JWT
-- Esto es necesario para que el bot pueda leer restaurantes cuando llega un mensaje
CREATE POLICY IF NOT EXISTS "Service_Role_Restaurantes" ON restaurantes FOR SELECT
  USING (true);

-- ============================================================
-- VERIFICACIÓN FINAL
-- ============================================================
SELECT 
  table_name, 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_name IN ('restaurantes', 'colonias', 'restaurante_colonias', 'pedidos', 'clientes', 'repartidores', 'bot_memory')
  AND table_schema = 'public'
ORDER BY table_name, ordinal_position;

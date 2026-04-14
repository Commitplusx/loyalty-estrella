-- ============================================================
-- TABLA: pedidos
-- Sistema de seguimiento de pedidos con WhatsApp
-- ============================================================

CREATE TABLE IF NOT EXISTS pedidos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_tel    TEXT NOT NULL,
  cliente_nombre TEXT,
  restaurante    TEXT,
  repartidor_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  descripcion    TEXT NOT NULL,
  direccion      TEXT,
  lat            DOUBLE PRECISION,          -- GPS latitud (de WhatsApp location)
  lng            DOUBLE PRECISION,          -- GPS longitud (de WhatsApp location)
  wb_message_id  TEXT UNIQUE,               -- ID del mensaje WA (evita duplicados)
  estado         TEXT NOT NULL DEFAULT 'asignado'
                   CHECK (estado IN ('asignado', 'recibido', 'en_camino', 'entregado')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migración para tablas existentes (sin error si ya existen)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_nombre TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS restaurante TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS wb_message_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_wb_message_id_idx ON pedidos(wb_message_id) WHERE wb_message_id IS NOT NULL;
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_repartidor_id_fkey;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_repartidor_id_fkey
  FOREIGN KEY (repartidor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Memoria del bot de WhatsApp para contexto conversacional
CREATE TABLE IF NOT EXISTS bot_memory (
  phone TEXT PRIMARY KEY,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sistema de Puntos de Lealtad AI
CREATE TABLE IF NOT EXISTS loyalty_points (
  phone TEXT PRIMARY KEY,
  puntos INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS pedidos_repartidor_idx ON pedidos(repartidor_id);
CREATE INDEX IF NOT EXISTS pedidos_estado_idx ON pedidos(estado);
CREATE INDEX IF NOT EXISTS pedidos_created_at_idx ON pedidos(created_at DESC);

-- Trigger: actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_pedidos_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedidos_updated_at ON pedidos;
CREATE TRIGGER trg_pedidos_updated_at
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION update_pedidos_updated_at();

-- Seguridad RLS
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

-- Admin (email termina en @admin.com) puede todo
DROP POLICY IF EXISTS "admin_all_pedidos" ON pedidos;
CREATE POLICY "admin_all_pedidos" ON pedidos
  FOR ALL
  USING (
    auth.jwt() ->> 'email' ILIKE '%@admin.com'
  );

-- Repartidor sólo puede ver y actualizar sus propios pedidos
DROP POLICY IF EXISTS "repartidor_own_pedidos" ON pedidos;
CREATE POLICY "repartidor_own_pedidos" ON pedidos
  FOR SELECT
  USING (repartidor_id = auth.uid());

DROP POLICY IF EXISTS "repartidor_update_estado" ON pedidos;
CREATE POLICY "repartidor_update_estado" ON pedidos
  FOR UPDATE
  USING (repartidor_id = auth.uid())
  WITH CHECK (repartidor_id = auth.uid());

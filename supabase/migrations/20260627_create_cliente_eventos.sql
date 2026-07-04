-- ============================================================
-- Migración: Tabla cliente_eventos
-- Reemplaza el sistema de [TAGS] en notas_crm (texto plano)
-- ============================================================

CREATE TABLE IF NOT EXISTS cliente_eventos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,      -- 'PROMO_5H', 'REACTIV', 'FELICITACION_CUMPLE', etc.
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS cliente_eventos_cliente_id_idx ON cliente_eventos (cliente_id);
CREATE INDEX IF NOT EXISTS cliente_eventos_tipo_idx ON cliente_eventos (tipo);
CREATE INDEX IF NOT EXISTS cliente_eventos_created_at_idx ON cliente_eventos (created_at);

-- RLS: Solo service role puede insertar/leer (usado desde Edge Functions)
ALTER TABLE cliente_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON cliente_eventos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE cliente_eventos IS
  'Eventos y acciones registradas por cliente. Reemplaza el sistema de [TAGS] en el campo notas_crm que era frágil y no consultable.';

COMMENT ON COLUMN cliente_eventos.tipo IS
  'Tipo de evento. Valores comunes: PROMO_5H, REACTIV, FELICITACION_CUMPLE, etc.';

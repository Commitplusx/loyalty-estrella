-- ══════════════════════════════════════════════════════════════════════════════
-- Tabla: repartidor_log
-- Registra cada acción que un repartidor hace a través del bot de WhatsApp.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "public"."repartidor_log" (
  "id"              uuid DEFAULT gen_random_uuid() NOT NULL,
  "repartidor_tel"  text NOT NULL,
  "repartidor_nombre" text,
  "accion"          text NOT NULL,  -- info, qr, score, direccion, noregistrado, cupon, sos, sumar_puntos, cargar_saldo
  "cliente_tel"     text,           -- teléfono del cliente afectado (si aplica)
  "detalle"         text,           -- detalle extra: calificación, nueva dirección, puntos sumados, etc.
  "created_at"      timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("id")
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_rep_log_tel       ON "public"."repartidor_log" ("repartidor_tel");
CREATE INDEX IF NOT EXISTS idx_rep_log_accion    ON "public"."repartidor_log" ("accion");
CREATE INDEX IF NOT EXISTS idx_rep_log_created   ON "public"."repartidor_log" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_rep_log_cli_tel   ON "public"."repartidor_log" ("cliente_tel");

-- RLS: Lectura pública para el dashboard de admin, escritura solo desde service_role
ALTER TABLE "public"."repartidor_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access to repartidor_log"
  ON "public"."repartidor_log"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anon read repartidor_log"
  ON "public"."repartidor_log"
  FOR SELECT
  TO anon
  USING (true);

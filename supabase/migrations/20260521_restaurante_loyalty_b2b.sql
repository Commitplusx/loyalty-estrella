-- ================================================================
-- MIGRACIÓN: Programa de Lealtad B2B para Restaurantes
-- Los restaurantes pueden afiliar clientes, regalar envíos y
-- sumar puntos directamente desde WhatsApp.
-- ================================================================

-- 1. Columnas del programa de lealtad en la tabla restaurantes
ALTER TABLE "public"."restaurantes"
  ADD COLUMN IF NOT EXISTS "programa_lealtad_activo" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "envios_gratis_patrocinados" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "puntos_otorgados_total" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "clientes_afiliados_count" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "correo" text,
  ADD COLUMN IF NOT EXISTS "logo_url" text;

COMMENT ON COLUMN "public"."restaurantes"."programa_lealtad_activo" IS 'Si TRUE, el restaurante puede usar los comandos de WhatsApp para el programa de lealtad.';
COMMENT ON COLUMN "public"."restaurantes"."envios_gratis_patrocinados" IS 'Total de envíos gratis que este restaurante ha regalado a sus clientes.';
COMMENT ON COLUMN "public"."restaurantes"."puntos_otorgados_total" IS 'Acumulado total de puntos que el restaurante ha otorgado a clientes.';
COMMENT ON COLUMN "public"."restaurantes"."clientes_afiliados_count" IS 'Conteo de clientes que este restaurante ha afiliado al programa.';

-- 2. Tabla de registro de acciones B2B del restaurante (auditoría completa)
CREATE TABLE IF NOT EXISTS "public"."restaurante_loyalty_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "restaurante_id" uuid NOT NULL REFERENCES "public"."restaurantes"("id") ON DELETE CASCADE,
  "cliente_tel" varchar(20) NOT NULL,
  "accion" text NOT NULL, -- 'afiliar', 'regalar_envio', 'sumar_puntos'
  "valor" integer DEFAULT 0, -- cantidad de puntos o envíos
  "descripcion" text,
  "created_at" timestamp with time zone DEFAULT now(),
  PRIMARY KEY ("id")
);

COMMENT ON TABLE "public"."restaurante_loyalty_log" IS 'Registro de todas las acciones de lealtad que los restaurantes han hecho sobre sus clientes.';

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_rest_loyalty_log_restaurante ON "public"."restaurante_loyalty_log"("restaurante_id");
CREATE INDEX IF NOT EXISTS idx_rest_loyalty_log_cliente ON "public"."restaurante_loyalty_log"("cliente_tel");
CREATE INDEX IF NOT EXISTS idx_rest_loyalty_log_fecha ON "public"."restaurante_loyalty_log"("created_at" DESC);

-- 3. Vista para el resumen de acciones de cada restaurante
CREATE OR REPLACE VIEW "public"."restaurante_loyalty_resumen" AS
  SELECT
    r.id,
    r.nombre,
    r.telefono,
    r.programa_lealtad_activo,
    r.clientes_afiliados_count,
    r.envios_gratis_patrocinados,
    r.puntos_otorgados_total,
    COUNT(rll.id) AS acciones_ultimo_mes
  FROM "public"."restaurantes" r
  LEFT JOIN "public"."restaurante_loyalty_log" rll
    ON r.id = rll.restaurante_id
    AND rll.created_at >= now() - interval '30 days'
  GROUP BY r.id, r.nombre, r.telefono, r.programa_lealtad_activo,
           r.clientes_afiliados_count, r.envios_gratis_patrocinados,
           r.puntos_otorgados_total;

-- 4. RLS: Restaurantes solo ven sus propios logs
ALTER TABLE "public"."restaurante_loyalty_log" ENABLE ROW LEVEL SECURITY;

-- Los service_role (el bot) pueden hacer todo
CREATE POLICY "service_role_full_access_loyalty_log"
  ON "public"."restaurante_loyalty_log"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. RPC atómico para incrementar contadores del restaurante sin race conditions
CREATE OR REPLACE FUNCTION "public"."increment_restaurante_counter"(
  p_id uuid,
  p_column text,
  p_amount integer DEFAULT 1
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_column = 'clientes_afiliados_count' THEN
    UPDATE "public"."restaurantes"
      SET clientes_afiliados_count = COALESCE(clientes_afiliados_count, 0) + p_amount
      WHERE id = p_id;
  ELSIF p_column = 'envios_gratis_patrocinados' THEN
    UPDATE "public"."restaurantes"
      SET envios_gratis_patrocinados = COALESCE(envios_gratis_patrocinados, 0) + p_amount
      WHERE id = p_id;
  ELSIF p_column = 'puntos_otorgados_total' THEN
    UPDATE "public"."restaurantes"
      SET puntos_otorgados_total = COALESCE(puntos_otorgados_total, 0) + p_amount
      WHERE id = p_id;
  END IF;
END;
$$;

-- 6. RPC atómico para incrementar envios_gratis_disponibles en clientes (anti race-condition)
CREATE OR REPLACE FUNCTION "public"."increment_cliente_envios_gratis"(
  p_tel text,
  p_amount integer DEFAULT 1
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE "public"."clientes"
    SET envios_gratis_disponibles = COALESCE(envios_gratis_disponibles, 0) + p_amount
    WHERE telefono ILIKE '%' || right(p_tel, 10) || '%';
END;
$$;

-- Eliminar tabla completamente obsoleta
DROP TABLE IF EXISTS "public"."loyalty_points" CASCADE;

-- Eliminar columna vieja del script de importación inicial
ALTER TABLE "public"."colonias" DROP COLUMN IF EXISTS "precio_base";

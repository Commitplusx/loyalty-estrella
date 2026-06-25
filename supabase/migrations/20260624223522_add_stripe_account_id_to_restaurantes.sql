-- Añadir la columna stripe_account_id a la tabla restaurantes
ALTER TABLE "public"."restaurantes" ADD COLUMN IF NOT EXISTS "stripe_account_id" text;

-- ============================================================
-- ESTRELLA DELIVERY - UPDATE V22 (Campos Restaurantes)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- Añadir columnas al table restaurantes (solo si no existen)
ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS telefono TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS direccion TEXT,
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- Asegurar que la tabla tiene RLS habilitado y política de admins
ALTER TABLE restaurantes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'restaurantes' AND policyname = 'Admins_Full_Access_Restaurantes'
  ) THEN
    CREATE POLICY "Admins_Full_Access_Restaurantes" ON restaurantes FOR ALL
      USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));
  END IF;
END $$;

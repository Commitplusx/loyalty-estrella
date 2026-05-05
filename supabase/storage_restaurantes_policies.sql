-- ============================================================
-- POLÍTICAS DE STORAGE PARA "restaurantes"
-- ============================================================

-- IMPORTANTE: Asegúrate de haber creado el bucket "restaurantes" y que sea Público.

-- 1. Permitir que cualquier persona pueda VER y DESCARGAR las fotos
--    Esto es necesario para que el Directorio Web funcione.
DROP POLICY IF EXISTS "Public View Restaurantes" ON storage.objects;
CREATE POLICY "Public View Restaurantes" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'restaurantes');

-- 2. Permitir que los restaurantes AUTENTICADOS puedan SUBIR sus fotos
DROP POLICY IF EXISTS "Auth Insert Restaurantes" ON storage.objects;
CREATE POLICY "Auth Insert Restaurantes" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'restaurantes');

-- 3. Permitir que los restaurantes AUTENTICADOS puedan ACTUALIZAR sus fotos
DROP POLICY IF EXISTS "Auth Update Restaurantes" ON storage.objects;
CREATE POLICY "Auth Update Restaurantes" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'restaurantes');

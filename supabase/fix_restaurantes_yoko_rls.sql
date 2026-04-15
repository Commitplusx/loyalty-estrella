-- ============================================================
-- ACTUALIZAR RESTAURANTE YOKO + FIX RLS para la App Admin
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- 1. Actualizar Yoko con teléfono y dirección
UPDATE restaurantes
SET 
  telefono  = '9631371902',
  direccion = 'https://maps.app.goo.gl/FoBsezwi76oB3vLQ8',
  activo    = true
WHERE UPPER(nombre) LIKE '%YOKO%';

-- 2. Activar todos los restaurantes que tengan activo = NULL
UPDATE restaurantes SET activo = true WHERE activo IS NULL;

-- 3. FIX RLS: La política actual requiere que el usuario esté en la tabla `admins`.
--    El stream/future de la App usa el anon key. Si no hay política para anon ni para admins, bloquea.
--    Solución: Asegurarse que los admins autenticados pueden leer.
ALTER TABLE restaurantes ENABLE ROW LEVEL SECURITY;

-- Eliminar política vieja si existe para recrearla correctamente
DROP POLICY IF EXISTS "Admins_Full_Access_Restaurantes" ON restaurantes;
DROP POLICY IF EXISTS "Service_Role_Restaurantes" ON restaurantes;

-- Política para admins autenticados: acceso total
CREATE POLICY "Admins_Full_Access_Restaurantes" ON restaurantes
  FOR ALL
  USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));

-- Política de lectura para usuarios autenticados (incluye a cualquier admin logueado)
-- Esto es necesario porque el stream de la App usa auth.uid()
CREATE POLICY "Auth_Read_Restaurantes" ON restaurantes
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- 4. Verificar resultado final
SELECT id, nombre, telefono, activo, direccion FROM restaurantes ORDER BY nombre;

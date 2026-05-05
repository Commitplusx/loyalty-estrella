-- ============================================================
-- FIX RLS: Permitir que el directorio web público lea restaurantes
-- ============================================================

-- Eliminar política vieja si existe para no duplicar
DROP POLICY IF EXISTS "Public_Read_Restaurantes" ON restaurantes;

-- Crear política que permite a cualquier usuario (incluyendo anónimos) LEER la tabla restaurantes
CREATE POLICY "Public_Read_Restaurantes" ON restaurantes
  FOR SELECT
  USING (true);

-- (Opcional) Si también quisieras mostrar el menú en la web pública más adelante, 
-- necesitarás estas políticas también. Por ahora te las dejo comentadas.
/*
DROP POLICY IF EXISTS "Public_Read_Menu" ON menu_items;
CREATE POLICY "Public_Read_Menu" ON menu_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public_Read_Categorias" ON menu_categorias;
CREATE POLICY "Public_Read_Categorias" ON menu_categorias FOR SELECT USING (true);
*/

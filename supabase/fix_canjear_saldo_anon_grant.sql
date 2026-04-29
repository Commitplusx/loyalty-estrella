-- ============================================================
-- FIX PGRST203: Ambigüedad de función canjear_saldo
-- Hay DOS versiones en la DB con firmas diferentes:
--   1. canjear_saldo(uuid, text, numeric, text)   ← la correcta (p_admin_id = TEXT)
--   2. canjear_saldo(uuid, numeric, text, uuid)   ← la vieja (p_admin_id = UUID)
-- PostgREST no puede elegir → error PGRST203
-- SOLUCIÓN: Eliminar la versión vieja (UUID) y quedarse solo con la TEXT.
-- ============================================================

-- 1. Eliminar la versión vieja que tiene p_admin_id como UUID
DROP FUNCTION IF EXISTS public.canjear_saldo(UUID, UUID, NUMERIC, TEXT);

-- 2. Asegurar que la versión correcta tiene permiso para anon
GRANT EXECUTE ON FUNCTION public.canjear_saldo(UUID, TEXT, NUMERIC, TEXT) TO anon;

-- 3. Asegurar SECURITY DEFINER para que corra con permisos del creador
ALTER FUNCTION public.canjear_saldo(UUID, TEXT, NUMERIC, TEXT) SECURITY DEFINER;

-- 4. Verificar que solo queda UNA función canjear_saldo:
-- SELECT proname, proargtypes::text, prosecdef
-- FROM pg_proc
-- WHERE proname = 'canjear_saldo';
-- → Debe retornar solo 1 fila.

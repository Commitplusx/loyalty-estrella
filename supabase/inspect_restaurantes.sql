-- ============================================================
-- SCRIPT DE LECTURA (100% SEGURO, NO MODIFICA NADA)
-- Copia y pega esto en el SQL Editor de Supabase y dale a "RUN"
-- ============================================================

-- 1. Ver qué restaurantes existen en tu base de datos y su estado 'activo'
SELECT 
  id, 
  nombre, 
  activo, 
  telefono 
FROM restaurantes 
ORDER BY nombre ASC;

-- 2. Ver las políticas de seguridad (RLS) actuales de la tabla 'restaurantes'
-- Esto nos dirá si actualmente la web (usuarios anónimos) tiene permiso de lectura o no.
SELECT 
  policyname AS nombre_politica, 
  permissive AS tipo, 
  roles, 
  cmd AS accion, 
  qual AS condicion_usando
FROM pg_policies 
WHERE tablename = 'restaurantes';

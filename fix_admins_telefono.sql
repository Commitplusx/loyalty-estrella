-- ═══════════════════════════════════════════════════════════════
-- FIX: Agregar columna telefono a la tabla admins
-- Ejecutar en Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Agregar columna telefono (nullable)
ALTER TABLE public.admins
ADD COLUMN IF NOT EXISTS telefono text;

-- 2. Actualiza con tu número (sin +52, solo 10 dígitos)
--    Cambia el email por el tuyo real
UPDATE public.admins
SET telefono = '9631234567'   -- ← Pon aquí el número del admin
WHERE email = 'tu@email.com'; -- ← Pon aquí tu email real

-- 3. Verificar el resultado
SELECT id, nombre, email, telefono, role FROM public.admins;

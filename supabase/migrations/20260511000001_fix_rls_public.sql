-- ═══════════════════════════════════════════════════════════════════
-- FIX: Public access for 'restaurantes' table
-- ═══════════════════════════════════════════════════════════════════

-- Enable RLS (just in case it's not enabled)
ALTER TABLE public.restaurantes ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to read active restaurants
DROP POLICY IF EXISTS "Permitir lectura pública de restaurantes activos" ON public.restaurantes;
CREATE POLICY "Permitir lectura pública de restaurantes activos"
ON public.restaurantes
FOR SELECT
TO anon, authenticated
USING (activo = true);

-- Also ensure 'anuncios_flash' table (used in Home/Promos) is readable
ALTER TABLE public.anuncios_flash ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura pública de anuncios flash" ON public.anuncios_flash;
CREATE POLICY "Permitir lectura pública de anuncios flash"
ON public.anuncios_flash
FOR SELECT
TO anon, authenticated
USING (activo = true);

-- Tabla para almacenar el historial de GPS (Migas de Pan)
CREATE TABLE IF NOT EXISTS public.rutas_historial (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    repartidor_id UUID REFERENCES public.repartidores(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índices para consultas rápidas por repartidor y fecha (crítico para escalabilidad)
CREATE INDEX IF NOT EXISTS idx_rutas_repartidor_fecha 
ON public.rutas_historial (repartidor_id, created_at DESC);

-- Habilitar RLS
ALTER TABLE public.rutas_historial ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS (Permitir lectura y escritura)
CREATE POLICY "Permitir todo a rutas_historial" 
ON public.rutas_historial 
FOR ALL USING (true);

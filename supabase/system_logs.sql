-- Crear tabla de logs del sistema
CREATE TABLE IF NOT EXISTS public.system_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error', 'critical')),
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON public.system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_source ON public.system_logs(source);

-- Políticas de RLS (solo inserción pública/anonima permitida si queremos que el frontend loguee, y lectura solo admin)
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir inserción anonima a system_logs" 
    ON public.system_logs 
    FOR INSERT 
    TO public, anon 
    WITH CHECK (true);

-- Permitir lectura solo a usuarios autenticados (o en este caso no la exponemos al cliente, solo la leemos desde dashboard o service_role)
CREATE POLICY "Denegar lectura publica a system_logs" 
    ON public.system_logs 
    FOR SELECT 
    TO public, anon 
    USING (false);

-- Función RPC para insertar logs desde el frontend usando anon key
CREATE OR REPLACE FUNCTION public.log_system_error(
    p_level TEXT,
    p_source TEXT,
    p_message TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS void AS $$
BEGIN
    INSERT INTO public.system_logs (level, source, message, metadata)
    VALUES (p_level, p_source, p_message, p_metadata);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

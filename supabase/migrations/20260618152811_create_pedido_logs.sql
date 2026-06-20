-- Migration: Create pedido_logs table
CREATE TABLE public.pedido_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID REFERENCES public.pedidos(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id),
    accion TEXT NOT NULL,
    detalles TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- Habilitar RLS
ALTER TABLE public.pedido_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad (RLS)
-- Administradores pueden ver todos los logs
CREATE POLICY "Admins pueden ver todos los logs" ON public.pedido_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.administradores a WHERE a.user_id = auth.uid()
        )
    );

-- Permitir insertar libremente (ya que las Edge Functions usarán service_role, y repartidores autenticados pueden insertar)
CREATE POLICY "Repartidores pueden insertar logs" ON public.pedido_logs
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

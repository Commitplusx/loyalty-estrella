-- V25: Tabla para onboarding de restaurantes vía WhatsApp

CREATE TABLE IF NOT EXISTS restaurantes_solicitudes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_restaurante TEXT NOT NULL,
  correo TEXT NOT NULL,
  telefono TEXT NOT NULL,
  estado TEXT DEFAULT 'pendiente', -- 'pendiente', 'aprobado', 'rechazado'
  creado_en TIMESTAMPTZ DEFAULT now(),
  actualizado_en TIMESTAMPTZ DEFAULT now()
);

-- RLS: Solo lectura/escritura para Service Role (Edge functions)
ALTER TABLE restaurantes_solicitudes ENABLE ROW LEVEL SECURITY;
-- No agregamos políticas públicas porque solo el bot (usando service_role) escribirá y leerá aquí.

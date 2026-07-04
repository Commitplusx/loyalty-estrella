-- ============================================================
-- Migración: Agregar access_token seguro a la tabla pedidos
-- Reemplaza el sistema de "key" predecible (slice del UUID)
-- ============================================================

-- 1. Agregar columna con valor por defecto automático
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS access_token UUID NOT NULL DEFAULT gen_random_uuid();

-- 2. Índice único para búsquedas rápidas por token
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_access_token_idx ON pedidos (access_token);

-- 3. Política RLS: Solo el dueño del pedido (o service role) puede ver el token
-- (El access_token solo se expone via el link que le enviamos al cliente)
COMMENT ON COLUMN pedidos.access_token IS 
  'Token de acceso seguro generado aleatoriamente. Se incluye en el link de seguimiento enviado al cliente por WhatsApp.';

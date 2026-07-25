-- Corre esto en el SQL Editor de Supabase para arreglar el error del estado

-- 1. Eliminar la restricción actual
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;

-- 2. Crear la nueva restricción incluyendo 'buscando_repartidor' y 'ofrecido'
ALTER TABLE pedidos ADD CONSTRAINT pedidos_estado_check 
CHECK (estado IN (
  'pendiente', 
  'pendiente_pago',
  'buscando_repartidor', 
  'ofrecido',
  'asignado', 
  'en_camino', 
  'recibido', 
  'entregado', 
  'cancelado'
));

-- 3. (Opcional) Verificar que se aplicó
SELECT pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'pedidos_estado_check';

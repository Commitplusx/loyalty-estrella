-- Migración segura para agregar soporte completo de Mandaditos en la tabla 'pedidos'

-- 1. Agregar columna de 'destino' (ya existe 'origen')
ALTER TABLE public.pedidos 
  ADD COLUMN IF NOT EXISTS destino text;

-- 2. Agregar columna 'metodo_pago' (por defecto 'efectivo')
ALTER TABLE public.pedidos 
  ADD COLUMN IF NOT EXISTS metodo_pago text DEFAULT 'efectivo';

-- 3. Agregar columna 'tipo_pedido' (por defecto 'comida')
ALTER TABLE public.pedidos 
  ADD COLUMN IF NOT EXISTS tipo_pedido text DEFAULT 'comida';

-- Asegurar que los pedidos pasados tengan tipo 'comida' y pago 'efectivo'
UPDATE public.pedidos SET tipo_pedido = 'comida' WHERE tipo_pedido IS NULL;
UPDATE public.pedidos SET metodo_pago = 'efectivo' WHERE metodo_pago IS NULL;

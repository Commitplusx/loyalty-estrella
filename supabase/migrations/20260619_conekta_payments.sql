-- Migración para añadir soporte de pagos en línea (Conekta)
ALTER TABLE public.pedidos 
  ADD COLUMN IF NOT EXISTS metodo_pago text DEFAULT 'efectivo',
  ADD COLUMN IF NOT EXISTS estado_pago text DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS conekta_order_id text;

-- Restricción para validar método de pago
ALTER TABLE public.pedidos 
  ADD CONSTRAINT pedidos_metodo_pago_check 
  CHECK (metodo_pago IN ('efectivo', 'en_linea'));

-- Restricción para estado de pago
ALTER TABLE public.pedidos 
  ADD CONSTRAINT pedidos_estado_pago_check 
  CHECK (estado_pago IN ('pendiente', 'pagado', 'fallido'));

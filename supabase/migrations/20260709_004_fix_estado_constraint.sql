ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;

ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_estado_check 
CHECK (estado IN (
  'pendiente', 
  'ofrecido', 
  'asignado', 
  'aceptado', 
  'en_cocina', 
  'listo_para_recoger', 
  'recibido', 
  'en_camino', 
  'entregado', 
  'cancelado', 
  'rechazado'
));

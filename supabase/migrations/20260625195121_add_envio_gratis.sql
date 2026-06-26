-- Añadir columnas para configuración de envío gratis
ALTER TABLE public.restaurantes ADD COLUMN envio_gratis_monto_minimo numeric DEFAULT 500;
ALTER TABLE public.restaurantes ADD COLUMN envio_gratis_tope numeric DEFAULT 50;

-- Aumentar el precio de todos los items en 8 pesos
UPDATE public.menu_items SET precio = precio + 8;

-- Aumentar el precio de todos los combos en 8 pesos
UPDATE public.menu_combos SET precio = precio + 8;

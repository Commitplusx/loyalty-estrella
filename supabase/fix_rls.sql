-- Allow anonymous access to read a pedido (since UUIDs are unguessable)
CREATE POLICY "Allow public read access to pedidos"
ON public.pedidos
FOR SELECT
TO anon
USING (true);

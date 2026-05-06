-- ==============================================================================
-- ACTUALIZACIÓN V31: Política de Inserción Pública para Interceptores Web
-- ==============================================================================

-- Permitir que cualquier persona en la web inserte un nuevo pedido en la tabla pedidos
DROP POLICY IF EXISTS "Permitir_Insertar_Pedidos_Web_Publicos" ON pedidos;

CREATE POLICY "Permitir_Insertar_Pedidos_Web_Publicos" 
ON pedidos
FOR INSERT 
TO public
WITH CHECK (true);

-- Notar que no se les da acceso SELECT, por lo que no pueden leer pedidos de otros.
-- Sólo pueden insertar (crear) un nuevo pedido.

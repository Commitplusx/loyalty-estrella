-- Funcioón para obtener o crear un cliente basado en su número de teléfono
CREATE OR REPLACE FUNCTION get_or_create_cliente(p_telefono TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cliente RECORD;
    v_qr_code TEXT;
    v_nuevo_cliente record;
BEGIN
    -- Intentar buscar al cliente por teléfono
    SELECT * INTO v_cliente FROM clientes WHERE telefono = p_telefono LIMIT 1;
    
    IF FOUND THEN
        -- Si existe, devolver sus datos en formato JSON
        RETURN row_to_json(v_cliente);
    ELSE
        -- Generar un código QR temporal (único probabilísticamente)
        v_qr_code := 'ED-' || extract(epoch from now())::text || '-' || substr(md5(random()::text), 1, 6);
        
        -- Insertar el nuevo cliente, con nombre por defecto basado en su teléfono
        INSERT INTO clientes (nombre, telefono, qr_code, puntos, envios_gratis_disponibles, envios_totales)
        VALUES ('Cliente ' || p_telefono, p_telefono, v_qr_code, 0, 0, 0)
        RETURNING * INTO v_nuevo_cliente;
        
        -- Devolver el cliente recién creado
        RETURN row_to_json(v_nuevo_cliente);
    END IF;
END;
$$;

-- ============================================
-- EXPANSION PRO - ESTRELLA DELIVERY
-- Ejecutar en el Editor SQL de Supabase
-- ============================================

-- ============================================
-- TABLA: GASTOS_MOTOS
-- ============================================
CREATE TABLE IF NOT EXISTS gastos_motos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    concepto VARCHAR(255) NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TABLA: PROMOCIONES_DINAMICAS
-- ============================================
CREATE TABLE IF NOT EXISTS promociones_dinamicas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT,
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- POLÍTICAS DE SEGURIDAD (RLS)
-- ============================================

-- Habilitar RLS
ALTER TABLE gastos_motos ENABLE ROW LEVEL SECURITY;
ALTER TABLE promociones_dinamicas ENABLE ROW LEVEL SECURITY;

-- Políticas Gastos
CREATE POLICY "Allow admin all gastos" ON gastos_motos
    FOR ALL USING (
        EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
    );

-- Políticas Promociones
CREATE POLICY "Allow public read promos" ON promociones_dinamicas
    FOR SELECT USING (activa = true);

CREATE POLICY "Allow admin all promos" ON promociones_dinamicas
    FOR ALL USING (
        EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
    );

-- ============================================
-- FUNCIONES RPC
-- ============================================

-- RPC para que la web lea el historial de forma segura usando el ID_CLIENTE
CREATE OR REPLACE FUNCTION get_historial_cliente(p_cliente_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_registros JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', r.id,
            'tipo', r.tipo,
            'puntos', r.puntos,
            'descripcion', r.descripcion,
            'created_at', r.created_at
        ) ORDER BY r.created_at DESC
    ) INTO v_registros
    FROM registros_puntos r
    WHERE r.cliente_id = p_cliente_id;
    
    RETURN COALESCE(v_registros, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC para forzar crear un cliente manualmente (Registro Express)
CREATE OR REPLACE FUNCTION registro_express_cliente(
    p_telefono VARCHAR,
    p_nombre VARCHAR
)
RETURNS JSONB AS $$
DECLARE
    v_cliente_id UUID;
    v_qr_code VARCHAR;
BEGIN
    -- Validar si ya existe
    IF EXISTS (SELECT 1 FROM clientes WHERE telefono = p_telefono) THEN
        RETURN jsonb_build_object('success', false, 'message', 'El teléfono ya está registrado');
    END IF;

    -- Generar QR único
    v_qr_code := 'ESTRELLA-' || substr(md5(random()::text), 1, 8);

    -- Insertar
    INSERT INTO clientes (nombre, telefono, qr_code)
    VALUES (p_nombre, p_telefono, v_qr_code)
    RETURNING id INTO v_cliente_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Cliente registrado',
        'cliente_id', v_cliente_id,
        'qr_code', v_qr_code
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TABLA: REGISTROS_PUNTOS (Actualización Geo)
-- ============================================

-- Añadir campos de latitud y longitud a la tabla existente
ALTER TABLE registros_puntos ADD COLUMN IF NOT EXISTS latitud DECIMAL(10, 8);
ALTER TABLE registros_puntos ADD COLUMN IF NOT EXISTS longitud DECIMAL(11, 8);

-- ============================================
-- SISTEMA VIP (Actualización Base Clientes)
-- ============================================
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS es_vip BOOLEAN DEFAULT false;

-- RPC Actualizado para aceptar latitud y longitud, y procesar Lógica VIP (Meta 4 vs 5)
CREATE OR REPLACE FUNCTION registrar_envio(
    p_cliente_id UUID,
    p_admin_id UUID DEFAULT auth.uid(),
    p_latitud DECIMAL DEFAULT NULL,
    p_longitud DECIMAL DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_cliente RECORD;
    v_nuevos_puntos INTEGER;
    v_envios_gratis INTEGER;
    v_meta INTEGER;
    v_mensaje TEXT;
BEGIN
    -- Obtener cliente
    SELECT * INTO v_cliente FROM clientes WHERE id = p_cliente_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cliente no encontrado');
    END IF;
    
    -- Determinar la meta basada en si es VIP
    IF v_cliente.es_vip THEN
        v_meta := 4;
    ELSE
        v_meta := 5;
    END IF;
    
    -- Calcular nuevos puntos
    v_nuevos_puntos := v_cliente.puntos + 1;
    v_envios_gratis := v_cliente.envios_gratis_disponibles;
    v_mensaje := 'Punto acumulado correctamente';
    
    -- Verificar si alcanzó la meta
    IF v_nuevos_puntos >= v_meta THEN
        v_envios_gratis := v_envios_gratis + 1;
        v_nuevos_puntos := 0;
        v_mensaje := '¡Felicidades! Has ganado un envío GRATIS';
    END IF;
    
    -- Actualizar cliente
    UPDATE clientes SET
        puntos = v_nuevos_puntos,
        envios_gratis_disponibles = v_envios_gratis,
        envios_totales = envios_totales + 1,
        updated_at = NOW()
    WHERE id = p_cliente_id;
    
    -- Crear registro
    INSERT INTO registros_puntos (cliente_id, tipo, puntos, descripcion, created_by, latitud, longitud)
    VALUES (p_cliente_id, 'acumulacion', 1, v_mensaje, p_admin_id, p_latitud, p_longitud);
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', v_mensaje,
        'puntos', v_nuevos_puntos,
        'envios_gratis', v_envios_gratis,
        'meta_vip', v_meta
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Insertar una promoción de prueba
INSERT INTO promociones_dinamicas (titulo, descripcion) 
VALUES ('¡Puntos Dobles este Viernes!', 'Muestra este anuncio y gana 2 puntos por tu entrega.')
ON CONFLICT DO NOTHING;

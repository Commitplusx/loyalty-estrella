-- ============================================
-- ESQUEMA DE BASE DE DATOS - ESTRELLA DELIVERY
-- ============================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLA: CLIENTES
-- ============================================
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL,
    telefono VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255),
    qr_code VARCHAR(255) NOT NULL UNIQUE,
    puntos INTEGER DEFAULT 0 CHECK (puntos >= 0 AND puntos < 5),
    envios_gratis_disponibles INTEGER DEFAULT 0 CHECK (envios_gratis_disponibles >= 0),
    envios_totales INTEGER DEFAULT 0 CHECK (envios_totales >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para clientes
CREATE INDEX idx_clientes_telefono ON clientes(telefono);
CREATE INDEX idx_clientes_qr_code ON clientes(qr_code);
CREATE INDEX idx_clientes_created_at ON clientes(created_at DESC);

-- ============================================
-- TABLA: REGISTROS_DE_PUNTOS
-- ============================================
CREATE TABLE IF NOT EXISTS registros_puntos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('acumulacion', 'canje')),
    puntos INTEGER NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Índices para registros
CREATE INDEX idx_registros_cliente ON registros_puntos(cliente_id);
CREATE INDEX idx_registros_created_at ON registros_puntos(created_at DESC);

-- ============================================
-- TABLA: ADMINS
-- ============================================
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    nombre VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- FUNCIONES Y TRIGGERS
-- ============================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para clientes
DROP TRIGGER IF EXISTS update_clientes_updated_at ON clientes;
CREATE TRIGGER update_clientes_updated_at
    BEFORE UPDATE ON clientes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- POLÍTICAS DE SEGURIDAD (RLS)
-- ============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_puntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Políticas para clientes
CREATE POLICY "Allow public read clientes" ON clientes
    FOR SELECT USING (true);

CREATE POLICY "Allow admin insert clientes" ON clientes
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
    );

CREATE POLICY "Allow admin update clientes" ON clientes
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
    );

-- Políticas para registros_puntos
CREATE POLICY "Allow public read own registros" ON registros_puntos
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM clientes WHERE id = registros_puntos.cliente_id)
        -- En un caso ideal con auth real de cliente, sería: auth.uid() = cliente_id
        -- Como la app los identifica por teléfono/QR, permitimos lectura pública y el frontend filtra por cliente_id
    );

CREATE POLICY "Allow admin read registros" ON registros_puntos
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
    );

CREATE POLICY "Allow admin insert registros" ON registros_puntos
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
    );

-- Políticas para admins
CREATE POLICY "Allow admin read admins" ON admins
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
    );

-- ============================================
-- DATOS INICIALES
-- ============================================

-- Insertar admin inicial (ejecutar después de crear el usuario en Auth)
-- INSERT INTO admins (id, email, nombre, role) 
-- VALUES ('uuid-del-usuario-auth', 'admin@estrelladelivery.com', 'Administrador', 'superadmin');

-- ============================================
-- TABLA: APP_CONFIG
-- ============================================
CREATE TABLE IF NOT EXISTS app_config (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
    horarios JSONB NOT NULL,
    horas_felices JSONB NOT NULL,
    contacto JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger para update_at en app_config
DROP TRIGGER IF EXISTS update_app_config_updated_at ON app_config;
CREATE TRIGGER update_app_config_updated_at
    BEFORE UPDATE ON app_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Políticas de seguridad para app_config
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read app_config" ON app_config
    FOR SELECT USING (true);

CREATE POLICY "Allow admin update app_config" ON app_config
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
    );

-- Insertar configuración inicial
INSERT INTO app_config (id, horarios, horas_felices, contacto)
VALUES (
    'default',
    '[
        {"dia": 0, "nombre": "Domingo", "abierto": true, "hora_apertura": "09:00", "hora_cierre": "22:00"},
        {"dia": 1, "nombre": "Lunes", "abierto": true, "hora_apertura": "09:00", "hora_cierre": "22:00"},
        {"dia": 2, "nombre": "Martes", "abierto": true, "hora_apertura": "09:00", "hora_cierre": "22:00"},
        {"dia": 3, "nombre": "Miércoles", "abierto": true, "hora_apertura": "09:00", "hora_cierre": "22:00"},
        {"dia": 4, "nombre": "Jueves", "abierto": true, "hora_apertura": "09:00", "hora_cierre": "22:00"},
        {"dia": 5, "nombre": "Viernes", "abierto": true, "hora_apertura": "09:00", "hora_cierre": "22:00"},
        {"dia": 6, "nombre": "Sábado", "abierto": true, "hora_apertura": "09:00", "hora_cierre": "22:00"}
    ]'::jsonb,
    '[
        {"dia": 1, "nombre": "Lunes", "hora_inicio": "17:00", "hora_fin": "20:00", "precio_promocional": 35, "activo": true},
        {"dia": 3, "nombre": "Miércoles", "hora_inicio": "17:00", "hora_fin": "20:00", "precio_promocional": 35, "activo": true},
        {"dia": 6, "nombre": "Sábado", "hora_inicio": "17:00", "hora_fin": "20:00", "precio_promocional": 35, "activo": true}
    ]'::jsonb,
    '{"whatsapp": "1234567890", "telefono": "+1 234 567 890", "precio_normal": 50}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista de clientes con estadísticas
CREATE OR REPLACE VIEW vista_clientes_stats AS
SELECT 
    c.*,
    COUNT(r.id) as total_registros,
    MAX(r.created_at) as ultima_actividad
FROM clientes c
LEFT JOIN registros_puntos r ON c.id = r.cliente_id
GROUP BY c.id;

-- ============================================
-- FUNCIONES ADICIONALES
-- ============================================

-- Función para acumular punto con lógica de negocio
CREATE OR REPLACE FUNCTION acumular_punto(
    p_cliente_id UUID,
    p_admin_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_cliente RECORD;
    v_nuevos_puntos INTEGER;
    v_envios_gratis INTEGER;
    v_mensaje TEXT;
BEGIN
    -- Obtener cliente
    SELECT * INTO v_cliente FROM clientes WHERE id = p_cliente_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cliente no encontrado');
    END IF;
    
    -- Calcular nuevos puntos
    v_nuevos_puntos := v_cliente.puntos + 1;
    v_envios_gratis := v_cliente.envios_gratis_disponibles;
    v_mensaje := 'Punto acumulado correctamente';
    
    -- Verificar si ganó envío gratis
    IF v_nuevos_puntos >= 5 THEN
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
    INSERT INTO registros_puntos (cliente_id, tipo, puntos, descripcion, created_by)
    VALUES (p_cliente_id, 'acumulacion', 1, v_mensaje, p_admin_id);
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', v_mensaje,
        'puntos', v_nuevos_puntos,
        'envios_gratis', v_envios_gratis
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para canjear envío gratis
CREATE OR REPLACE FUNCTION canjear_envio_gratis(
    p_cliente_id UUID,
    p_admin_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_cliente RECORD;
BEGIN
    -- Obtener cliente
    SELECT * INTO v_cliente FROM clientes WHERE id = p_cliente_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cliente no encontrado');
    END IF;
    
    IF v_cliente.envios_gratis_disponibles <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'No tienes envíos gratis disponibles');
    END IF;
    
    -- Actualizar cliente
    UPDATE clientes SET
        envios_gratis_disponibles = envios_gratis_disponibles - 1,
        envios_totales = envios_totales + 1,
        updated_at = NOW()
    WHERE id = p_cliente_id;
    
    -- Crear registro
    INSERT INTO registros_puntos (cliente_id, tipo, puntos, descripcion, created_by)
    VALUES (p_cliente_id, 'canje', 0, 'Envío gratis canjeado', p_admin_id);
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', '¡Envío gratis canjeado exitosamente!'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

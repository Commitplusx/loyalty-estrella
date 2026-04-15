-- ============================================================
-- ESTRELLA DELIVERY - ESQUEMA INTEGRADO (V20)
-- Consolidado: Sistema de Logística, CRM, VIP y Billetera
-- ============================================================

-- EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABLA: ADMINS
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    nombre VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. TABLA: REPARTIDORES
CREATE TABLE IF NOT EXISTS repartidores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    nombre VARCHAR(255) NOT NULL,
    alias VARCHAR(100),
    telefono VARCHAR(20),
    activo BOOLEAN DEFAULT true,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2.1 TABLA: RESTAURANTES (Añadido en V21)
CREATE TABLE IF NOT EXISTS restaurantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id),
  nombre TEXT NOT NULL,
  telefono TEXT UNIQUE,
  activo BOOLEAN DEFAULT true,
  direccion TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABLA: CLIENTES (Merged CRM + VIP + Billetera)
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL,
    telefono VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255),
    qr_code VARCHAR(255) NOT NULL UNIQUE,
    puntos INTEGER DEFAULT 0,
    envios_gratis_disponibles INTEGER DEFAULT 0,
    envios_totales INTEGER DEFAULT 0,
    es_vip BOOLEAN DEFAULT false,
    saldo_billetera DECIMAL(10,2) DEFAULT 0.00,
    notas_crm TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TABLA: PEDIDOS (Logística Central)
CREATE TABLE IF NOT EXISTS pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_tel TEXT NOT NULL,
    cliente_nombre TEXT,
    restaurante TEXT,
    repartidor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    descripcion TEXT NOT NULL,
    direccion TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    wb_message_id TEXT UNIQUE,
    estado TEXT NOT NULL DEFAULT 'asignado' 
        CHECK (estado IN ('asignado', 'recibido', 'en_camino', 'entregado', 'cancelado')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. TABLA: REGISTROS_PUNTOS (Historial de Movimientos)
CREATE TABLE IF NOT EXISTS registros_puntos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('acumulacion', 'canje')),
    puntos INTEGER DEFAULT 0,
    monto_saldo DECIMAL(10,2) DEFAULT 0.00,
    descripcion TEXT,
    latitud DECIMAL(10, 8),
    longitud DECIMAL(11, 8),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- 6. TABLA: BOT_MEMORY (Contexto WhatsApp)
CREATE TABLE IF NOT EXISTS bot_memory (
    phone TEXT PRIMARY KEY,
    history JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 7. TABLA: APP_CONFIG / GASTOS / PROMOS
CREATE TABLE IF NOT EXISTS app_config (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
    horarios JSONB NOT NULL,
    horas_felices JSONB NOT NULL,
    contacto JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gastos_motos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    concepto VARCHAR(255) NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    estado VARCHAR(20) DEFAULT 'aprobado',
    fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promociones_dinamicas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT,
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- FUNCIONES RPC
-- ============================================================

-- A. Registrar Envío Inteligente (Puntos o Cashback VIP)
CREATE OR REPLACE FUNCTION registrar_envio(
    p_cliente_id UUID,
    p_admin_id UUID DEFAULT auth.uid(),
    p_latitud DECIMAL DEFAULT NULL,
    p_longitud DECIMAL DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_cliente RECORD;
    v_mensaje TEXT;
BEGIN
    SELECT * INTO v_cliente FROM clientes WHERE id = p_cliente_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Cliente no encontrado'); END IF;

    IF v_cliente.es_vip THEN
        UPDATE clientes SET 
            saldo_billetera = COALESCE(saldo_billetera, 0) + 5.00,
            envios_totales = envios_totales + 1,
            updated_at = NOW()
        WHERE id = p_cliente_id;
        
        INSERT INTO registros_puntos (cliente_id, tipo, puntos, monto_saldo, descripcion, created_by, latitud, longitud)
        VALUES (p_cliente_id, 'acumulacion', 0, 5.00, 'Cashback VIP: +$5.00', p_admin_id, p_latitud, p_longitud);
        
        RETURN jsonb_build_object('success', true, 'message', 'Cashback VIP acumulado', 'is_vip', true);
    ELSE
        -- Lógica Puntos (Meta 5)
        DECLARE 
            v_puntos INT := v_cliente.puntos + 1;
            v_gratis INT := v_cliente.envios_gratis_disponibles;
        BEGIN
            IF v_puntos >= 5 THEN v_puntos := 0; v_gratis := v_gratis + 1; v_mensaje := '¡Envío GRATIS ganado!';
            ELSE v_mensaje := 'Punto acumulado'; END IF;

            UPDATE clientes SET 
                puntos = v_puntos, envios_gratis_disponibles = v_gratis, 
                envios_totales = envios_totales + 1, updated_at = NOW()
            WHERE id = p_cliente_id;

            INSERT INTO registros_puntos (cliente_id, tipo, puntos, monto_saldo, descripcion, created_by, latitud, longitud)
            VALUES (p_cliente_id, 'acumulacion', 1, 0, v_mensaje, p_admin_id, p_latitud, p_longitud);

            RETURN jsonb_build_object('success', true, 'message', v_mensaje, 'puntos', v_puntos, 'is_vip', false);
        END;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. Obtener Historial Completo
CREATE OR REPLACE FUNCTION get_historial_cliente(p_cliente_id UUID)
RETURNS JSONB AS $$
BEGIN
    RETURN (
        SELECT jsonb_agg(r ORDER BY r.created_at DESC) 
        FROM (SELECT id, tipo, puntos, monto_saldo, descripcion, created_at FROM registros_puntos WHERE cliente_id = p_cliente_id) r
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- POLÍTICAS RLS (Seguridad)
-- ============================================================
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_puntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE repartidores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins_Full_Access" ON clientes FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));
CREATE POLICY "Admins_Full_Access_Pedidos" ON pedidos FOR ALL USING (EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));
CREATE POLICY "Repartidores_Own_Orders" ON pedidos FOR SELECT USING (repartidor_id = auth.uid());
CREATE POLICY "Repartidores_Update_Status" ON pedidos FOR UPDATE USING (repartidor_id = auth.uid());

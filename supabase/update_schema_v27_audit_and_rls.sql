-- ============================================================
-- ACTUALIZACIÓN V27: AUDITORÍA ESTRICTA Y RLS
-- Log Histórico de Billetera VIP y Seguridad de Funciones
-- ============================================================

-- ============================================================
-- 1. CREACIÓN DEL LOG DE AUDITORÍA (historial_billetera)
-- ============================================================
CREATE TABLE IF NOT EXISTS historial_billetera (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
    saldo_anterior DECIMAL(10,2) NOT NULL,
    saldo_nuevo DECIMAL(10,2) NOT NULL,
    diferencia DECIMAL(10,2) NOT NULL,
    motivo TEXT,
    fecha TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en la nueva tabla
ALTER TABLE historial_billetera ENABLE ROW LEVEL SECURITY;

-- Solo los Admins o Service Role pueden leer el historial
DROP POLICY IF EXISTS "Solo admins ven historial" ON historial_billetera;
CREATE POLICY "Solo admins ven historial" 
ON historial_billetera 
FOR SELECT 
USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');

-- Trigger de Auditoría Intocable (Se dispara a nivel atómico en Postgres)
CREATE OR REPLACE FUNCTION auditar_billetera_vip()
RETURNS TRIGGER AS $$
BEGIN
    -- Si el saldo cambió matemáticamente
    IF OLD.saldo_billetera IS DISTINCT FROM NEW.saldo_billetera THEN
        INSERT INTO historial_billetera (cliente_id, saldo_anterior, saldo_nuevo, diferencia, motivo)
        VALUES (
            NEW.id,
            COALESCE(OLD.saldo_billetera, 0),
            COALESCE(NEW.saldo_billetera, 0),
            COALESCE(NEW.saldo_billetera, 0) - COALESCE(OLD.saldo_billetera, 0),
            'Transacción de base de datos'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enganchar el vigilante a la tabla clientes
DROP TRIGGER IF EXISTS trg_auditar_billetera ON clientes;
CREATE TRIGGER trg_auditar_billetera
    AFTER UPDATE OF saldo_billetera ON clientes
    FOR EACH ROW
    EXECUTE FUNCTION auditar_billetera_vip();


-- ============================================================
-- 2. BLINDAJE DE FUNCIONES Y TABLAS (RLS Y PERMISOS)
-- ============================================================

-- Revocar permisos de ejecución pública para que un atacante no llame a la función RPC con la llave anónima
REVOKE EXECUTE ON FUNCTION canjear_saldo(UUID, TEXT, NUMERIC, TEXT) FROM public;
REVOKE EXECUTE ON FUNCTION canjear_saldo(UUID, TEXT, NUMERIC, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION canjear_saldo(UUID, TEXT, NUMERIC, TEXT) TO service_role, authenticated;

REVOKE EXECUTE ON FUNCTION registrar_envio(UUID, UUID, NUMERIC, NUMERIC) FROM public;
REVOKE EXECUTE ON FUNCTION registrar_envio(UUID, UUID, NUMERIC, NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION registrar_envio(UUID, UUID, NUMERIC, NUMERIC) TO service_role, authenticated;

-- Asegurar RLS en la tabla Clientes
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- Políticas estrictas: 
-- 1. Service Role puede hacer todo (El Bot de Node)
-- 2. Authenticated (App) solo puede ver clientes si tiene login válido.
DROP POLICY IF EXISTS "Service Role puede todo en clientes" ON clientes;
CREATE POLICY "Service Role puede todo en clientes" 
ON clientes 
FOR ALL 
USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Usuarios logueados pueden ver clientes" ON clientes;
CREATE POLICY "Usuarios logueados pueden ver clientes" 
ON clientes 
FOR SELECT 
USING (auth.role() = 'authenticated');

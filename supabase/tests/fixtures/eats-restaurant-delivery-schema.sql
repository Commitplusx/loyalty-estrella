CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('test.role',true)$$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
 CREATE TABLE restaurantes(id uuid PRIMARY KEY,nombre text,nombre_sucursal text,matriz_id uuid,admin_id uuid,activo boolean,lat float8,lng float8,direccion text);
 CREATE TABLE pedidos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurante_id uuid,restaurante text,restaurante_lat float8,restaurante_lng float8,
 cliente_nombre text,cliente_tel text,descripcion text,direccion text,referencias_entrega text,lat float8,lng float8,lat_entrega float8,lng_entrega float8,
 total numeric,precio_entrega numeric,tipo_pedido text,metodo_pago text,estado_pago text,estado text,estado_cocina text,tiempo_preparacion_minutos integer,
 origen text,destino text,items jsonb,idempotency_key uuid UNIQUE,wb_message_id text,pickup_pin text,pin_seguridad text,repartidor_id uuid,
 access_token uuid NOT NULL DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT clock_timestamp(),despacho_incidente text);
 CREATE TABLE dispatch_wakes(pedido_id uuid);
 CREATE FUNCTION test_wake() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
  IF NEW.estado='buscando_repartidor' AND NEW.repartidor_id IS NULL AND pedido_admite_repartidor(NEW) THEN
   INSERT INTO dispatch_wakes VALUES(NEW.id);
  END IF; RETURN NEW; END;$$;
 CREATE TRIGGER test_dispatch AFTER INSERT ON pedidos FOR EACH ROW EXECUTE FUNCTION test_wake();
 ALTER TABLE restaurantes ADD COLUMN es_socio boolean DEFAULT true;
 ALTER TABLE restaurantes ADD COLUMN telefono text DEFAULT '0000000000';
 CREATE TABLE repartidores(user_id uuid,telefono text,nombre text,activo boolean DEFAULT true);
 CREATE FUNCTION loyalty_manages_restaurant(p_restaurante_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(SELECT 1 FROM restaurantes r WHERE r.id=p_restaurante_id AND(r.admin_id=auth.uid() OR EXISTS(
   SELECT 1 FROM restaurantes parent WHERE parent.id=r.matriz_id AND parent.matriz_id IS NULL AND parent.admin_id=auth.uid())))
 $$;
 ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
 GRANT SELECT ON pedidos TO anon,authenticated;
 CREATE POLICY fixture_legacy_read ON pedidos FOR SELECT TO anon,authenticated USING(true);
 CREATE TABLE eats_notification_settings(enabled boolean);
 INSERT INTO eats_notification_settings VALUES(true);
 CREATE TABLE test_notices(pedido_id uuid,kind text);
 CREATE FUNCTION eats_enqueue_notice(p pedidos,kind text,phone text,ek text,details jsonb DEFAULT '{}')
 RETURNS void LANGUAGE sql AS $$INSERT INTO test_notices VALUES(p.id,kind)$$;

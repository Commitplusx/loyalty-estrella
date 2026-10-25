CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
CREATE SCHEMA auth;CREATE SCHEMA extensions;CREATE SCHEMA cron;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('test.role',true)$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$SELECT 1::bigint$$;
CREATE TABLE repartidores(id uuid PRIMARY KEY,user_id uuid UNIQUE,nombre text,activo boolean,bateria integer,lat float8,lng float8,
 current_device_id uuid,meta_envios integer,total_ofertas integer DEFAULT 0,total_aceptaciones integer DEFAULT 0,ultimo_pedido_entregado_at timestamptz);
CREATE TABLE restaurantes(id uuid PRIMARY KEY,lat float8,lng float8);
CREATE TABLE pedidos(id uuid PRIMARY KEY,estado text,repartidor_id uuid,tipo_pedido text,metodo_pago text,estado_pago text,
 estado_cocina text,tiempo_preparacion_minutos integer,ofertas_rechazadas uuid[],oferta_token uuid,oferta_vence_at timestamptz,
 despacho_reintentar_at timestamptz,despacho_incidente text,despacho_intentos integer DEFAULT 0,pickup_pin text,pin_seguridad text,
 lat_entrega float8,lng_entrega float8,pago_pendiente_restaurante boolean,restaurante_id uuid,restaurante_lat float8,restaurante_lng float8,lat float8,lng float8);
CREATE TABLE eats_order_notifications(id uuid PRIMARY KEY,pedido_id uuid,recipient text,kind text DEFAULT 'restaurant_receipt',state text,
 provider_id text,provider_status text,error_code text,price numeric,currency text,lease_until timestamptz,
 recoveries integer DEFAULT 0,attempts integer DEFAULT 0,next_attempt_at timestamptz DEFAULT now(),lease_token uuid,group_key text,
 sequence integer DEFAULT 0,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE eats_notification_settings(enabled boolean);INSERT INTO eats_notification_settings VALUES(true);
CREATE TABLE pedido_logs(pedido_id uuid,accion text,detalles text);
-- Deterministic geometry substitutes isolate eligibility/ranking. Real PostGIS is checked separately.
CREATE DOMAIN geography AS float8[];
CREATE FUNCTION st_makepoint(float8,float8) RETURNS float8[] LANGUAGE sql IMMUTABLE AS $$SELECT ARRAY[$1,$2]$$;
CREATE FUNCTION st_setsrid(float8[],integer) RETURNS geography LANGUAGE sql IMMUTABLE AS $$SELECT $1::geography$$;
CREATE FUNCTION st_distancesphere(geography,geography) RETURNS float8 LANGUAGE sql IMMUTABLE AS $$SELECT sqrt(power($1[1]-$2[1],2)+power($1[2]-$2[2],2))*100000$$;
CREATE FUNCTION st_dwithin(geography,geography,float8) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT st_distancesphere($1,$2)<=$3$$;
SELECT set_config('test.role','service_role',false);

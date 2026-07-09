CREATE OR REPLACE FUNCTION public.buscar_repartidores_cercanos(
  p_lat double precision, 
  p_lng double precision, 
  p_radio_metros double precision DEFAULT 5000,
  p_cliente_lat double precision DEFAULT NULL,
  p_cliente_lng double precision DEFAULT NULL
)
 RETURNS TABLE(
   repartidor_id uuid, 
   user_id uuid, 
   distancia_metros double precision, 
   score double precision, 
   bateria integer, 
   meta_envios integer,
   viaje_apilado boolean 
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH driver_stats AS (
        SELECT 
            r.id,
            r.user_id,
            r.lat,
            r.lng,
            COALESCE(r.bateria, 0) AS bateria,
            COALESCE(r.meta_envios, 0) AS meta_envios,
            
            -- Cantidad real de pedidos activos cruzando con la tabla pedidos
            (SELECT COUNT(*) FROM public.pedidos p WHERE p.repartidor_id = r.id AND p.estado IN ('asignado', 'en_camino', 'recibido')) AS pedidos_activos,
            
            -- Obtener la lat/lng de entrega del último pedido activo (si tiene) para ver hacia dónde se dirige
            (SELECT p.lat_entrega FROM public.pedidos p WHERE p.repartidor_id = r.id AND p.estado IN ('asignado', 'en_camino', 'recibido') ORDER BY p.created_at DESC LIMIT 1) AS ultimo_destino_lat,
            (SELECT p.lng_entrega FROM public.pedidos p WHERE p.repartidor_id = r.id AND p.estado IN ('asignado', 'en_camino', 'recibido') ORDER BY p.created_at DESC LIMIT 1) AS ultimo_destino_lng,
            
            -- Distancia al restaurante (origen)
            ST_DistanceSphere(
                ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326),
                ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
            ) AS dist_origen
        FROM public.repartidores r
        WHERE r.activo = true 
            AND r.lat IS NOT NULL 
            AND r.lng IS NOT NULL
            AND COALESCE(r.bateria, 0) >= 15
    )
    SELECT 
        d.id AS repartidor_id,
        d.user_id,
        d.dist_origen AS distancia_metros,
        -- Score Híbrido: Distancia + Batería + Histórico + Penalización Pesada por Apilamiento
        -- (Los repartidores que ya tienen viajes suman +2000 al score, por lo que pasan al final de la cola,
        -- asegurando un round-robin justo. Solo se les asignará si los libres están más lejos o no existen).
        (
            (d.dist_origen * 0.5) 
            - (d.bateria * 10) 
            + (d.meta_envios * 50) 
            + (d.pedidos_activos * 2000) 
        ) AS score,
        d.bateria,
        d.meta_envios,
        (d.pedidos_activos > 0) AS viaje_apilado
    FROM driver_stats d
    WHERE d.dist_origen <= p_radio_metros
      AND d.pedidos_activos < 3 -- REGLA ORO: NUNCA MÁS DE 3 PEDIDOS SIMULTÁNEOS
      AND (
          d.pedidos_activos = 0 -- Si está libre, entra como candidato perfecto
          OR 
          (
             -- Validamos zonas cercanas
             p_cliente_lat IS NULL 
             OR d.ultimo_destino_lat IS NULL
             OR 
             -- La distancia entre el punto de entrega de su pedido actual y el punto del NUEVO pedido es menor a 2.5km
             ST_DistanceSphere(
                ST_SetSRID(ST_MakePoint(d.ultimo_destino_lng, d.ultimo_destino_lat), 4326),
                ST_SetSRID(ST_MakePoint(p_cliente_lng, p_cliente_lat), 4326)
             ) <= 2500
          )
          OR
          (
             -- Si van a zonas totalmente OPUESTAS (dist > 2.5km), SOLO lo aceptamos si está por quedar libre
             p_cliente_lat IS NOT NULL 
             AND d.ultimo_destino_lat IS NOT NULL
             AND ST_DistanceSphere(
                ST_SetSRID(ST_MakePoint(d.ultimo_destino_lng, d.ultimo_destino_lat), 4326),
                ST_SetSRID(ST_MakePoint(p_cliente_lng, p_cliente_lat), 4326)
             ) > 2500
             -- Está a menos de 1km de llegar al cliente de su entrega actual
             AND ST_DistanceSphere(
                ST_SetSRID(ST_MakePoint(d.lng, d.lat), 4326),
                ST_SetSRID(ST_MakePoint(d.ultimo_destino_lng, d.ultimo_destino_lat), 4326)
             ) <= 1000
          )
      )
    ORDER BY score ASC
    LIMIT 10;
END;
$function$;

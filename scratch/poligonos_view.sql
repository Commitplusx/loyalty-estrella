-- Vista para extraer Polígonos como GeoJSON
CREATE OR REPLACE VIEW public.vw_poligonos AS 
SELECT 
    id, 
    nombre, 
    precio, 
    etiqueta_zona, 
    ST_AsGeoJSON(geom)::jsonb as geojson, 
    'colonia' as tipo 
FROM public.colonias 
WHERE geom IS NOT NULL
UNION ALL
SELECT 
    id, 
    nombre, 
    precio, 
    NULL as etiqueta_zona, 
    ST_AsGeoJSON(geom)::jsonb as geojson, 
    'zona_kml' as tipo 
FROM public.zonas_kml 
WHERE geom IS NOT NULL AND activo = true;

-- Asegurar permisos
GRANT SELECT ON public.vw_poligonos TO anon, authenticated;

-- RPC para actualizar la geometría desde un arreglo de coordenadas de Flutter
-- Recibe un ID, el tipo ('colonia' o 'zona_kml') y un arreglo de pares [lng, lat]
CREATE OR REPLACE FUNCTION public.update_poligono_geom(
    p_id uuid,
    p_tipo text,
    p_coords jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_geojson text;
    v_geom geometry;
BEGIN
    -- Validar que p_coords es un arreglo válido de coordenadas para formar un polígono
    -- El JSON viene como: [[lng, lat], [lng, lat], ...]
    -- El último punto debe ser igual al primero para cerrar el polígono
    
    -- Crear una estructura GeoJSON válida
    v_geojson := json_build_object(
        'type', 'Polygon',
        'coordinates', json_build_array(p_coords)
    )::text;
    
    -- Convertir a geometría con SRID 4326
    v_geom := ST_SetSRID(ST_GeomFromGeoJSON(v_geojson), 4326);
    
    -- Actualizar la tabla correspondiente
    IF p_tipo = 'colonia' THEN
        UPDATE public.colonias SET geom = v_geom WHERE id = p_id;
    ELSIF p_tipo = 'zona_kml' THEN
        UPDATE public.zonas_kml SET geom = v_geom WHERE id = p_id;
    ELSE
        RAISE EXCEPTION 'Tipo no válido. Debe ser "colonia" o "zona_kml"';
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_poligono_geom TO authenticated, anon;

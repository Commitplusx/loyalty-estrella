CREATE OR REPLACE FUNCTION resolve_address_to_coords(p_address TEXT)
RETURNS TABLE (
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    nombre TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ST_Y(ST_Centroid(geom)) as lat,
        ST_X(ST_Centroid(geom)) as lng,
        k.nombre::text
    FROM kml_zonas k
    WHERE unaccent(k.nombre) ILIKE unaccent('%' || p_address || '%')
       OR k.nombre ILIKE '%' || p_address || '%'
    ORDER BY char_length(k.nombre) ASC
    LIMIT 1;
END;
$$;

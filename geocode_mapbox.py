import time
import json
import requests
from urllib.parse import quote

MAPBOX_TOKEN = "pk.eyJ1IjoiZGVpZmZ4ZCIsImEiOiJjbW9ha2UybG4wNzJiMnJwcHJteXFua3BmIn0.hASM0wsh3h4QYqnBNHwa1A"
# Centro de Comitán para que Mapbox priorice resultados cercanos
COMITAN_LNG = -92.1345
COMITAN_LAT = 16.2514

ZONAS = {
    "verde":    { "precio": 45, "precio_max": None, "emoji": "🟢", "colonias": [
        "CENTRO", "SAN SEBASTIAN", "SAN AGUSTIN", "PUENTE HIDALGO", "BELISARIO",
        "BARRIO EL 25", "PILA", "PILITA", "SAN JOSE", "JESUSITO", "CANDELARIA",
        "INFONAVIT", "GUADALUPE", "FRACC LAS FLORES", "FOVISSTE", "SANTA ANA",
        "FRACC 28 DE AGOSTO", "LA POPULAR", "MONTE VERDE", "MICROONDAS", "LA PILETA",
        "MAGUEYES", "YALCHIVOL", "FRACC MAYA", "FRACC LOS PINOS", "ARENAL",
        "FRACC TERRAZAS", "EL ROSARIO", "1RO DE MAYO", "LATINO AMERICANA",
        "ORQUIDEAS", "EL HERRAJE", "COL ESMERALDA", "COL LUIS DONALDO COLOSIO",
        "BELLAVISTA", "SIETE ESQUINAS", "NICALOKOCK", "FRACC LOS LAGOS", "FRACC 9 ESTRELLAS"
    ]},
    "azul":    { "precio": 50, "precio_max": None, "emoji": "🔵", "colonias": [
        "CRUZ GRANDE", "SANTA CECILIA", "LA CUEVA", "ARBOLEDAS", "BOSQUES",
        "SAN MARTIN", "BETHEL", "COMITLAN", "MARIANO N RUIZ", "LOS SABINOS",
        "FRACC PRADO", "FRACC TUCANES", "ROSARIO", "CHICHIMA GUADALUPE", "CHILCAS",
        "BONAMPAK", "MIRAMAR", "CERRITO", "CEDRO", "JERUSALEN", "SAN ANTONIO",
        "JORDAN", "SAN MIGUEL", "LA REPRESA", "PASHTON", "TENAM",
        "COMITAN COLONIAL", "LINDA VISTA"
    ]},
    "amarilla": { "precio": 55, "precio_max": 60, "emoji": "🟡", "colonias": [
        "TINAJAS", "DESAMPARADOS", "27 DE JUNIO", "PASHTON ACAPULCO",
        "20 DE NOVIEMBRE", "CHICHIMA ACAPETAHUA", "PLAZA LAS FLORES"
    ]},
    "roja":    { "precio": 70, "precio_max": None, "emoji": "🔴", "colonias": [
        "ENTRONQUE CHICHIMA", "LA COCA", "GAS VILLATORO"
    ]},
}

def geocode_mapbox(nombre):
    query = f"{nombre}, Comitán de Domínguez, Chiapas, México"
    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{quote(query)}.json"
    params = {
        "access_token": MAPBOX_TOKEN,
        "country": "mx",
        "language": "es",
        "limit": 1,
        "proximity": f"{COMITAN_LNG},{COMITAN_LAT}",
        "bbox": "-92.20,16.18,-92.09,16.32"  # Bounding box de Comitán
    }
    try:
        res = requests.get(url, params=params, timeout=10)
        data = res.json()
        features = data.get("features", [])
        if features:
            lng, lat = features[0]["geometry"]["coordinates"]
            place_name = features[0]["place_name"]
            return lat, lng, place_name
    except Exception as e:
        print(f"   Error: {e}")
    return None, None, ""

def main():
    print("🚀 Geocodificando zonas de Comitán con Mapbox API...")
    print("=" * 60)

    resultados = []
    sql_lines = ["-- Colonias geocodificadas con Mapbox API para Estrella Delivery", "-- Pegar en Supabase SQL Editor\n"]
    # Aseguramos columnas necesarias
    sql_lines.append("ALTER TABLE colonias ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;")
    sql_lines.append("ALTER TABLE colonias ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;")
    sql_lines.append("ALTER TABLE colonias ADD COLUMN IF NOT EXISTS etiqueta_zona TEXT DEFAULT 'rojo';")
    sql_lines.append("ALTER TABLE colonias ADD COLUMN IF NOT EXISTS precio INT;")
    sql_lines.append("ALTER TABLE colonias ADD COLUMN IF NOT EXISTS precio_max INT;\n")

    total = sum(len(v["colonias"]) for v in ZONAS.values())
    contador = 0
    con_gps = 0

    for zona, info in ZONAS.items():
        emoji = info["emoji"]
        precio = info["precio"]
        precio_max = info["precio_max"]
        print(f"\n{emoji} ZONA {zona.upper()} (${precio}{f'-${precio_max}' if precio_max else ''})")
        print("-" * 45)

        for nombre in info["colonias"]:
            contador += 1
            lat, lng, place = geocode_mapbox(nombre)

            if lat and lng:
                print(f"  ✅ [{contador}/{total}] {nombre}")
                print(f"       → {lat:.5f}, {lng:.5f}")
                con_gps += 1
                nombre_sql = nombre.replace("'", "''")
                precio_max_sql = str(precio_max) if precio_max else "NULL"
                sql_lines.append(
                    f"INSERT INTO colonias (nombre, ciudad, etiqueta_zona, lat, lng, precio, precio_max) "
                    f"VALUES ('{nombre_sql}', 'Comitán', '{zona}', {lat}, {lng}, {precio}, {precio_max_sql}) "
                    f"ON CONFLICT (nombre) DO UPDATE SET etiqueta_zona='{zona}', lat={lat}, lng={lng}, precio={precio}, precio_max={precio_max_sql};"
                )
            else:
                print(f"  ⚠️  [{contador}/{total}] {nombre} → sin GPS")
                nombre_sql = nombre.replace("'", "''")
                precio_max_sql = str(precio_max) if precio_max else "NULL"
                sql_lines.append(
                    f"INSERT INTO colonias (nombre, ciudad, etiqueta_zona, precio, precio_max) "
                    f"VALUES ('{nombre_sql}', 'Comitán', '{zona}', {precio}, {precio_max_sql}) "
                    f"ON CONFLICT (nombre) DO UPDATE SET etiqueta_zona='{zona}', precio={precio}, precio_max={precio_max_sql};"
                )

            resultados.append({"nombre": nombre, "zona": zona, "precio": precio, "lat": lat, "lng": lng})
            time.sleep(0.1)  # Mapbox permite 600 req/min, somos respetuosos

    # Guardar archivos
    with open("insert_colonias_mapbox.sql", "w", encoding="utf-8") as f:
        f.write("\n".join(sql_lines))

    with open("colonias_gps.json", "w", encoding="utf-8") as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 60}")
    print(f"🎉 COMPLETADO: {con_gps}/{total} colonias con GPS exacto")
    print(f"📄 SQL listo: insert_colonias_mapbox.sql")
    print(f"📁 JSON listo: colonias_gps.json")
    print(f"\n🔜 Siguiente: Ejecutar el SQL en Supabase para activar el mapa")

if __name__ == "__main__":
    main()

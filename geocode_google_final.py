import csv
import time
import json
import requests
from urllib.parse import quote

GOOGLE_API_KEY = "AIzaSyBOZkp595ze0Agwb7yPG5u7MD29EL9gHMw"

# Tabulador maestro de zonas
ZONA_MAP = {
    # VERDE $45
    "CENTRO": ("verde", 45, None), "SAN SEBASTIAN": ("verde", 45, None),
    "SAN AGUSTIN": ("verde", 45, None), "PUENTE HIDALGO": ("verde", 45, None),
    "BELISARIO": ("verde", 45, None), "BARRIO EL 25": ("verde", 45, None),
    "PILA": ("verde", 45, None), "PILITA": ("verde", 45, None),
    "SAN JOSE": ("verde", 45, None), "JESUSITO": ("verde", 45, None),
    "CANDELARIA": ("verde", 45, None), "INFONAVIT": ("verde", 45, None),
    "GUADALUPE": ("verde", 45, None), "LAS FLORES": ("verde", 45, None),
    "FOVISSTE": ("verde", 45, None), "SANTA ANA": ("verde", 45, None),
    "28 DE AGOSTO": ("verde", 45, None), "LA POPULAR": ("verde", 45, None),
    "MONTE VERDE": ("verde", 45, None), "MICROONDAS": ("verde", 45, None),
    "LA PILETA": ("verde", 45, None), "MAGUEYES": ("verde", 45, None),
    "YALCHIVOL": ("verde", 45, None), "MAYA": ("verde", 45, None),
    "LOS PINOS": ("verde", 45, None), "ARENAL": ("verde", 45, None),
    "TERRAZAS": ("verde", 45, None), "EL ROSARIO": ("verde", 45, None),
    "1RO DE MAYO": ("verde", 45, None), "PRIMERO DE MAYO": ("verde", 45, None),
    "LATINO AMERICANA": ("verde", 45, None), "ORQUIDEAS": ("verde", 45, None),
    "EL HERRAJE": ("verde", 45, None), "ESMERALDA": ("verde", 45, None),
    "LUIS DONALDO COLOSIO": ("verde", 45, None), "COLOSIO": ("verde", 45, None),
    "BELLAVISTA": ("verde", 45, None), "BELLA VISTA": ("verde", 45, None),
    "SIETE ESQUINAS": ("verde", 45, None), "NICALOKOCK": ("verde", 45, None),
    "LOS LAGOS": ("verde", 45, None), "9 ESTRELLAS": ("verde", 45, None),
    "NUEVE ESTRELLAS": ("verde", 45, None),
    # AZUL $50
    "CRUZ GRANDE": ("azul", 50, None), "SANTA CECILIA": ("azul", 50, None),
    "CUEVA": ("azul", 50, None), "LA CUEVA": ("azul", 50, None),
    "ARBOLEDAS": ("azul", 50, None), "BOSQUES": ("azul", 50, None),
    "SAN MARTIN": ("azul", 50, None), "BETHEL": ("azul", 50, None),
    "COMITLAN": ("azul", 50, None), "MARIANO N RUIZ": ("azul", 50, None),
    "MARIANO RUIZ": ("azul", 50, None), "LOS SABINOS": ("azul", 50, None),
    "SABINOS": ("azul", 50, None), "PRADO": ("azul", 50, None),
    "TUCANES": ("azul", 50, None), "ROSARIO": ("azul", 50, None),
    "CHICHIMA GUADALUPE": ("azul", 50, None), "CHICHIMÁ GUADALUPE": ("azul", 50, None),
    "CHILCAS": ("azul", 50, None), "BONAMPAK": ("azul", 50, None),
    "MIRAMAR": ("azul", 50, None), "CERRITO": ("azul", 50, None),
    "CEDRO": ("azul", 50, None), "JERUSALEN": ("azul", 50, None),
    "SAN ANTONIO": ("azul", 50, None), "JORDAN": ("azul", 50, None),
    "SAN MIGUEL": ("azul", 50, None), "LA REPRESA": ("azul", 50, None),
    "PASHTON": ("azul", 50, None), "TENAM": ("azul", 50, None),
    "COMITAN COLONIAL": ("azul", 50, None), "LINDA VISTA": ("azul", 50, None),
    # AMARILLA $55-60
    "TINAJAS": ("amarilla", 55, 60), "DESAMPARADOS": ("amarilla", 55, 60),
    "27 DE JUNIO": ("amarilla", 55, 60), "PASHTON ACAPULCO": ("amarilla", 55, 60),
    "20 DE NOVIEMBRE": ("amarilla", 55, 60), "CHICHIMA ACAPETAHUA": ("amarilla", 55, 60),
    "CHICHIMÁ ACAPETAHUA": ("amarilla", 55, 60), "PLAZA LAS FLORES": ("amarilla", 55, 60),
    # ROJA $70+
    "ENTRONQUE CHICHIMA": ("roja", 70, None), "LA COCA": ("roja", 70, None),
    "GAS VILLATORO": ("roja", 70, None),
}

def buscar_zona(nombre):
    nombre_upper = nombre.upper().strip()
    if nombre_upper in ZONA_MAP:
        return ZONA_MAP[nombre_upper]
    for clave, datos in ZONA_MAP.items():
        if clave in nombre_upper or nombre_upper in clave:
            return datos
    return ("rojo", 45, None)

def geocode_google(nombre):
    query = f"{nombre}, Comitán de Domínguez, Chiapas, México"
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {
        "address": query,
        "key": GOOGLE_API_KEY,
        "language": "es"
    }
    try:
        res = requests.get(url, params=params, timeout=10)
        data = res.json()
        if data["status"] == "OK":
            loc = data["results"][0]["geometry"]["location"]
            return loc["lat"], loc["lng"]
    except Exception as e:
        print(f"   Error: {e}")
    return None, None

def main():
    print("🚀 INICIANDO GEOCODIFICACIÓN FINAL CON GOOGLE MAPS...")
    print("=" * 65)

    with open("colonias_comitan_oficial.csv", encoding="utf-8") as f:
        colonias_csv = list(csv.DictReader(f))

    nombres_csv = {r["Colonia"].upper().strip() for r in colonias_csv}
    extras = []
    for nombre_zona in ZONA_MAP.keys():
        if nombre_zona not in nombres_csv:
            extras.append({"Colonia": nombre_zona.title(), "CP": "30000", "Tipo": "Colonia"})

    todas = colonias_csv + extras
    total = len(todas)
    print(f"📌 Procesando {total} colonias...\n")

    sql_lines = [
        "-- Padrón FINAL con Google Maps API",
        "ALTER TABLE colonias ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;",
        "ALTER TABLE colonias ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;",
        "ALTER TABLE colonias ADD COLUMN IF NOT EXISTS etiqueta_zona TEXT DEFAULT 'rojo';",
        "ALTER TABLE colonias ADD COLUMN IF NOT EXISTS precio INT DEFAULT 45;",
        "ALTER TABLE colonias ADD COLUMN IF NOT EXISTS precio_max INT;\n"
    ]

    contadores = {"verde": 0, "azul": 0, "amarilla": 0, "roja": 0, "rojo": 0}

    for i, row in enumerate(todas):
        nombre = row["Colonia"].strip()
        zona, precio, precio_max = buscar_zona(nombre)
        lat, lng = geocode_google(nombre)

        contadores[zona] += 1
        emoji = {"verde": "🟢", "azul": "🔵", "amarilla": "🟡", "rojo": "🔴", "roja": "🔴"}.get(zona, "❓")
        gps_str = f"{lat:.6f},{lng:.6f}" if lat else "NO ENCONTRADA"
        
        print(f"  {emoji} [{i+1}/{total}] {nombre} → {gps_str}")

        if lat:
            nombre_sql = nombre.replace("'", "''")
            precio_max_sql = str(precio_max) if precio_max else "NULL"
            sql_lines.append(
                f"INSERT INTO colonias (nombre, ciudad, etiqueta_zona, lat, lng, precio, precio_max) "
                f"VALUES ('{nombre_sql}', 'Comitán', '{zona}', {lat}, {lng}, {precio}, {precio_max_sql}) "
                f"ON CONFLICT (nombre) DO UPDATE SET etiqueta_zona='{zona}', lat={lat}, lng={lng}, precio={precio}, precio_max={precio_max_sql};"
            )
        
        time.sleep(0.05) # Google es rápido

    with open("padron_google_final.sql", "w", encoding="utf-8") as f:
        f.write("\n".join(sql_lines))

    print(f"\n{'=' * 65}")
    print(f"🎉 ¡PROCESO TERMINADO!")
    print(f"📄 SQL generado: padron_google_final.sql")

if __name__ == "__main__":
    main()

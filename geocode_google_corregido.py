import csv
import time
import json
import requests
from urllib.parse import quote

GOOGLE_API_KEY = "AIzaSyBOZkp595ze0Agwb7yPG5u7MD29EL9gHMw"

# Tabulador maestro de zonas
ZONA_MAP = {
    "verde": 45, "azul": 50, "amarilla": 55, "roja": 70
}

def buscar_zona_y_precio(nombre):
    nombre_upper = nombre.upper().strip()
    # Aquí iría la lógica de tu lista de zonas (Verde, Azul, etc.)
    # Por ahora simplificamos para la geocodificación masiva
    return "rojo", 45, None

def geocode_google(nombre_real, tipo):
    # Combinamos "Barrio San Jose" o "Fraccionamiento Las Flores" para máxima precisión
    query = f"{tipo} {nombre_real}, Comitán de Domínguez, Chiapas, México"
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
            addr = data["results"][0].get("formatted_address", "")
            return loc["lat"], loc["lng"], addr
    except Exception as e:
        print(f"   Error: {e}")
    return None, None, ""

def main():
    print("🚀 CORRIGIENDO Y GEOCODIFICANDO CON NOMBRES REALES...")
    print("=" * 65)

    with open("colonias_comitan_oficial.csv", encoding="utf-8") as f:
        # Forzamos los nombres de columnas porque el CSV original está mal etiquetado
        reader = csv.reader(f)
        header = next(reader) # Saltamos el header malo
        todas = list(reader)

    total = len(todas)
    print(f"📌 Procesando {total} colonias con nombres corregidos...\n")

    sql_lines = ["-- Padrón CORREGIDO con Google Maps API"]
    
    for i, row in enumerate(todas):
        if len(row) < 3: continue
        
        tipo_lugar = row[0].strip()   # "Barrio", "Fraccionamiento"
        nombre_lugar = row[1].strip() # "San Jose", "20 de Noviembre"
        cp = row[2].strip()           # "30000"
        
        lat, lng, addr = geocode_google(nombre_lugar, tipo_lugar)
        
        if lat:
            print(f"  ✅ [{i+1}/{total}] {tipo_lugar} {nombre_lugar} → {lat:.6f}, {lng:.6f}")
            nombre_sql = nombre_lugar.replace("'", "''")
            sql_lines.append(
                f"INSERT INTO colonias (nombre, ciudad, cp, lat, lng) "
                f"VALUES ('{nombre_sql}', 'Comitán', '{cp}', {lat}, {lng}) "
                f"ON CONFLICT (nombre) DO UPDATE SET lat={lat}, lng={lng}, cp='{cp}';"
            )
        else:
            print(f"  ❌ [{i+1}/{total}] {tipo_lugar} {nombre_lugar} → NO ENCONTRADA")
        
        time.sleep(0.04)

    with open("padron_google_corregido.sql", "w", encoding="utf-8") as f:
        f.write("\n".join(sql_lines))

    print(f"\n{'=' * 65}")
    print(f"🎉 ¡PROCESO CORREGIDO TERMINADO!")
    print(f"📄 SQL generado: padron_google_corregido.sql")

if __name__ == "__main__":
    main()

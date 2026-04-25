import csv
import time
import json
import requests

GOOGLE_API_KEY = "AIzaSyA0o5nSa5mc8QUcyFjkH71oQ3PuRgymmL4"
GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json"

def geocode_con_google(nombre_colonia):
    """Geocodifica una colonia usando Google Maps con el contexto completo de Comitán."""
    query = f"{nombre_colonia}, Comitán de Domínguez, Chiapas, México"
    params = {
        "address": query,
        "key": GOOGLE_API_KEY,
        "language": "es",
        "region": "mx",
        # Bounding box de Comitán para que Google no se vaya a otra ciudad
        "bounds": "16.18,-92.20|16.32,-92.09"
    }
    try:
        res = requests.get(GEOCODING_URL, params=params, timeout=10)
        data = res.json()
        if data.get("status") == "OK" and data.get("results"):
            result = data["results"][0]
            loc = result["geometry"]["location"]
            formatted = result.get("formatted_address", "")
            # Verificar que el resultado esté en Chiapas/Comitán
            if "Chiapas" in formatted or "Comitán" in formatted:
                return loc["lat"], loc["lng"], formatted
            else:
                # Google nos mandó lejos, intentamos más restrictivo
                print(f"   ⚠️  Google devolvió fuera de Comitán: {formatted}")
                return None, None, formatted
        else:
            return None, None, data.get("status", "ERROR")
    except Exception as e:
        return None, None, str(e)

def main():
    print("🚀 Iniciando geocodificación con Google Maps API...")
    print("📍 Ciudad objetivo: Comitán de Domínguez, Chiapas, México\n")

    resultados = []
    no_encontradas = []

    with open("colonias_comitan_oficial.csv", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        colonias = list(reader)

    total = len(colonias)
    print(f"📋 Total de colonias a procesar: {total}\n")

    for i, row in enumerate(colonias):
        nombre = row["Colonia"]
        cp = row.get("CP", "")
        tipo = row.get("Tipo", "")

        lat, lng, formatted = geocode_con_google(nombre)

        if lat and lng:
            resultados.append({
                "nombre": nombre,
                "cp": cp,
                "tipo": tipo,
                "lat": lat,
                "lng": lng,
                "formatted_address": formatted
            })
            print(f"✅ [{i+1}/{total}] {nombre} → {lat:.6f}, {lng:.6f}")
        else:
            no_encontradas.append(nombre)
            print(f"❌ [{i+1}/{total}] {nombre} → No localizada ({formatted})")

        # Google Maps permite ~50 req/s pero respetamos 5/s para no exceder cuota
        time.sleep(0.2)

    # ── Guardar resultados como CSV ──────────────────────────────────────
    with open("colonias_con_gps.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["nombre", "cp", "tipo", "lat", "lng", "formatted_address"])
        writer.writeheader()
        writer.writerows(resultados)
    print(f"\n📁 CSV guardado: colonias_con_gps.csv ({len(resultados)} colonias con GPS)")

    # ── Generar SQL para actualizar Supabase ─────────────────────────────
    sql_lines = ["-- Coordenadas GPS obtenidas con Google Maps Geocoding API\n"]
    for r in resultados:
        nombre_sql = r["nombre"].replace("'", "''")
        sql_lines.append(
            f"UPDATE colonias SET lat = {r['lat']}, lng = {r['lng']} "
            f"WHERE UPPER(nombre) = UPPER('{nombre_sql}');"
        )

    with open("update_gps_google.sql", "w", encoding="utf-8") as f:
        f.write("\n".join(sql_lines))
    print(f"📄 SQL guardado: update_gps_google.sql")

    # ── Resumen ──────────────────────────────────────────────────────────
    print(f"\n{'='*50}")
    print(f"🎉 RESUMEN FINAL")
    print(f"   ✅ Con GPS:       {len(resultados)}/{total}")
    print(f"   ❌ Sin GPS:       {len(no_encontradas)}/{total}")
    if no_encontradas:
        print(f"\n   Colonias sin localizar:")
        for c in no_encontradas:
            print(f"     - {c}")
    print(f"{'='*50}")
    print(f"\n🔜 Siguiente paso: Ejecuta el SQL en Supabase con:")
    print(f"   python3 apply_sql.py")

if __name__ == "__main__":
    main()

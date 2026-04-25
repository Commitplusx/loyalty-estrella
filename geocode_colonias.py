import csv
import time
import requests

def geocode_colonias():
    print("🚀 Iniciando geolocalización de las 169 colonias...")
    sql_updates = "ALTER TABLE colonias ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;\nALTER TABLE colonias ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;\n\n"
    
    headers = {
        'User-Agent': 'EstrellaDeliveryBot/1.0 (contacto@estrelladelivery.com)'
    }

    exitos = 0
    fallos = 0

    with open("colonias_comitan_oficial.csv", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            colonia = row["Colonia"]
            # Preparamos la consulta para Nominatim (OpenStreetMap)
            query = f"{colonia}, Comitán de Domínguez, Chiapas, Mexico"
            url = f"https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=1"
            
            try:
                # Respetamos el rate limit de Nominatim (1 req/sec)
                time.sleep(1.2)
                res = requests.get(url, headers=headers)
                data = res.json()
                
                if data and len(data) > 0:
                    lat = data[0]['lat']
                    lng = data[0]['lon']
                    # Generar SQL update
                    nombre_sql = colonia.replace("'", "''")
                    sql_updates += f"UPDATE colonias SET lat = {lat}, lng = {lng} WHERE nombre = '{nombre_sql}';\n"
                    print(f"✅ [{i+1}/169] {colonia} -> {lat}, {lng}")
                    exitos += 1
                else:
                    # Si falla, intentamos con solo Comitán
                    print(f"⚠️ [{i+1}/169] {colonia} -> No encontrada con precisión exacta.")
                    fallos += 1
            except Exception as e:
                print(f"❌ Error en {colonia}: {e}")

    # Guardar en archivo SQL
    with open("update_coordenadas.sql", "w", encoding="utf-8") as f:
        f.write(sql_updates)
    
    print(f"\n🎉 ¡Proceso finalizado! {exitos} exitosas, {fallos} manuales.")
    print("El archivo 'update_coordenadas.sql' está listo para ejecutarse en la base de datos.")

if __name__ == "__main__":
    geocode_colonias()

import requests
import csv

# Definimos la consulta para la Overpass API
# Buscamos en el área de Comitán de Domínguez, Chiapas
overpass_url = "http://overpass-api.de/api/interpreter"
overpass_query = """
[out:json][timeout:25];
area["name"="Comitán de Domínguez"]->.searchArea;
(
  node["addr:suburb"](area.searchArea);
  way["addr:suburb"](area.searchArea);
  node["addr:street"](area.searchArea);
  way["addr:street"](area.searchArea);
  node["place"~"suburb|neighbourhood"](area.searchArea);
);
out body;
>;
out skel qt;
"""

def extract_comitan_data():
    print("🚀 Iniciando escaneo de Comitán... esto puede tardar unos segundos.")
    headers = {'User-Agent': 'EstrellaDeliveryBot/1.0 (contacto@estrelladelivery.com)'}
    response = requests.get(overpass_url, params={'data': overpass_query}, headers=headers)
    
    if response.status_code != 200:
        print("❌ Error al conectar con el servidor de mapas.")
        return

    data = response.json()
    elements = data.get('elements', [])
    
    # Usamos un set para evitar duplicados
    resultados = set()

    for element in elements:
        tags = element.get('tags', {})
        # Extraemos los datos clave
        colonia = tags.get('addr:suburb') or tags.get('name') or tags.get('place')
        calle = tags.get('addr:street', 'N/A')
        cp = tags.get('addr:postcode', 'N/A')
        
        # Filtramos para que solo guarde si tiene al menos nombre de colonia
        if colonia and len(colonia) > 2:
            resultados.add((colonia, cp, calle))

    # Guardamos en CSV
    with open('comitan_geo_data.csv', mode='w', newline='', encoding='utf-8') as file:
        writer = csv.writer(file)
        writer.writerow(['Colonia/Barrio', 'CP', 'Calle'])
        for row in sorted(resultados):
            writer.writerow(row)

    print(f"✅ ¡Listo! Se extrajeron {len(resultados)} registros únicos.")
    print("📁 Archivo guardado como: comitan_geo_data.csv")

if __name__ == "__main__":
    extract_comitan_data()

import requests
from bs4 import BeautifulSoup
import csv

def extraer_colonias_comitan():
    print("🚀 Iniciando extracción del catálogo oficial de Colonias en Comitán...")
    url = "https://micodigopostal.org/chiapas/comitan-de-dominguez/"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
    
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        print("❌ Error al conectar con micodigopostal.org")
        return

    soup = BeautifulSoup(response.text, 'html.parser')
    
    resultados = set()
    
    # micodigopostal usually lists locations in tables or lists
    # Let's find all links or rows that contain the colonias
    bloques = soup.find_all('div', class_='cp')
    if not bloques:
        # Fallback: look for table rows
        rows = soup.find_all('tr')
        for row in rows:
            cols = row.find_all('td')
            if len(cols) >= 3:
                cp = cols[0].text.strip()
                colonia = cols[1].text.strip()
                tipo = cols[2].text.strip()
                resultados.add((colonia, cp, tipo))
    
    # Guardamos en CSV
    if resultados:
        with open('colonias_comitan_oficial.csv', mode='w', newline='', encoding='utf-8') as file:
            writer = csv.writer(file)
            writer.writerow(['Colonia', 'CP', 'Tipo'])
            for row in sorted(resultados):
                writer.writerow(row)
        print(f"✅ ¡Éxito! Se extrajeron {len(resultados)} colonias de Comitán.")
        print("📁 Guardado como: colonias_comitan_oficial.csv")
    else:
        print("⚠️ No se encontraron resultados. La estructura de la página pudo haber cambiado.")

if __name__ == "__main__":
    extraer_colonias_comitan()

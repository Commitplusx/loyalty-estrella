import shapefile from "shapefile";
import fs from "fs";

async function analyze() {
  let countComitan = 0;
  let examples = [];
  let firstProps = null;
  
  try {
    const source = await shapefile.open(
      "C:\\Users\\asus_\\Desktop\\inegi_chiapas\\conjunto_de_datos\\07as.shp",
      "C:\\Users\\asus_\\Desktop\\inegi_chiapas\\conjunto_de_datos\\07as.dbf",
      { encoding: "utf-8" }
    );
    
    while (true) {
      const result = await source.read();
      if (result.done) break;
      
      const feature = result.value;
      const props = feature.properties;
      if (!firstProps) firstProps = props;
      
      if (props.cve_mun === "019") {
        countComitan++;
        let centerLng = 0, centerLat = 0;
        if (feature.geometry && feature.geometry.coordinates) {
          let minX = 999, maxX = -999, minY = 999, maxY = -999;
          const coords = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0] : (feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates[0][0] : []);
          coords.forEach(pt => {
             if (pt[0] < minX) minX = pt[0];
             if (pt[0] > maxX) maxX = pt[0];
             if (pt[1] < minY) minY = pt[1];
             if (pt[1] > maxY) maxY = pt[1];
          });
          if (coords.length > 0) {
            centerLng = (minX + maxX) / 2;
            centerLat = (minY + maxY) / 2;
          }
        }

        examples.push({
          nombre: props.nom_asen,
          municipio_cve: props.cve_mun,
          tipo: props.tipo,
          lat: centerLat.toFixed(6),
          lng: centerLng.toFixed(6)
        });
      }
    }
    
    console.log(`✅ Total de colonias encontradas para Comitán: ${countComitan}`);
    if (countComitan > 0) {
      // Ordenar alfabéticamente
      examples.sort((a, b) => a.nombre.localeCompare(b.nombre));

      let txtContent = "📍 COORDENADAS OFICIALES INEGI - COMITÁN DE DOMÍNGUEZ 📍\n";
      txtContent += "=================================================================\n\n";
      
      examples.forEach(e => {
        // Formato limpio: NOMBRE          ->   Latitud, Longitud    (TIPO)
        txtContent += `${e.nombre.padEnd(45, ' ')} ->   ${e.lat}, ${e.lng}   (${e.tipo})\n`;
      });
      
      fs.writeFileSync("C:\\Users\\asus_\\Desktop\\loyalty-estrella\\colonias_inegi_limpias.txt", txtContent, "utf-8");
      console.log("Archivo guardado en: C:\\Users\\asus_\\Desktop\\loyalty-estrella\\colonias_inegi_limpias.txt");
    } else {
       console.log("No se encontraron colonias para Comitán. Estructura de un registro (para ver qué columnas hay):");
       console.log(firstProps);
    }
    
  } catch (err) {
    console.error("Error reading shapefile:", err);
  }
}

analyze();

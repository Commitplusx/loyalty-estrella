const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Cargar .env.local
const envFile = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
let env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if(match) env[match[1].trim()] = match[2].trim();
});
const supabase = createClient(env['VITE_SUPABASE_URL'], env['VITE_SUPABASE_ANON_KEY']);

async function run() {
  console.log('Iniciando importación de Food Truck Big Red...');
  
  // 1. Restaurante
  const res = {
    nombre: 'Food Truck Big Red',
    descripcion_corta: 'Auténticas hamburguesas de sirloin, hot dogs y costillas ahumadas.',
    es_socio: false, // ¡Clave para modelo Concierge!
    telefono: '9630000000', // Teléfono default para concierge
    direccion: 'Comitán de Domínguez',
    activo: true,
    categorias: ['Hamburguesas', 'Hot Dogs', 'Costillas']
  };

  const { data: resData, error: err1 } = await supabase.from('restaurantes').insert(res).select().single();
  if (err1) { console.error('Error creando restaurante:', err1); return; }
  const rId = resData.id;
  console.log('Restaurante creado ID:', rId);

  // 2. Categorías
  const cats = [
    { restaurante_id: rId, nombre: 'Tradicionales', emoji: '🍔', orden: 1, activa: true },
    { restaurante_id: rId, nombre: 'Del Carrito', emoji: '🚐', orden: 2, activa: true },
    { restaurante_id: rId, nombre: 'Hot Dogs', emoji: '🌭', orden: 3, activa: true },
    { restaurante_id: rId, nombre: 'Tortitas', emoji: '🥪', orden: 4, activa: true },
    { restaurante_id: rId, nombre: 'Costillas Ahumadas', emoji: '🍖', orden: 5, activa: true }
  ];

  const { data: catData, error: err2 } = await supabase.from('menu_categorias').insert(cats).select();
  if (err2) { console.error('Error creando categorías:', err2); return; }
  
  const getCatId = (name) => catData.find(c => c.nombre === name).id;

  // 3. Productos
  const items = [
    // Tradicionales
    { restaurante_id: rId, categoria_id: getCatId('Tradicionales'), nombre: 'Clásica (Una Carne)', descripcion: 'Carne de sirloin, jamón, tocino, queso americano, lechuga orgánica, jitomate, cebolla morada, aguacate, jalapeños, aderezos y pan artesanal.', precio: 140, disponible: true },
    { restaurante_id: rId, categoria_id: getCatId('Tradicionales'), nombre: 'Clásica (Doble Carne)', descripcion: 'Doble carne de sirloin, jamón, tocino, queso americano, vegetales frescos, aderezos y pan artesanal.', precio: 180, disponible: true },
    { restaurante_id: rId, categoria_id: getCatId('Tradicionales'), nombre: 'BBQ (Una Carne)', descripcion: 'Carne de sirloin bañado en salsa BBQ, jamón, tocino, queso americano, vegetales y pan artesanal.', precio: 140, disponible: true },
    { restaurante_id: rId, categoria_id: getCatId('Tradicionales'), nombre: 'BBQ (Doble Carne)', descripcion: 'Doble carne de sirloin bañado en salsa BBQ, jamón, tocino, queso americano, vegetales y pan artesanal.', precio: 180, disponible: true },
    { restaurante_id: rId, categoria_id: getCatId('Tradicionales'), nombre: 'Hawaiana (Una Carne)', descripcion: 'Carne de sirloin, piña asada con canela, jamón, tocino, queso americano, vegetales.', precio: 150, disponible: true },
    { restaurante_id: rId, categoria_id: getCatId('Tradicionales'), nombre: 'Hawaiana (Doble Carne)', descripcion: 'Doble carne de sirloin, piña asada con canela, jamón, tocino, queso americano, vegetales.', precio: 190, disponible: true },
    
    // Del Carrito
    { restaurante_id: rId, categoria_id: getCatId('Del Carrito'), nombre: 'Ahuacamolli (Una Carne)', descripcion: 'Carne de sirloin, queso manchego, queso mozzarella, guacamole, aderezo blue cheese, tocino, lechuga orgánica.', precio: 165, disponible: true },
    { restaurante_id: rId, categoria_id: getCatId('Del Carrito'), nombre: 'Ahuacamolli (Doble Carne)', descripcion: 'Doble carne de sirloin, queso manchego, mozzarella, guacamole, blue cheese, tocino.', precio: 205, disponible: true },
    { restaurante_id: rId, categoria_id: getCatId('Del Carrito'), nombre: 'Big Red (Una Carne)', descripcion: 'Carne de sirloin, costilla ahumada en BBQ con chile ancho, cebolla caramelizada, costra de queso, doble tocino, aderezo chipotle.', precio: 175, disponible: true },
    { restaurante_id: rId, categoria_id: getCatId('Del Carrito'), nombre: 'Big Red (Doble Carne)', descripcion: 'Doble carne de sirloin, costilla ahumada, costra de queso, doble tocino.', precio: 215, disponible: true },
    
    // Hot Dogs
    { restaurante_id: rId, categoria_id: getCatId('Hot Dogs'), nombre: 'Clásico', descripcion: 'Pan de hojaldre, salchicha envuelta en tocino, jitomate, cebolla, jalapeños, aderezo chipotle, mayonesa, mostaza y catsup.', precio: 65, disponible: true },
    { restaurante_id: rId, categoria_id: getCatId('Hot Dogs'), nombre: 'De Costilla', descripcion: 'Pan de hojaldre, salchicha envuelta en tocino, costilla bañada en BBQ y cebolla caramelizada.', precio: 80, disponible: true },
    { restaurante_id: rId, categoria_id: getCatId('Hot Dogs'), nombre: 'El del Personal', descripcion: 'Pan de hojaldre, salchicha y tocino picado, gratinado con gouda, aderezo chipotle, habanero y aguacate.', precio: 85, disponible: true },
    
    // Tortitas
    { restaurante_id: rId, categoria_id: getCatId('Tortitas'), nombre: 'Clásica', descripcion: 'Pan artesanal, queso asadero gratinado, jamón de pavo, tocino, queso americano, vegetales.', precio: 75, disponible: true },
    { restaurante_id: rId, categoria_id: getCatId('Tortitas'), nombre: 'Sandwich de Roast Beef', descripcion: 'Pan brioche, roast beef, lechuga, espinaca, tomate deshidratado, chimichurri y pimiento.', precio: 110, disponible: true },

    // Costillas Ahumadas
    { restaurante_id: rId, categoria_id: getCatId('Costillas Ahumadas'), nombre: 'Media Orden (con papas o ensalada)', descripcion: 'Ahumadas por cinco horas. Incluye guarnición, pan de ajo y quesadilla.', precio: 195, disponible: true },
    { restaurante_id: rId, categoria_id: getCatId('Costillas Ahumadas'), nombre: 'Orden Completa (con papas o ensalada)', descripcion: 'Ahumadas por cinco horas. Incluye guarnición, pan de ajo y quesadilla.', precio: 370, disponible: true },
  ];

  const { error: err3 } = await supabase.from('menu_items').insert(items);
  if (err3) { console.error('Error creando items:', err3); return; }

  console.log('¡Importación completada! Restaurante:', rId, 'con', items.length, 'productos.');
}

run();

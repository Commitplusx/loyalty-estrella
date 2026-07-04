import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
const env = await load();
const key = env['DEEPSEEK_API_KEY'];
const url = 'https://api.deepseek.com/chat/completions';

async function limpiarUbicacionTextoConIA(texto) {
  const model = 'deepseek-chat';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Extrae en JSON: "calle" (vía principal o nombre de negocio), "colonia" (barrio, fracc o zona), "referencias" (entre qué calles, fachada, etc), "destinatario" (nombre de persona a entregar/recoger si existe), "telefono" (si hay). Además añade "esNegocio": true/false (true si el lugar es una tienda, local, restaurante, farmacia, clínica, paquetería, etc). Si no menciona colonia, déjalo null. NO inventes datos.' },
        { role: 'user', content: texto }
      ]
    })
  });
  const json = await res.json();
  const content = json.choices[0].message.content.trim().replace(/```json/gi, '').replace(/```/g, '');
  return JSON.parse(content);
}

const tests = [
  "Voy para el chichima guadalupe, porton negro",
  "por la cruz grande atras de la prepa, con doña mary",
  "en la pilita por los tacos del gordo",
  "barrio san agustin cerca del parque, casa verde de 2 pisos",
  "rumbo a tenam puente adelantito de la gasolinera",
  "Yalchivol, 7a sur ote",
  "belisario dominguez por el cbtis",
  "a la chichima guadalupe, porton negro",
  "recoge en paqueteria castillejos, manda a mi casa en vallecito, dejo 50 varos",
  "voy a la cueva del diablo, por donde esta la bajada fea",
  "fraccionamiento tinaja, atras de la bodega"
];

async function runTests() {
  for (const t of tests) {
    console.log(`\n\n--- TEST: "${t}" ---`);
    const res = await limpiarUbicacionTextoConIA(t);
    console.log(res);
  }
}

runTests();

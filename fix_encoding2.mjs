// fix_encoding2.mjs - Segunda pasada: corrige emojis y chars de 3 bytes
import { readFileSync, writeFileSync } from 'fs'

const file = 'supabase/functions/whatsapp-bot/restaurant-portal.ts'
let text = readFileSync(file, 'utf8')
const original = text

// Mapeo: cada key es la secuencia garbled real leida como UTF-8
// Los chars 3-byte UTF-8 se convierten en 3 chars W1252 al hacer double-encode
// • U+2022 -> [E2,80,A2] -> W1252: â(E2) + €(20AC from 80) + ¢(A2) -> \u00E2\u20AC\u00A2
// — U+2014 -> [E2,80,94] -> W1252: â + € + "(201D from 94) -> \u00E2\u20AC\u201D  
// – U+2013 -> [E2,80,93] -> W1252: â + € + "(201C from 93) -> \u00E2\u20AC\u201C
// → U+2192 -> [E2,86,92] -> W1252: â + †(2020 from 86) + '(2019 from 92) -> \u00E2\u2020\u2019
// ← U+2190 -> [E2,86,90] -> W1252: â + † + '(2018 from 90) -> \u00E2\u2020\u2018
// ' U+2019 -> [E2,80,99] -> W1252: â + € + ™(2122 from 99) -> \u00E2\u20AC\u2122
// " U+201C -> [E2,80,9C] -> W1252: â + € + œ(0153 from 9C) -> \u00E2\u20AC\u0153
// " U+201D -> [E2,80,9D] -> W1252: â + € + (009D) -> \u00E2\u20AC\u009D
// Uppercase accented (byte 2 in 0x80-0x9F W1252 range):
// Ó U+00D3 -> [C3,93] -> W1252: Ã(C3) + "(201C from 93) -> \u00C3\u201C
// É U+00C9 -> [C3,89] -> W1252: Ã + ‰(2030 from 89) -> \u00C3\u2030
// Ú U+00DA -> [C3,9A] -> W1252: Ã + š(0161 from 9A) -> \u00C3\u0161
// Á U+00C1 -> [C3,81] -> W1252: Ã + (0081 ctrl) -> \u00C3\u0081 (control char - tricky)
// í U+00ED -> [C3,AD] -> W1252: Ã + ­(00AD soft-hyphen) -> \u00C3\u00AD (already fixed?)

const fixes = [
  // Uppercase Spanish (2-byte UTF-8, second byte in W1252 special range)
  ['\u00C3\u201C', '\u00D3'],  // Ã" -> Ó (0x93 = " in W1252)
  ['\u00C3\u2030', '\u00C9'],  // Ã‰ -> É (0x89 = ‰ in W1252)
  ['\u00C3\u0161', '\u00DA'],  // Ãš -> Ú (0x9A = š in W1252)
  ['\u00C3\u0081', '\u00C1'],  // Ã\x81 -> Á (0x81 = undefined ctrl in W1252)

  // 3-byte UTF-8 punctuation (3 W1252 chars each)
  ['\u00E2\u20AC\u00A2', '\u2022'],  // â€¢ -> • (bullet)
  ['\u00E2\u20AC\u201D', '\u2014'],  // â€" -> — (em dash)
  ['\u00E2\u20AC\u201C', '\u2013'],  // â€" -> – (en dash)
  ['\u00E2\u2020\u2019', '\u2192'],  // â†' -> → (right arrow)
  ['\u00E2\u2020\u2018', '\u2190'],  // â†' -> ← (left arrow)
  ['\u00E2\u20AC\u2122', '\u2019'],  // â€™ -> ' (right single quote)
  ['\u00E2\u20AC\u0153', '\u201C'],  // â€œ -> " (left double quote)
  ['\u00E2\u20AC\u009D', '\u201D'],  // â€  -> " (right double quote, ctrl char key)
]

for (const [from, to] of fixes) {
  text = text.replaceAll(from, to)
}

// Diagnostico: mostrar cuantos reemplazos se hicieron
if (text !== original) {
  writeFileSync(file, text, 'utf8')
  const count = fixes.reduce((acc, [f]) => acc + (original.split(f).length - 1), 0)
  console.log(`Fixed ${count} occurrences in restaurant-portal.ts`)
} else {
  console.log('No changes needed (or keys still wrong)')
}

// Mostrar primeras 5 lineas para verificar
console.log('\nPrimeras lineas del archivo:')
text.split('\n').slice(0, 5).forEach((l, i) => console.log(`${i+1}: ${l.substring(0, 80)}`))

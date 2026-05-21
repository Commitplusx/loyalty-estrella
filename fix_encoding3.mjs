// fix_encoding3.mjs - Corrige emojis garbled en restaurant-portal.ts
import { readFileSync, writeFileSync } from 'fs'

const file = 'supabase/functions/whatsapp-bot/restaurant-portal.ts'
let text = readFileSync(file, 'utf8')
const original = text

// Emojis comunes en el portal de restaurantes (3-byte UTF-8 garbled via W1252)
// Format: [garbled_string_in_utf8, correct_char]
// Calculo: UTF-8 bytes -> W1252 chars -> re-encoded UTF-8 chars

const emojiMap = [
  // ✅ U+2705: [E2,9C,85] -> â(E2) + œ(0153 from 9C) + …(2026 from 85)
  ['\u00E2\u0153\u2026', '\u2705'],
  // ✅ variante: comprobacion manual con lo que muestra el archivo
  ['\u00E2\u009C\u0085', '\u2705'],

  // ⚠️ U+26A0 + U+FE0F: [E2,9A,A0] -> â + š(0161 from 9A) + \xa0(nbsp)
  ['\u00E2\u0161\u00A0', '\u26A0\uFE0F'],

  // ⏱ U+23F1: [E2,8F,B1] -> â + \x8F(ctrl) + ±(B1)
  ['\u00E2\u008F\u00B1', '\u23F1'],

  // 📦 U+1F4E6 (4-byte): [F0,9F,93,A6] -> ð + Ÿ(0178) + \x93(201C) + ¦(A6)
  ['\u00F0\u0178\u201C\u00A6', '\uD83D\uDCE6'],

  // 📍 U+1F4CD: [F0,9F,93,8D] -> ð + Ÿ + \x93(201C) + \x8D(ctrl)
  ['\u00F0\u0178\u201C\u008D', '\uD83D\uDCCD'],

  // 📞 U+1F4DE: [F0,9F,93,9E] -> ð + Ÿ + \x93(201C) + ž(017E from 9E)
  ['\u00F0\u0178\u201C\u017E', '\uD83D\uDCDE'],

  // 🔴 U+1F534: [F0,9F,94,B4] -> ð + Ÿ + \x94(201D) + ´(B4)
  ['\u00F0\u0178\u201D\u00B4', '\uD83D\uDD34'],

  // 🚨 U+1F6A8: [F0,9F,9A,A8] -> ð + Ÿ + š(0161) + ¨(A8)
  ['\u00F0\u0178\u0161\u00A8', '\uD83D\uDEA8'],

  // 🍽 U+1F37D: [F0,9F,8D,BD] -> ð + Ÿ + \x8D(ctrl) + ½(BD)
  ['\u00F0\u0178\u008D\u00BD', '\uD83C\uDF7D'],

  // 🥳 U+1F973: [F0,9F,A5,B3] -> ð + Ÿ + ¥(A5) + ³(B3)
  ['\u00F0\u0178\u00A5\u00B3', '\uD83E\uDD73'],

  // 💰 U+1F4B0: [F0,9F,92,B0] -> ð + Ÿ + \x92(2019) + °(B0)
  ['\u00F0\u0178\u2019\u00B0', '\uD83D\uDCB0'],

  // ⭐ U+2B50: [E2,AD,90] -> â + ­(00AD soft-hyp) + \x90(ctrl)
  ['\u00E2\u00AD\u0090', '\u2B50'],

  // 🎛 U+1F39B: [F0,9F,8E,9B] -> ð + Ÿ + \x8E(017D) + \x9B(203A)
  ['\u00F0\u0178\u017D\u203A', '\uD83C\uDF9B'],

  // 🗺 U+1F5FA: [F0,9F,97,BA] -> ð + Ÿ + \x97(2014 em-dash) + º(BA)
  ['\u00F0\u0178\u2014\u00BA', '\uD83D\uDDFA'],

  // 🚀 U+1F680: [F0,9F,9A,80] -> ð + Ÿ + š(0161) + €(20AC)
  ['\u00F0\u0178\u0161\u20AC', '\uD83D\uDE80'],

  // 📸 U+1F4F8: [F0,9F,93,B8] -> ð + Ÿ + \x93(201C) + ¸(B8)
  ['\u00F0\u0178\u201C\u00B8', '\uD83D\uDCF8'],

  // 🎟 U+1F39F: [F0,9F,8E,9F] -> ð + Ÿ + \x8E(017D) + \x9F(0178 Ÿ)
  ['\u00F0\u0178\u017D\u0178', '\uD83C\uDF9F'],

  // 🔗 U+1F517: [F0,9F,94,97] -> ð + Ÿ + \x94(201D) + \x97(2014)
  ['\u00F0\u0178\u201D\u2014', '\uD83D\uDD17'],

  // ⏰ U+23F0: [E2,8F,B0] -> â + \x8F(ctrl) + °(B0)
  ['\u00E2\u008F\u00B0', '\u23F0'],

  // 🔔 U+1F514: [F0,9F,94,94] -> ð + Ÿ + \x94(201D) + \x94(201D)
  ['\u00F0\u0178\u201D\u201D', '\uD83D\uDD14'],

  // 🗑 U+1F5D1: [F0,9F,97,91] -> ð + Ÿ + \x97(2014) + \x91(2018)
  ['\u00F0\u0178\u2014\u2018', '\uD83D\uDDD1'],

  // 📋 U+1F4CB: [F0,9F,93,8B] -> ð + Ÿ + \x93(201C) + \x8B(2039)
  ['\u00F0\u0178\u201C\u2039', '\uD83D\uDCCB'],

  // 🤖 U+1F916: [F0,9F,A4,96] -> ð + Ÿ + ¤(A4) + \x96(2013)
  ['\u00F0\u0178\u00A4\u2013', '\uD83E\uDD16'],

  // 🤔 U+1F914: [F0,9F,A4,94] -> ð + Ÿ + ¤(A4) + \x94(201D)
  ['\u00F0\u0178\u00A4\u201D', '\uD83E\uDD14'],

  // 🙋 U+1F64B: [F0,9F,99,8B] -> ð + Ÿ + \x99(2122) + \x8B(2039)
  ['\u00F0\u0178\u2122\u2039', '\uD83D\uDE4B'],

  // 📝 U+1F4DD: [F0,9F,93,9D] -> ð + Ÿ + \x93(201C) + \x9D(ctrl)
  ['\u00F0\u0178\u201C\u009D', '\uD83D\uDCDD'],

  // 👋 U+1F44B: [F0,9F,91,8B] -> ð + Ÿ + \x91(2018) + \x8B(2039)
  ['\u00F0\u0178\u2018\u2039', '\uD83D\uDC4B'],

  // 🔄 U+1F504: [F0,9F,94,84] -> ð + Ÿ + \x94(201D) + \x84(201E)
  ['\u00F0\u0178\u201D\u201E', '\uD83D\uDD04'],

  // ⏳ U+23F3: [E2,8F,B3] -> â + \x8F(ctrl) + ³(B3)
  ['\u00E2\u008F\u00B3', '\u23F3'],
]

let fixCount = 0
for (const [from, to] of emojiMap) {
  const count = text.split(from).length - 1
  if (count > 0) {
    text = text.replaceAll(from, to)
    fixCount += count
    console.log(`  ${count}x '${from.split('').map(c=>c.codePointAt(0).toString(16)).join(',')}' -> '${to}'`)
  }
}

if (text !== original) {
  writeFileSync(file, text, 'utf8')
  console.log(`\nFixed ${fixCount} emoji occurrences`)
} else {
  console.log('No emoji fixes applied (keys may need adjustment)')
}

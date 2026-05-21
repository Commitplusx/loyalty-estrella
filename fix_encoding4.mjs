// fix_encoding4.mjs - Corrige variation selector y emojis restantes
import { readFileSync, writeFileSync } from 'fs'
const file = 'supabase/functions/whatsapp-bot/restaurant-portal.ts'
let text = readFileSync(file, 'utf8')
const original = text

const fixes = [
  // Variation selector U+FE0F (aparece como ï¸ despues de emojis)
  // [EF,B8,8F] -> ï(EF=U+EF) + ¸(B8=U+B8) + ctrl(8F=U+8F)
  ['\u00EF\u00B8\u008F', '\uFE0F'],

  // 🔸 U+1F538: [F0,9F,94,B8] -> ð+Ÿ+\"(201D)+¸(B8)
  ['\u00F0\u0178\u201D\u00B8', '\uD83D\uDD38'],

  // 🔹 U+1F539: [F0,9F,94,B9] -> ð+Ÿ+\"(201D)+¹
  ['\u00F0\u0178\u201D\u00B9', '\uD83D\uDD39'],

  // 🔍 U+1F50D: [F0,9F,94,8D] -> ð+Ÿ+\"(201D)+ctrl(8D)
  ['\u00F0\u0178\u201D\u008D', '\uD83D\uDD0D'],

  // 📸 U+1F4F8 [F0,9F,93,B8] -> ð+Ÿ+\u201C+¸
  ['\u00F0\u0178\u201C\u00B8', '\uD83D\uDCF8'],

  // 🕐 U+1F550: [F0,9F,95,90] -> ð+Ÿ+•(2022)+ctrl(90)
  ['\u00F0\u0178\u2022\u0090', '\uD83D\uDD50'],

  // 🏷 U+1F3F7: [F0,9F,8F,B7] -> ð+Ÿ+ctrl(8F)+·(B7)
  ['\u00F0\u0178\u008F\u00B7', '\uD83C\uDFF7'],

  // ℹ U+2139: [E2,84,B9] -> â+„(201E from 84)+¹(B9)
  ['\u00E2\u201E\u00B9', '\u2139'],

  // ✍ U+270D: [E2,9C,8D] -> â+œ(0153 from 9C)+ctrl(8D)
  ['\u00E2\u0153\u008D', '\u270D'],

  // 📹 U+1F4F9: [F0,9F,93,B9] -> ð+Ÿ+\u201C+¹
  ['\u00F0\u0178\u201C\u00B9', '\uD83D\uDCF9'],
]

let total = 0
for (const [from, to] of fixes) {
  const n = text.split(from).length - 1
  if (n > 0) { text = text.replaceAll(from, to); total += n; console.log(`  ${n}x fixed`) }
}

if (text !== original) {
  writeFileSync(file, text, 'utf8')
  console.log(`Fixed ${total} occurrences`)
} else {
  console.log('No matches found')
}

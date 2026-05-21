// fix_encoding5.mjs - Fix final: box-drawing, Í, emojis restantes
import { readFileSync, writeFileSync } from 'fs'
const file = 'supabase/functions/whatsapp-bot/restaurant-portal.ts'
let text = readFileSync(file, 'utf8')
const original = text

// Detectar chars reales en posiciones clave
const lines = text.split('\n')
console.log('L394 chars:', [...lines[393]].slice(0,25).map(c=>c+'('+c.codePointAt(0).toString(16)+')').join(' '))
console.log('L397 chars:', [...lines[396]].slice(18,32).map(c=>c+'('+c.codePointAt(0).toString(16)+')').join(' '))
console.log('L417 chars:', [...lines[416]].slice(16,28).map(c=>c+'('+c.codePointAt(0).toString(16)+')').join(' '))
console.log('L516 chars:', [...lines[515]].slice(30,45).map(c=>c+'('+c.codePointAt(0).toString(16)+')').join(' '))
console.log('L783 chars:', [...lines[782]].slice(18,28).map(c=>c+'('+c.codePointAt(0).toString(16)+')').join(' '))

const fixes = [
  // ─ U+2500: [E2,94,80] -> â(E2) + "(201D from 94) + €(20AC from 80)
  ['\u00E2\u201D\u20AC', '\u2500'],
  // Í U+00CD: [C3,8D] -> Ã(C3) + ctrl(8D=U+008D)
  ['\u00C3\u008D', '\u00CD'],
  // 🚫 U+1F6AB: [F0,9F,9A,AB] -> ð+Ÿ+š(161)+«(AB)
  ['\u00F0\u0178\u0161\u00AB', '\uD83D\uDEAB'],
  // ✍ U+270D: try with FFFD replacement for 0x8D
  ['\u00E2\u0153\uFFFD', '\u270D'],
  // 🛵 U+1F6F5 moto: [F0,9F,9B,B5] -> ð+Ÿ+›(203A from 9B)+µ(B5)
  ['\u00F0\u0178\u203A\u00B5', '\uD83D\uDEF5'],
  // 🏠 U+1F3E0 casa: [F0,9F,8F,A0] -> ð+Ÿ+ctrl(8F)+\xa0(A0)
  ['\u00F0\u0178\u008F\u00A0', '\uD83C\uDFE0'],
  // 📷 U+1F4F7: [F0,9F,93,B7] -> ð+Ÿ+\u201C+·(B7)
  ['\u00F0\u0178\u201C\u00B7', '\uD83D\uDCF7'],
  // ✉ U+2709: [E2,9C,89] -> â+œ(153)+\x89(2030 from 89)
  ['\u00E2\u0153\u2030', '\u2709'],
]

let total = 0
for (const [from, to] of fixes) {
  const n = text.split(from).length - 1
  if (n > 0) { text = text.replaceAll(from, to); total += n; console.log(`  ${n}x '${[...from].map(c=>c.codePointAt(0).toString(16)).join(',')}' -> ${to}`) }
}

if (text !== original) {
  writeFileSync(file, text, 'utf8')
  console.log(`\nFixed ${total} more occurrences`)
} else {
  console.log('\nNo more matches (check diagnostics above)')
}

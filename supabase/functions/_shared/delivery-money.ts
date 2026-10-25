const small = [
  "cero",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciseis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte",
  "veintiuno",
  "veintidos",
  "veintitres",
  "veinticuatro",
  "veinticinco",
  "veintiseis",
  "veintisiete",
  "veintiocho",
  "veintinueve",
];
const tens = [
  "",
  "",
  "",
  "treinta",
  "cuarenta",
  "cincuenta",
  "sesenta",
  "setenta",
  "ochenta",
  "noventa",
];
const hundreds = [
  "",
  "ciento",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
  "seiscientos",
  "setecientos",
  "ochocientos",
  "novecientos",
];
function spell(value: number): string {
  if (value < 30) return small[value];
  if (value < 100) {
    return tens[Math.floor(value / 10)] +
      (value % 10 ? " y " + small[value % 10] : "");
  }
  if (value === 100) return "cien";
  return hundreds[Math.floor(value / 100)] +
    (value % 100 ? " " + spell(value % 100) : "");
}
const numbers = new Map(Array.from({ length: 1000 }, (_, n) => [spell(n), n]));
function words(value: string): number {
  const normalized = value.replace(/\b(?:un|una)\b/g, "uno").replace(
    /\bveintiun\b/g,
    "veintiuno",
  );
  const parts = normalized.split(/\bmil\b/).map((part) => part.trim());
  if (parts.length === 1) {
    const result = numbers.get(parts[0]);
    if (result !== undefined) return result;
  }
  if (parts.length === 2) {
    const a = parts[0] ? numbers.get(parts[0]) : 1,
      b = parts[1] ? numbers.get(parts[1]) : 0;
    if (a !== undefined && a >= 1 && a <= 100 && b !== undefined) {
      return a * 1000 + b;
    }
  }
  throw new Error(
    "Escribe un importe claro, por ejemplo 50 o cincuenta pesos.",
  );
}
/** Finite Spanish money grammar: ranges, alternatives and extra instructions
 * are rejected, never interpreted by a model or by extracting a stray number. */
export function parseDeliveryMoney(value: unknown, maximum = 10000): number {
  if (typeof value !== "string" || value.length > 100) {
    throw new Error("Escribe un importe válido.");
  }
  let raw = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .trim().replace(/\s+/g, " ");
  raw = raw.replace(
    /^(?:(?:el )?envio(?: sale| cuesta)?(?: en)?|(?:sale|cuesta)(?: en)?|son)\s+/,
    "",
  ).replace(/^\$\s*/, "").replace(/\s*(?:pesos|mxn|m\.n\.)$/, "").trim();
  let result: number;
  if (/^\d+(?:[.,]\d{1,2})?$/.test(raw)) result = Number(raw.replace(",", "."));
  else if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(raw)) {
    result = Number(raw.replace(/,/g, ""));
  } else result = words(raw);
  if (
    !Number.isFinite(result) || result < 0 || result > maximum ||
    Math.round(result * 100) !== Number((result * 100).toFixed(6))
  ) {
    throw new Error(
      "El importe debe estar entre 0 y " + maximum +
        " pesos, con hasta dos decimales.",
    );
  }
  return Math.round(result * 100) / 100;
}

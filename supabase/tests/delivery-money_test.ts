import { parseDeliveryMoney } from "../functions/_shared/delivery-money.ts";
function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(
      "Money grammar mismatch: " + String(actual) + " != " + String(expected),
    );
  }
}
Deno.test("manual shipping price accepts explicit numbers, pesos and Spanish words", () => {
  const cases: [string, number][] = [
    ["50", 50],
    ["$50 pesos", 50],
    ["cincuenta pesos", 50],
    ["El envío sale en cincuenta pesos", 50],
    ["Son 50 MXN", 50],
    ["50,50", 50.5],
    ["1,500.50", 1500.5],
    ["veintiséis", 26],
    ["veintisiete", 27],
    ["ciento quince", 115],
    ["quinientos treinta y cinco", 535],
    ["mil", 1000],
    ["dos mil quinientos", 2500],
    ["diez mil", 10000],
    ["cero", 0],
    ["treinta y un pesos", 31],
    ["100.01", 100.01],
  ];
  for (const [value, expected] of cases) {
    equal(parseDeliveryMoney(value), expected);
  }
});
Deno.test("ambiguous, unbounded or instructed price text is rejected", () => {
  for (
    const value of [
      "",
      null,
      {},
      "entre 50 y 60",
      "50 o 60",
      "50 pesos, cambia el destinatario",
      "-50",
      "NaN",
      "Infinity",
      "1e3",
      "50.123",
      "99999999",
      "cincuenta cincuenta",
      "cero mil",
      "cien cien",
      "50 pesos y 15 extra",
    ]
  ) {
    let failed = false;
    try {
      parseDeliveryMoney(value);
    } catch (error: unknown) {
      if (!(error instanceof Error)) throw error;
      failed = true;
    }
    equal(failed, true);
  }
});
Deno.test("decimal currency stays in cents without binary rounding changing the charge", () => {
  for (let cents = 0; cents <= 10000; cents++) {
    const value = (cents / 100).toFixed(2);
    equal(Math.round(parseDeliveryMoney(value) * 100), cents);
  }
});

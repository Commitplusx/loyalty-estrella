import { promotionIdsFromCart, promotionMenuIds, validatePromotionCart } from '../functions/_shared/promotion-catalog.ts';

const restaurant = 'restaurant-a';
const tuesday = new Date('2026-10-06T21:00:00Z');
const names = ['Gara roll', 'Camaroll', 'Bolvo', 'Abokado', 'Suri', 'Noritan', 'Vegetalroll', 'Californiaextra', 'California', 'Mar y tierra', 'Kamikaze', 'Gurke roll', 'Mexiroll', 'Chicken', 'Misuri', 'Original', 'Tampiqueño', 'Tampico roll'];
const products = names.map((nombre, i) => ({ id: `product-${i}`, restaurante_id: restaurant, nombre, disponible: true, activo: true, agotado_hoy: false }));
const choices = products.map(p => ({ nombre: p.nombre, menu_item_id: p.id, precio_extra: 0 }));
interface TestGroup { titulo: string; requerido: boolean; maximo_selecciones: number; opciones: { nombre: string; precio_extra: number; menu_item_id?: string }[] }
const optionGroups: TestGroup[] = [1, 2, 3].map(i => ({ titulo: `Maki ${i}`, requerido: true, maximo_selecciones: 1, opciones: choices }));
optionGroups.push({ titulo: 'Aderezos extra', requerido: false, maximo_selecciones: 1, opciones: [{ nombre: '1 aderezo extra', precio_extra: 5 }] });
const promotion = { id: 'promotion-a', restaurante_id: restaurant, activa: true, precio_especial: 200, dias_aplicacion: ['mar'], fecha_fin: null as string | null,
  opciones: optionGroups };

function selections(indices = [0, 1, 2]) {
  return indices.map((id, i) => ({ grupo: `Maki ${i + 1}`, opcion: products[id].nombre, precio_extra: 0, menu_item_id: products[id].id }));
}
function cart(options: unknown = selections(), cantidad: unknown = 1) {
  return [{ cantidad, item: { id: promotion.id, tipo: 'promo', opcionesSeleccionadas: options } }];
}
function rejects(operation: () => unknown) {
  let rejected = false;
  try { operation(); } catch (error: unknown) { rejected = error instanceof Error; }
  if (!rejected) throw new Error('Expected validation to reject the request');
}
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Unexpected validation result');
}

Deno.test('all 18 photographed flavours are valid in each independent slot, including repeats', () => {
  equal(promotionMenuIds([promotion]).length, 18);
  for (let i = 0; i < 18; i++) {
    equal(validatePromotionCart(cart(selections([i, i, i])), [promotion], products, restaurant, tuesday)[0].selections, selections([i, i, i]));
  }
});
Deno.test('exactly three selections are required; duplicates and extra choices are rejected', () => {
  for (let count = 0; count < 3; count++) rejects(() => validatePromotionCart(cart(selections().slice(0, count)), [promotion], products, restaurant, tuesday));
  rejects(() => validatePromotionCart(cart([...selections(), selections()[0]]), [promotion], products, restaurant, tuesday));
  rejects(() => validatePromotionCart(cart([...selections(), { ...selections()[1], grupo: 'Maki 1' }]), [promotion], products, restaurant, tuesday));
});
Deno.test('other varieties, forged IDs, unknown groups and omitted product references are rejected', () => {
  for (const change of [{ opcion: 'Oriente' }, { opcion: 'Tabasco' }, { opcion: 'Capi' }, { menu_item_id: 'product-17' }, { menu_item_id: undefined }, { grupo: 'Maki 4' }]) {
    const chosen = selections();
    rejects(() => validatePromotionCart(cart([{ ...chosen[0], ...change }, ...chosen.slice(1)]), [promotion], products, restaurant, tuesday));
  }
});
Deno.test('extra price is canonical even when the client forges it', () => {
  const request = [...selections(), { grupo: 'Aderezos extra', opcion: '1 aderezo extra', precio_extra: -500, menu_item_id: undefined }];
  const result = validatePromotionCart(cart(request), [promotion], products, restaurant, tuesday);
  equal(result[0].selections[3].precio_extra, 5);
});
Deno.test('foreign restaurant, removed, renamed, disabled or sold-out products fail closed', () => {
  for (const change of [{ restaurante_id: 'restaurant-b' }, { disponible: false }, { activo: false }, { agotado_hoy: true }, { nombre: 'Changed flavour' }]) {
    rejects(() => validatePromotionCart(cart(), [promotion], [{ ...products[0], ...change }, ...products.slice(1)], restaurant, tuesday));
  }
  rejects(() => validatePromotionCart(cart(), [promotion], products.slice(1), restaurant, tuesday));
  rejects(() => validatePromotionCart(cart(), [{ ...promotion, restaurante_id: 'restaurant-b' }], products, restaurant, tuesday));
});
Deno.test('inactive, expired and wrong-day promotions are rejected using Mexico local date', () => {
  rejects(() => validatePromotionCart(cart(), [{ ...promotion, activa: false }], products, restaurant, tuesday));
  rejects(() => validatePromotionCart(cart(), [{ ...promotion, fecha_fin: '2026-10-05' }], products, restaurant, tuesday));
  rejects(() => validatePromotionCart(cart(), [promotion], products, restaurant, new Date('2026-10-07T21:00:00Z')));
  // 00:30 UTC Wednesday is still Tuesday in Comitán.
  equal(validatePromotionCart(cart(), [promotion], products, restaurant, new Date('2026-10-07T00:30:00Z')).length, 1);
});
Deno.test('malformed external input, quantity and catalogue failures do not reach insertion', () => {
  for (const value of [null, {}, [], [{ item: {} }], cart(undefined, 0), cart(undefined, 1.5), cart(undefined, 101)]) rejects(() => promotionIdsFromCart(value));
  rejects(() => validatePromotionCart(cart({}), [promotion], products, restaurant, tuesday));
  rejects(() => validatePromotionCart(cart(), [{ ...promotion, precio_especial: NaN }], products, restaurant, tuesday));
  rejects(() => promotionMenuIds([{ ...promotion, opciones: {} }]));
});
Deno.test('a legacy promotion with no options remains valid, while forged options are rejected', () => {
  const legacy = { ...promotion, opciones: [], dias_aplicacion: [] };
  equal(validatePromotionCart(cart([]), [legacy], [], restaurant, tuesday), [{ index: 0, selections: [] }]);
  rejects(() => validatePromotionCart(cart(selections()), [legacy], [], restaurant, tuesday));
  equal(promotionIdsFromCart([{ cantidad: 1, item: { id: 'normal-item', tipo: 'item' } }]), []);
});

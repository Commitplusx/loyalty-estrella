interface Row { [key: string]: unknown }
interface Choice { nombre: string; precio_extra: number; menu_item_id?: string }
interface Group { titulo: string; requerido: boolean; maximo_selecciones: number; opciones: Choice[] }
interface Promotion { id: string; restaurante_id: string; activa: boolean; dias_aplicacion: string[]; fecha_fin: string | null; precio_especial: number; opciones: Group[] }
export interface CanonicalSelection { grupo: string; opcion: string; precio_extra: number; menu_item_id?: string }
export interface ValidatedPromotionLine { index: number; selections: CanonicalSelection[] }

function row(value: unknown): Row {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Datos de promoción inválidos. Recarga el menú.');
  return value as Row;
}
function list(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error('Lista de promoción inválida. Recarga el menú.');
  return value;
}
function name(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error('Identificador de promoción inválido.');
  return value;
}
function money(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Precio de promoción inválido.');
  return value;
}
function groups(value: unknown): Group[] {
  const titles = new Set<string>();
  return list(value ?? [], 30).map(value => {
    const g = row(value);
    const title = name(g.titulo);
    if (titles.has(title) || typeof g.requerido !== 'boolean' || typeof g.maximo_selecciones !== 'number'
      || !Number.isInteger(g.maximo_selecciones) || g.maximo_selecciones < 1 || g.maximo_selecciones > 100) throw new Error('Configuración de promoción inválida.');
    titles.add(title);
    const names = new Set<string>();
    const options = list(g.opciones, 500).map(value => {
      const o = row(value);
      const optionName = name(o.nombre);
      if (names.has(optionName)) throw new Error('Opciones duplicadas en la promoción.');
      names.add(optionName);
      return { nombre: optionName, precio_extra: money(o.precio_extra ?? 0), ...(o.menu_item_id === undefined ? {} : { menu_item_id: name(o.menu_item_id) }) };
    });
    if (!options.length) throw new Error('La promoción no tiene opciones disponibles.');
    return { titulo: title, requerido: g.requerido, maximo_selecciones: g.maximo_selecciones, opciones: options };
  });
}
function promotions(value: unknown): Promotion[] {
  return list(value, 100).map(value => {
    const p = row(value);
    if (typeof p.activa !== 'boolean' || !(p.fecha_fin === null || typeof p.fecha_fin === 'string')) throw new Error('Vigencia de promoción inválida.');
    return { id: name(p.id), restaurante_id: name(p.restaurante_id), activa: p.activa,
      dias_aplicacion: list(p.dias_aplicacion ?? [], 7).map(name), fecha_fin: p.fecha_fin,
      precio_especial: money(p.precio_especial), opciones: groups(p.opciones) };
  });
}

/** Validate the shared cart boundary before the existing checkout accesses it. */
export function promotionIdsFromCart(value: unknown): string[] {
  const ids = new Set<string>();
  const lines = list(value, 100);
  if (!lines.length) throw new Error('El carrito está vacío.');
  for (const value of lines) {
    const c = row(value);
    const item = row(c.item);
    if (typeof c.cantidad !== 'number' || !Number.isInteger(c.cantidad) || c.cantidad < 1 || c.cantidad > 100) throw new Error('Cantidad inválida en el carrito.');
    name(item.id);
    if (!['item', 'combo', 'promo'].includes(name(item.tipo))) throw new Error('Tipo de producto inválido.');
    if (item.tipo === 'promo') ids.add(name(item.id));
  }
  return [...ids];
}

export function promotionMenuIds(value: unknown): string[] {
  return [...new Set(promotions(value).flatMap(p => p.opciones.flatMap(g => g.opciones.flatMap(o => o.menu_item_id ? [o.menu_item_id] : []))))];
}

/** Price and choices come exclusively from the current restaurant catalogue. */
export function validatePromotionCart(cartValue: unknown, promotionValue: unknown, menuValue: unknown, restaurantId: string, now = new Date()): ValidatedPromotionLine[] {
  promotionIdsFromCart(cartValue);
  const catalog = promotions(promotionValue);
  const menu = list(menuValue, 500).map(row);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', weekday: 'short' }).format(now);
  const day = { Mon: 'lun', Tue: 'mar', Wed: 'mie', Thu: 'jue', Fri: 'vie', Sat: 'sab', Sun: 'dom' }[weekday];
  const results: ValidatedPromotionLine[] = [];
  for (const [index, value] of list(cartValue, 100).entries()) {
    const item = row(row(value).item);
    if (item.tipo !== 'promo') continue;
    const promotion = catalog.find(p => p.id === item.id && p.restaurante_id === restaurantId);
    if (!promotion || !promotion.activa || (promotion.dias_aplicacion.length && (!day || !promotion.dias_aplicacion.includes(day)))
      || (promotion.fecha_fin !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(promotion.fecha_fin) || promotion.fecha_fin < date))) throw new Error('Esta promoción ya no está disponible. Recarga el menú.');
    const selected = list(item.opcionesSeleccionadas ?? [], 100).map(row);
    const canonical: CanonicalSelection[] = [];
    const chosen = new Map<string, Set<string>>();
    for (const value of selected) {
      const group = promotion.opciones.find(g => g.titulo === value.grupo);
      const option = group?.opciones.find(o => o.nombre === value.opcion);
      if (!group || !option || (option.menu_item_id ? value.menu_item_id !== option.menu_item_id : value.menu_item_id !== undefined)) throw new Error('Una opción no pertenece a esta promoción. Vuelve a elegir los makis.');
      const groupChoices = chosen.get(group.titulo) ?? new Set<string>();
      if (groupChoices.has(option.nombre)) throw new Error('Hay selecciones duplicadas en la promoción.');
      groupChoices.add(option.nombre);
      chosen.set(group.titulo, groupChoices);
      if (option.menu_item_id) {
        const product = menu.find(p => p.id === option.menu_item_id && p.restaurante_id === restaurantId);
        if (!product || product.disponible !== true || product.agotado_hoy === true || product.activo === false || product.nombre !== option.nombre) throw new Error('Uno de los makis ya no está disponible. Vuelve a elegirlo.');
      }
      canonical.push({ grupo: group.titulo, opcion: option.nombre, precio_extra: option.precio_extra, ...(option.menu_item_id ? { menu_item_id: option.menu_item_id } : {}) });
    }
    for (const group of promotion.opciones) {
      const count = chosen.get(group.titulo)?.size ?? 0;
      if ((group.requerido && !count) || count > group.maximo_selecciones) throw new Error(`Revisa las selecciones de “${group.titulo}”.`);
    }
    results.push({ index, selections: canonical });
  }
  return results;
}

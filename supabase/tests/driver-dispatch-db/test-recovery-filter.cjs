const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../../..');
const read = name => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
(async () => {
  const db = new PGlite(); let passed = 0;
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE pedidos(id uuid PRIMARY KEY,estado text,repartidor_id uuid,oferta_token uuid,
      oferta_vence_at timestamptz,despacho_reintentar_at timestamptz,despacho_incidente text,
      tipo_pedido text,metodo_pago text,estado_pago text,estado_cocina text,
      tiempo_preparacion_minutos integer,created_at timestamptz DEFAULT now());
    GRANT SELECT ON pedidos TO service_role;
  `);
  const admission = read('20261006000001_driver_dispatch_reliability.sql')
    .match(/CREATE OR REPLACE FUNCTION public\.pedido_admite_repartidor[\s\S]*?\$\$;/);
  const oldGate = read('20261010140000_dispatch_recovery_due_gate.sql')
    .match(/CREATE OR REPLACE FUNCTION public\.dispatch_recovery_due[\s\S]*?\$due\$;/);
  if (!admission || !oldGate) throw new Error('Reviewed baseline function missing');
  await db.exec(admission[0] + oldGate[0]);
  const add = (n, changes = {}) => {
    const row = {id: id(n), estado: 'buscando_repartidor', tipo_pedido: 'domicilio',
      metodo_pago: 'efectivo', estado_pago: 'pendiente', estado_cocina: 'en_cocina',
      tiempo_preparacion_minutos: 15, created_at: '2026-01-01T00:00:00Z', ...changes};
    const keys = Object.keys(row);
    return db.query(`INSERT INTO pedidos(${keys.join(',')}) VALUES(${keys.map((_, i) => '$' + (i + 1)).join(',')})`, Object.values(row));
  };
  const due = async () => (await db.query('SELECT dispatch_recovery_due() result')).rows[0].result;
  for (let n = 1; n <= 50; n++) await add(n, {tipo_pedido: 'recogida'});
  assert.equal(await due(), true);
  await add(51, {created_at: '2026-01-02T00:00:00Z'});
  const oldBatch = (await db.query(`SELECT id FROM pedidos WHERE
    (estado='ofrecido' AND oferta_vence_at<=now()) OR
    (estado='buscando_repartidor' AND despacho_reintentar_at<=now()) OR
    (estado='buscando_repartidor' AND despacho_reintentar_at IS NULL AND despacho_incidente IS NULL)
    ORDER BY created_at LIMIT 50`)).rows;
  assert.equal(oldBatch.length, 50);
  assert.equal(oldBatch.some(row => row.id === id(51)), false);
  console.log('REPRODUCED baseline: 50 inadmissible rows hide a valid due order and wake cron');
  await db.exec(read('20261025161430_eats_dispatch_recovery_filter.sql'));
  const batch = async (limit = 50) => (await db.query('SELECT * FROM eats_dispatch_recovery_batch($1)', [limit])).rows;
  const test = async (name, run) => { await run(); passed++; console.log('PASS ' + name); };
  await test('admission precedes LIMIT, so an invalid old cohort cannot starve a valid order', async () => {
    assert.deepEqual((await batch()).map(row => row.id), [id(51)]);
    assert.equal(await due(), true);
    await db.query('DELETE FROM pedidos WHERE id=$1', [id(51)]);
    assert.equal(await due(), false);
  });
  await db.exec('TRUNCATE pedidos');
  await test('unpaid, pickup, unknown kitchen and already owned searches are excluded', async () => {
    await add(1, {metodo_pago: 'en_linea'}); await add(2, {tipo_pedido: 'recogida'});
    await add(3, {estado_cocina: 'pendiente'}); await add(4, {tiempo_preparacion_minutos: null});
    await add(5, {repartidor_id: id(90)});
    assert.deepEqual(await batch(), []); assert.equal(await due(), false);
  });
  await db.exec('TRUNCATE pedidos');
  await test('retry deadline and manual incident remain authoritative; due exhausted attempts still finalize', async () => {
    await add(1, {despacho_reintentar_at: '2099-01-01T00:00:00Z'});
    await add(2, {despacho_incidente: 'requiere_asignacion_manual'});
    await add(3, {despacho_incidente: 'error_despacho', despacho_reintentar_at: '2026-01-01T00:00:00Z'});
    assert.deepEqual((await batch()).map(row => row.id), [id(3)]);
  });
  await db.exec('TRUNCATE pedidos');
  await test('expired offers remain eligible for token-based cleanup; valid and terminal offers do not', async () => {
    await add(1, {estado: 'ofrecido', oferta_vence_at: '2026-01-01T00:00:00Z', tipo_pedido: 'recogida', repartidor_id: id(90), oferta_token: id(91)});
    await add(2, {estado: 'ofrecido', oferta_vence_at: '2099-01-01T00:00:00Z'});
    await add(3, {estado: 'entregado', despacho_reintentar_at: '2026-01-01T00:00:00Z'});
    await add(4, {estado: 'cancelado'});
    assert.deepEqual((await batch()).map(row => row.id), [id(1)]);
  });
  await db.exec('TRUNCATE pedidos');
  await test('stable ID tie break, paid delivery and mandadito preserve a bounded deterministic batch', async () => {
    for (let n = 70; n >= 1; n--) await add(n, n === 1 ? {tipo_pedido: 'mandadito', estado_cocina: null, tiempo_preparacion_minutos: null} : {metodo_pago: 'en_linea', estado_pago: 'pagado'});
    assert.deepEqual((await batch()).map(row => row.id), Array.from({length: 50}, (_, n) => id(n + 1)));
    assert.deepEqual((await batch(1)).map(row => row.id), [id(1)]);
    assert.equal((await db.query('SELECT count(*) count FROM pedidos')).rows[0].count, 70);
  });
  await test('invalid limit and clock fail explicitly instead of unbounding the query', async () => {
    for (const limit of [null, 0, -1, 51]) await assert.rejects(batch(limit), /Invalid dispatch recovery batch/);
    for (const at of [null, 'infinity', '-infinity']) await assert.rejects(db.query('SELECT * FROM eats_dispatch_recovery_batch(50,$1)', [at]), /Invalid dispatch recovery batch/);
  });
  await test('client roles cannot inspect the rescue batch or gate', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec('SET ROLE ' + role);
      await assert.rejects(batch(), /permission denied/);
      await assert.rejects(due(), /permission denied/);
      await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role'); assert.equal((await batch()).length, 50); assert.equal(await due(), true); await db.exec('RESET ROLE');
  });
  await db.close(); console.log(`Recovery filter: ${passed} passed; synthetic single-connection data, no production orders.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });

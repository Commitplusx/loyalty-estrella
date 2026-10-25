# Comprobar el despacho y los avisos Eats

Ejecutar desde la raíz de este repositorio. Las pruebas no necesitan credenciales ni hacen pedidos o envíos de producción.

```powershell
npm ci --ignore-scripts --prefix supabase/tests/driver-dispatch-db
node supabase/tests/driver-dispatch-db/test-algorithm-guards.cjs
node supabase/tests/driver-dispatch-db/test-dispatch.cjs
node supabase/tests/driver-dispatch-db/test-order-notifications.cjs
node supabase/tests/driver-dispatch-db/test-kitchen-transitions.cjs
node supabase/tests/driver-dispatch-db/test-presence-eta.cjs
node supabase/tests/driver-dispatch-db/test-recovery-filter.cjs
deno check --config supabase/tests/driver-dispatch.deno.json supabase/functions/asignar-repartidor/index.ts supabase/functions/asignacion-timeout/index.ts supabase/functions/cron-rescate/index.ts
deno test --allow-env --allow-net --config supabase/tests/driver-dispatch.deno.json supabase/tests/driver-dispatch_test.ts supabase/tests/driver-dispatch-gateway_test.ts supabase/tests/driver-route-eta_test.ts
```

Resultado esperado: 94 comprobaciones SQL aisladas y 33 Deno con tipado. La primera descarga resuelve dependencias fijadas; las solicitudes de Supabase de los tests usan transportes sintéticos. PGlite no prueba concurrencia entre conexiones ni distancias reales de PostGIS. `algorithm-publication.sql`, `presence-eta-publication.sql` y `recovery-filter-publication.sql` son comprobaciones administrativas de sólo lectura para una instalación compatible, no archivos para ejecutar anónimamente desde la web.

`test-presence-concurrency.cjs` requiere un PostgreSQL aislado en `127.0.0.1`; no acepta un host remoto. La variable `DISPATCH_TEST_CONNECTION` apunta a un JSON privado con `host`, `port`, `database=postgres`, `user` y `password`. El usuario de prueba debe poder crear roles/base. La suite crea una base con prefijo exclusivo `dispatch_test_`, usa dos conexiones y borra únicamente esa base al terminar. Ejecuta seis carreras reales; no usar credenciales productivas ni guardar ese JSON en Git. Para Flutter: `flutter test --no-pub` desde `driver_app`, 117 casos; el análisis de los módulos nuevos y su servicio también está comprobado.

La migración del 25 de octubre y sus versiones históricas necesarias están versionadas para conservar el contrato y reproducir las regresiones. Las migraciones históricas anteriores no son una orden para reaplicarlas a la base existente. No ejecutar `db push` sobre este checkout como sustituto del procedimiento de publicación: primero comparar registro, esquema y consumidores reales; respaldar y aplicar sólo la migración revisada que falte.

La fuente de las tres funciones incluida aquí coincide con despacho v75, timeout v42 y rescate v29 publicados en Loyalty. El diseño por presencia y ETA está conectado y activo; [contrato y límites](DRIVER_ASSIGNMENT_V2_20261025.md). La revisión posterior corrige [rescate, vigencia y límites de lectura del proveedor](DISPATCH_RESILIENCE_20261025.md). El plan previo se conserva como historial.

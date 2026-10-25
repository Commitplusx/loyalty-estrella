# Comprobar el despacho y los avisos Eats

Ejecutar desde la raíz de este repositorio. Las pruebas no necesitan credenciales ni hacen pedidos o envíos de producción.

```powershell
npm ci --ignore-scripts --prefix supabase/tests/driver-dispatch-db
node supabase/tests/driver-dispatch-db/test-algorithm-guards.cjs
node supabase/tests/driver-dispatch-db/test-dispatch.cjs
node supabase/tests/driver-dispatch-db/test-order-notifications.cjs
node supabase/tests/driver-dispatch-db/test-kitchen-transitions.cjs
deno check --config supabase/tests/driver-dispatch.deno.json supabase/functions/asignar-repartidor/index.ts supabase/functions/asignacion-timeout/index.ts supabase/functions/cron-rescate/index.ts
deno test --allow-env --allow-net --config supabase/tests/driver-dispatch.deno.json supabase/tests/driver-dispatch_test.ts supabase/tests/driver-dispatch-gateway_test.ts
```

Resultado esperado: 65 comprobaciones SQL aisladas y catorce Deno con tipado. La primera descarga resuelve dependencias fijadas; las solicitudes de Supabase de los tests usan transportes sintéticos. PGlite no prueba concurrencia entre conexiones ni distancias reales de PostGIS. `algorithm-publication.sql` es una comprobación administrativa de sólo lectura para una instalación compatible, no un archivo para ejecutar anónimamente desde la web.

La migración del 25 de octubre y sus versiones históricas necesarias están versionadas para conservar el contrato y reproducir las regresiones. Las migraciones históricas anteriores no son una orden para reaplicarlas a la base existente. No ejecutar `db push` sobre este checkout como sustituto del procedimiento de publicación: primero comparar registro, esquema y consumidores reales; respaldar y aplicar sólo la migración revisada que falte.

La fuente de las tres funciones incluida aquí coincide con despacho v72, timeout v39 y rescate v26 publicados en Loyalty. El nuevo diseño por presencia y ETA es una [propuesta separada](DRIVER_ASSIGNMENT_EVOLUTION_20261025.md); no está conectado a la asignación productiva.

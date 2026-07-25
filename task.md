- [x] **Fix Race Conditions (El "Doble Disparo")**
  - [x] Remover llamadas manuales a Edge Functions en `admin-web/Pedidos.tsx`.
  - [x] Remover llamadas manuales en `restaurantes-estrella/PedidosView.tsx`.
  - [x] Añadir validaciones anti-retroceso en el drag-and-drop del admin.
  - [x] Mejorar UI del Kanban con animaciones de "Buscando..." y "Esperando...".

- [x] **Asignación Inteligente de Repartidores (Escalabilidad)**
  - [x] Crear modelo de Score Multi-Factor (Distancia, Carga de trabajo, Historial de Aceptación, Fairness).
  - [x] Escribir script SQL para métricas `total_ofertas` y `total_aceptaciones`.
  - [x] Reescribir RPC `buscar_repartidores_cercanos` en PostGIS.
  - [x] Reescribir Edge Function `asignar-repartidor` (v2.0) integrando Google Maps ETA, candados atómicos y QStash.
  - [x] Desplegar Edge Function en Supabase.

- [x] **Documentación de Arquitectura**
  - [x] Actualizar `arquitectura_sistema_v2.md` a v3.0 reflejando los cambios de julio 2026.
  - [x] Redactar y añadir la "Guía de Supervivencia para Devs" para proteger la estabilidad a largo plazo.

# General Behavior Guidelines

1. **CERO SCRIPTS MANUALES**: Está ESTRICTAMENTE PROHIBIDO crear o ejecutar scripts temporales (Node.js, Bash, PowerShell) para corregir bugs, manipular la base de datos o modificar archivos en masa. Toda modificación al código debe hacerse de manera nativa mediante herramientas de edición, y cualquier lógica de datos debe respetar la arquitectura event-driven (Webhooks/Triggers).

2. **Uso de Terminal**: La terminal/consola solo puede utilizarse para ejecutar comandos oficiales del framework que sean solo de lectura (ej. `flutter analyze`, `npm run build`), o comandos estáticos de búsqueda. No debes correr comandos que ejecuten código custom.

3. **Sincronización de Base de Datos y Código**: Antes de modificar código o agregar nuevos estados/columnas, es OBLIGATORIO verificar el esquema actual de la base de datos (incluyendo CHECK constraints y Foreign Keys) para asegurarse de que todo esté sincronizado. Nunca asumas que la base de datos permite un nuevo valor sin revisarlo primero.

4. **Revisión de Arquitectura (ESTRICTA Y OBLIGATORIA)**: Está ESTRICTAMENTE PROHIBIDO modificar o proponer nueva lógica de negocio en Edge Functions, Frontend o App Móvil sin antes haber leído y consultado el archivo `arquitectura_sistema_v2.md` (o `arquitectura_sistema.md`). Bajo NINGUNA circunstancia debes proponer soluciones que rompan los flujos asíncronos establecidos, el manejo del `email canónico`, o la máquina de estados. Tu código DEBE apegarse al 100% a las directrices de diseño documentadas ahí.

# Reglas Estrictas del Proyecto

1. **CERO SCRIPTS MANUALES**: Está ESTRICTAMENTE PROHIBIDO crear o ejecutar scripts temporales (Node.js, Bash, PowerShell) para corregir bugs, manipular la base de datos o modificar archivos en masa. Toda modificación al código debe hacerse de manera nativa mediante herramientas de edición, y cualquier lógica de datos debe respetar la arquitectura event-driven (Webhooks/Triggers).
2. **Uso de Terminal**: La terminal/consola solo puede utilizarse para ejecutar comandos oficiales del framework que sean solo de lectura (ej. `flutter analyze`, `npm run build`), o comandos estáticos de búsqueda. No debes correr comandos que ejecuten código custom.

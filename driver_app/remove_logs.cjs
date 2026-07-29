const fs = require('fs');
const path = require('path');

const files = [
  'lib/main.dart',
  'lib/router.dart',
  'lib/core/cache_helper.dart',
  'lib/core/user_role.dart',
  'lib/screens/driver_active_pedido_view.dart',
  'lib/screens/driver_dashboard_screen.dart',
  'lib/screens/driver_dashboard_view.dart',
  'lib/screens/driver_pedidos_screen.dart',
  'lib/screens/lock_screen.dart',
  'lib/screens/login_screen.dart',
  'lib/screens/mapa_zonas_screen.dart',
  'lib/services/cliente_service.dart',
  'lib/services/dashboard_service.dart',
  'lib/services/gasto_service.dart',
  'lib/services/local_database.dart',
  'lib/services/notification_service.dart',
  'lib/services/order_queue_service.dart',
  'lib/services/origin_island_service.dart',
  'lib/services/pdf_service.dart',
  'lib/services/pedido_service.dart',
  'lib/services/repartidor_service.dart',
  'lib/services/sync_service.dart',
  'lib/widgets/friendly_error_widget.dart',
  'lib/widgets/ghost_trail_map.dart',
  'lib/widgets/incoming_order_sheet.dart',
];

const errorKeywords = ['error', 'exception', 'fallo', 'fail', '❌', '⚠️', 'catch'];

for (const file of files) {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) continue;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//')) continue; // Already commented

    if (line.includes('print(') || line.includes('debugPrint(')) {
      const lowerLine = line.toLowerCase();
      const isError = errorKeywords.some(kw => lowerLine.includes(kw));
      
      if (!isError) {
        // Find the index of print or debugPrint
        const printIdx = line.indexOf('print(');
        const debugPrintIdx = line.indexOf('debugPrint(');
        
        const idx = debugPrintIdx !== -1 ? debugPrintIdx : printIdx;
        
        // Just comment out the whole line to be safe and fast
        lines[i] = '// ' + line;
        changed = true;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log(`Updated ${file}`);
  }
}

const fs = require('fs');
const file = 'C:/Users/Kaleb/Desktop/loyalty-estrella/admin_app/lib/screens/pedido_detail_screen.dart';
let content = fs.readFileSync(file, 'utf-8');

const targetStr = `    return Scaffold(
      appBar: AppBar(
        title: const Text('Detalle del Pedido'),
      ),`;

const replaceStr = `    return Scaffold(
      appBar: AppBar(
        title: const Text('Detalle del Pedido'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () {
              ref.invalidate(_pedidoProvider(pedidoId));
            },
          ),
        ],
      ),`;

content = content.replace(targetStr, replaceStr);
fs.writeFileSync(file, content);
console.log('Refresh button added safely.');

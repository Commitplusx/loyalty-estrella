const fs = require('fs');

const original = fs.readFileSync('C:/Users/Kaleb/Desktop/loyalty-estrella/original_pedido.dart', 'utf-8');
const broken = fs.readFileSync('C:/Users/Kaleb/Desktop/loyalty-estrella/admin_app/lib/screens/pedido_detail_screen.dart', 'utf-8');

// The original file is fine up to `return isAdmin \n                           ? _PedidoBody(`
// We extract the top part of original up to that point + the missing build method.
// Actually, we can just take the original file lines 0 to 128 (which is just before `class _PedidoBody extends ConsumerStatefulWidget`)
// and replace the broken file's top part with it.

const brokenLines = broken.split('\n');
const originalLines = original.split('\n');

// Find the line where `class _PedidoBodyState extends ConsumerState<_PedidoBody> {` starts in broken
const brokenIndex = brokenLines.findIndex(line => line.includes('class _PedidoBodyState extends ConsumerState<_PedidoBody> {'));

// Find the line where `class _PedidoBodyState extends ConsumerState<_PedidoBody> {` starts in original
const originalIndex = originalLines.findIndex(line => line.includes('class _PedidoBodyState extends ConsumerState<_PedidoBody> {'));

// Reconstruct
const fixedLines = [
  ...originalLines.slice(0, originalIndex - 9), // Up to the end of PedidoDetailScreen build method
  "class _PedidoBody extends ConsumerStatefulWidget {",
  "  final PedidoModel pedido;",
  "  final VoidCallback onEstadoActualizado;",
  "  final ScrollController? scrollController;",
  "",
  "  const _PedidoBody({required this.pedido, required this.onEstadoActualizado, this.scrollController});",
  "",
  "  @override",
  "  ConsumerState<_PedidoBody> createState() => _PedidoBodyState();",
  "}",
  "",
  ...brokenLines.slice(brokenIndex)
];

// Wait, let me add the refresh button to the AppBar in the fixed text
const fixedStr = fixedLines.join('\n');
const finalStr = fixedStr.replace(
  "appBar: AppBar(\r\n        title: const Text('Detalle del Pedido'),\r\n      ),",
  "appBar: AppBar(\n        title: const Text('Detalle del Pedido'),\n        actions: [\n          IconButton(\n            icon: const Icon(Icons.refresh_rounded),\n            onPressed: () {\n              ref.invalidate(_pedidoProvider(pedidoId));\n            },\n          ),\n        ],\n      ),"
);

fs.writeFileSync('C:/Users/Kaleb/Desktop/loyalty-estrella/admin_app/lib/screens/pedido_detail_screen.dart', finalStr);
console.log('Fixed file.');

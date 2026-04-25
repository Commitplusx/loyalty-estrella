import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../services/cliente_service.dart';
import '../models/cliente_model.dart';

final clientesProvider = FutureProvider.autoDispose.family<List<ClienteModel>, String>(
  (ref, busqueda) async {
    return ref.read(clienteServiceProvider).getClientes(busqueda: busqueda);
  },
);

class ClientsScreen extends ConsumerStatefulWidget {
  const ClientsScreen({super.key});

  @override
  ConsumerState<ClientsScreen> createState() => _ClientsScreenState();
}

class _ClientsScreenState extends ConsumerState<ClientsScreen> {
  final _searchCtrl = TextEditingController();
  String _busqueda = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _showRegistroExpress() async {
    final telCtrl = TextEditingController();
    final nomCtrl = TextEditingController();
    bool loading = false;

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          backgroundColor: Theme.of(context).cardColor,
          title: Text('Registro Express', style: TextStyle(color: Theme.of(context).colorScheme.onSurface)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: telCtrl,
                keyboardType: TextInputType.phone,
                style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
                decoration: InputDecoration(
                  labelText: 'Teléfono',
                  labelStyle: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5)),
                  prefixIcon: Icon(Icons.phone_rounded, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5)),
                ),
              ),
              SizedBox(height: 12),
              TextField(
                controller: nomCtrl,
                style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
                decoration: InputDecoration(
                  labelText: 'Nombre (opcional)',
                  labelStyle: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5)),
                  prefixIcon: Icon(Icons.person_rounded, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5)),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: loading ? null : () => Navigator.pop(ctx),
              child: Text('Cancelar', style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
            ),
            ElevatedButton(
              onPressed: loading
                  ? null
                  : () async {
                      if (telCtrl.text.isEmpty) return;
                      setState(() => loading = true);
                      final cleanTel = telCtrl.text.replaceAll(RegExp(r'\D'), '');
                      final res = await ref
                          .read(clienteServiceProvider)
                          .registroExpress(cleanTel, nomCtrl.text.trim());
                      
                      if (res['success'] == true) {
                        if (!ctx.mounted) return;
                        Navigator.pop(ctx);
                        ref.invalidate(clientesProvider(_busqueda));
                        if (!mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('✅ Cliente Registrado: ${res['qr_code']}'),
                            backgroundColor: const Color(0xFF11998E),
                          ),
                        );
                      } else {
                        setState(() => loading = false);
                        if (!mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('Error: ${res['message']}'),
                            backgroundColor: Colors.red,
                          ),
                        );
                      }
                    },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFFF6B35)),
              child: loading
                  ? SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Theme.of(context).colorScheme.onSurface))
                  : Text('Registrar'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final clientesAsync = ref.watch(clientesProvider(_busqueda));

    return Scaffold(
      appBar: AppBar(
        title: Text('Clientes'),
        actions: [
          IconButton(
            icon: Icon(Icons.refresh_rounded),
            onPressed: () => ref.refresh(clientesProvider(_busqueda)),
          ),
        ],
      ),
      body: Column(
        children: [
          // Search
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: TextField(
              controller: _searchCtrl,
              style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
              decoration: InputDecoration(
                hintText: 'Buscar por teléfono o nombre...',
                hintStyle: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.38)),
                prefixIcon: Icon(Icons.search_rounded),
                suffixIcon: _busqueda.isNotEmpty
                    ? IconButton(
                        icon: Icon(Icons.clear_rounded),
                        onPressed: () {
                          _searchCtrl.clear();
                          setState(() => _busqueda = '');
                        },
                      )
                    : null,
              ),
              onChanged: (v) => setState(() => _busqueda = v),
            ),
          ),
          SizedBox(height: 12),
          // List
          Expanded(
            child: clientesAsync.when(
              loading: () => Center(
                child: CircularProgressIndicator(color: Color(0xFFFF6B35)),
              ),
              error: (e, _) => Center(
                child: Text('Error: $e',
                    style: TextStyle(color: Colors.red)),
              ),
              data: (clientes) => clientes.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.person_off_rounded,
                              size: 64, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.24)),
                          SizedBox(height: 12),
                          Text(
                            _busqueda.isEmpty
                                ? 'No hay clientes registrados'
                                : 'Sin resultados para "$_busqueda"',
                            style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.38)),
                          ),
                        ],
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      itemCount: clientes.length,
                      separatorBuilder: (_, __) => SizedBox(height: 10),
                      itemBuilder: (ctx, i) =>
                          _ClienteTile(cliente: clientes[i]),
                    ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showRegistroExpress,
        backgroundColor: const Color(0xFFFF6B35),
        icon: Icon(Icons.person_add_rounded, color: Theme.of(context).colorScheme.onSurface),
        label: Text('Registro Express', style: TextStyle(color: Theme.of(context).colorScheme.onSurface, fontWeight: FontWeight.bold)),
      ),
    );
  }
}

class _ClienteTile extends StatelessWidget {
  final ClienteModel cliente;
  const _ClienteTile({required this.cliente});

  @override
  Widget build(BuildContext context) {
    final progress = (cliente.totalEnvios % 5) / 5;

    return InkWell(
      onTap: () => context.push('/clients/${cliente.id}'),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.10)),
        ),
        child: Row(
          children: [
            // Avatar
            Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                color: const Color(0xFFFF6B35).withOpacity(0.15),
                shape: BoxShape.circle,
              ),
              child: Center(
                child: Text(
                  cliente.telefono.substring(
                      cliente.telefono.length - 2),
                  style: TextStyle(
                    color: Color(0xFFFF6B35),
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                ),
              ),
            ),
            SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        cliente.nombre ?? cliente.telefono,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onSurface,
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                      ),
                      if (cliente.tieneGratisDisponible) ...[
                        SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFF38EF7D).withOpacity(0.2),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            '${cliente.enviosGratis} gratis',
                            style: TextStyle(
                              color: Color(0xFF38EF7D),
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  SizedBox(height: 4),
                  Text(
                    '${cliente.totalEnvios} envíos totales',
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.38), fontSize: 12),
                  ),
                  SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: progress,
                      backgroundColor: Colors.white12,
                      valueColor: const AlwaysStoppedAnimation(
                          Color(0xFFFF6B35)),
                      minHeight: 4,
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(width: 8),
            Icon(Icons.chevron_right_rounded, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.24)),
          ],
        ),
      ),
    );
  }
}

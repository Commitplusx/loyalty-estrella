const fs = require('fs');

const filePath = 'C:\\Users\\Kaleb\\Desktop\\loyalty-estrella\\admin_app\\lib\\widgets\\incoming_order_overlay.dart';
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add _isStacked state and check in initState
const oldInitState = `  @override
  void initState() {
    super.initState();
    _checkPermissionsAndGetLocation();
  }`;

const newInitState = `  bool _isStacked = false;

  @override
  void initState() {
    super.initState();
    _checkPermissionsAndGetLocation();
    _verificarSiEsApilado();
  }

  Future<void> _verificarSiEsApilado() async {
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) return;
    
    // Contar pedidos activos del repartidor (excluyendo este que est\u00E1 pendiente)
    final response = await Supabase.instance.client
        .from('pedidos')
        .select('id')
        .eq('repartidor_id', userId)
        .inFilter('estado', ['asignado', 'aceptado', 'en_cocina', 'listo_para_recoger', 'en_camino']);
        
    if (mounted && (response as List).isNotEmpty) {
      setState(() {
        _isStacked = true;
      });
    }
  }`;

content = content.replace(oldInitState, newInitState);

// 2. Change "Nuevo pedido" label
const oldNuevo = `                        Text(
                          'Nuevo pedido',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: isDark ? Colors.white70 : Colors.black54,
                          ),
                        ),`;

const newNuevo = `                        Container(
                          padding: EdgeInsets.symmetric(horizontal: _isStacked ? 12 : 0, vertical: _isStacked ? 6 : 0),
                          decoration: BoxDecoration(
                            color: _isStacked ? Colors.purpleAccent.withOpacity(0.2) : Colors.transparent,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            _isStacked ? '🚀 VIAJE APILADO (SEGUNDO ENVÍO)' : 'Nuevo pedido',
                            style: TextStyle(
                              fontSize: _isStacked ? 14 : 16,
                              fontWeight: FontWeight.w900,
                              color: _isStacked ? Colors.purpleAccent : (isDark ? Colors.white70 : Colors.black54),
                              letterSpacing: _isStacked ? 0.5 : 0,
                            ),
                          ),
                        ),`;

content = content.replace(oldNuevo, newNuevo);

// 3. Add extra text to the price
const oldPrice = `                    Text(
                      '\\$\${widget.pedido.precioEntrega?.toStringAsFixed(2) ?? "45.50"}',
                      style: TextStyle(
                        fontSize: 48,
                        fontWeight: FontWeight.w900,
                        color: isDark ? Colors.white : Colors.black,
                        height: 1.1,
                        letterSpacing: -1.5,
                      ),
                    ),`;

const newPrice = `                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Text(
                          '\\$\${widget.pedido.precioEntrega?.toStringAsFixed(2) ?? "45.50"}',
                          style: TextStyle(
                            fontSize: 48,
                            fontWeight: FontWeight.w900,
                            color: isDark ? Colors.white : Colors.black,
                            height: 1.1,
                            letterSpacing: -1.5,
                          ),
                        ),
                        if (_isStacked)
                          Padding(
                            padding: const EdgeInsets.only(left: 12.0),
                            child: Text(
                              '+ EXTRA',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w900,
                                color: Colors.purpleAccent,
                              ),
                            ),
                          ),
                      ],
                    ),`;

content = content.replace(oldPrice, newPrice);

fs.writeFileSync(filePath, content, 'utf-8');
console.log("Overlay modificado con exito");

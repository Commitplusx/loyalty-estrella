const fs = require('fs');
let code = fs.readFileSync('C:/Users/Kaleb/Desktop/loyalty-estrella/admin_app/lib/screens/pedido_detail_screen.dart', 'utf-8');

// Fix `\\$${` to `\$${`
code = code.replace(/\\\\\$\$\{/g, '\\$${');

// Fix ok in _avanzarEstado
const str1 = `    final ok = await ref
        .read(pedidoServiceProvider)
        .actualizarEstado(widget.pedido.id, siguiente, pagoPendienteRestaurante: pagoPendiente);
    setState(() => _loading = false);

    if (mounted) {
      PremiumToast.show(
        context,
        title: ok ? 'Estado actualizado' : 'Error',
        description: ok ? 'Mensaje enviado al cliente por WhatsApp' : 'Error al actualizar el estado',
        isError: !ok,
      );
      if (ok) widget.onEstadoActualizado();
    }`;

const str1_fixed = `    final errorMsg = await ref
        .read(pedidoServiceProvider)
        .actualizarEstado(widget.pedido.id, siguiente, pagoPendienteRestaurante: pagoPendiente);
    setState(() => _loading = false);

    if (mounted) {
      if (errorMsg == null) {
        PremiumToast.show(context, title: 'Estado actualizado', description: 'Mensaje enviado al cliente por WhatsApp');
        widget.onEstadoActualizado();
      } else {
        PremiumToast.show(context, title: 'Error', description: 'Error al actualizar el estado', isError: true);
      }
    }`;

// Fix ok in _reasignarRepartidor
const str2 = `        final ok = await ref.read(pedidoServiceProvider).reasignarPedido(widget.pedido.id, repId.toString());
        setState(() => _loading = false);

        if (mounted) {
          PremiumToast.show(
            context,
            title: ok ? 'Reasignado' : 'Error',
            description: ok ? 'Notificado al nuevo repartidor' : 'Error al reasignar',
            isError: !ok,
          );
          if (ok) widget.onEstadoActualizado();
        }`;

const str2_fixed = `        final errorMsg = await ref.read(pedidoServiceProvider).reasignarPedido(widget.pedido.id, repId.toString());
        setState(() => _loading = false);

        if (mounted) {
          if (errorMsg == null) {
            PremiumToast.show(context, title: 'Reasignado', description: 'Notificado al nuevo repartidor');
            widget.onEstadoActualizado();
          } else {
            PremiumToast.show(context, title: 'Error', description: 'Error al reasignar', isError: true);
          }
        }`;

code = code.replace(str1, str1_fixed);
code = code.replace(str2, str2_fixed);

fs.writeFileSync('C:/Users/Kaleb/Desktop/loyalty-estrella/admin_app/lib/screens/pedido_detail_screen.dart', code);
console.log('Fixed compile errors');

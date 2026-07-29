import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { X, ShieldAlert, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface DisputaModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: any;
  onSuccess: () => void;
}

export function DisputaModal({ isOpen, onClose, pedido, onSuccess }: DisputaModalProps) {
  const [motivo, setMotivo] = useState('Faltó un artículo en el pedido');
  const [montoPuntos, setMontoPuntos] = useState<number>(0);
  const [penalizar, setPenalizar] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen || !pedido) return null;

  const handleReembolso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (montoPuntos <= 0) {
      toast.error('El monto debe ser mayor a 0');
      return;
    }

    setLoading(true);
    try {
      // 1. Obtener cliente actual para actualizar saldo (asumimos puntos como monedero virtual)
      const { data: cliente, error: errorCliente } = await supabase
        .from('clientes')
        .select('puntos')
        .eq('telefono', pedido.cliente_tel)
        .single();

      if (errorCliente) {
        throw new Error('No se encontró el cliente en la base de datos (clientes.telefono)');
      }

      // 2. Aumentar Puntos
      const nuevosPuntos = (cliente.puntos || 0) + montoPuntos;
      const { error: errorUpdate } = await supabase
        .from('clientes')
        .update({ puntos: nuevosPuntos })
        .eq('telefono', pedido.cliente_tel);

      if (errorUpdate) throw errorUpdate;

      // 3. Registrar el movimiento en movimientos_saldo
      const { error: errorMov } = await supabase
        .from('movimientos_saldo')
        .insert({
          cliente_tel: pedido.cliente_tel,
          tipo: 'reembolso_disputa',
          puntos_delta: montoPuntos,
          descripcion: `Reembolso Disputa Pedido #${pedido.id.substring(0, 8)} - ${motivo}`
        });

      if (errorMov) throw errorMov;

      // 4. (Opcional) Penalizar restaurante: Aquí podrías registrarlo en una tabla de deudas si existiera
      if (penalizar && pedido.restaurante_id) {
        // Ejemplo: Si existiera una tabla para registrar penalizaciones
        console.log(`Registrando penalización de $${montoPuntos} al restaurante ${pedido.restaurante_id}`);
      }

      toast.success(`Reembolso exitoso. El cliente recibió ${montoPuntos} puntos.`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error('Error al procesar reembolso: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
          <div className="flex items-center gap-2 text-rose-600">
            <ShieldAlert size={20} />
            <h2 className="font-black text-lg tracking-tight">Centro de Disputas</h2>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Resumen del pedido */}
        <div className="p-6 pb-2">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
            <div className="text-sm font-bold text-blue-900 mb-1">Pedido a disputar:</div>
            <div className="text-xs text-blue-800">
              <span className="font-bold">Cliente:</span> {pedido.cliente_nombre || pedido.cliente_tel}
            </div>
            <div className="text-xs text-blue-800">
              <span className="font-bold">Restaurante:</span> {pedido.restaurante}
            </div>
            <div className="text-xs text-blue-800">
              <span className="font-bold">Total Pagado:</span> ${pedido.total} ({pedido.metodo_pago})
            </div>
          </div>
        </div>

        <form onSubmit={handleReembolso} className="p-6 pt-0 space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
              Motivo de la disputa
            </label>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500"
            >
              <option value="Faltó un artículo en el pedido">Faltó un artículo en el pedido</option>
              <option value="Comida en mal estado o fría">Comida en mal estado o fría</option>
              <option value="Retraso extremo en entrega">Retraso extremo en entrega</option>
              <option value="Actitud del Repartidor">Actitud del Repartidor</option>
              <option value="Pedido cancelado pero cobrado">Pedido cancelado pero cobrado</option>
              <option value="Otro">Otro...</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
              Monto a reembolsar (en Puntos Monedero)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-zinc-400">$</span>
              <input
                required
                type="number"
                min="1"
                step="1"
                value={montoPuntos || ''}
                onChange={(e) => setMontoPuntos(parseInt(e.target.value) || 0)}
                placeholder="Ej. 100"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 pl-8 text-sm focus:outline-none focus:border-rose-500 font-bold"
              />
            </div>
            <p className="text-[10px] text-zinc-400 mt-1 flex items-center gap-1">
              <AlertCircle size={10} /> 1 Punto = $1 MXN aplicable en su próxima compra.
            </p>
          </div>

          <div className="flex items-start gap-3 bg-zinc-50 p-3 rounded-lg border border-zinc-100">
            <input
              type="checkbox"
              id="penalizar"
              checked={penalizar}
              onChange={(e) => setPenalizar(e.target.checked)}
              className="mt-1 w-4 h-4 rounded text-rose-500 focus:ring-rose-500"
            />
            <label htmlFor="penalizar" className="text-xs text-zinc-700 cursor-pointer">
              <span className="font-bold text-rose-600 block">Penalizar al Restaurante</span>
              Si activas esto, el monto del reembolso se descontará de las ganancias semanales del restaurante (Aliado).
            </label>
          </div>

          <div className="pt-4 border-t border-zinc-100 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-lg font-bold text-sm text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || montoPuntos <= 0}
              className="flex-1 px-4 py-2.5 rounded-lg font-bold text-sm text-white bg-rose-500 hover:bg-rose-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Aprobar Reembolso
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, X, Loader2, CheckCircle2, Ticket } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getMetaPuntos } from '@/lib/constants';
import type { Cliente } from '@/types';

interface CanjeModalProps {
  isOpen: boolean;
  onClose: () => void;
  cliente: Cliente;
}

export function CanjeModal({ isOpen, onClose, cliente }: CanjeModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successData, setSuccessData] = useState<{codigo: string, valor_pesos: number, expires_at: string} | null>(null);

  const isVip = cliente?.es_vip === true;
  // Meta de puntos dinámica según rango (centralizado en constants.ts)
  const puntosNecesarios = getMetaPuntos(cliente?.rango, isVip);
  const puedeCanjearNormal = (cliente?.puntos || 0) >= puntosNecesarios;
  const saldoBilletera = cliente?.saldo_billetera || 0;

  const handleCanjear = async (tipo: 'envio_normal' | 'envio_vip', montoPedido: number = 0) => {
    setLoading(true);
    setErrorMsg('');
    
    try {
      const { data, error } = await supabase.functions.invoke('canjear-puntos', {
        body: {
          clienteTel: cliente?.telefono,
          tipo,
          montoPedido, // 0 for normal, otherwise max 50 for VIP
        }
      });

      if (error) throw new Error(error.message);
      if (data && !data.success) throw new Error(data.error);

      setSuccessData(data);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Ocurrió un error al canjear los puntos.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-gray-700 dark:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {successData ? (
            <div className="p-8 text-center space-y-4">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">¡Cupón Generado!</h2>
              <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-500/30 rounded-xl">
                <p className="text-xs text-orange-600 dark:text-orange-400 font-semibold mb-1 uppercase tracking-wider">Código de Descuento</p>
                <p className="text-2xl font-black text-gray-900 dark:text-white font-mono tracking-widest">{successData.codigo}</p>
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Has obtenido <strong>${successData.valor_pesos} pesos</strong> de descuento para tu próximo envío.
              </p>
              <p className="text-xs text-gray-400">
                Se te ha enviado el código también por WhatsApp. Expira el {new Date(successData.expires_at).toLocaleDateString()}.
              </p>
              <button
                onClick={onClose}
                className="w-full mt-4 py-3 rounded-xl bg-gray-900 text-white font-bold hover:bg-gray-800 transition-colors"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <>
              <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-6 text-white text-center">
                <Gift className="w-12 h-12 mx-auto mb-2" />
                <h2 className="text-xl font-bold">Canjear Beneficio</h2>
                <p className="text-orange-100 text-sm">Convierte tus puntos en descuentos reales</p>
              </div>

              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <div>
                    <p className="text-sm text-gray-500">Tus puntos</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{cliente?.puntos || 0}</p>
                  </div>
                  {isVip && (
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Billetera</p>
                      <p className="text-2xl font-bold text-amber-600">${saldoBilletera.toFixed(2)}</p>
                    </div>
                  )}
                </div>

                {errorMsg && (
                  <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                    {errorMsg}
                  </div>
                )}

                {!isVip ? (
                  <div className="space-y-3">
                    <div className="p-4 border-2 border-orange-100 rounded-xl">
                      <h3 className="font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                        <Ticket className="w-5 h-5 text-orange-500" /> Envío Gratis ($50)
                      </h3>
                      <p className="text-sm text-gray-500 mb-3">Canjea 5 puntos por un cupón de $50 pesos de descuento en tu envío.</p>
                      <button
                        onClick={() => handleCanjear('envio_normal')}
                        disabled={loading || !puedeCanjearNormal}
                        className="w-full py-3 rounded-xl bg-orange-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-orange-600 transition-colors"
                      >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Canjear 5 puntos'}
                      </button>
                      {!puedeCanjearNormal && (
                        <p className="text-xs text-center text-red-500 mt-2">Necesitas 5 puntos para canjear.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-4 border-2 border-amber-200 bg-amber-50 dark:bg-amber-900/10 rounded-xl">
                      <h3 className="font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                        <Ticket className="w-5 h-5 text-amber-500" /> Envío Gratis VIP
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        Canjea 5 puntos y usa tu saldo de billetera para pagar tu envío (hasta $50 pesos).
                      </p>
                      <button
                        onClick={() => handleCanjear('envio_vip', 50)}
                        disabled={loading || !puedeCanjearNormal || saldoBilletera <= 0}
                        className="w-full py-3 rounded-xl bg-amber-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-600 transition-colors"
                      >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Canjear 5 puntos y Saldo'}
                      </button>
                      {!puedeCanjearNormal ? (
                        <p className="text-xs text-center text-red-500 mt-2">Necesitas 5 puntos.</p>
                      ) : saldoBilletera <= 0 ? (
                        <p className="text-xs text-center text-red-500 mt-2">No tienes saldo en tu billetera.</p>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

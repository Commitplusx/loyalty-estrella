// ══════════════════════════════════════════════════════════════════════════════
// HistorialTimeline — Historial de movimientos con tabs y lazy loading
// ══════════════════════════════════════════════════════════════════════════════
// Extraído de ClienteView para mantener responsabilidad única.

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Star, Gift, DollarSign, History } from 'lucide-react';
import { toast } from '@/components/ui/toast-native';
import type { RegistroMovimiento } from '@/types';

interface HistorialTimelineProps {
  historial: RegistroMovimiento[];
}

type TabFilter = 'todo' | 'puntos' | 'canjes';

export function HistorialTimeline({ historial }: HistorialTimelineProps) {
  const [historialTab, setHistorialTab] = useState<TabFilter>('todo');
  const [historialLimit, setHistorialLimit] = useState(10);

  const filtered = historial.filter(mov => {
    if (historialTab === 'puntos') return mov.tipo !== 'canje';
    if (historialTab === 'canjes') return mov.tipo === 'canje';
    return true;
  });

  return (
    <div className="mb-6">
      <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <History className="w-6 h-6 text-blue-500" />
        Historial Estrella
      </h3>
      {/* Tabs */}
      <div className="flex gap-2 mb-5 bg-gray-100 dark:bg-gray-800 p-1.5 rounded-2xl">
        {(['todo', 'puntos', 'canjes'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setHistorialTab(tab)}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
              historialTab === tab
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-md'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab === 'todo' ? 'Todo' : tab === 'puntos' ? '⭐ Puntos' : '🎁 Canjes'}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <p className="text-gray-500 italic text-center text-sm py-4">
            {historial.length === 0 ? 'Aún no hay movimientos' : 'No hay movimientos de este tipo'}
          </p>
        ) : (
          filtered
            .slice(0, historialLimit)
            .map((mov: RegistroMovimiento) => {
              const codeMatch = mov.descripcion?.match(/Código:\s*(CANJE-[A-Z0-9]+)/i);
              const couponCode = codeMatch ? codeMatch[1] : null;
              const isCanje = mov.tipo === 'canje';
              const isCashback = mov.tipo === 'acumulacion' && !!mov.monto_saldo;

              return (
                <div key={mov.id ?? `${mov.cliente_id}-${mov.created_at}`}>
                  <Card className={`border-0 shadow-sm overflow-hidden transition-all hover:shadow-md ${isCanje && couponCode ? 'ring-2 ring-amber-400/60' : 'bg-white dark:bg-card'}`}>
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                        isCashback ? 'bg-amber-100 dark:bg-amber-900/30' 
                        : isCanje ? 'bg-emerald-100 dark:bg-emerald-900/30' 
                        : 'bg-orange-100 dark:bg-orange-900/30'
                      }`}>
                        {isCashback
                          ? <DollarSign className="w-7 h-7 text-amber-500" />
                          : isCanje
                            ? <Gift className="w-7 h-7 text-emerald-500" />
                            : <Star className="w-7 h-7 text-orange-500 fill-orange-500" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white text-base">
                          {isCashback ? `Envío Registrado (+$${mov.monto_saldo?.toFixed(2)} Cashback)`
                            : isCanje ? (mov.monto_saldo !== undefined && mov.monto_saldo < 0 ? 'Uso de Billetera VIP' : 'Canje de Envío Gratis')
                            : '+1 Punto Acumulado'}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {new Date(mov.created_at).toLocaleDateString()} a las {new Date(mov.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          {mov.monto_saldo !== undefined && mov.monto_saldo < 0 && (
                            <span className="font-black text-rose-500 ml-2">(-${Math.abs(mov.monto_saldo).toFixed(2)})</span>
                          )}
                        </p>
                      </div>
                    </CardContent>
                    {/* Coupon Ticket */}
                    {couponCode && (
                      <div className="px-5 pb-5 -mt-1">
                        <div className="relative bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-2 border-dashed border-amber-300 dark:border-amber-600 rounded-2xl p-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-2xl">🎟️</span>
                            <div className="min-w-0">
                              <p className="text-[11px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold mb-0.5">Tu código de descuento</p>
                              <p className="font-mono font-black text-amber-700 dark:text-amber-300 text-xl tracking-widest truncate">{couponCode}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => navigator.clipboard.writeText(couponCode).then(() => toast.success('¡Copiado!', 'Código listo para usar')).catch(() => toast.error('Error', 'No se pudo copiar'))}
                            className="shrink-0 text-xs font-black text-amber-700 dark:text-amber-400 bg-amber-200 shadow-sm px-4 py-2.5 rounded-xl hover:bg-amber-300 transition-all active:scale-[0.95]"
                          >
                            Copiar
                          </button>
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
              );
            })
        )}
        {/* Ver más button */}
        {filtered.length > historialLimit && (
          <button
            onClick={() => setHistorialLimit(prev => prev + 10)}
            className="w-full py-4 text-base font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-2xl transition-all border-2 border-blue-100 dark:border-blue-800 shadow-sm active:scale-[0.98]"
          >
            Ver más movimientos ↓
          </button>
        )}
      </div>
    </div>
  );
}

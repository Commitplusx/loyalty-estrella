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
      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <History className="w-5 h-5 text-blue-500" />
        Historial Estrella
      </h3>
      {/* Tabs */}
      <div className="flex gap-1.5 mb-4 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
        {(['todo', 'puntos', 'canjes'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setHistorialTab(tab)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              historialTab === tab
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab === 'todo' ? 'Todo' : tab === 'puntos' ? '⭐ Puntos' : '🎁 Canjes'}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {historial.length === 0 ? (
          <p className="text-gray-500 italic text-center text-sm py-4">Aún no hay movimientos</p>
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
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                        isCashback ? 'bg-amber-100 dark:bg-amber-900/30' 
                        : isCanje ? 'bg-emerald-100 dark:bg-emerald-900/30' 
                        : 'bg-orange-100 dark:bg-orange-900/30'
                      }`}>
                        {isCashback
                          ? <DollarSign className="w-6 h-6 text-amber-500" />
                          : isCanje
                            ? <Gift className="w-6 h-6 text-emerald-500" />
                            : <Star className="w-6 h-6 text-orange-500 fill-orange-500" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white text-sm">
                          {isCashback ? `Envío Registrado (+$${mov.monto_saldo?.toFixed(2)} Cashback)`
                            : isCanje ? (mov.monto_saldo !== undefined && mov.monto_saldo < 0 ? 'Uso de Billetera VIP' : 'Canje de Envío Gratis')
                            : '+1 Punto Acumulado'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {new Date(mov.created_at).toLocaleDateString()} a las {new Date(mov.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          {mov.monto_saldo !== undefined && mov.monto_saldo < 0 && (
                            <span className="font-semibold text-rose-500 ml-2">(-${Math.abs(mov.monto_saldo).toFixed(2)})</span>
                          )}
                        </p>
                      </div>
                    </CardContent>
                    {/* Coupon Ticket */}
                    {couponCode && (
                      <div className="px-4 pb-4 -mt-1">
                        <div className="relative bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-dashed border-amber-300 dark:border-amber-600 rounded-xl p-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-lg">🎟️</span>
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">Tu código de descuento</p>
                              <p className="font-mono font-black text-amber-700 dark:text-amber-300 text-base tracking-widest truncate">{couponCode}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => navigator.clipboard.writeText(couponCode).then(() => toast.success('¡Copiado!', 'Código listo para usar')).catch(() => toast.error('Error', 'No se pudo copiar'))}
                            className="shrink-0 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-200/60 dark:bg-amber-800/40 px-2.5 py-1.5 rounded-lg hover:bg-amber-300/60 transition-colors"
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
            className="w-full py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors border border-blue-100 dark:border-blue-800"
          >
            Ver más movimientos ↓
          </button>
        )}
      </div>
    </div>
  );
}

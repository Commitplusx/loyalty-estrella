// ══════════════════════════════════════════════════════════════════════════════
// ProgressCard — Barra de progreso de puntos para clientes NO VIP
// ══════════════════════════════════════════════════════════════════════════════
// Muestra puntos actuales, barra de progreso, estrellas, y stats.

import { motion, MotionValue } from 'framer-motion';
import { Star, Gift, Ticket } from 'lucide-react';
import type { Cliente } from '@/types';

interface ProgressCardProps {
  cliente: Cliente;
  metaVip: number;
  progreso: number;
  enviosRestantes: number;
  displayPointsRounded: MotionValue<number>;
  onCanjear: () => void;
}

export function ProgressCard({
  cliente,
  metaVip,
  progreso,
  enviosRestantes,
  displayPointsRounded,
  onCanjear,
}: ProgressCardProps) {
  return (
    <>
      {/* Progress Card — minimalist */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-400 uppercase tracking-wider font-bold mb-1">Tu Progreso</p>
              <p className="text-5xl font-black text-gray-900">
                <motion.span>{displayPointsRounded}</motion.span>
                <span className="text-2xl text-gray-300 font-medium ml-1">/ {metaVip}</span>
              </p>
            </div>
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center shadow-inner">
              <Gift className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className="bg-gray-100 rounded-full h-4 overflow-hidden border border-gray-200">
            <motion.div
              className="bg-blue-600 h-full rounded-full shadow-[0_0_12px_rgba(37,99,235,0.4)]"
              initial={{ width: '0%' }}
              animate={{ width: `${progreso}%` }}
              transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
            />
          </div>
          {/* Motivational alert when 1 away */}
          {enviosRestantes === 1 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.3 }}
              className="mt-4 flex items-center gap-2 bg-green-50 border-2 border-green-200 rounded-2xl px-4 py-3"
            >
              <motion.span
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                className="text-2xl"
              >
                🎉
              </motion.span>
              <p className="text-sm font-bold text-green-700">¡Solo te falta <span className="text-green-600">1 envío</span> para el gratis!</p>
            </motion.div>
          )}
          {enviosRestantes === 0 && cliente.envios_totales > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.3 }}
              className="mt-3 flex items-center gap-2 bg-emerald-500 rounded-xl px-3 py-2.5"
            >
              <span className="text-lg">🎊</span>
              <p className="text-xs font-bold text-white">¡Tu próximo envío es COMPLETAMENTE GRATIS!</p>
            </motion.div>
          )}
          {enviosRestantes > 1 && (
            <p className="text-sm font-medium text-gray-500 mt-3 text-center">
              {enviosRestantes} envío{enviosRestantes > 1 ? 's' : ''} más para envío gratis
            </p>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
            {Array.from({ length: metaVip }).map((_, idx) => {
              const filled = idx < (cliente.puntos % metaVip);
              return (
                <div
                  key={idx}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                    filled ? 'bg-blue-600 shadow-md shadow-blue-400/40' : 'bg-gray-100'
                  }`}
                >
                  <Star className={`w-6 h-6 ${filled ? 'text-white fill-white' : 'text-gray-300'}`} />
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-xl font-black text-gray-900">{cliente.envios_totales}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Totales</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-blue-500">{cliente.puntos % metaVip}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Puntos</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-emerald-500">{cliente.envios_gratis_disponibles}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Gratis</p>
            </div>
          </div>
        </div>
      </div>

      {/* Botón de Canje */}
      <button
        onClick={onCanjear}
        className="w-full mt-4 py-5 rounded-2xl bg-blue-600 text-white font-black text-xl flex items-center justify-center gap-3 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 active:scale-[0.98]"
      >
        <Ticket className="w-6 h-6" />
        Canjear Beneficio
      </button>
    </>
  );
}

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
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Tu Progreso</p>
              <p className="text-3xl font-black text-gray-900">
                <motion.span>{displayPointsRounded}</motion.span>
                <span className="text-lg text-gray-300 font-medium"> / {metaVip}</span>
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
              <Gift className="w-6 h-6 text-blue-500" />
            </div>
          </div>
          <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
            <motion.div
              className="bg-blue-500 h-full rounded-full"
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
              className="mt-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2"
            >
              <motion.span
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                className="text-lg"
              >
                🎉
              </motion.span>
              <p className="text-xs font-bold text-green-700">¡Solo te falta <span className="text-green-600">1 envío</span> para el gratis!</p>
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
            <p className="text-xs text-gray-400 mt-2 text-center">
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
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 ${
                    filled ? 'bg-blue-500 shadow-sm shadow-blue-300' : 'bg-gray-100'
                  }`}
                >
                  <Star className={`w-5 h-5 ${filled ? 'text-white fill-white' : 'text-gray-300'}`} />
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
        className="w-full mt-3 py-3 rounded-xl bg-blue-600 text-white font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors shadow-sm"
      >
        <Ticket className="w-5 h-5" />
        Canjear Beneficio
      </button>
    </>
  );
}

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
          {(() => {
            const enviosPorPuntos = Math.floor((cliente.puntos || 0) / metaVip);
            const totalGratis = (cliente.envios_gratis_disponibles || 0) + enviosPorPuntos;

            if (totalGratis > 0) {
              return (
                <div className="flex items-center justify-between mb-4 bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-2xl border-2 border-emerald-100">
                  <div>
                    <p className="text-sm text-emerald-600 uppercase tracking-wider font-black mb-1 flex items-center gap-1">
                      <Gift className="w-4 h-4" /> ¡Premio Listo!
                    </p>
                    <p className="text-3xl font-black text-gray-900 leading-tight">
                      Tienes <span className="text-emerald-500">{totalGratis}</span> <br/>
                      <span className="text-2xl">Envío{totalGratis > 1 ? 's' : ''} Gratis</span>
                    </p>
                  </div>
                  <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0 animate-bounce">
                    <Gift className="w-8 h-8 text-white" />
                  </div>
                </div>
              );
            }

            return (
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
            );
          })()}
          <div className="bg-gray-100 rounded-full h-4 overflow-hidden border border-gray-200">
            <motion.div
              className="bg-blue-600 h-full rounded-full shadow-[0_0_12px_rgba(37,99,235,0.4)]"
              initial={{ width: '0%' }}
              animate={{ width: `${progreso}%` }}
              transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
            />
          </div>
          {/* Motivational alert when 1 away */}
          {enviosRestantes === 1 && Math.floor((cliente.puntos || 0) / metaVip) === 0 && (
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

          {/* Minimalist next-progress text if they already have free deliveries */}
          {(() => {
            const totalGratis = (cliente.envios_gratis_disponibles || 0) + Math.floor((cliente.puntos || 0) / metaVip);
            if (totalGratis > 0 && (cliente.puntos % metaVip) > 0) {
              return (
                <div className="mt-3 flex items-center justify-between px-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Para el siguiente</p>
                  <p className="text-sm font-bold text-blue-600">{cliente.puntos % metaVip} / {metaVip}</p>
                </div>
              );
            } else if (totalGratis === 0 && enviosRestantes > 1) {
              return (
                <p className="text-sm font-medium text-gray-500 mt-3 text-center">
                  {enviosRestantes} envío{enviosRestantes > 1 ? 's' : ''} más para envío gratis
                </p>
              );
            }
            return null;
          })()}
        </div>
        <div className="p-4">
          <div className="flex items-center justify-center gap-2 mb-4 flex-wrap mt-2">
            {Array.from({ length: metaVip }).map((_, idx) => {
              const filled = idx < (cliente.puntos % metaVip);
              return (
                <div
                  key={idx}
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-all duration-500 ${
                    filled ? 'bg-blue-600 shadow-md shadow-blue-400/40' : 'bg-gray-100'
                  }`}
                >
                  <Star className={`w-5 h-5 sm:w-6 sm:h-6 ${filled ? 'text-white fill-white' : 'text-gray-300'}`} />
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
              <p className="text-xl font-black text-emerald-500">{(cliente.envios_gratis_disponibles || 0) + Math.floor((cliente.puntos || 0) / metaVip)}</p>
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

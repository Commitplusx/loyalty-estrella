import { motion } from 'framer-motion';
import { Award, CalendarDays, DollarSign, Star } from 'lucide-react';
import { VALOR_CANJE_ESTIMADO } from '@/lib/constants';
import type { Cliente, RegistroMovimiento } from '@/types';

interface ClientStatsProps {
  cliente: Cliente;
  historial: RegistroMovimiento[];
}

export function ClientStats({ cliente, historial }: ClientStatsProps) {
  const currentYear = new Date().getFullYear();
  
  const enviosEsteAno = historial.filter(h => {
    const d = new Date(h.created_at);
    return d.getFullYear() === currentYear && h.tipo === 'acumulacion';
  }).length;

  const canjesTotales = historial.filter(h => h.tipo === 'canje').length;
  const ahorroEstimado = canjesTotales * VALOR_CANJE_ESTIMADO;

  const isVip = cliente.es_vip === true || (cliente.envios_totales ? cliente.envios_totales >= 15 : false);
  // "Socio VIP" era muy largo para el espacio reducido, abreviamos a "VIP"
  const rangoActual = isVip ? 'VIP' : (cliente.rango ?? 'bronce');
  const rangoEmoji = isVip ? '👑' : (rangoActual === 'oro' ? '🥇' : rangoActual === 'plata' ? '🥈' : '🥉');
  const rangoNext = isVip ? null : (rangoActual === 'bronce' ? 'Plata' : rangoActual === 'plata' ? 'Oro' : 'VIP');

  // Clase base compartida para que las 3 tarjetas tengan exactamente el mismo tamaño y centrado
  const cardClass = "relative overflow-hidden rounded-xl bg-white dark:bg-card border border-gray-100 dark:border-gray-800 p-4 text-center shadow-sm flex flex-col items-center justify-center gap-1";
  const bgIconClass = "w-8 h-8 absolute -right-1 -top-1 opacity-20";

  return (
    <div className="mb-6">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <Award className="w-5 h-5 text-orange-500" />
        Tu Resumen {currentYear}
      </h3>
      
      <div className="grid grid-cols-3 gap-3">
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={cardClass}
        >
          <CalendarDays className={`${bgIconClass} text-orange-400`} />
          <p className="text-2xl font-black text-gray-900 dark:text-white leading-none">{enviosEsteAno}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium">Envíos</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className={cardClass}
        >
          <DollarSign className={`${bgIconClass} text-emerald-400`} />
          <p className="text-2xl font-black text-gray-900 dark:text-white leading-none">${ahorroEstimado}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium">Ahorro</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={cardClass}
        >
          <Star className={`${bgIconClass} text-amber-400`} />
          {/* El emoji al mismo font-size que los números de las otras 2 tarjetas */}
          <span className="text-2xl leading-none" role="img" aria-label={rangoActual}>{rangoEmoji}</span>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium truncate w-full text-center">{rangoActual}</p>
        </motion.div>
      </div>

      {rangoNext && (
        <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 mt-2">
          Sigue pidiendo para llegar al nivel <strong className="text-orange-500">{rangoNext}</strong>
        </p>
      )}
    </div>
  );
}

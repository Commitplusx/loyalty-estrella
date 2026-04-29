import { motion } from 'framer-motion';
import { Award, TrendingUp, CalendarDays, DollarSign } from 'lucide-react';
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
  // BUG-23 fix: use $50 (actual delivery price) not hardcoded $35 (happy hour price)
  const VALOR_CANJE_ESTIMADO = 50;
  const ahorroEstimado = canjesTotales * VALOR_CANJE_ESTIMADO;

  const rangoEmoji = (cliente.rango ?? 'bronce') === 'oro' ? '👑' : (cliente.rango ?? 'bronce') === 'plata' ? '🥈' : '🥉';
  const rangoNext = (cliente.rango ?? 'bronce') === 'bronce' ? 'Plata' : (cliente.rango ?? 'bronce') === 'plata' ? 'Oro' : null;

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
          className="relative overflow-hidden rounded-xl bg-white dark:bg-card border border-gray-100 dark:border-gray-800 p-4 text-center shadow-sm"
        >
          <CalendarDays className="w-8 h-8 text-orange-200 dark:text-orange-900/40 absolute -right-1 -top-1" />
          <p className="text-2xl font-black text-gray-900 dark:text-white">{enviosEsteAno}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wider font-medium">Envíos</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="relative overflow-hidden rounded-xl bg-white dark:bg-card border border-gray-100 dark:border-gray-800 p-4 text-center shadow-sm"
        >
          <DollarSign className="w-8 h-8 text-emerald-200 dark:text-emerald-900/40 absolute -right-1 -top-1" />
          <p className="text-2xl font-black text-gray-900 dark:text-white">${ahorroEstimado}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wider font-medium">Ahorro</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative overflow-hidden rounded-xl bg-white dark:bg-card border border-gray-100 dark:border-gray-800 p-4 text-center shadow-sm"
        >
          <TrendingUp className="w-8 h-8 text-amber-200 dark:text-amber-900/40 absolute -right-1 -top-1" />
          <p className="text-xl font-black text-gray-900 dark:text-white">{rangoEmoji}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wider font-medium">{cliente.rango ?? 'Bronce'}</p>
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

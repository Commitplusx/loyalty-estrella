import { motion } from 'framer-motion';
import { Award, TrendingUp, CalendarDays, DollarSign } from 'lucide-react';
import type { Cliente } from '@/types';

interface ClientStatsProps {
  cliente: Cliente;
  historial: any[];
}

export function ClientStats({ cliente, historial }: ClientStatsProps) {
  // Calculos para el Wrapped
  const currentYear = new Date().getFullYear();
  
  // Total de envíos de este año
  const enviosEsteAno = historial.filter(h => {
    const d = new Date(h.created_at);
    return d.getFullYear() === currentYear && h.tipo === 'acumulacion';
  }).length;

  // Ahorro estimado: (número de envios gratis cobrados) * $35 (costo promedio, asumiendo precio feliz)
  // O podemos contar todos los "canje" del historial.
  const canjesTotales = historial.filter(h => h.tipo === 'canje').length;
  const ahorroEstimado = canjesTotales * 35; // $35 por envio gratis

  return (
    <div className="mt-8 mb-6">
      <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Award className="w-5 h-5 text-purple-500" />
        Tu Wrapped {currentYear}
      </h3>
      
      <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
        {/* Card 1: Envíos este año */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden"
        >
          <div className="absolute -right-4 -top-4 opacity-20">
            <CalendarDays className="w-24 h-24" />
          </div>
          <p className="text-sm text-purple-100 font-medium mb-1">Envíos este año</p>
          <h4 className="text-3xl font-black">{enviosEsteAno}</h4>
          <p className="text-xs text-purple-200 mt-2">¡Gracias por tu preferencia!</p>
        </motion.div>

        {/* Card 2: Ahorro Total */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden"
        >
          <div className="absolute -right-4 -top-4 opacity-20">
            <DollarSign className="w-24 h-24" />
          </div>
          <p className="text-sm text-emerald-100 font-medium mb-1">Ahorro Estimado</p>
          <h4 className="text-3xl font-black">${ahorroEstimado}</h4>
          <p className="text-xs text-emerald-200 mt-2">En envíos gratis canjeados</p>
        </motion.div>

        {/* Card 3: Rango Actual */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-rose-400 to-red-600 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden col-span-2 sm:col-span-2"
        >
          <div className="absolute right-0 top-0 opacity-20 transform translate-x-4 -translate-y-4">
            <TrendingUp className="w-32 h-32" />
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-2xl">
                {cliente.rango === 'oro' ? '👑' : cliente.rango === 'plata' ? '🥈' : '🥉'}
              </span>
            </div>
            <div>
              <p className="text-sm text-rose-100 font-medium mb-1">Nivel Actual</p>
              <h4 className="text-3xl font-black uppercase tracking-wider">{cliente.rango}</h4>
              <p className="text-xs text-rose-200 mt-1">
                {cliente.rango === 'oro' ? '¡Disfrutas de la meta mínima de envíos!' : `Lleva tus pedidos al Nivel ${cliente.rango === 'bronce' ? 'Plata' : 'Oro'}`}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

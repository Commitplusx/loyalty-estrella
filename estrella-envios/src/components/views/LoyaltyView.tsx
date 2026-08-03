import { Gift, Star, Trophy, CheckCircle2, Ticket, ExternalLink, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { motion } from 'framer-motion';

interface LoyaltyViewProps {
  setCurrentView: (view: string) => void;
}

const RANK_COLOR: Record<string, string> = {
  bronce: 'text-amber-600 bg-amber-50 border-amber-200',
  plata:  'text-gray-500  bg-gray-50  border-gray-200',
  oro:    'text-yellow-600 bg-yellow-50 border-yellow-200',
};

export function LoyaltyView({ setCurrentView }: LoyaltyViewProps) {
  const { user } = useAppStore();

  const { data: profile } = useQuery({
    queryKey: ['cliente_loyalty', user?.phone],
    queryFn: async () => {
      if (!user?.phone || user.id === 'guest') return null;
      const { data } = await supabase
        .from('clientes')
        .select('*')
        .eq('telefono', user.phone.replace(/\D/g, ''))
        .maybeSingle();
      return data;
    },
    enabled: !!user?.phone && user.id !== 'guest',
  });

  const isGuest        = !user?.phone || user.id === 'guest';
  const puntos         = profile?.puntos              ?? 0;
  const rango          = profile?.rango               ?? 'bronce';
  const entregasCiclo  = profile?.entregas_ciclo      ?? 0;
  const enviosGratis   = profile?.envios_gratis_disponibles ?? 0;
  const displayName    = profile?.nombre ?? (isGuest ? 'Invitado' : user?.phone ?? '—');

  const initials = (() => {
    const n = profile?.nombre;
    if (!n) return user?.phone?.slice(-2) ?? '★';
    const p = n.trim().split(' ');
    return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : n.slice(0, 2).toUpperCase();
  })();

  const rankCls = RANK_COLOR[rango] ?? RANK_COLOR.bronce;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">

      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 px-8 md:px-12 h-14 flex items-center shrink-0">
        <h1 className="text-sm font-bold text-gray-900">Mi Perfil</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 md:px-12 py-10">
        <div className="max-w-3xl w-full mx-auto space-y-8">

          {/* Section label */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Loyalty</p>
            <h2 className="text-3xl font-black text-gray-900">Estrella Rewards</h2>
          </div>

          {/* Profile + stats row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-gray-100 rounded-2xl overflow-hidden border border-gray-100">

            {/* Avatar block */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="bg-white p-6 flex flex-col gap-3"
            >
              <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0">
                {initials}
              </div>
              <div>
                <p className="font-bold text-gray-900 truncate">{displayName}</p>
                <div className={`inline-flex items-center gap-1.5 mt-1.5 border text-xs font-bold px-2.5 py-1 rounded-full ${rankCls}`}>
                  <Trophy className="w-3 h-3" />
                  {rango.charAt(0).toUpperCase() + rango.slice(1)}
                </div>
              </div>
            </motion.div>

            {/* Puntos */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              className="bg-white p-6 flex flex-col justify-between"
            >
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Puntos totales</p>
              <div>
                <p className="text-4xl font-black text-gray-900">{puntos}</p>
                <p className="text-xs text-gray-400 mt-1">acumulados</p>
              </div>
            </motion.div>

            {/* Cupones */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="bg-white p-6 flex flex-col justify-between"
            >
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Envíos gratis</p>
              <div className="flex items-end gap-2">
                <p className="text-4xl font-black text-gray-900">{enviosGratis}</p>
                <Ticket className="w-5 h-5 text-yellow-500 mb-1.5 shrink-0" />
              </div>
              <p className="text-xs text-gray-400">disponibles</p>
            </motion.div>
          </div>

          {/* Punch card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 }}
            className="border border-gray-100 rounded-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tarjeta de sellos</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">Cada 5 envíos → 1 gratis</p>
              </div>
              <span className="text-xs font-bold text-gray-500 bg-gray-50 border border-gray-200 px-3 py-1 rounded-full">
                {entregasCiclo}/5 envíos
              </span>
            </div>
            <div className="px-6 py-5 bg-white flex items-center gap-3">
              {[1, 2, 3, 4, 5].map((step) => (
                <div
                  key={step}
                  className={`flex-1 h-2 rounded-full transition-colors duration-300 ${
                    entregasCiclo >= step ? 'bg-yellow-400' : 'bg-gray-100'
                  }`}
                />
              ))}
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ml-1 ${
                entregasCiclo >= 5 ? 'bg-yellow-400' : 'bg-gray-100'
              }`}>
                <Gift className={`w-4 h-4 ${entregasCiclo >= 5 ? 'text-white' : 'text-gray-300'}`} />
              </div>
            </div>
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-500">¡El 6to envío corre por nuestra cuenta!</p>
            </div>
          </motion.div>

          {/* Info cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-100 rounded-2xl overflow-hidden border border-gray-100">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-white p-6 flex items-start gap-4"
            >
              <div className="w-9 h-9 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center shrink-0">
                <Star className="w-4 h-4 text-yellow-500" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm mb-1">El 6to Envío es Gratis</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Acumula 5 sellos y tu sexto envío será 100% gratuito. Canjea con tu código QR.
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="bg-white p-6 flex items-start gap-4"
            >
              <div className="w-9 h-9 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-gray-400" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm mb-1">Horario de Atención</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Lunes a Domingo, de <strong className="text-gray-700">9:00 AM</strong> a <strong className="text-gray-700">10:00 PM</strong>.
                </p>
              </div>
            </motion.div>
          </div>

          {/* CTA */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            onClick={() => window.open('https://www.app-estrella.shop/', '_blank')}
            className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
          >
            Visitar app-estrella.shop <ExternalLink className="w-3.5 h-3.5" />
          </motion.button>

        </div>
      </div>
    </div>
  );
}

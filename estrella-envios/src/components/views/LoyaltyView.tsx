import { ArrowLeft, Gift, Star, ShieldCheck, Trophy, Sparkles, Clock, CheckCircle2, Ticket, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { motion } from 'framer-motion';
import { useState } from 'react';

interface LoyaltyViewProps {
  setCurrentView: (view: string) => void;
}

export function LoyaltyView({ setCurrentView }: LoyaltyViewProps) {
  const { user } = useAppStore();
  const [isScrolled, setIsScrolled] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['cliente_loyalty', user?.phone],
    queryFn: async () => {
      if (!user?.phone || user.id === 'guest') return null;
      const cleanPhone = user.phone.replace(/\D/g, '');
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('telefono', cleanPhone)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.phone && user.id !== 'guest',
  });

  const isGuest = !user?.phone || user.id === 'guest';
  const puntos = profile?.puntos || 0;
  const rango = profile?.rango || 'bronce';
  const entregasCiclo = profile?.entregas_ciclo || 0;
  const enviosGratis = profile?.envios_gratis_disponibles || 0;

  const getInitials = (name: string) => {
    if (!name) return user?.phone ? user.phone.substring(user.phone.length - 2) : '🌟';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div 
      className="flex flex-col h-full bg-gray-50 relative w-full overflow-y-auto custom-scrollbar"
      onScroll={(e) => setIsScrolled(e.currentTarget.scrollTop > 10)}
    >
      {/* Header */}
      <header className={`px-5 pt-8 pb-4 flex items-center justify-between sticky top-0 z-20 transition-all duration-300 ${
        isScrolled ? 'bg-white/90 backdrop-blur-xl shadow-sm border-b border-gray-100' : 'bg-transparent border-b border-transparent'
      }`}>
        <button 
          onClick={() => setCurrentView('home')}
          className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors border ${
            isScrolled ? 'bg-gray-50 border-gray-200 hover:bg-gray-100' : 'bg-white/80 border-gray-200/50 shadow-sm backdrop-blur-sm'
          }`}
        >
          <ArrowLeft className="w-5 h-5 text-gray-900" />
        </button>
        
        <span className={`font-black text-gray-900 transition-all duration-300 ${isScrolled ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
          Estrella Loyalty
        </span>

        <div className="w-10 h-10"></div>
      </header>

      <div className="max-w-3xl mx-auto w-full p-5 space-y-6">
        
        {/* Profile Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 flex flex-col items-center text-center relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-100 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 opacity-60"></div>
          
          <div className="w-20 h-20 bg-gray-900 rounded-[1.5rem] flex items-center justify-center text-white text-3xl font-bold shadow-xl mb-4 relative z-10">
            {profile?.nombre ? getInitials(profile.nombre) : (isGuest ? '🌟' : getInitials(user.phone))}
          </div>
          
          <h2 className="text-2xl font-black text-gray-900 mb-1 relative z-10">
            {profile?.nombre || (isGuest ? 'Invitado Especial' : user?.phone)}
          </h2>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-bold mb-6 border border-purple-100 relative z-10">
            <Trophy className="w-4 h-4" />
            Nivel {rango.charAt(0).toUpperCase() + rango.slice(1)}
          </div>

          <div className="w-full bg-gray-50 rounded-2xl p-5 border border-gray-100 flex justify-between items-center relative z-10 mb-4">
            <div className="text-left">
              <p className="text-sm text-gray-500 font-medium mb-0.5">Cupones Gratis</p>
              <h3 className="text-3xl font-black text-gray-900">{enviosGratis} <span className="text-sm font-bold text-gray-400">disponibles</span></h3>
            </div>
            <div className="w-14 h-14 bg-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30 transform rotate-6">
              <Ticket className="w-7 h-7 text-white" />
            </div>
          </div>

          {/* Punch Card (5 envíos -> 1 gratis) */}
          <div className="w-full relative z-10 mt-2">
            <div className="flex justify-between items-center mb-3 px-1">
              <span className="text-sm font-bold text-gray-700">Tu progreso actual</span>
              <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">{entregasCiclo}/5 envíos</span>
            </div>
            <div className="flex justify-between items-center gap-2 bg-gray-50 p-4 rounded-2xl border border-gray-100">
              {[1, 2, 3, 4, 5].map((step) => (
                <div key={step} className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${entregasCiclo >= step ? 'bg-purple-500 border-purple-500 text-white' : 'bg-white border-gray-200 text-gray-300'}`}>
                  {entregasCiclo >= step ? <CheckCircle2 className="w-5 h-5" /> : <span className="text-sm font-bold">{step}</span>}
                </div>
              ))}
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-yellow-400 to-yellow-500 border-2 border-yellow-200 flex items-center justify-center shadow-md transform rotate-12 shrink-0">
                <Gift className="w-6 h-6 text-yellow-950" />
              </div>
            </div>
            <p className="text-xs text-gray-500 font-medium mt-3 text-center">¡El 6to envío corre por nuestra cuenta!</p>
          </div>
        </motion.div>

        {/* Info Cards */}
        <motion.h3 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="text-lg font-black text-gray-900 px-1 pt-2"
        >
          Beneficios Estrella
        </motion.h3>
        
        <div className="space-y-3">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="bg-gradient-to-tr from-gray-900 to-gray-800 p-5 rounded-2xl shadow-xl flex items-start gap-4 text-white relative overflow-hidden"
          >
            <div className="absolute right-0 bottom-0 w-32 h-32 bg-yellow-400 rounded-full blur-[80px] opacity-30"></div>
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center shrink-0 backdrop-blur-sm border border-white/10">
              <Gift className="w-6 h-6 text-yellow-400" />
            </div>
            <div className="relative z-10">
              <h4 className="font-bold text-white mb-1">El 6to Envío es Gratis</h4>
              <p className="text-sm text-gray-300">Acumula 5 sellos pidiendo mandaditos y tu sexto envío será 100% gratuito. Solo canjea tu código QR.</p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-start gap-4"
          >
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
              <Star className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900 mb-1">Horario de Atención</h4>
              <p className="text-sm text-gray-500">Estamos disponibles de Lunes a Domingo, desde las <b>9:00 AM hasta las 10:00 PM</b>.</p>
            </div>
          </motion.div>
        </div>

        <motion.button 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="w-full bg-white border border-gray-200 text-gray-700 font-bold py-4 rounded-2xl hover:bg-gray-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-8 shadow-sm"
          onClick={() => {
            window.open("https://www.app-estrella.shop/", "_blank");
          }}
        >
          Visitar app-estrella.shop <ExternalLink className="w-4 h-4" />
        </motion.button>
      </div>
    </div>
  );
}

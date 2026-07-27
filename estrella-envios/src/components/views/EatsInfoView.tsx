import { ArrowLeft, Utensils, Star, ExternalLink, Heart, DollarSign, Gift } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';

interface EatsInfoViewProps {
  setCurrentView: (view: string) => void;
}

export function EatsInfoView({ setCurrentView }: EatsInfoViewProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  return (
    <div 
      className="flex flex-col h-full bg-gray-50 relative w-full overflow-y-auto custom-scrollbar"
      onScroll={(e) => setIsScrolled(e.currentTarget.scrollTop > 10)}
    >
      {/* Background that covers the top behind the header */}
      <div className="absolute top-0 left-0 right-0 h-[400px] bg-gradient-to-b from-orange-100/60 to-gray-50 z-0 pointer-events-none"></div>

      {/* Dynamic Header */}
      <header className={`px-5 flex items-center justify-between sticky top-0 z-20 transition-all duration-300 ${
        isScrolled ? 'pt-4 pb-3 bg-white/90 backdrop-blur-xl shadow-sm border-b border-gray-100' : 'pt-6 pb-2 bg-transparent border-b border-transparent'
      }`}>
        <button 
          onClick={() => setCurrentView('home')}
          className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors border ${
            isScrolled ? 'bg-gray-50 border-gray-200 hover:bg-gray-100' : 'bg-white/60 border-gray-200/50 shadow-sm backdrop-blur-sm hover:bg-white'
          }`}
        >
          <ArrowLeft className="w-5 h-5 text-gray-900" />
        </button>
        
        <span className={`font-black text-gray-900 transition-all duration-300 ${isScrolled ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
          Estrella Eats
        </span>

        <div className="w-10 h-10"></div>
      </header>

      {/* Hero Section */}
      <div className="relative w-full pt-2 pb-10 flex flex-col items-center">
        
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0.4, duration: 0.8 }}
          className="relative z-10 w-40 h-40 md:w-48 md:h-48 mb-6"
        >
          {/* Subtle glow behind the image */}
          <div className="absolute inset-0 bg-orange-400 rounded-full blur-2xl opacity-20 transform scale-110"></div>
          <div className="relative w-full h-full bg-white rounded-full shadow-xl flex items-center justify-center border-4 border-white overflow-hidden p-2">
             <img src="/estrella-circle.png" alt="Estrella Eats Logo" className="w-full h-full object-contain" />
          </div>
          {/* Floating badge */}
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: "spring" }}
            className="absolute -bottom-2 -right-2 bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-[11px] px-4 py-1.5 rounded-full shadow-lg border-2 border-white transform rotate-6"
          >
            ¡NUEVO!
          </motion.div>
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl md:text-5xl font-black text-gray-900 mb-3 tracking-tight text-center relative z-10"
        >
          Estrella <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-500">Eats</span>
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-[17px] text-gray-600 font-medium text-center text-balance max-w-sm px-6 relative z-10 leading-relaxed"
        >
          Pide de tus restaurantes favoritos en Comitán y recibe calientito hasta tu puerta.
        </motion.p>
      </div>

      <div className="flex-1 flex flex-col max-w-md mx-auto w-full px-5 pb-12 relative z-10">
        
        {/* Features Section */}
        <div className="space-y-4 mb-8">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-start gap-4 hover:shadow-md transition-shadow"
          >
            <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center shrink-0">
              <DollarSign className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900 text-base mb-0.5">Precios Reales</h4>
              <p className="text-[13px] text-gray-500 leading-snug">Sin precios inflados. Pagas exactamente lo mismo que en el restaurante local.</p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-start gap-4 hover:shadow-md transition-shadow"
          >
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center shrink-0">
              <Heart className="w-6 h-6 text-red-500 fill-red-50" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900 text-base mb-0.5">Apoyo Local</h4>
              <p className="text-[13px] text-gray-500 leading-snug">Impulsamos el comercio de Comitán con un esquema verdaderamente justo para todos.</p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
            className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-start gap-4 hover:shadow-md transition-shadow"
          >
            <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center shrink-0">
              <Gift className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900 text-base mb-0.5">Gana Recompensas</h4>
              <p className="text-[13px] text-gray-500 leading-snug">Todos tus pedidos suman puntos directos a tus beneficios de Estrella Loyalty.</p>
            </div>
          </motion.div>
        </div>
        
        {/* Actions */}
        <div className="mt-auto space-y-3 pb-6">
          <motion.button 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.6 }}
            className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-orange-500/30 hover:shadow-orange-500/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-lg"
            onClick={() => {
              window.open("https://estrella-eats.mx", "_blank");
            }}
          >
            Ir a Estrella Eats <ExternalLink className="w-5 h-5" />
          </motion.button>
          
          <motion.button 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.7 }}
            className="w-full bg-white text-gray-700 font-bold py-4 rounded-2xl border border-gray-200 hover:bg-gray-50 active:scale-[0.98] transition-all"
            onClick={() => setCurrentView('home')}
          >
            Volver al inicio
          </motion.button>
        </div>
      </div>
    </div>
  );
}

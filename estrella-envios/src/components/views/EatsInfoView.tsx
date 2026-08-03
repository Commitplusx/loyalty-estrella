import { DollarSign, Heart, Gift, ExternalLink, Utensils } from 'lucide-react';
import { motion } from 'framer-motion';

interface EatsInfoViewProps {
  setCurrentView: (view: string) => void;
}

const FEATURES = [
  {
    icon: DollarSign,
    title: 'Precios reales',
    desc: 'Sin precios inflados. Pagas exactamente lo mismo que en el restaurante.',
  },
  {
    icon: Heart,
    title: 'Apoyo local',
    desc: 'Impulsamos el comercio de Comitán con un esquema justo para restaurantes y repartidores.',
  },
  {
    icon: Gift,
    title: 'Gana recompensas',
    desc: 'Todos tus pedidos suman puntos a tus beneficios de Estrella Loyalty.',
  },
];

export function EatsInfoView({ setCurrentView }: EatsInfoViewProps) {
  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">

      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 px-8 md:px-12 h-14 flex items-center shrink-0">
        <h1 className="text-sm font-bold text-gray-900">Estrella Eats</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 md:px-12 py-10">
        <div className="max-w-3xl w-full mx-auto">

          {/* Hero text */}
          <div className="mb-10">
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4"
            >
              Próximamente · Comitán
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 }}
              className="text-4xl md:text-5xl font-black text-gray-900 leading-tight tracking-tight mb-4"
            >
              Estrella <span className="text-yellow-400">Eats</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
              className="text-base text-gray-500 max-w-md leading-relaxed"
            >
              Pide de tus restaurantes favoritos en Comitán y recibe tu pedido calientito, directo a tu puerta.
            </motion.p>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-gray-100 rounded-2xl overflow-hidden border border-gray-100 mb-10">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 + i * 0.06 }}
                  className="bg-white p-6 flex flex-col gap-4"
                >
                  <div className="w-9 h-9 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center">
                    <Icon className="w-4 h-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm mb-1">{f.title}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Logo block */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.25 }}
            className="flex items-center gap-5 p-6 border border-gray-100 rounded-2xl mb-8"
          >
            <div className="w-14 h-14 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center shrink-0">
              <Utensils className="w-6 h-6 text-gray-400" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Estrella Eats</p>
              <p className="text-xs text-gray-400 mt-0.5">
                La plataforma de delivery que apoya al comercio local de Comitán de Domínguez.
              </p>
            </div>
          </motion.div>

          {/* Actions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-4"
          >
            <button
              onClick={() => window.open('https://estrella-eats.mx', '_blank')}
              className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold px-6 py-3 rounded-xl transition-all active:scale-95"
            >
              Ir a Estrella Eats <ExternalLink className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentView('home')}
              className="text-sm font-medium text-gray-400 hover:text-gray-700 transition-colors"
            >
              Volver al inicio
            </button>
          </motion.div>

        </div>
      </div>
    </div>
  );
}

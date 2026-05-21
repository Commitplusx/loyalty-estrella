// OnboardingWelcome.tsx — Pantalla de bienvenida para nuevos usuarios
// Se muestra UNA VEZ en la primera visita (localStorage flag)
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, QrCode, Star, ArrowRight, ChevronRight } from 'lucide-react';

const STEPS = [
  {
    icon: Star,
    color: 'from-blue-500 to-blue-700',
    glow: 'shadow-blue-500/40',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    iconColor: 'text-blue-600',
    title: 'Acumula con cada envío',
    desc: 'Cada entrega que hagas con nosotros suma 1 punto automáticamente. Sin formularios, sin apps extra.',
    badge: '1 envío = 1 punto',
  },
  {
    icon: Gift,
    color: 'from-amber-500 to-orange-600',
    glow: 'shadow-amber-500/40',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    iconColor: 'text-amber-600',
    title: '¡El 6to envío es gratis!',
    desc: 'Al llegar a 5 puntos, tu siguiente envío no te cuesta nada. El beneficio se aplica automáticamente.',
    badge: '5 puntos = 1 gratis',
  },
  {
    icon: QrCode,
    color: 'from-purple-500 to-violet-700',
    glow: 'shadow-purple-500/40',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    iconColor: 'text-purple-600',
    title: 'Tu QR, tu identidad',
    desc: 'Ingresa tu número y accede a tu perfil con puntos, historial y QR personal para canjearlo en segundos.',
    badge: 'Acceso con PIN',
  },
];

interface OnboardingWelcomeProps {
  onFinish: () => void;
}

export function OnboardingWelcome({ onFinish }: OnboardingWelcomeProps) {
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const Icon = current.icon;

  const handleFinish = () => {
    setExiting(true);
    localStorage.setItem('estrella_onboarding_done', '1');
    setTimeout(onFinish, 400);
  };

  const handleNext = () => (isLast ? handleFinish() : setStep(s => s + 1));

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="onboarding-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-40 flex flex-col items-center justify-between
            bg-gradient-to-br from-slate-950 via-blue-950/90 to-slate-900
            backdrop-blur-sm px-5 select-none"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
        >
          {/* Top: dots + skip */}
          <div className="w-full max-w-sm flex items-center justify-between">
            <div className="flex gap-2">
              {STEPS.map((_, i) => (
                <motion.div key={i} className="h-2 rounded-full bg-white"
                  animate={{ width: i === step ? 28 : 8, opacity: i <= step ? 1 : 0.25 }}
                  transition={{ duration: 0.3 }} />
              ))}
            </div>
            <button onClick={handleFinish}
              className="text-white/40 hover:text-white/70 text-sm font-medium transition-colors px-2 py-1">
              Omitir
            </button>
          </div>

          {/* Icon */}
          <AnimatePresence mode="wait">
            <motion.div key={step}
              initial={{ opacity: 0, x: 60, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -60, scale: 0.92 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-6 w-full max-w-sm"
            >
              <div className={`relative w-32 h-32 rounded-3xl bg-gradient-to-br ${current.color}
                flex items-center justify-center shadow-2xl ${current.glow}`}>
                <Icon className="w-16 h-16 text-white" strokeWidth={1.5} />
                <motion.div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${current.color} opacity-40`}
                  animate={{ scale: [1, 1.14, 1] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }} />
              </div>

              <span className={`text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full border ${current.bg} ${current.iconColor} border-current/20`}>
                {current.badge}
              </span>

              <h2 className="text-white text-2xl sm:text-3xl font-black text-center tracking-tight leading-tight">
                {current.title}
              </h2>
              <p className="text-white/55 text-center text-sm sm:text-base leading-relaxed max-w-xs">
                {current.desc}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* CTA */}
          <div className="w-full max-w-sm space-y-2">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={handleNext}
              className={`w-full py-4 rounded-2xl font-bold text-base text-white
                bg-gradient-to-r ${current.color} shadow-xl ${current.glow}
                flex items-center justify-center gap-2`}>
              {isLast
                ? <><span>Consultar mis puntos</span><ArrowRight className="w-5 h-5" /></>
                : <><span>Siguiente</span><ChevronRight className="w-5 h-5" /></>}
            </motion.button>
            <p className="text-center text-white/25 text-xs font-medium">{step + 1} de {STEPS.length}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

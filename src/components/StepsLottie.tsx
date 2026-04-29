import { useState, useEffect, useRef } from 'react';
import Lottie from 'lottie-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Phone, QrCode, Gift } from 'lucide-react';

/* ── Step data ── */
const STEPS = [
  {
    num: '01',
    title: 'Pide tu envío',
    desc: 'Contacta al repartidor por WhatsApp y realiza tu pedido como siempre. Rápido y sin complicaciones.',
    src: '/lottie/step-pedir.json',
    color: 'from-blue-50 to-blue-100/60',
    barColor: 'bg-blue-600',
    FallbackIcon: Phone,
    fallbackBg: 'bg-blue-100',
    fallbackIcon: 'text-blue-600',
  },
  {
    num: '02',
    title: 'Muestra tu QR',
    desc: 'Abre la app, busca tu número y muestra tu QR personal. El repartidor lo escanea y acumulas al instante.',
    src: '/lottie/step-qr.json',
    color: 'from-indigo-50 to-indigo-100/60',
    barColor: 'bg-indigo-600',
    FallbackIcon: QrCode,
    fallbackBg: 'bg-indigo-100',
    fallbackIcon: 'text-indigo-600',
  },
  {
    num: '03',
    title: 'Recibe tu envío gratis',
    desc: 'Cada 5 envíos acumulas uno completamente gratis. Se aplica automáticamente, sin trámites.',
    src: '/lottie/step-recibir.json',
    color: 'from-red-50 to-red-100/60',
    barColor: 'bg-red-500',
    FallbackIcon: Gift,
    fallbackBg: 'bg-red-100',
    fallbackIcon: 'text-red-500',
  },
] as const;

const AUTO_ADVANCE_MS = 5500;

/* ── Stepper — preloads ALL animations on mount so switches are instant ── */
export function StepsLottie() {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preload all 3 JSONs at once — keyed by index
  const [animCache, setAnimCache] = useState<Record<number, object | 'failed'>>({});

  useEffect(() => {
    STEPS.forEach((step, i) => {
      fetch(step.src)
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(data => setAnimCache(prev => ({ ...prev, [i]: data })))
        .catch(() => setAnimCache(prev => ({ ...prev, [i]: 'failed' })));
    });
  }, []);

  const goTo = (idx: number, dir: 1 | -1 = 1) => {
    setDirection(dir);
    setActive(idx);
  };

  const next = () => goTo((active + 1) % STEPS.length, 1);
  const prev = () => goTo((active - 1 + STEPS.length) % STEPS.length, -1);

  // Auto-advance
  useEffect(() => {
    timerRef.current = setTimeout(next, AUTO_ADVANCE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = STEPS[active];
  const cachedData = animCache[active];

  /* Render the animation area — data is already loaded before the slide happens */
  const renderAnim = () => {
    if (cachedData === undefined) {
      // Still loading — neutral skeleton (only visible on very first render)
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className={`w-24 h-24 ${step.fallbackBg} rounded-3xl animate-pulse`} />
        </div>
      );
    }
    if (cachedData === 'failed') {
      // JSON not found — clean icon fallback
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className={`w-24 h-24 ${step.fallbackBg} rounded-3xl flex items-center justify-center`}>
            <step.FallbackIcon className={`w-12 h-12 ${step.fallbackIcon}`} />
          </div>
        </div>
      );
    }
    // Data ready — render instantly, no delay
    return (
      <Lottie
        animationData={cachedData}
        loop
        autoplay
        className="w-full h-full"
        rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
      />
    );
  };

  return (
    <div className="max-w-xl mx-auto select-none">
      {/* Card */}
      <div className={`bg-gradient-to-br ${step.color} rounded-3xl overflow-hidden border border-white/80 shadow-xl shadow-gray-200/60 transition-colors duration-500`}>

        {/* Top progress bars */}
        <div className="flex gap-1.5 px-6 pt-5">
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => goTo(i, i > active ? 1 : -1)}
              aria-label={`Ir al paso ${i + 1}`}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === active ? `flex-1 ${s.barColor}` : 'w-6 bg-gray-200 hover:bg-gray-300'
              }`}
            />
          ))}
        </div>

        {/* Slide transition — only text and number slide, animation fades softly */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={active}
            custom={direction}
            initial={{ opacity: 0, x: direction * 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -32 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Lottie area */}
            <div className="px-8 pt-5 pb-2 h-52 sm:h-60">
              {renderAnim()}
            </div>

            {/* Text */}
            <div className="px-8 pb-8">
              <span className={`inline-block text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-full text-white ${step.barColor} mb-3`}>
                Paso {step.num}
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-gray-900 mb-2 tracking-tight">
                {step.title}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between mt-4 px-1">
        <button
          onClick={prev}
          className="w-10 h-10 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex gap-2.5 items-center">
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => goTo(i, i > active ? 1 : -1)}
              className={`rounded-full transition-all duration-200 ${
                i === active
                  ? `w-5 h-2 ${s.barColor}`
                  : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>

        <button
          onClick={next}
          className="w-10 h-10 rounded-full bg-blue-600 shadow-md shadow-blue-600/30 flex items-center justify-center text-white hover:bg-blue-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Auto-progress bar */}
      <div className="mt-3 h-0.5 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          key={active}
          className={`h-full ${step.barColor} rounded-full origin-left`}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: AUTO_ADVANCE_MS / 1000, ease: 'linear' }}
        />
      </div>
    </div>
  );
}

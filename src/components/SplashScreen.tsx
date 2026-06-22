import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props { onComplete: () => void; }

// Partículas sutiles adaptadas a fondo blanco
const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: 3 + (i * 4.8) % 94,
  y: 3 + (i * 9.3) % 92,
  s: 0.9 + (i % 3) * 0.6,
  dur: `${2.4 + (i % 5) * 0.5}s`,
  del: `${(i * 0.11) % 2}s`,
  dy: -(8 + (i % 3) * 7),
}));

// Colores más intensos para que se lean perfecto en fondo blanco
const WORDS = [
  { text: 'Pide.',  color: '#3b82f6' }, // blue-500
  { text: 'Suma.',  color: '#8b5cf6' }, // purple-500
  { text: 'Gana.',  color: '#10b981' }, // emerald-500
];

const SONAR = [0, 0.6, 1.2];

export function SplashScreen({ onComplete }: Props) {
  const [phase, setPhase]           = useState(0);
  const [showBar, setShowBar]       = useState(false);
  const [wordIdx, setWordIdx]       = useState(0);
  const [wordVisible, setWordVisible] = useState(false);

  useEffect(() => {
    const show = (idx: number) => { setWordIdx(idx); setWordVisible(true); };
    const hide = () => setWordVisible(false);

    const timers = [
      setTimeout(() => show(0),  700),
      setTimeout(() => hide(),   1850),
      setTimeout(() => show(1),  2050),
      setTimeout(() => hide(),   3150),
      setTimeout(() => show(2),  3350),
      setTimeout(() => setShowBar(true), 1400),
      setTimeout(() => setPhase(1), 600),
      setTimeout(() => { hide(); setPhase(2); }, 3600),
      setTimeout(onComplete, 4100),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {phase < 2 && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            paddingBottom: 'env(safe-area-inset-bottom)',
            willChange: 'opacity, transform',
          }}
        >
          {/* ✨ Partículas oscuras/suaves ✨ */}
          {PARTICLES.map(p => (
            <div
              key={p.id}
              className="absolute rounded-full bg-slate-300 pointer-events-none splash-particle"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: p.s,
                height: p.s,
                willChange: 'transform, opacity',
                animationDuration: p.dur,
                animationDelay: p.del,
                '--dy': `${p.dy}px`,
              } as React.CSSProperties}
            />
          ))}

          {/* ✨ Grid sutil oscuro ✨ */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: 'radial-gradient(circle,#000 1px,transparent 1px)', backgroundSize: '36px 36px' }}
          />

          {/* ✨ LOGO + ANILLOS ✨ */}
          <motion.div
            className="relative flex items-center justify-center"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.65, ease: [0.34, 1.56, 0.64, 1] }}
            style={{ willChange: 'transform, opacity' }}
          >
            {/* Sonar rings */}
            {SONAR.map((del, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full border border-blue-500/20 pointer-events-none"
                style={{ width: 90, height: 90, willChange: 'transform, opacity' }}
                animate={{ scale: [1, 2.8], opacity: [0.8, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: del, ease: 'easeOut' }}
              />
            ))}

            {/* Glow pulsante (más suave para fondo blanco) */}
            <motion.div
              className="absolute rounded-full pointer-events-none"
              style={{
                width: 120, height: 120,
                background: 'radial-gradient(circle,rgba(59,130,246,0.15),transparent 70%)',
                willChange: 'transform, opacity',
              }}
              animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0.95, 0.5] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Anillo exterior */}
            <div
              className="absolute rounded-full pointer-events-none splash-spin-cw"
              style={{
                width: 116, height: 116,
                border: '2.5px solid transparent',
                borderTopColor: 'rgba(59,130,246,0.5)',
                borderRightColor: 'rgba(59,130,246,0.2)',
                borderBottomColor: 'rgba(59,130,246,0.05)',
                willChange: 'transform',
              }}
            />

            {/* Anillo interior inverso */}
            <div
              className="absolute rounded-full pointer-events-none splash-spin-ccw"
              style={{
                width: 94, height: 94,
                border: '2px solid transparent',
                borderBottomColor: 'rgba(139,92,246,0.5)',
                borderLeftColor: 'rgba(139,92,246,0.2)',
                borderTopColor: 'rgba(139,92,246,0.05)',
                willChange: 'transform',
              }}
            />

            {/* Punto orbital azul */}
            <div
              className="absolute pointer-events-none splash-spin-cw"
              style={{ width: 116, height: 116, willChange: 'transform' }}
            >
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-500"
                style={{ boxShadow: '0 0 10px 3px rgba(59,130,246,0.4)' }}
              />
            </div>

            {/* Punto orbital violeta */}
            <div
              className="absolute pointer-events-none splash-spin-ccw-slow"
              style={{ width: 94, height: 94, willChange: 'transform' }}
            >
              <div
                className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 rounded-full bg-purple-500"
                style={{ boxShadow: '0 0 8px 2px rgba(139,92,246,0.4)' }}
              />
            </div>

            {/* Logo adaptado para que resalte en blanco */}
            <motion.img
              src="/logo.png"
              alt="Estrella"
              className="relative z-10 rounded-full object-cover bg-white"
              style={{
                width: 78, height: 78,
                border: '3.5px solid rgba(248,250,252,1)',
                boxShadow: '0 0 0 7px rgba(0,0,0,0.03), 0 16px 32px rgba(0,0,0,0.1)',
                willChange: 'transform',
              }}
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>

          {/* ✨ TEXTO ✨ */}
          <motion.div
            className="flex flex-col items-center gap-2 mt-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: 'transform, opacity' }}
          >
            <h1
              className="font-black leading-none"
              style={{
                fontFamily: 'system-ui,-apple-system,sans-serif',
                fontSize: '3rem', letterSpacing: '-0.05em',
                background: 'linear-gradient(135deg,#0f172a 30%,#3b82f6 70%,#8b5cf6 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Estrella<span style={{ WebkitTextFillColor: '#3b82f6' }}>.</span>
            </h1>
            <motion.p
              className="text-slate-400 text-xs font-bold uppercase tracking-[0.18em]"
              style={{ fontFamily: 'system-ui,-apple-system,sans-serif' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              Programa de lealtad
            </motion.p>
          </motion.div>

          {/* ✨ TICKER ✨ */}
          <div className="mt-7 h-12 flex items-center justify-center overflow-hidden" style={{ minWidth: 160 }}>
            <AnimatePresence mode="wait">
              {wordVisible && (
                <motion.div
                  key={wordIdx}
                  initial={{ opacity: 0, y: 22, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -22, scale: 0.85 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  style={{ willChange: 'transform, opacity' }}
                >
                  <span
                    className="font-black text-3xl leading-none"
                    style={{
                      fontFamily: 'system-ui,-apple-system,sans-serif',
                      letterSpacing: '-0.04em',
                      color: WORDS[wordIdx].color,
                      textShadow: `0 4px 14px ${WORDS[wordIdx].color}40`,
                    }}
                  >
                    {WORDS[wordIdx].text}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ✨ BARRA DE CARGA ✨ */}
          <AnimatePresence>
            {showBar && (
              <motion.div
                className="flex flex-col items-center gap-3 mt-10"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.35 }}
                style={{ willChange: 'opacity' }}
              >
                <div
                  className="overflow-hidden rounded-full"
                  style={{ width: 160, height: 3, background: 'rgba(0,0,0,0.06)' }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: 'linear-gradient(90deg,#3b82f6,#8b5cf6,#3b82f6)',
                      backgroundSize: '200% 100%',
                      willChange: 'transform',
                      transformOrigin: 'left',
                    }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 2.1, ease: [0.4, 0, 0.2, 1] }}
                  />
                </div>
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="rounded-full bg-slate-300 splash-dot"
                      style={{
                        width: 5, height: 5,
                        willChange: 'transform, opacity',
                        animationDelay: `${i * 0.2}s`,
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ✨ CSS Keyframes — todo GPU ✨ */}
          <style>{`
            @keyframes splashSpinCW  { to { transform: rotate(360deg); } }
            @keyframes splashSpinCCW { to { transform: rotate(-360deg); } }
            .splash-spin-cw      { animation: splashSpinCW  1.8s linear infinite; }
            .splash-spin-ccw     { animation: splashSpinCCW 2.6s linear infinite; }
            .splash-spin-ccw-slow{ animation: splashSpinCCW 2.6s linear infinite; }

            @keyframes splashParticle {
              0%,100% { transform: translate3d(0,0,0);            opacity: 0.1; }
              50%      { transform: translate3d(0,var(--dy),0);   opacity: 0.6; }
            }
            .splash-particle {
              animation: splashParticle 3s ease-in-out infinite;
            }

            @keyframes splashDot {
              0%,100% { transform: scale(0.5); opacity: 0.2; }
              50%      { transform: scale(1.3); opacity: 1;   }
            }
            .splash-dot { animation: splashDot 1.1s ease-in-out infinite; }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

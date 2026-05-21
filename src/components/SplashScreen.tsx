// SplashScreen.tsx — Splash GPU-acelerado (sin JS por partícula)
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props { onComplete: () => void; }

// Partículas: posiciones pre-calculadas — animadas 100% por CSS (GPU)
const PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: 3 + (i * 4.8) % 94,
  y: 3 + (i * 9.3) % 92,
  s: 0.9 + (i % 3) * 0.6,
  dur: `${2.4 + (i % 5) * 0.5}s`,
  del: `${(i * 0.11) % 2}s`,
  dy: -(8 + (i % 3) * 7),
}));

const WORDS = [
  { text: 'Pide.',  color: '#93c5fd' },
  { text: 'Suma.',  color: '#a78bfa' },
  { text: 'Gana.',  color: '#34d399' },
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
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden select-none"
          style={{
            background: 'linear-gradient(150deg,#060d2e 0%,#0f2070 35%,#1a40c0 65%,#1d4ed8 100%)',
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            willChange: 'opacity, transform',
          }}
        >
          {/* ── Blobs ambientales — CSS puro, GPU ── */}
          <div
            className="pointer-events-none absolute rounded-full splash-blob-0"
            style={{
              top: -80, left: -80, width: 340, height: 340,
              background: 'radial-gradient(circle,rgba(59,130,246,0.18),transparent 70%)',
              filter: 'blur(55px)',
              willChange: 'transform',
              transform: 'translate3d(0,0,0)',
            }}
          />
          <div
            className="pointer-events-none absolute rounded-full splash-blob-1"
            style={{
              bottom: -70, right: -70, width: 280, height: 280,
              background: 'radial-gradient(circle,rgba(139,92,246,0.18),transparent 70%)',
              filter: 'blur(55px)',
              willChange: 'transform',
              transform: 'translate3d(0,0,0)',
            }}
          />
          <div
            className="pointer-events-none absolute rounded-full splash-blob-0"
            style={{
              top: '40%', left: -40, width: 180, height: 180,
              background: 'radial-gradient(circle,rgba(6,182,212,0.14),transparent 70%)',
              filter: 'blur(40px)',
              willChange: 'transform',
              transform: 'translate3d(0,0,0)',
            }}
          />

          {/* ── Partículas — CSS @keyframes, 0 JS por frame ── */}
          {PARTICLES.map(p => (
            <div
              key={p.id}
              className="absolute rounded-full bg-white pointer-events-none splash-particle"
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

          {/* ── Grid sutil ── */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: 'radial-gradient(circle,white 1px,transparent 1px)', backgroundSize: '36px 36px' }}
          />

          {/* ── LOGO + ANILLOS — GPU via transform/opacity ── */}
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
                className="absolute rounded-full border border-blue-400/50 pointer-events-none"
                style={{ width: 90, height: 90, willChange: 'transform, opacity' }}
                animate={{ scale: [1, 2.8], opacity: [0.6, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: del, ease: 'easeOut' }}
              />
            ))}

            {/* Glow pulsante */}
            <motion.div
              className="absolute rounded-full pointer-events-none"
              style={{
                width: 120, height: 120,
                background: 'radial-gradient(circle,rgba(96,165,250,0.55),transparent 70%)',
                willChange: 'transform, opacity',
              }}
              animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0.95, 0.5] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Anillo exterior — CSS spin (GPU) */}
            <div
              className="absolute rounded-full pointer-events-none splash-spin-cw"
              style={{
                width: 116, height: 116,
                border: '2.5px solid transparent',
                borderTopColor: 'rgba(147,197,253,0.95)',
                borderRightColor: 'rgba(147,197,253,0.4)',
                borderBottomColor: 'rgba(147,197,253,0.1)',
                willChange: 'transform',
              }}
            />

            {/* Anillo interior inverso — CSS spin (GPU) */}
            <div
              className="absolute rounded-full pointer-events-none splash-spin-ccw"
              style={{
                width: 94, height: 94,
                border: '2px solid transparent',
                borderBottomColor: 'rgba(167,139,250,0.9)',
                borderLeftColor: 'rgba(167,139,250,0.4)',
                borderTopColor: 'rgba(167,139,250,0.1)',
                willChange: 'transform',
              }}
            />

            {/* Punto orbital azul */}
            <div
              className="absolute pointer-events-none splash-spin-cw"
              style={{ width: 116, height: 116, willChange: 'transform' }}
            >
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-300"
                style={{ boxShadow: '0 0 10px 3px rgba(147,197,253,0.8)' }}
              />
            </div>

            {/* Punto orbital violeta */}
            <div
              className="absolute pointer-events-none splash-spin-ccw-slow"
              style={{ width: 94, height: 94, willChange: 'transform' }}
            >
              <div
                className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 rounded-full bg-violet-300"
                style={{ boxShadow: '0 0 8px 2px rgba(167,139,250,0.8)' }}
              />
            </div>

            {/* Logo */}
            <motion.img
              src="/logo.png"
              alt="Estrella"
              className="relative z-10 rounded-full object-cover"
              style={{
                width: 78, height: 78,
                border: '3.5px solid rgba(255,255,255,0.35)',
                boxShadow: '0 0 0 7px rgba(255,255,255,0.06), 0 16px 48px rgba(0,0,0,0.5)',
                willChange: 'transform',
              }}
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>

          {/* ── TEXTO ── */}
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
                background: 'linear-gradient(135deg,#fff 30%,#93c5fd 70%,#a78bfa 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Estrella<span style={{ WebkitTextFillColor: '#93c5fd' }}>.</span>
            </h1>
            <motion.p
              className="text-white/50 text-xs font-semibold uppercase tracking-[0.18em]"
              style={{ fontFamily: 'system-ui,-apple-system,sans-serif' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              Programa de lealtad
            </motion.p>
          </motion.div>

          {/* ── TICKER ── */}
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
                      textShadow: `0 0 24px ${WORDS[wordIdx].color}80`,
                    }}
                  >
                    {WORDS[wordIdx].text}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── BARRA DE CARGA ── */}
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
                  style={{ width: 160, height: 3, background: 'rgba(255,255,255,0.1)' }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: 'linear-gradient(90deg,#60a5fa,#a78bfa,#60a5fa)',
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
                      className="rounded-full bg-white/35 splash-dot"
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

          {/* ── CSS Keyframes — todo GPU ── */}
          <style>{`
            @keyframes splashBlob0 {
              from { transform: translate3d(0,0,0) scale(1); }
              to   { transform: translate3d(28px,18px,0) scale(1.08); }
            }
            @keyframes splashBlob1 {
              from { transform: translate3d(0,0,0) scale(1); }
              to   { transform: translate3d(-22px,-14px,0) scale(1.06); }
            }
            .splash-blob-0 { animation: splashBlob0 9s ease-in-out infinite alternate; }
            .splash-blob-1 { animation: splashBlob1 11s ease-in-out infinite alternate; }

            @keyframes splashSpinCW  { to { transform: rotate(360deg); } }
            @keyframes splashSpinCCW { to { transform: rotate(-360deg); } }
            .splash-spin-cw      { animation: splashSpinCW  1.8s linear infinite; }
            .splash-spin-ccw     { animation: splashSpinCCW 2.6s linear infinite; }
            .splash-spin-ccw-slow{ animation: splashSpinCCW 2.6s linear infinite; }

            @keyframes splashParticle {
              0%,100% { transform: translate3d(0,0,0);            opacity: 0.06; }
              50%      { transform: translate3d(0,var(--dy),0);   opacity: 0.65; }
            }
            .splash-particle {
              animation: splashParticle var(--dur,3s) ease-in-out infinite;
              animation-duration: inherit;
              animation-delay: inherit;
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

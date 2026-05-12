// SplashScreen.tsx — Splash premium 4 segundos con Framer Motion
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props { onComplete: () => void; }

// Partículas de fondo — posiciones fijas para evitar re-renders
const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  x: 3 + (i * 3.4) % 94,
  y: 3 + (i * 7.1) % 92,
  s: 0.8 + (i % 4 === 0 ? 2 : i % 3 === 0 ? 1.5 : i % 2 === 0 ? 1 : 0.6),
  dur: 2.2 + (i % 6) * 0.5,
  del: (i * 0.07) % 2.2,
  dy: -8 - (i % 3) * 6,
}));

// Palabras del ticker rotativo
const WORDS = [
  { text: 'Pide.',  color: '#93c5fd' },
  { text: 'Suma.',  color: '#a78bfa' },
  { text: 'Gana.',  color: '#34d399' },
];

const SPARKS = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  angle: i * 45,
  dist: 70,
}));

// Anillos sonar que emanan del logo
const SONAR = [0, 0.6, 1.2];

export function SplashScreen({ onComplete }: Props) {
  const [phase, setPhase] = useState(0);
  const [showBar, setShowBar] = useState(false);
  const [wordIdx, setWordIdx] = useState(0);
  const [wordVisible, setWordVisible] = useState(false);

  useEffect(() => {
    const show = (idx: number) => { setWordIdx(idx); setWordVisible(true); };
    const hide = () => setWordVisible(false);

    // Pide: entra 700ms, sale 1850ms
    // Suma: entra 2050ms, sale 3150ms
    // Gana: entra 3350ms, sale con el splash (3600ms)
    const timers = [
      setTimeout(() => show(0), 700),
      setTimeout(() => hide(),  1850),
      setTimeout(() => show(1), 2050),
      setTimeout(() => hide(),  3150),
      setTimeout(() => show(2), 3350),
      // barra y fases generales
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
          exit={{ opacity: 0, scale: 1.06 }}
          transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden select-none"
          style={{
            background: 'linear-gradient(150deg,#060d2e 0%,#0f2070 35%,#1a40c0 65%,#1d4ed8 100%)',
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {/* ── Blobs ambientales ── */}
          {[
            { top: '-80px', left: '-80px', w: 340, h: 340, c: '#3b82f6', dur: 9, alt: false },
            { top: 'auto', left: 'auto', bottom: '-70px', right: '-70px', w: 280, h: 280, c: '#8b5cf6', dur: 11, alt: true },
            { top: '40%', left: '-40px', w: 180, h: 180, c: '#06b6d4', dur: 7, alt: false },
          ].map((b, i) => (
            <div key={i} className="pointer-events-none absolute rounded-full"
              style={{
                width: b.w, height: b.h, top: b.top, left: b.left,
                bottom: (b as any).bottom, right: (b as any).right,
                background: `radial-gradient(circle,${b.c}30,transparent 70%)`,
                filter: 'blur(55px)',
                animation: `splashBlob${i % 2} ${b.dur}s ease-in-out infinite alternate`,
              }} />
          ))}

          {/* ── Partículas flotantes ── */}
          {PARTICLES.map(p => (
            <motion.div key={p.id}
              className="absolute rounded-full bg-white pointer-events-none"
              style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s }}
              animate={{ opacity: [0.06, 0.65, 0.06], y: [0, p.dy, 0] }}
              transition={{ duration: p.dur, repeat: Infinity, delay: p.del, ease: 'easeInOut' }} />
          ))}

          {/* ── Cuadrícula de fondo sutil ── */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: 'radial-gradient(circle,white 1px,transparent 1px)', backgroundSize: '36px 36px' }} />

          {/* ── LOGO + ANILLOS ORBITALES ── */}
          <motion.div
            className="relative flex items-center justify-center"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
          >
            {/* Anillos sonar */}
            {SONAR.map((del, i) => (
              <motion.div key={i}
                className="absolute rounded-full border border-blue-400/50 pointer-events-none"
                style={{ width: 90, height: 90 }}
                animate={{ scale: [1, 2.8], opacity: [0.6, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: del, ease: 'easeOut' }} />
            ))}

            {/* Glow pulsante */}
            <motion.div className="absolute rounded-full pointer-events-none"
              style={{ width: 120, height: 120, background: 'radial-gradient(circle,rgba(96,165,250,0.55),transparent 70%)' }}
              animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0.95, 0.5] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} />

            {/* Anillo exterior giratorio */}
            <motion.div className="absolute rounded-full pointer-events-none"
              style={{ width: 116, height: 116, border: '2.5px solid transparent',
                borderTopColor: 'rgba(147,197,253,0.95)', borderRightColor: 'rgba(147,197,253,0.4)',
                borderBottomColor: 'rgba(147,197,253,0.1)' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }} />

            {/* Anillo interior inverso */}
            <motion.div className="absolute rounded-full pointer-events-none"
              style={{ width: 94, height: 94, border: '2px solid transparent',
                borderBottomColor: 'rgba(167,139,250,0.9)', borderLeftColor: 'rgba(167,139,250,0.4)',
                borderTopColor: 'rgba(167,139,250,0.1)' }}
              animate={{ rotate: -360 }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }} />

            {/* Punto orbital azul */}
            <motion.div className="absolute pointer-events-none"
              style={{ width: 116, height: 116 }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2
                w-3 h-3 rounded-full bg-blue-300"
                style={{ boxShadow: '0 0 10px 3px rgba(147,197,253,0.8)' }} />
            </motion.div>

            {/* Punto orbital violeta (opuesto) */}
            <motion.div className="absolute pointer-events-none"
              style={{ width: 94, height: 94 }}
              animate={{ rotate: -360 }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }}>
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2
                w-2 h-2 rounded-full bg-violet-300"
                style={{ boxShadow: '0 0 8px 2px rgba(167,139,250,0.8)' }} />
            </motion.div>

            {/* Chispas burst al aparecer */}
            {SPARKS.map(sp => (
              <motion.div key={sp.id}
                className="absolute w-1.5 h-1.5 rounded-full bg-yellow-300 pointer-events-none"
                style={{ boxShadow: '0 0 6px 2px rgba(253,224,71,0.7)' }}
                initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                animate={{
                  x: Math.cos((sp.angle * Math.PI) / 180) * sp.dist,
                  y: Math.sin((sp.angle * Math.PI) / 180) * sp.dist,
                  scale: [0, 1.4, 0],
                  opacity: [0, 1, 0],
                }}
                transition={{ duration: 0.7, delay: 0.55, ease: 'easeOut' }} />
            ))}

            {/* Logo circular */}
            <motion.img src="/logo.png" alt="Estrella"
              className="relative z-10 rounded-full object-cover"
              style={{
                width: 78, height: 78,
                border: '3.5px solid rgba(255,255,255,0.35)',
                boxShadow: '0 0 0 7px rgba(255,255,255,0.06), 0 16px 48px rgba(0,0,0,0.5)',
              }}
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} />
          </motion.div>

          {/* ── TEXTO ── */}
          <motion.div className="flex flex-col items-center gap-2 mt-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}>

            {/* Nombre */}
            <h1 className="font-black leading-none"
              style={{
                fontFamily: 'system-ui,-apple-system,sans-serif',
                fontSize: '3rem', letterSpacing: '-0.05em',
                background: 'linear-gradient(135deg,#fff 30%,#93c5fd 70%,#a78bfa 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
              Estrella<span style={{ WebkitTextFillColor: '#93c5fd' }}>.</span>
            </h1>

            {/* Tagline */}
            <motion.p
              className="text-white/50 text-xs font-semibold uppercase tracking-[0.18em]"
              style={{ fontFamily: 'system-ui,-apple-system,sans-serif' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}>
              Programa de lealtad
            </motion.p>
          </motion.div>

          {/* ── TICKER: Pide / Suma / Gana ── */}
          <div className="mt-7 h-12 flex items-center justify-center overflow-hidden" style={{ minWidth: 160 }}>
            <AnimatePresence mode="wait">
              {wordVisible && (
                <motion.div
                  key={wordIdx}
                  initial={{ opacity: 0, y: 22, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -22, scale: 0.85 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center gap-2"
                >
                  <span className="font-black text-3xl leading-none"
                    style={{
                      fontFamily: 'system-ui,-apple-system,sans-serif',
                      letterSpacing: '-0.04em',
                      color: WORDS[wordIdx].color,
                      textShadow: `0 0 24px ${WORDS[wordIdx].color}80`,
                    }}>
                    {WORDS[wordIdx].text}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── BARRA DE CARGA ── */}
          <AnimatePresence>
            {showBar && (
              <motion.div className="flex flex-col items-center gap-3 mt-10"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}>

                {/* Track */}
                <div className="overflow-hidden rounded-full"
                  style={{ width: 160, height: 3, background: 'rgba(255,255,255,0.1)' }}>
                  <motion.div className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg,#60a5fa,#a78bfa,#60a5fa)', backgroundSize: '200% 100%' }}
                    initial={{ width: '0%' }}
                    animate={{ width: '100%', backgroundPosition: ['200% 0', '-200% 0'] }}
                    transition={{
                      width: { duration: 2.1, ease: [0.4, 0, 0.2, 1] },
                      backgroundPosition: { duration: 2, repeat: Infinity, ease: 'linear' },
                    }} />
                </div>

                {/* Dots */}
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(i => (
                    <motion.div key={i} className="rounded-full bg-white/35"
                      style={{ width: 5, height: 5 }}
                      animate={{ scale: [0.5, 1.3, 0.5], opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.2 }} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Keyframes para blobs */}
          <style>{`
            @keyframes splashBlob0 { from{transform:translate(0,0) scale(1)} to{transform:translate(28px,18px) scale(1.08)} }
            @keyframes splashBlob1 { from{transform:translate(0,0) scale(1)} to{transform:translate(-22px,-14px) scale(1.06)} }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

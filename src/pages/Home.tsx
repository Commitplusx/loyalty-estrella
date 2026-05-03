import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { ArrowRight, Phone, Star, Gift, Zap, Shield, Clock, Flame, Heart, Truck, MapPin, Sparkles, ChevronRight } from 'lucide-react';
import { useSchedule } from '@/hooks/useSchedule';
import AuthorityCounter from '@/components/client/AuthorityCounter';
import { StepsLottie } from '@/components/StepsLottie';

/* ── Shared variants — GPU-only properties (transform + opacity) ── */
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: i * 0.08 },
  }),
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  show: (i = 0) => ({
    opacity: 1, scale: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.07 },
  }),
};

/* ── Scroll-triggered wrapper ── */
function Reveal({ children, custom = 0, variants = fadeUp, className = '' }: {
  children: React.ReactNode; custom?: number; variants?: any; className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-72px' });
  return (
    <motion.div ref={ref} variants={variants} initial="hidden"
      animate={inView ? 'show' : 'hidden'} custom={custom} className={className}>
      {children}
    </motion.div>
  );
}

const REVIEWS = [
  { name: 'María G.', text: '¡Llevan más de un año siendo mi delivery! El trato es increíble y el 6to gratis es real 🎉', stars: 5 },
  { name: 'Carlos R.', text: 'Rapidísimos y muy confiables. Ya usé 3 envíos gratis y sigo acumulando ⭐', stars: 5 },
  { name: 'Sofía M.', text: 'Me encanta que puedo ver mis puntos en la app. Super transparente y profesional.', stars: 5 },
];

const FEATURES = [
  { icon: Gift,   title: '6to Envío Gratis',   desc: 'Cada 5 envíos te ganás uno completamente gratis.', bg: 'bg-blue-50',  iconBg: 'bg-blue-600 text-white' },
  { icon: Zap,    title: 'Sin Trámites',        desc: 'Tu QR lo hace todo. Acumulación automática al instante.', bg: 'bg-red-50', iconBg: 'bg-red-500 text-white' },
  { icon: Shield, title: 'Pedidos Seguros',     desc: 'Cada entrega monitoreada de principio a fin.', bg: 'bg-gray-950', iconBg: 'bg-white/10 text-white', dark: true },
  { icon: Heart,  title: 'Clientes VIP',        desc: 'Asciende de rango y desbloquea beneficios exclusivos.', bg: 'bg-blue-600', iconBg: 'bg-white/10 text-white', dark: true },
];

const STEPS = [
  { num: '01', icon: Phone, title: 'Pide tu envío', desc: 'Contacta al repartidor y realiza tu pedido como siempre.' },
  { num: '02', icon: Star,  title: 'Muestra tu QR', desc: 'Abre la app y muestra tu código personal. El repartidor lo escanea.' },
  { num: '03', icon: Gift,  title: 'Canjea tu gratis', desc: 'Cada 5 envíos acumulas uno gratis. Se aplica automáticamente.' },
];

/* ── StepCard: extracted so we can use hooks legally (not inside map) ── */
function StepCard({ step, index }: { step: { num: string; icon: React.ElementType; title: string; desc: string }; index: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });

  // Each step animates in from a different direction
  const directions = [
    { x: -50, y: 0 },    // 01 ← from left
    { x: 0,   y: 50 },  // 02 ↑ from below
    { x: 50,  y: 0 },   // 03 → from right
  ];
  const dir = directions[index] ?? { x: 0, y: 40 };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: dir.x, y: dir.y }}
      animate={inView ? { opacity: 1, x: 0, y: 0 } : {}}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: index * 0.12 }}
      className="relative group"
    >
      <div className="bg-white border border-gray-100 rounded-2xl p-6 sm:p-7 h-full
        hover:border-blue-200 hover:shadow-xl hover:shadow-blue-50/80 transition-all duration-300">

        <div className="flex items-start justify-between mb-5">
          {/* Step number — floats up on hover */}
          <motion.span
            animate={inView ? { y: [0, -4, 0] } : {}}
            transition={{ duration: 2.5, delay: index * 0.3 + 0.8, repeat: Infinity, ease: 'easeInOut' }}
            className="text-5xl sm:text-6xl font-black leading-none select-none
              bg-gradient-to-br from-blue-200 to-blue-400 bg-clip-text text-transparent
              group-hover:from-blue-500 group-hover:to-blue-700 transition-all duration-400"
          >
            {step.num}
          </motion.span>

          <motion.div
            whileHover={{ rotate: 15, scale: 1.15 }}
            whileTap={{ scale: 0.92 }}
            className="w-11 h-11 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center
              group-hover:bg-blue-600 group-hover:border-blue-600 transition-all duration-300 shadow-sm group-hover:shadow-blue-600/30 group-hover:shadow-lg"
          >
            <step.icon className="w-5 h-5 text-blue-500 group-hover:text-white transition-colors duration-300" />
          </motion.div>
        </div>

        <h3 className="font-bold text-gray-900 text-base sm:text-lg mb-2">{step.title}</h3>
        <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>

        {/* Animated progress bar */}
        <motion.div
          className="mt-5 h-[3px] bg-gradient-to-r from-blue-500 via-blue-400 to-blue-200 rounded-full origin-left"
          initial={{ scaleX: 0 }}
          animate={inView ? { scaleX: 1 } : {}}
          transition={{ duration: 0.8, delay: index * 0.18 + 0.5, ease: [0.22, 1, 0.36, 1] }}
        />

        {/* Animated dot at end of bar */}
        <motion.div
          className="w-2 h-2 rounded-full bg-blue-500 mt-1 ml-auto"
          initial={{ opacity: 0, scale: 0 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.3, delay: index * 0.18 + 1.2 }}
        />
      </div>

      {index < 2 && (
        <div className="hidden md:flex absolute top-10 -right-3 z-10 w-6 h-6 items-center justify-center">
          <motion.div
            animate={inView ? { x: [0, 4, 0] } : {}}
            transition={{ duration: 1.5, delay: index * 0.15 + 1, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronRight className="w-4 h-4 text-blue-300" />
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

export function Home() {
  const navigate = useNavigate();
  const { storeState, horasFelices, formatTime, contacto } = useSchedule();
  const whatsappNum = contacto.whatsapp.replace(/\D/g, '');
  const whatsappUrl = whatsappNum ? `https://wa.me/${whatsappNum}` : '';

  // Scroll-aware nav: add shadow + stronger bg when user scrolls
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-950 antialiased overflow-x-hidden">

      {/* ── NAV — blue + scroll-aware + iOS safe-area ── */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 bg-blue-600 transition-all duration-300
          ${scrolled ? 'shadow-xl shadow-blue-700/40' : ''}`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-5xl mx-auto px-5 h-14 sm:h-16 flex items-center justify-between">
          <motion.div className="flex items-center gap-2.5"
            initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <Truck className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white tracking-tight">
              Estrella<span className="text-blue-200">.</span>
            </span>
          </motion.div>

          <motion.div
            className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/15 text-white backdrop-blur-sm"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}>
            <span className={`w-1.5 h-1.5 rounded-full ${storeState.isOpen ? 'bg-green-400 animate-pulse' : 'bg-red-300'}`} />
            {storeState.isOpen ? (storeState.isHappyHour ? '🔥 Hora Feliz activa' : 'Abierto') : 'Cerrado'}
          </motion.div>

          <motion.button onClick={() => navigate('/cliente')}
            className="text-sm font-semibold text-white/90 hover:text-white transition-colors flex items-center gap-1"
            initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ x: 2 }} whileTap={{ scale: 0.97 }}>
            Mis Puntos <ArrowRight className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </nav>

      {/* ── HERO — padded to clear nav + iOS notch ── */}
      <section className="pt-36 sm:pt-44 pb-20 sm:pb-24 px-5 max-w-5xl mx-auto"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 9rem)' }}>
        <div className="grid lg:grid-cols-[1fr_340px] gap-16 items-center">
          <div>
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-4 py-2 mb-8">
              <Sparkles className="w-3.5 h-3.5" /> Programa de Lealtad
            </motion.div>

            <motion.h1 variants={fadeUp} initial="hidden" animate="show" custom={1}
              className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.04] mb-6">
              5 envíos,<br />
              <span className="text-blue-600 relative">
                1 gratis.
                <motion.span className="absolute -bottom-1 left-0 w-full h-[3px] bg-blue-600/20 rounded-full"
                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                  transition={{ duration: 0.7, delay: 0.8, ease: [0.22, 1, 0.36, 1] }} style={{ transformOrigin: 'left' }} />
              </span>
            </motion.h1>

            <motion.p variants={fadeUp} initial="hidden" animate="show" custom={2}
              className="text-lg text-gray-500 max-w-md mb-10 leading-relaxed">
              Acumula puntos con cada envío y el 6to es completamente gratis. Sin apps, sin trámites.
            </motion.p>

            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3}
              className="flex flex-col sm:flex-row gap-3">
              <motion.button onClick={() => navigate('/cliente')}
                whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
                className="flex items-center justify-center gap-2 bg-gray-950 text-white font-semibold px-7 py-3.5 rounded-xl text-sm shadow-xl shadow-gray-950/20 hover:bg-gray-800 transition-colors">
                Ver mis puntos <ArrowRight className="w-4 h-4" />
              </motion.button>
              <motion.button
                onClick={() => whatsappUrl && window.open(whatsappUrl, '_blank', 'noopener')}
                whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
                className="flex items-center justify-center gap-2 bg-white text-gray-700 font-semibold px-7 py-3.5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-sm">
                <Phone className="w-4 h-4" /> Pedir ahora
              </motion.button>
            </motion.div>
          </div>

          {/* Authority Counters — below text on mobile, right col on desktop */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4}
            className="lg:col-span-1">
            <AuthorityCounter />
          </motion.div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-24 px-5 max-w-5xl mx-auto">
        <Reveal className="mb-14 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3">Por qué elegirnos</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Más que un delivery</h2>
        </Reveal>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} custom={i} variants={scaleIn}
              className={`rounded-2xl p-6 ${f.bg} ${f.dark ? 'text-white' : ''} hover:shadow-lg transition-shadow duration-300 cursor-default`}>
              <motion.div whileHover={{ scale: 1.05 }}
                className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 shadow-sm ${f.iconBg}`}>
                <f.icon className="w-5 h-5" />
              </motion.div>
              <h3 className={`font-bold mb-1.5 ${f.dark ? 'text-white' : 'text-gray-900'}`}>{f.title}</h3>
              <p className={`text-sm leading-relaxed ${f.dark ? 'text-white/60' : 'text-gray-500'}`}>{f.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── HORA FELIZ ── */}
      <section className="py-4 px-5 max-w-5xl mx-auto">
        <Reveal>
          <div className="bg-gray-950 rounded-2xl sm:rounded-3xl overflow-hidden relative">
            {/* Ambient glow */}
            <div className="absolute top-0 left-1/4 w-96 h-48 bg-red-600/20 blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-64 h-32 bg-blue-600/15 blur-3xl pointer-events-none" />

            <div className="relative grid lg:grid-cols-2 gap-0">
              {/* Left — compact on mobile */}
              <div className="p-6 sm:p-9 lg:p-14">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-red-400 mb-4">
                  <Flame className="w-3.5 h-3.5" /> Promoción Especial
                </span>
                <h2 className="text-2xl sm:text-4xl font-black text-white mb-3 tracking-tight">¡Hora Feliz!</h2>
                <p className="text-gray-400 mb-5 leading-relaxed text-sm sm:text-base">
                  {horasFelices.filter(h => h.activo).length > 0 ? (
                    <>
                      {horasFelices.filter(h => h.activo).map(h => h.nombre).join(', ')} de{' '}
                      <span className="text-white font-semibold">
                        {formatTime(horasFelices.filter(h => h.activo)[0]?.hora_inicio)} a {formatTime(horasFelices.filter(h => h.activo)[0]?.hora_fin)}
                      </span>.
                      {' '}Todos los envíos a solo{' '}
                      <span className="text-red-400 font-black text-xl">${horasFelices.filter(h => h.activo)[0]?.precio_promocional ?? 35}</span>.
                    </>
                  ) : (
                    <>Horarios especiales con descuento en todos los envíos.</>
                  )}
                </p>

                <div className="space-y-0 mb-6">
                  {horasFelices.filter(h => h.activo).length === 0 ? (
                    <div className="flex gap-2">
                      {[1,2,3].map(i => <div key={i} className="h-9 flex-1 bg-white/5 rounded-xl animate-pulse" />)}
                    </div>
                  ) : horasFelices.filter(h => h.activo).map((hora, i) => (
                    <motion.div key={hora.dia}
                      initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 * i, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      className="flex items-center justify-between py-2.5 border-b border-white/5">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-gray-500" />
                        <span className="text-sm font-medium text-gray-300">{hora.nombre}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{formatTime(hora.hora_inicio)} – {formatTime(hora.hora_fin)}</span>
                        <span className="text-xs font-black text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">${hora.precio_promocional}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <motion.button onClick={() => navigate('/cliente')}
                  whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 bg-white text-gray-950 font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-gray-100 transition-colors shadow-lg">
                  Ver mis puntos <ChevronRight className="w-4 h-4" />
                </motion.button>
              </div>

              {/* Right price — hidden on mobile to avoid excessive height */}
              <div className="hidden lg:flex items-center justify-center p-10 border-l border-white/5">
                <div className="text-center">
                  <motion.div className="inline-flex w-24 h-24 bg-red-500/10 rounded-full items-center justify-center mb-5 border border-red-500/20"
                    animate={{ scale: [1, 1.04, 1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
                    <Sparkles className="w-10 h-10 text-red-400" />
                  </motion.div>
                  <p className="text-8xl font-black text-white tracking-tighter leading-none">$35</p>
                  <p className="text-gray-500 mt-3 text-sm">precio en hora feliz</p>
                  <span className="inline-block mt-4 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full">
                    -30% de descuento
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── CÓMO FUNCIONA — Lottie stepper ── */}
      <section className="py-20 px-5 max-w-5xl mx-auto">
        <Reveal className="mb-12 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3">Así de simple</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Cómo ganar envíos gratis</h2>
        </Reveal>
        <Reveal>
          <StepsLottie />
        </Reveal>
      </section>

      {/* ── TESTIMONIOS ── */}
      <section className="py-24 px-5 max-w-5xl mx-auto">
        <Reveal className="mb-14 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3">Testimonios</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Lo que dicen nuestros clientes</h2>
        </Reveal>

        <div className="grid sm:grid-cols-3 gap-4">
          {REVIEWS.map((r, i) => (
            <Reveal key={r.name} custom={i} variants={scaleIn}
              className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: r.stars }).map((_, si) => (
                  <Star key={si} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                ))}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed mb-5">"{r.text}"</p>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-xs font-black text-white">
                  {r.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin className="w-2.5 h-2.5" /> Cliente verificado</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-10 pb-24 px-5 max-w-5xl mx-auto">
        <Reveal>
          <div className="bg-blue-600 rounded-3xl p-12 sm:p-16 text-center text-white relative overflow-hidden">
            <div className="absolute inset-0 opacity-10"
              style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
            <motion.div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl"
              animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 6, repeat: Infinity }} />
            <div className="relative z-10">
              <p className="text-blue-100 text-xs font-bold uppercase tracking-widest mb-4">Únete hoy</p>
              <h2 className="text-3xl sm:text-5xl font-black mb-5 tracking-tight">
                ¿Listo para empezar<br />a acumular?
              </h2>
              <p className="text-blue-100 text-lg mb-10 max-w-md mx-auto">
                Comienza a ganar envíos gratis con tu próximo pedido.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <motion.button onClick={() => navigate('/cliente')}
                  whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center justify-center gap-2 bg-white text-blue-700 font-bold px-8 py-4 rounded-xl text-sm hover:bg-blue-50 transition-colors shadow-xl shadow-black/20">
                  Ver mis puntos <ArrowRight className="w-4 h-4" />
                </motion.button>
                <motion.button
                  onClick={() => whatsappUrl && window.open(whatsappUrl, '_blank', 'noopener')}
                  whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center justify-center gap-2 bg-white/10 text-white font-semibold px-8 py-4 rounded-xl text-sm hover:bg-white/20 border border-white/20 transition-all backdrop-blur-sm">
                  <Phone className="w-4 h-4" /> WhatsApp
                </motion.button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-gray-100 bg-white/60 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-5 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-blue-600/30">
                <Truck className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-gray-700">Estrella Delivery</span>
            </div>
            <div className="flex items-center gap-5 text-xs">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Lun – Dom: 9 AM – 10 PM
              </div>
              {contacto.telefono && (
                <a href={`tel:${contacto.telefono}`} className="hover:text-gray-600 transition-colors font-medium">
                  {contacto.telefono}
                </a>
              )}
              <a href="/login" className="hover:text-gray-600 transition-colors">Acceso Creador</a>
            </div>
          </div>
          <div className="mt-6 pt-5 border-t border-gray-50 text-center text-xs text-gray-300">
            © {new Date().getFullYear()} Estrella Delivery — Hecho con{' '}
            <Heart className="w-3 h-3 text-red-400 fill-red-400 inline mx-0.5" /> para nuestros clientes
          </div>
        </div>
      </footer>
      {/* Floating WhatsApp CTA */}
      <motion.a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-5 z-40 flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold px-4 py-3 rounded-full shadow-xl shadow-green-500/40 transition-colors"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1.2, type: 'spring', stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        aria-label="Pedir por WhatsApp"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white shrink-0" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        Pedir ahora
      </motion.a>

    </div>
  );
}


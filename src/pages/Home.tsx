import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { ArrowRight, Phone, Star, Gift, Zap, Shield, Clock, Flame, Heart, Truck, MapPin, Sparkles, ChevronRight } from 'lucide-react';
import { useSchedule } from '@/hooks/useSchedule';
import AuthorityCounter from '@/components/client/AuthorityCounter';

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
      animate={inView ? 'show' : 'hidden'} custom={custom}
      style={{ willChange: 'transform, opacity' }} className={className}>
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

export function Home() {
  const navigate = useNavigate();
  const { storeState, horasFelices, formatTime, contacto } = useSchedule();
  const whatsappUrl = `https://wa.me/${contacto.whatsapp.replace(/\D/g, '')}`;

  return (
    <div className="min-h-screen bg-white text-gray-950 antialiased overflow-x-hidden">

      {/* ── NAV ── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100/80">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          <motion.div className="flex items-center gap-2.5"
            initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: 'transform, opacity' }}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Truck className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 tracking-tight">
              Estrella<span className="text-blue-600">.</span>
            </span>
          </motion.div>

          <motion.div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 text-gray-600"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: 'transform, opacity' }}>
            <span className={`w-1.5 h-1.5 rounded-full ${storeState.isOpen ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`} />
            {storeState.isOpen ? (storeState.isHappyHour ? '🔥 Hora Feliz activa' : 'Abierto') : 'Cerrado'}
          </motion.div>

          <motion.button onClick={() => navigate('/cliente')}
            className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1"
            initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: 'transform, opacity' }}
            whileHover={{ x: 2 }} whileTap={{ scale: 0.97 }}>
            Mis Puntos <ArrowRight className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="pt-40 pb-24 px-5 max-w-5xl mx-auto">
        <div className="grid lg:grid-cols-[1fr_340px] gap-16 items-center">
          <div>
            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
              style={{ willChange: 'transform, opacity' }}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-4 py-2 mb-8">
              <Sparkles className="w-3.5 h-3.5" /> Programa de Lealtad
            </motion.div>

            <motion.h1 variants={fadeUp} initial="hidden" animate="show" custom={1}
              style={{ willChange: 'transform, opacity' }}
              className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.04] mb-6">
              5 envíos,<br />
              <span className="text-blue-600 relative">
                1 gratis.
                <motion.span className="absolute -bottom-1 left-0 w-full h-[3px] bg-blue-600/20 rounded-full"
                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                  transition={{ duration: 0.7, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformOrigin: 'left', willChange: 'transform' }} />
              </span>
            </motion.h1>

            <motion.p variants={fadeUp} initial="hidden" animate="show" custom={2}
              style={{ willChange: 'transform, opacity' }}
              className="text-lg text-gray-500 max-w-md mb-10 leading-relaxed">
              Acumula puntos con cada envío y el 6to es completamente gratis. Sin apps, sin trámites.
            </motion.p>

            <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3}
              style={{ willChange: 'transform, opacity' }}
              className="flex flex-col sm:flex-row gap-3">
              <motion.button onClick={() => navigate('/cliente')}
                whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
                style={{ willChange: 'transform' }}
                className="flex items-center justify-center gap-2 bg-gray-950 text-white font-semibold px-7 py-3.5 rounded-xl text-sm shadow-xl shadow-gray-950/20 hover:bg-gray-800 transition-colors">
                Ver mis puntos <ArrowRight className="w-4 h-4" />
              </motion.button>
              <motion.button
                onClick={() => contacto.whatsapp && window.open(whatsappUrl, '_blank', 'noopener')}
                whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
                style={{ willChange: 'transform' }}
                className="flex items-center justify-center gap-2 bg-white text-gray-700 font-semibold px-7 py-3.5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-sm">
                <Phone className="w-4 h-4" /> Pedir ahora
              </motion.button>
            </motion.div>
          </div>

          {/* Authority Counters — below text on mobile, right col on desktop */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4}
            style={{ willChange: 'transform, opacity' }}
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
              <motion.div whileHover={{ scale: 1.05 }} style={{ willChange: 'transform' }}
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
                  Lunes, Miércoles y Sábados de{' '}
                  <span className="text-white font-semibold">5 PM a 8 PM</span>.
                  Todos los envíos a solo{' '}
                  <span className="text-red-400 font-black text-xl">$35</span>.
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
                      style={{ willChange: 'transform, opacity' }}
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
                  style={{ willChange: 'transform' }}
                  className="inline-flex items-center gap-2 bg-white text-gray-950 font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-gray-100 transition-colors shadow-lg">
                  Ver mis puntos <ChevronRight className="w-4 h-4" />
                </motion.button>
              </div>

              {/* Right price — hidden on mobile to avoid excessive height */}
              <div className="hidden lg:flex items-center justify-center p-10 border-l border-white/5">
                <div className="text-center">
                  <motion.div className="inline-flex w-24 h-24 bg-red-500/10 rounded-full items-center justify-center mb-5 border border-red-500/20"
                    animate={{ scale: [1, 1.04, 1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ willChange: 'transform' }}>
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

      {/* ── CÓMO FUNCIONA ── */}
      <section className="py-20 px-5 max-w-5xl mx-auto">
        <Reveal className="mb-12 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3">Así de simple</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Cómo ganar envíos gratis</h2>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
          {STEPS.map((step, i) => {
            const ref = useRef(null);
            const inView = useInView(ref, { once: true, margin: '-60px' });
            return (
              <motion.div key={step.num} ref={ref}
                initial={{ opacity: 0, y: 40 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: i * 0.12 }}
                style={{ willChange: 'transform, opacity' }}
                className="relative group">
                <div className="bg-white border border-gray-100 rounded-2xl p-6 sm:p-7 h-full
                  hover:border-blue-200 hover:shadow-lg hover:shadow-blue-50 transition-all duration-300">
                  {/* Step number — now visible with blue accent */}
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-5xl sm:text-6xl font-black leading-none
                      bg-gradient-to-br from-blue-100 to-blue-200 bg-clip-text text-transparent
                      group-hover:from-blue-500 group-hover:to-blue-600 transition-all duration-300">
                      {step.num}
                    </span>
                    <motion.div
                      whileHover={{ rotate: 12, scale: 1.1 }}
                      style={{ willChange: 'transform' }}
                      className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center
                        group-hover:bg-blue-600 group-hover:border-blue-600 transition-all duration-300">
                      <step.icon className="w-4.5 h-4.5 text-blue-600 group-hover:text-white transition-colors duration-300" />
                    </motion.div>
                  </div>
                  <h3 className="font-bold text-gray-900 text-base sm:text-lg mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>

                  {/* Animated progress dot at bottom */}
                  <motion.div
                    className="mt-4 h-0.5 bg-gradient-to-r from-blue-500 to-blue-300 rounded-full origin-left"
                    initial={{ scaleX: 0 }}
                    animate={inView ? { scaleX: 1 } : {}}
                    transition={{ duration: 0.7, delay: i * 0.15 + 0.4, ease: [0.22, 1, 0.36, 1] }}
                    style={{ willChange: 'transform' }}
                  />
                </div>
                {i < 2 && (
                  <div className="hidden md:flex absolute top-8 -right-3 z-10 w-6 h-6 items-center justify-center">
                    <ChevronRight className="w-4 h-4 text-blue-300" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
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
              className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300" style={{ willChange: 'transform' }}>
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
              animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 6, repeat: Infinity }}
              style={{ willChange: 'transform' }} />
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
                  style={{ willChange: 'transform' }}
                  className="inline-flex items-center justify-center gap-2 bg-white text-blue-700 font-bold px-8 py-4 rounded-xl text-sm hover:bg-blue-50 transition-colors shadow-xl shadow-black/20">
                  Ver mis puntos <ArrowRight className="w-4 h-4" />
                </motion.button>
                <motion.button
                  onClick={() => contacto.whatsapp && window.open(whatsappUrl, '_blank', 'noopener')}
                  whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                  style={{ willChange: 'transform' }}
                  className="inline-flex items-center justify-center gap-2 bg-white/10 text-white font-semibold px-8 py-4 rounded-xl text-sm hover:bg-white/20 border border-white/20 transition-all backdrop-blur-sm">
                  <Phone className="w-4 h-4" /> WhatsApp
                </motion.button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-gray-100 py-10 px-5 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-5 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center shadow-sm shadow-blue-600/40">
              <Truck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-gray-700">Estrella Delivery</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Lun – Dom: 9 AM – 10 PM
          </div>
          <div className="flex items-center gap-4">
            {contacto.telefono && (
              <a href={`tel:${contacto.telefono}`} className="hover:text-gray-600 transition-colors">{contacto.telefono}</a>
            )}
            <span className="text-gray-200">|</span>
            <a href="/login" className="hover:text-gray-600 transition-colors">Acceso Creador</a>
          </div>
        </div>
        <div className="mt-6 pt-6 border-t border-gray-50 text-center text-xs text-gray-300">
          © {new Date().getFullYear()} Estrella Delivery — Hecho con{' '}
          <Heart className="w-3 h-3 text-red-400 fill-red-400 inline mx-0.5" /> para nuestros clientes
        </div>
      </footer>

    </div>
  );
}

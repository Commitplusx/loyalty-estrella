import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Phone, Star, Gift, Zap, Shield, Clock, Flame, Heart, Truck, MapPin, Sparkles, Users, Package, ChevronRight } from 'lucide-react';
import { useSchedule } from '@/hooks/useSchedule';
import AuthorityCounter from '@/components/client/AuthorityCounter';

const REVIEWS = [
  { name: 'María G.', text: '¡Llevan más de un año siendo mi delivery! El trato es increíble y el 6to gratis es real 🎉', stars: 5 },
  { name: 'Carlos R.', text: 'Rapidísimos y muy confiables. Ya usé 3 envíos gratis y sigo acumulando ⭐', stars: 5 },
  { name: 'Sofía M.', text: 'Me encanta que puedo ver mis puntos en la app. Super transparente y profesional.', stars: 5 },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut', delay: i * 0.1 },
  }),
};

export function Home() {
  const navigate = useNavigate();
  const { storeState, horasFelices, formatTime, contacto } = useSchedule();

  const whatsappUrl = `https://wa.me/${contacto.whatsapp.replace(/\D/g, '')}`;

  return (
    <div className="min-h-screen bg-white text-gray-950 antialiased">

      {/* ─── NAV ─────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Truck className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">
              Estrella<span className="text-blue-600">.</span>
            </span>
          </div>

          {/* Status pill */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-gray-200 text-gray-600">
            <span className={`w-1.5 h-1.5 rounded-full ${storeState.isOpen ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
            {storeState.isOpen ? (storeState.isHappyHour ? 'Hora Feliz activa' : 'Abierto') : 'Cerrado'}
          </div>

          {/* CTA */}
          <button
            onClick={() => navigate('/cliente')}
            className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
          >
            Mis Puntos →
          </button>
        </div>
      </nav>

      {/* ─── HERO ────────────────────────────────────────────────────────── */}
      <section className="pt-40 pb-28 px-5 max-w-5xl mx-auto text-center">
        <motion.div
          variants={fadeUp} initial="hidden" animate="visible" custom={0}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-4 py-2 mb-8"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Programa de Lealtad
        </motion.div>

        <motion.h1
          variants={fadeUp} initial="hidden" animate="visible" custom={1}
          className="text-5xl sm:text-7xl font-black tracking-tight leading-[1.05] mb-6"
        >
          5 envíos,<br />
          <span className="text-blue-600">1 gratis.</span>
        </motion.h1>

        <motion.p
          variants={fadeUp} initial="hidden" animate="visible" custom={2}
          className="text-lg text-gray-500 max-w-md mx-auto mb-10 leading-relaxed"
        >
          Acumula puntos con cada envío y el 6to es completamente gratis.
          Sin apps, sin trámites.
        </motion.p>

        <motion.div
          variants={fadeUp} initial="hidden" animate="visible" custom={3}
          className="flex flex-col sm:flex-row gap-3 justify-center items-center"
        >
          <button
            onClick={() => navigate('/cliente')}
            className="flex items-center gap-2 bg-gray-950 text-white font-semibold px-7 py-3.5 rounded-xl hover:bg-gray-800 transition-colors text-sm shadow-lg shadow-gray-950/10"
          >
            Ver mis puntos
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => window.open(whatsappUrl, '_blank', 'noopener')}
            className="flex items-center gap-2 bg-white text-gray-700 font-semibold px-7 py-3.5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-sm"
          >
            <Phone className="w-4 h-4" />
            Pedir ahora
          </button>
        </motion.div>

        {/* Authority Counter */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={4} className="mt-14">
          <AuthorityCounter />
        </motion.div>
      </section>

      {/* ─── DIVIDER ─────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-5">
        <div className="border-t border-gray-100" />
      </div>

      {/* ─── STATS BAR ───────────────────────────────────────────────────── */}
      <section className="py-10 px-5 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { icon: Users, label: '+1,200 clientes', color: 'text-blue-600' },
            { icon: Package, label: 'Entregas diarias', color: 'text-red-500' },
            { icon: Star, label: '4.9 estrellas', color: 'text-yellow-500' },
            { icon: Flame, label: 'Hora Feliz semanal', color: 'text-red-600' },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              variants={fadeUp} initial="hidden" whileInView="visible" custom={i}
              viewport={{ once: true }}
              className="flex flex-col items-center gap-2"
            >
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <p className="text-sm font-medium text-gray-600">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── FEATURES ────────────────────────────────────────────────────── */}
      <section className="py-20 px-5 max-w-5xl mx-auto">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mb-14 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3">Por qué elegirnos</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Más que un delivery</h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Gift, title: '6to Envío Gratis', desc: 'Cada 5 envíos te ganás uno completamente gratis.', accent: 'bg-blue-50 text-blue-600' },
            { icon: Zap, title: 'Sin Trámites', desc: 'Tu QR lo hace todo. Acumulación automática e instantánea.', accent: 'bg-red-50 text-red-500' },
            { icon: Shield, title: 'Pedidos Seguros', desc: 'Cada entrega monitoreada de principio a fin.', accent: 'bg-gray-900 text-white' },
            { icon: Heart, title: 'Clientes VIP', desc: 'Asciende de rango y desbloquea beneficios exclusivos.', accent: 'bg-blue-600 text-white' },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              variants={fadeUp} initial="hidden" whileInView="visible" custom={i}
              viewport={{ once: true }}
              className="group bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${f.accent}`}>
                <f.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1.5">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── HORA FELIZ ──────────────────────────────────────────────────── */}
      <section className="py-20 px-5 max-w-5xl mx-auto">
        <div className="bg-gray-950 rounded-3xl overflow-hidden">
          <div className="grid lg:grid-cols-2 gap-0">
            {/* Left */}
            <div className="p-10 lg:p-14">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-red-400 mb-6">
                <Flame className="w-3.5 h-3.5" /> Promoción Especial
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-white mb-4 tracking-tight">
                ¡Hora Feliz!
              </h2>
              <p className="text-gray-400 mb-8 leading-relaxed">
                Lunes, Miércoles y Sábados de{' '}
                <span className="text-white font-semibold">5 PM a 8 PM</span>.
                Todos los envíos a solo{' '}
                <span className="text-red-400 font-black text-2xl">$35</span>.
              </p>

              <div className="space-y-2 mb-8">
                {horasFelices.filter(h => h.activo).length === 0 ? (
                  <p className="text-gray-600 text-sm">Cargando horarios...</p>
                ) : (
                  horasFelices.filter(h => h.activo).map(hora => (
                    <div key={hora.dia} className="flex items-center justify-between py-3 border-b border-white/5">
                      <div className="flex items-center gap-3">
                        <Clock className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-300">{hora.nombre}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">{formatTime(hora.hora_inicio)} – {formatTime(hora.hora_fin)}</span>
                        <span className="text-xs font-black text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">${hora.precio_promocional}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => navigate('/cliente')}
                className="inline-flex items-center gap-2 bg-white text-gray-950 font-semibold px-6 py-3 rounded-xl text-sm hover:bg-gray-100 transition-colors"
              >
                Ver mis puntos <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Right — Price Card */}
            <div className="flex items-center justify-center p-10 border-t lg:border-t-0 lg:border-l border-white/5">
              <div className="text-center">
                <div className="inline-flex w-24 h-24 bg-red-500/10 rounded-full items-center justify-center mb-6">
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Sparkles className="w-10 h-10 text-red-400" />
                  </motion.div>
                </div>
                <p className="text-8xl font-black text-white tracking-tighter leading-none">$35</p>
                <p className="text-gray-500 mt-3 text-sm">precio en hora feliz</p>
                <span className="inline-block mt-4 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full">
                  -30% de descuento
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CÓMO FUNCIONA ───────────────────────────────────────────────── */}
      <section className="py-20 px-5 max-w-5xl mx-auto">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mb-14 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3">Así de simple</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Cómo ganar envíos gratis</h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            { num: '01', icon: Phone, title: 'Pide tu envío', desc: 'Contacta al repartidor y realiza tu pedido como siempre.' },
            { num: '02', icon: Star, title: 'Muestra tu QR', desc: 'Abre la app y muestra tu código personal. El repartidor lo escanea.' },
            { num: '03', icon: Gift, title: 'Canjea tu gratis', desc: 'Cada 5 envíos acumulas uno gratis. Se aplica automáticamente.' },
          ].map((step, i) => (
            <motion.div
              key={step.num}
              variants={fadeUp} initial="hidden" whileInView="visible" custom={i}
              viewport={{ once: true }}
              className="relative"
            >
              <p className="text-6xl font-black text-gray-100 mb-4 select-none">{step.num}</p>
              <h3 className="font-bold text-gray-900 text-lg mb-2">{step.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
              {i < 2 && (
                <div className="hidden md:block absolute top-8 -right-3 w-6 border-t-2 border-dashed border-gray-200" />
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── TESTIMONIOS ─────────────────────────────────────────────────── */}
      <section className="py-20 px-5 max-w-5xl mx-auto">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mb-14 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-3">Testimonios</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Lo que dicen nuestros clientes</h2>
        </motion.div>

        <div className="grid sm:grid-cols-3 gap-4">
          {REVIEWS.map((r, i) => (
            <motion.div
              key={r.name}
              variants={fadeUp} initial="hidden" whileInView="visible" custom={i}
              viewport={{ once: true }}
              className="bg-gray-50 rounded-2xl p-6 border border-gray-100"
            >
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: r.stars }).map((_, si) => (
                  <Star key={si} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                ))}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed mb-5">"{r.text}"</p>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                  {r.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-400">Cliente verificado</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── CTA FINAL ───────────────────────────────────────────────────── */}
      <section className="py-20 px-5 max-w-5xl mx-auto">
        <motion.div
          variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
          className="bg-blue-600 rounded-3xl p-12 sm:p-16 text-center text-white relative overflow-hidden"
        >
          {/* Subtle pattern */}
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '60px 60px' }}
          />
          <div className="relative z-10">
            <p className="text-blue-100 text-xs font-bold uppercase tracking-widest mb-4">Únete hoy</p>
            <h2 className="text-3xl sm:text-5xl font-black mb-5 tracking-tight">
              ¿Listo para empezar<br />a acumular?
            </h2>
            <p className="text-blue-100 text-lg mb-10 max-w-md mx-auto">
              Comienza a ganar envíos gratis con tu próximo pedido.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate('/cliente')}
                className="inline-flex items-center justify-center gap-2 bg-white text-blue-700 font-bold px-8 py-4 rounded-xl text-sm hover:bg-blue-50 transition-colors shadow-lg"
              >
                Ver mis puntos <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => window.open(whatsappUrl, '_blank', 'noopener')}
                className="inline-flex items-center justify-center gap-2 bg-white/10 text-white font-semibold px-8 py-4 rounded-xl text-sm hover:bg-white/20 border border-white/20 transition-all"
              >
                <Phone className="w-4 h-4" /> WhatsApp
              </button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ─── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-10 px-5 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-5 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
              <Truck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-gray-700">Estrella Delivery</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Lun – Dom: 9 AM – 10 PM
          </div>
          <div className="flex items-center gap-4">
            <a href={`tel:${contacto.telefono}`} className="hover:text-gray-600 transition-colors">
              {contacto.telefono}
            </a>
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

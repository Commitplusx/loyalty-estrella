import { useNavigate } from 'react-router-dom';
import { motion, type Transition } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Truck, Star, Gift, ArrowRight, Phone, Clock,
  MapPin, Sparkles, Shield, Zap, ChevronRight, Heart,
  Package, CheckCircle2, Flame, Users
} from 'lucide-react';
import { useSchedule } from '@/hooks/useSchedule';
import { AuthorityCounter } from '@/components/client/AuthorityCounter';

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const slowTransition: Transition = { duration: 0.8, ease: 'easeOut' };

const REVIEWS = [
  { name: 'María G.', text: '¡Llevan más de un año siendo mi delivery! El trato es increíble y el 6to gratis es real 🎉', stars: 5 },
  { name: 'Carlos R.', text: 'Rapidísimos y muy confiables. Ya usé 3 envíos gratis y sigo acumulando ⭐', stars: 5 },
  { name: 'Sofía M.', text: 'Me encanta que puedo ver mis puntos en la app. Super transparente y profesional.', stars: 5 },
];

export function Home() {
  const navigate = useNavigate();
  const { storeState, horasFelices, formatTime, contacto } = useSchedule();

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-x-hidden text-white">

      {/* ══ HERO ═══════════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen overflow-hidden flex flex-col">

        {/* Backgrounds */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#120e1e] to-[#0a0a0f]" />
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.25, 0.45, 0.25] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full"
            style={{ background: 'radial-gradient(circle, #ff6b35 0%, transparent 70%)' }}
          />
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.30, 0.15] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
            className="absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full"
            style={{ background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)' }}
          />
          {/* Grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: 'repeating-linear-gradient(0deg,#fff 0px,transparent 1px,transparent 80px,#fff 80px),repeating-linear-gradient(90deg,#fff 0px,transparent 1px,transparent 80px,#fff 80px)' }}
          />
        </div>

        {/* ─── Header ─── */}
        <header className="relative z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-20">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
                className="flex items-center gap-2"
              >
                <div className="relative">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shadow-lg shadow-orange-500/30">
                    <Truck className="w-5 h-5 text-white" />
                  </div>
                  <Star className="w-3 h-3 text-amber-400 fill-amber-400 absolute -top-1 -right-1" />
                </div>
                <span className="text-lg font-bold">
                  Estrella{' '}
                  <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
                    Delivery
                  </span>
                </span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
                className="flex items-center gap-3"
              >
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                  storeState.isOpen
                    ? storeState.isHappyHour
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    storeState.isOpen ? storeState.isHappyHour ? 'bg-amber-400' : 'bg-green-400' : 'bg-red-400'
                  }`} />
                  {storeState.isOpen ? storeState.isHappyHour ? '¡HORA FELIZ!' : 'ABIERTO' : 'CERRADO'}
                </div>
                <Button
                  size="sm"
                  onClick={() => navigate('/cliente')}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 text-sm backdrop-blur-sm"
                >
                  Mis Puntos
                </Button>
              </motion.div>
            </div>
          </div>
        </header>

        {/* ─── Hero Content ─── */}
        <div className="relative z-10 flex-1 flex items-center py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <div className="grid lg:grid-cols-2 gap-16 items-center">

              {/* Left Column */}
              <div className="text-center lg:text-left">
                <motion.div
                  variants={fadeUp} initial="hidden" animate="visible"
                  transition={{ ...slowTransition, delay: 0.1 }}
                  className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-2 mb-6 backdrop-blur-sm"
                >
                  <Sparkles className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-medium text-orange-300">¡5 envíos = 1 gratis!</span>
                </motion.div>

                <motion.h1
                  variants={fadeUp} initial="hidden" animate="visible"
                  transition={{ ...slowTransition, delay: 0.2 }}
                  className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black leading-tight mb-6"
                >
                  Tus envíos{' '}
                  <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500 bg-clip-text text-transparent">
                    con recompensa
                  </span>
                </motion.h1>

                <motion.p
                  variants={fadeUp} initial="hidden" animate="visible"
                  transition={{ ...slowTransition, delay: 0.35 }}
                  className="text-lg sm:text-xl text-gray-400 mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed"
                >
                  En <strong className="text-white">Estrella Delivery</strong> cada envío cuenta.
                  Por cada <span className="text-orange-400 font-semibold">5 que hagas</span>,
                  el <span className="text-orange-400 font-semibold">6to es completamente GRATIS</span>.
                </motion.p>

                <motion.div
                  variants={fadeUp} initial="hidden" animate="visible"
                  transition={{ ...slowTransition, delay: 0.5 }}
                  className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-10"
                >
                  <Button
                    onClick={() => navigate('/cliente')}
                    size="lg"
                    className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold px-8 py-6 text-lg shadow-xl shadow-orange-500/30 border-0 rounded-2xl"
                  >
                    Ver Mis Puntos
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      const cleanNumber = contacto.whatsapp.replace(/\D/g, '');
                      window.open(`https://wa.me/${cleanNumber}`, '_blank', 'noopener,noreferrer');
                    }}
                    className="border border-white/20 text-white hover:bg-white/10 bg-transparent font-semibold px-8 py-6 text-lg rounded-2xl backdrop-blur-sm"
                  >
                    <Phone className="w-5 h-5 mr-2" />
                    Pedir Ahora
                  </Button>
                </motion.div>

                <motion.div
                  variants={fadeUp} initial="hidden" animate="visible"
                  transition={{ ...slowTransition, delay: 0.65 }}
                >
                  <AuthorityCounter />
                </motion.div>

                {/* Mini stats */}
                <motion.div
                  variants={fadeUp} initial="hidden" animate="visible"
                  transition={{ ...slowTransition, delay: 0.8 }}
                  className="flex flex-wrap justify-center lg:justify-start gap-6 mt-6"
                >
                  {[
                    { icon: Gift, label: '6to gratis', value: '5 = 1', color: 'text-orange-400' },
                    { icon: MapPin, label: 'Cobertura', value: 'Local', color: 'text-blue-400' },
                    { icon: Clock, label: 'Respuesta', value: 'Rápida', color: 'text-amber-400' },
                  ].map((stat) => (
                    <div key={stat.label} className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                        <stat.icon className={`w-5 h-5 ${stat.color}`} />
                      </div>
                      <div className="text-left">
                        <p className="text-base font-bold text-white">{stat.value}</p>
                        <p className="text-xs text-gray-400">{stat.label}</p>
                      </div>
                    </div>
                  ))}
                </motion.div>
              </div>

              {/* Right Column — Floating card */}
              <div className="hidden lg:flex items-center justify-center">
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
                  className="relative"
                >
                  {/* Main card */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 w-80 shadow-2xl">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/30">
                          <Truck className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm">Estrella Delivery</p>
                          <p className="text-xs text-gray-400">Tu delivery de confianza</p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-1 rounded-full">● Activo</span>
                    </div>

                    <div className="bg-gradient-to-br from-orange-500/10 to-amber-500/10 border border-orange-500/20 rounded-2xl p-5 mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-semibold text-white text-sm">Tu progreso</p>
                        <Gift className="w-5 h-5 text-orange-400" />
                      </div>
                      <div className="flex items-center justify-between mb-4">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <motion.div
                            key={i}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.7 + i * 0.1, duration: 0.4 }}
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              i <= 3
                                ? 'bg-gradient-to-br from-orange-500 to-amber-500 shadow-lg shadow-orange-500/30'
                                : 'bg-white/10 border border-white/10'
                            }`}
                          >
                            <Star className={`w-5 h-5 ${i <= 3 ? 'text-white fill-white' : 'text-gray-600'}`} />
                          </motion.div>
                        ))}
                      </div>
                      <div className="bg-black/30 rounded-full h-2 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: '60%' }}
                          transition={{ duration: 1.2, ease: 'easeOut', delay: 1.2 }}
                          className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full"
                        />
                      </div>
                      <p className="text-center text-xs text-gray-300 mt-2">
                        <span className="font-bold text-orange-400">2 envíos más</span> para tu delivery gratis
                      </p>
                    </div>

                    {/* Review widget */}
                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                      <div className="flex -space-x-2">
                        {['MG', 'CR', 'SM'].map((initials) => (
                          <div key={initials} className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-[9px] font-bold text-white border-2 border-[#0a0a0f]">
                            {initials}
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="flex items-center gap-0.5 mb-0.5">
                          {[...Array(5)].map((_, i) => <Star key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />)}
                        </div>
                        <p className="text-xs text-gray-300">+500 clientes felices</p>
                      </div>
                    </div>
                  </div>

                  {/* Floating badge: point earned */}
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute -bottom-5 -left-6 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-4"
                  >
                    <div className="flex items-center gap-2">
                      <Star className="w-6 h-6 text-amber-400 fill-amber-400" />
                      <div>
                        <p className="text-sm font-bold text-white">+1 punto</p>
                        <p className="text-xs text-gray-300">Acumulado</p>
                      </div>
                    </div>
                  </motion.div>

                  {/* Floating badge: delivery done */}
                  <motion.div
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
                    className="absolute -top-4 -right-6 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Entregado ✓</p>
                        <p className="text-xs text-gray-300">Hace 2 min</p>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ══ SOCIAL PROOF ════════════════════════════════════════════════════ */}
      <section className="py-12 bg-black/40 border-y border-white/5">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
            {[
              { icon: Users, label: '+1,200 clientes activos', color: 'text-orange-400' },
              { icon: Package, label: 'Entregas diarias garantizadas', color: 'text-amber-400' },
              { icon: Star, label: '4.9 estrellas promedio', color: 'text-yellow-400' },
              { icon: Flame, label: 'Hora Feliz 2x por semana', color: 'text-red-400' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-gray-400">
                <item.icon className={`w-5 h-5 ${item.color} shrink-0`} />
                <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ BENEFICIOS ══════════════════════════════════════════════════════ */}
      <section className="py-24 bg-[#0a0a0f]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={fadeUp} initial="hidden" whileInView="visible"
            viewport={{ once: true, amount: 0.3 }} transition={slowTransition}
            className="text-center mb-16"
          >
            <p className="text-orange-400 font-semibold text-sm uppercase tracking-widest mb-3">¿Por qué elegirnos?</p>
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
              Más que un delivery,{' '}
              <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
                una experiencia
              </span>
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">Somos tu aliado de confianza en cada entrega</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Gift, title: '6to Envío Gratis', desc: 'Por cada 5 envíos acumulados, el siguiente es completamente gratis.', from: 'from-orange-500', to: 'to-amber-500', delay: 0.1 },
              { icon: Zap, title: 'Sin Trámites', desc: 'Tu código QR lo hace todo. Acumulación automática en cada entrega.', from: 'from-amber-500', to: 'to-yellow-500', delay: 0.2 },
              { icon: Shield, title: 'Tu Pedido Seguro', desc: 'Cada entrega monitoreada. Tu mercancía protegida de principio a fin.', from: 'from-emerald-500', to: 'to-teal-500', delay: 0.3 },
              { icon: Heart, title: 'Clientes VIP', desc: 'Asciende de rango y desbloquea beneficios exclusivos con cada pedido.', from: 'from-rose-500', to: 'to-pink-500', delay: 0.4 },
            ].map((f) => (
              <motion.div
                key={f.title}
                variants={fadeUp} initial="hidden" whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                transition={{ ...slowTransition, delay: f.delay }}
              >
                <div className="group bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-3xl p-6 h-full transition-all duration-500 hover:-translate-y-2 cursor-default">
                  <div className={`w-14 h-14 bg-gradient-to-br ${f.from} ${f.to} rounded-2xl flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <f.icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="font-bold text-white mb-2 text-lg">{f.title}</h3>
                  <p className="text-gray-300 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ HORA FELIZ ══════════════════════════════════════════════════════ */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/20 via-orange-900/10 to-[#0a0a0f]" />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-20" style={{ background: 'radial-gradient(circle, #f59e0b, transparent)' }} />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            <motion.div
              variants={fadeUp} initial="hidden" whileInView="visible"
              viewport={{ once: true, amount: 0.3 }} transition={slowTransition}
            >
              <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full px-4 py-2 mb-6">
                <Flame className="w-4 h-4" />
                <span className="text-sm font-semibold">Promoción Especial</span>
              </div>

              <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">¡Hora Feliz! 🎉</h2>

              <p className="text-lg text-gray-400 mb-8 leading-relaxed">
                Martes y Viernes de{' '}
                <strong className="text-amber-400">5:00 PM a 7:00 PM</strong>,
                todos los envíos cuestan solo{' '}
                <strong className="text-5xl font-black bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">$35</strong>
              </p>

              <div className="space-y-3 mb-8">
                {horasFelices.filter((h) => h.activo).length === 0 ? (
                  <p className="text-gray-600 italic text-sm">Cargando horarios...</p>
                ) : (
                  horasFelices.filter((h) => h.activo).map((hora) => (
                    <motion.div
                      key={hora.dia}
                      variants={fadeUp} initial="hidden" whileInView="visible"
                      viewport={{ once: true }}
                      transition={{ ...slowTransition, delay: 0.15 * hora.dia }}
                      className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-2xl"
                    >
                      <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center shrink-0">
                        <Clock className="w-6 h-6 text-amber-400" />
                      </div>
                      <div>
                        <p className="font-bold text-white">{hora.nombre}</p>
                        <p className="text-gray-400 text-sm">{formatTime(hora.hora_inicio)} – {formatTime(hora.hora_fin)}</p>
                      </div>
                      <div className="ml-auto bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-sm px-3 py-1 rounded-full">
                        ${hora.precio_promocional}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              <Button
                onClick={() => navigate('/cliente')}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold px-8 py-6 rounded-2xl shadow-xl shadow-amber-500/20 border-0"
              >
                Ver Mis Puntos
                <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            </motion.div>

            {/* Price card */}
            <motion.div
              variants={fadeIn} initial="hidden" whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              className="flex justify-center"
            >
              <div className="relative">
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 text-center w-72 shadow-2xl">
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-24 h-24 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-amber-500/30"
                  >
                    <Sparkles className="w-12 h-12 text-white" />
                  </motion.div>
                  <motion.p
                    initial={{ scale: 0.5, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.4 }}
                    className="text-7xl font-black bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent mb-1"
                  >
                    $35
                  </motion.p>
                  <p className="text-gray-300 mb-6">Precio en Hora Feliz</p>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
                    <p className="text-amber-200 font-medium text-sm">¡Aprovecha y acumula puntos más rápido!</p>
                  </div>
                </div>
                <motion.div
                  animate={{ y: [0, -6, 0], rotate: [0, 3, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -top-4 -right-4 bg-red-500 text-white font-black text-sm px-3 py-1.5 rounded-full shadow-lg"
                >
                  -30% OFF
                </motion.div>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* ══ CÓMO FUNCIONA ═══════════════════════════════════════════════════ */}
      <section className="py-24 bg-[#0a0a0f]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={fadeUp} initial="hidden" whileInView="visible"
            viewport={{ once: true, amount: 0.3 }} transition={slowTransition}
            className="text-center mb-16"
          >
            <p className="text-orange-400 font-semibold text-sm uppercase tracking-widest mb-3">Así de sencillo</p>
            <h2 className="text-3xl sm:text-4xl font-black text-white">
              Cómo{' '}
              <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
                ganar envíos gratis
              </span>
            </h2>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { num: '1', title: 'Pide tu envío', desc: 'Contacta a tu repartidor de siempre y realiza tu pedido normalmente.', icon: Phone, color: 'from-orange-500 to-red-500' },
              { num: '2', title: 'Muestra tu QR', desc: 'Abre la app, muestra tu código QR personal. El repartidor lo escanea.', icon: Star, color: 'from-amber-500 to-orange-500' },
              { num: '3', title: 'Acumula y canjea', desc: 'Con cada 5 envíos acumulas uno gratis. ¡Se aplica automáticamente!', icon: Gift, color: 'from-emerald-500 to-teal-500' },
            ].map((step, i) => (
              <motion.div
                key={step.num}
                variants={fadeUp} initial="hidden" whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                transition={{ ...slowTransition, delay: i * 0.2 }}
                className="text-center group"
              >
                <div className="relative inline-block mb-6">
                  <div className={`w-20 h-20 bg-gradient-to-br ${step.color} rounded-2xl flex items-center justify-center mx-auto shadow-xl group-hover:scale-110 transition-transform duration-300`}>
                    <step.icon className="w-9 h-9 text-white" />
                  </div>
                  <div className="absolute -top-3 -right-3 w-8 h-8 bg-white text-[#0a0a0f] rounded-full flex items-center justify-center text-sm font-black shadow-lg">
                    {step.num}
                  </div>
                  {i < 2 && (
                    <div className="hidden sm:block absolute top-1/2 left-full w-16 h-px bg-gradient-to-r from-orange-500/40 to-transparent -translate-y-1/2 ml-2" />
                  )}
                </div>
                <h3 className="font-bold text-white text-lg mb-2">{step.title}</h3>
                <p className="text-gray-300 text-sm leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ TESTIMONIOS ═════════════════════════════════════════════════════ */}
      <section className="py-24 bg-white/[0.02] border-y border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            variants={fadeUp} initial="hidden" whileInView="visible"
            viewport={{ once: true, amount: 0.3 }} transition={slowTransition}
            className="text-center mb-14"
          >
            <p className="text-orange-400 font-semibold text-sm uppercase tracking-widest mb-3">Lo que dicen nuestros clientes</p>
            <h2 className="text-3xl sm:text-4xl font-black text-white">
              Miles de clientes{' '}
              <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">confían en nosotros</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {REVIEWS.map((review, i) => (
              <motion.div
                key={review.name}
                variants={fadeUp} initial="hidden" whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                transition={{ ...slowTransition, delay: i * 0.15 }}
              >
                <div className="bg-white/5 border border-white/10 rounded-3xl p-6 h-full hover:border-orange-500/20 hover:bg-white/8 transition-all duration-300">
                  <div className="flex items-center gap-0.5 mb-4">
                    {[...Array(review.stars)].map((_, si) => (
                      <Star key={si} className="w-4 h-4 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <p className="text-gray-200 leading-relaxed mb-5 text-sm">"{review.text}"</p>
                  <div className="flex items-center gap-3 mt-auto">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-sm font-bold text-white shadow-lg">
                      {review.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-white text-sm">{review.name}</p>
                      <p className="text-xs text-gray-400">Cliente verificado</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CTA FINAL ═══════════════════════════════════════════════════════ */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-900/30 via-[#0a0a0f] to-amber-900/20" />
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.3, 0.15] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, #ff6b35, transparent)' }}
          />
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
            className="absolute bottom-0 left-0 w-80 h-80 rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, #f59e0b, transparent)' }}
          />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            variants={fadeUp} initial="hidden" whileInView="visible"
            viewport={{ once: true, amount: 0.3 }} transition={slowTransition}
          >
            <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-full px-4 py-2 mb-6">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-semibold">Únete hoy</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white mb-6 leading-tight">
              ¿Listo para empezar{' '}
              <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
                a acumular?
              </span>
            </h2>
            <p className="text-gray-300 text-xl mb-12 max-w-xl mx-auto leading-relaxed">
              Regístrate hoy y comienza a ganar envíos gratis con cada pedido que hagas.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={() => navigate('/cliente')}
                size="lg"
                className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold px-12 py-7 text-xl rounded-2xl shadow-2xl shadow-orange-500/30 border-0"
              >
                Ver Mis Puntos
                <ArrowRight className="w-6 h-6 ml-2" />
              </Button>
              <Button
                onClick={() => {
                  const cleanNumber = contacto.whatsapp.replace(/\D/g, '');
                  window.open(`https://wa.me/${cleanNumber}`, '_blank', 'noopener,noreferrer');
                }}
                variant="outline"
                size="lg"
                className="border border-white/20 hover:bg-white/10 text-white bg-transparent font-semibold px-12 py-7 text-xl rounded-2xl backdrop-blur-sm"
              >
                <Phone className="w-6 h-6 mr-2" />
                WhatsApp
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ══ FOOTER ══════════════════════════════════════════════════════════ */}
      <footer className="bg-black/60 border-t border-white/5 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center">
                <Truck className="w-4 h-4 text-white" />
              </div>
              <span className="text-white font-bold">
                Estrella{' '}
                <span className="text-orange-400">Delivery</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                Lunes a Domingo: 9:00 AM – 10:00 PM
              </span>
              <span className="text-gray-700">|</span>
              <a href={`tel:${contacto.telefono}`} className="hover:text-white transition-colors">
                {contacto.telefono}
              </a>
            </div>

            <a href="/login" className="text-sm hover:text-white transition-colors">
              Acceso Administrador
            </a>
          </div>

          <div className="mt-8 pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
            <p>© {new Date().getFullYear()} Estrella Delivery. Todos los derechos reservados.</p>
            <p className="flex items-center gap-1 text-gray-500">
              Hecho con <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500 mx-1" /> para nuestros clientes
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}

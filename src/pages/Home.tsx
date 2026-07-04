import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, type Variants } from 'framer-motion';
import { ArrowRight, Phone, Star, Gift, Zap, Shield, Heart, Truck, MapPin, Sparkles, CheckCircle, Clock, Store, Home as HomeIcon, QrCode, Utensils } from 'lucide-react';
import { useSchedule } from '@/hooks/useSchedule';
import { supabase } from '@/lib/supabase';
import { BottomNav } from '@/components/client/BottomNav';

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.07 },
  }),
};

function Reveal({ children, custom = 0, className = '' }: {
  children: React.ReactNode; custom?: number; className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div ref={ref} variants={fadeUp} initial="hidden"
      animate={inView ? 'show' : 'hidden'} custom={custom} className={className}>
      {children}
    </motion.div>
  );
}

const STEPS = [
  { n: '01', icon: Phone, title: 'Regístrate gratis', desc: 'Solo tu número de celular. Sin formularios, sin contraseñas.' },
  { n: '02', icon: QrCode, title: 'Muestra tu QR', desc: 'Con cada pedido escanean tu código y acumulas automático.' },
  { n: '03', icon: Gift, title: 'Canjea tu envío', desc: 'Al 6to envío, uno completamente gratis. Así de fácil.' },
];

const PERKS = [
  { icon: Zap, label: 'Acumulación instantánea', desc: 'Tus puntos se registran en el momento de la entrega.' },
  { icon: Shield, label: 'Sin caducidad', desc: 'Tus puntos no expiran. Úsalos cuando quieras.' },
  { icon: Utensils, label: 'Restaurantes asociados', desc: 'Acumula también en todos los negocios de Estrella Eats.' },
  { icon: Heart, label: 'Clientes VIP', desc: 'Entre más pides, más beneficios exclusivos desbloqueas.' },
];

const REVIEWS = [
  { name: 'María G.', text: 'Ya usé 3 envíos gratis. El sistema es súper fácil y rápido.', stars: 5 },
  { name: 'Carlos R.', text: 'Rapidísimos y muy confiables. Lo recomiendo al 100%.', stars: 5 },
  { name: 'Sofía M.', text: 'Me encanta ver mis puntos en tiempo real. Muy transparente.', stars: 5 },
];

export function Home() {
  const [telefono, setTelefono] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  const navigate = useNavigate();
  const { storeState, contacto } = useSchedule();
  const whatsappNum = contacto.whatsapp.replace(/\D/g, '');
  const whatsappUrl = whatsappNum ? `https://wa.me/${whatsappNum}` : '';
  const [tel, setTel] = useState('');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased font-sans overflow-x-hidden">

      {/* ── NAV ── */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-100' : 'bg-transparent'}`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <motion.div className="flex items-center gap-3" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
            <div className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center">
              <img src="/estrella-circle.png" alt="Estrella Logo" className="w-full h-full object-contain" />
            </div>
            <span className="font-black text-gray-900 text-2xl sm:text-xl tracking-tight">Estrella<span className="text-orange-500"> Eats</span></span>
          </motion.div>

          <motion.div className="hidden sm:flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 text-gray-600"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <span className={`w-1.5 h-1.5 rounded-full ${storeState.isOpen ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
            {storeState.isOpen ? 'Abierto ahora' : 'Cerrado'}
          </motion.div>

          <motion.button onClick={() => navigate('/cliente')}
            className="flex items-center gap-1.5 text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors"
            initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
            whileHover={{ x: 2 }} whileTap={{ scale: 0.97 }}>
            Mis Puntos <ArrowRight className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-5 text-center overflow-hidden"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 4rem)' }}>
        {/* Fondo decorativo sutil */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-orange-50 rounded-full blur-3xl opacity-60" />
        </div>

        <motion.div className="relative z-10 max-w-3xl mx-auto -mt-32 sm:-mt-16"
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>

          {/* Badge */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 bg-orange-50 border border-orange-100 text-orange-600 text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full mb-8">
            <Sparkles className="w-3.5 h-3.5" /> Programa de Lealtad
          </motion.div>

          {/* Título */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight text-gray-900 mb-6">
            Cada pedido<br />
            <span className="text-orange-500">vale más.</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-500 max-w-xl mx-auto mb-10 leading-relaxed">
            Acumula puntos con cada envío y desbloquea tu <strong className="text-gray-700">6to envío gratis</strong>. Sin apps, sin trámites, sin complicaciones.
          </p>

          {/* Input Hero */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
            <div className="relative flex-1">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="tel" value={tel} onChange={e => setTel(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="Tu número celular"
                className="w-full pl-10 pr-4 py-3.5 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-500/10 text-gray-900 font-semibold text-sm bg-white transition-all"
              />
            </div>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={() => tel.length === 10 && navigate('/loyalty/' + tel)}
              className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3.5 rounded-xl text-sm shadow-lg shadow-orange-500/25 transition-all disabled:opacity-40"
              disabled={tel.length < 10}>
              Ver mis puntos <ArrowRight className="w-4 h-4" />
            </motion.button>
          </motion.div>

          {/* Social proof */}
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            className="text-xs text-gray-400 mt-5 font-medium">
            +3,000 clientes ya acumulando · Gratis para siempre
          </motion.p>
        </motion.div>

        {/* Scroll hint */}
        <motion.div className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.8 }}>
          <div className="w-5 h-8 border-2 border-gray-300 rounded-full flex justify-center pt-1.5">
            <div className="w-1 h-2 bg-gray-400 rounded-full" />
          </div>
        </motion.div>
      </section>

      {/* ── CÓMO FUNCIONA ── */}
      <section className="py-24 px-5">
        <div className="max-w-5xl mx-auto">
          <Reveal className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Así de simple</p>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">3 pasos para ganar envíos gratis</h2>
          </Reveal>

          <div className="grid sm:grid-cols-3 gap-8">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} custom={i} className="relative">
                <div className="flex flex-col items-start gap-4 p-6 rounded-2xl bg-gray-50 hover:bg-orange-50/50 transition-colors duration-300 h-full border border-gray-100 hover:border-orange-100">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl font-black text-orange-500/20 leading-none">{s.n}</span>
                    <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-md shadow-orange-500/30">
                      <s.icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1.5">{s.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
                {i < 2 && <div className="hidden sm:block absolute top-1/2 -right-4 w-8 h-px bg-gray-200 z-10" />}
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── BENEFICIOS ── */}
      <section id="beneficios" className="py-24 px-5 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <Reveal className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Por qué elegirnos</p>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Más que un programa de puntos</h2>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PERKS.map((p, i) => (
              <Reveal key={p.label} custom={i}>
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 h-full">
                  <div className="w-11 h-11 bg-orange-50 rounded-xl flex items-center justify-center mb-4">
                    <p.icon className="w-5 h-5 text-orange-500" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1.5 text-sm">{p.label}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{p.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── ESTRELLA EATS BANNER ── */}
      <section className="py-24 px-5">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <div className="relative rounded-3xl overflow-hidden bg-orange-500 p-10 sm:p-14 flex flex-col sm:flex-row items-center gap-8">
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 50%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
              <div className="relative z-10 flex-1 text-center sm:text-left">
                <p className="text-orange-100 text-xs font-bold uppercase tracking-widest mb-3">Nuestros restaurantes</p>
                <h2 className="text-3xl sm:text-4xl font-black text-white mb-3 tracking-tight">Pide en Estrella Eats</h2>
                <p className="text-orange-100 text-base leading-relaxed max-w-md">
                  Descubre los restaurantes asociados y acumula puntos con cada pedido que haces en línea.
                </p>
              </div>
              <div className="relative z-10 shrink-0">
                <motion.button onClick={() => window.open('https://estrella-eats.shop', '_blank')}
                  whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 bg-white text-orange-600 font-black px-8 py-4 rounded-2xl text-sm shadow-xl shadow-black/10 hover:shadow-2xl transition-all">
                  <Utensils className="w-4 h-4" /> Ver Restaurantes <ArrowRight className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── TESTIMONIOS ── */}
      <section className="py-24 px-5 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <Reveal className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Testimonios</p>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Lo que dicen nuestros clientes</h2>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-5">
            {REVIEWS.map((r, i) => (
              <Reveal key={r.name} custom={i}>
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 h-full flex flex-col">
                  <div className="flex gap-0.5 mb-4">
                    {Array.from({ length: r.stars }).map((_, si) => (
                      <Star key={si} className="w-4 h-4 text-orange-400 fill-orange-400" />
                    ))}
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed flex-1 mb-5">"{r.text}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-xs font-black text-white">
                      {r.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{r.name}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin className="w-2.5 h-2.5" /> Cliente verificado</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-24 px-5">
        <div className="max-w-2xl mx-auto text-center">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-4">Únete gratis</p>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-gray-900 mb-5">
              ¿Listo para acumular?
            </h2>
            <p className="text-gray-500 text-lg mb-10">Tu primer envío ya cuenta. Empieza ahora.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <motion.button onClick={() => navigate('/cliente')}
                whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-4 rounded-xl text-sm shadow-lg shadow-orange-500/30 transition-all">
                Ver mis puntos <ArrowRight className="w-4 h-4" />
              </motion.button>
              {whatsappUrl && (
                <motion.button onClick={() => window.open(whatsappUrl, '_blank', 'noopener')}
                  whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center justify-center gap-2 border-2 border-gray-200 hover:border-gray-300 text-gray-700 font-bold px-8 py-4 rounded-xl text-sm transition-all">
                  <Phone className="w-4 h-4" /> WhatsApp
                </motion.button>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-gray-100 bg-white pb-24 lg:pb-0">
        <div className="max-w-5xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-orange-500 rounded-md flex items-center justify-center">
              <Star className="w-3.5 h-3.5 text-white fill-white" />
            </div>
            <span className="font-bold text-gray-700">Estrella Eats</span>
          </div>
          <p className="text-xs">© {new Date().getFullYear()} Estrella Delivery · Hecho con <Heart className="w-3 h-3 text-red-400 fill-red-400 inline mx-0.5" /> para nuestros clientes</p>
          {contacto.telefono && (
            <a href={`tel:${contacto.telefono}`} className="hover:text-gray-600 font-medium transition-colors text-xs">{contacto.telefono}</a>
          )}
        </div>
      </footer>

      {/* WhatsApp flotante */}
      {whatsappUrl && (
        <motion.a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
          className="fixed bottom-24 lg:bottom-6 right-5 z-40 flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold px-4 py-3 rounded-full shadow-xl shadow-green-500/30 transition-colors"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
          initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1, type: 'spring', stiffness: 260, damping: 20 }}
          whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}>
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white shrink-0" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Pedir ahora
        </motion.a>
      )}

      <BottomNav activeTab={activeTab}
        items={[
          { id: 'home', icon: HomeIcon, label: 'Inicio' },
          { id: 'beneficios', icon: Star, label: 'Beneficios' },
          { id: 'pedir', icon: Store, label: 'Pedir' },
        ]}
        onChange={(tab) => {
          if (tab === 'home') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setActiveTab('home');
          }
          else if (tab === 'beneficios') {
            document.getElementById('beneficios')?.scrollIntoView({ behavior: 'smooth' });
            setActiveTab('beneficios');
          }
          else if (tab === 'pedir' && whatsappUrl) {
            window.open(whatsappUrl, '_blank', 'noopener');
          }
        }}
      />
    </div>
  );
}


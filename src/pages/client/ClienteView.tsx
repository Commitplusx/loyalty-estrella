import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Phone, Search, Gift, Star, ArrowRight,
  ChevronLeft, AlertCircle, Share2
} from 'lucide-react';
import { useLoyaltyAccess } from '@/hooks/useLoyaltyAccess';
import { CustomerOtpCard } from '@/components/client/CustomerOtpCard';
import { ClientStats } from '@/components/ClientStats';
import { RatingModal } from '@/components/RatingModal';
import { CanjeModal } from '@/components/client/CanjeModal';
import { WalletSection } from '@/components/client/WalletSection';
import { ProgressCard } from '@/components/client/ProgressCard';
import { HistorialTimeline } from '@/components/client/HistorialTimeline';
import { OnboardingWelcome } from '@/components/client/OnboardingWelcome';

import { useSchedule } from '@/hooks/useSchedule';
import { generateCloudinaryVIPCard } from '@/lib/utils';
import '@/loyalty.css';


export function ClienteView() {
  const { tel: routeTel } = useParams<{ tel?: string }>();
  const rawPrefill=(routeTel || new URLSearchParams(window.location.search).get('tel') || '').replace(/\D/g,'').slice(-10);
  const access=useLoyaltyAccess(rawPrefill.length===10 ? rawPrefill : '');
  const {telefono,setTelefono,cliente,setCliente,historial,viewState}=access;
  const inputRef=useRef<HTMLInputElement>(null);
  const [showOnboarding,setShowOnboarding]=useState(false);
  const [showRating,setShowRating]=useState(false);
  const [activeRegistroId,setActiveRegistroId]=useState<string | null>(null);
  const [showCanjeModal,setShowCanjeModal]=useState(false);
  const {contacto}=useSchedule();
  const whatsappUrl=`https://wa.me/${(contacto?.whatsapp || '529631550244').replace(/\D/g,'')}`;
  const [navScrolled,setNavScrolled]=useState(false);
  useEffect(() => {
    const onScroll=() => setNavScrolled(window.scrollY>6);
    window.addEventListener('scroll',onScroll,{passive:true});
    return () => window.removeEventListener('scroll',onScroll);
  },[]);
  useEffect(() => {
    if (access.newAccumulationId && cliente) {setActiveRegistroId(access.newAccumulationId); setShowRating(true);}
  },[access.newAccumulationId,cliente?.id]);
  const handleBuscar=(event: React.FormEvent) => {event.preventDefault(); void access.requestCode();};
  const handleReset=() => {
    setShowRating(false); setShowCanjeModal(false); setActiveRegistroId(null);
    void access.reset();
  };


  const metaVip = 5; // Published coupon redemption requires five points, independently of delivery checkout.
  // Si el cliente es nuevo y tiene 0 puntos, no mostramos el mensaje de gratis.
  const puntosEnCiclo = cliente ? Math.min(cliente.puntos, metaVip) : 0;
  const progreso = cliente ? (puntosEnCiclo / metaVip) * 100 : 0;
  const enviosRestantes = cliente ? Math.max(0,metaVip-cliente.puntos) : metaVip;

  // â”€â”€ Compartir tarjeta de lealtad â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleShare = () => {
    const url = `https://www.app-estrella.shop/loyalty/${cliente?.telefono}`;
    const text = `¡Mira mi tarjeta de lealtad en Estrella Delivery! 🌟\n${url}`;
    if (navigator.share) {
      navigator.share({ title: 'Estrella Delivery', text, url }).catch(() => {});
    } else {
      const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(wa, '_blank');
    }
  };

  // â”€â”€ Animated points counter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const displayPoints = useMotionValue(0);
  const displayPointsRounded = useTransform(displayPoints, v => Math.round(v));
  useEffect(() => {
    if (viewState === 'result' && cliente) {
      const ctrl = animate(displayPoints, cliente.puntos || 0, { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.6, ease: 'easeOut' });
      return ctrl.stop;
    }
  }, [viewState, cliente?.id, cliente?.puntos, displayPoints]);

  // â”€â”€ Confetti when cycle is complete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (viewState === 'result' && cliente && enviosRestantes === 0 && cliente.envios_totales > 0) {
      const t = setTimeout(() => {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.55 }, colors: ['#f97316', '#f59e0b', '#10b981', '#ea580c', '#8b5cf6'] });
        setTimeout(() => confetti({ particleCount: 60, spread: 100, origin: { y: 0.4, x: 0.2 }, colors: ['#f97316', '#fbbf24'] }), 300);
        setTimeout(() => confetti({ particleCount: 60, spread: 100, origin: { y: 0.4, x: 0.8 }, colors: ['#10b981', '#f97316'] }), 500);
      }, 1400);
      return () => clearTimeout(t);
    }
  }, [viewState, cliente?.id, enviosRestantes]);

  // Wallet handlers moved to WalletSection component

  // El QR ya se genera arriba, quitamos el efecto duplicado.

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.02, y: -10 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="loyalty-page loyalty-portal min-h-screen overflow-x-hidden transition-colors duration-300"
    >
      {/* Onboarding primera visita */}
      {showOnboarding && (
        <OnboardingWelcome onFinish={() => {
          setShowOnboarding(false);
          setTimeout(() => inputRef.current?.focus(), 300);
        }} />
      )}
      {/* Header — Fixed Peach */}
      <div
        className={`loyalty-portal-header fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur-md transition-all duration-300
          ${navScrolled ? 'shadow-sm border-b border-gray-100' : ''}`}
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0.5rem)' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <span className="loyalty-brand-mark"><Star size={22} strokeWidth={2.5} aria-hidden="true" /></span>
              <div className="font-black text-lg text-gray-900 tracking-tight">
                Estrella<span style={{ color: "var(--loyalty-accent)" }}>.</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {cliente && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  disabled={access.busy}
                  className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 ml-1 text-xs gap-1 font-bold"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Salir
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main "” padding-top to clear fixed header + bottom safe-area for iPhone home bar */}
      <main className="loyalty-portal-main max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pt-20 sm:pt-24"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}>

        {/* --- LOADING --- */}
        {viewState === 'loading' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="max-w-md mx-auto pt-10 space-y-8"
          >
            {/* Orbital spinner */}
            <div className="flex flex-col items-center gap-5">
              <div className="relative w-24 h-24">
                {/* Outer ring */}
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 border-r-blue-400"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                />
                {/* Middle ring */}
                <motion.div
                  className="absolute inset-2 rounded-full border-4 border-transparent border-b-blue-300 border-l-blue-500"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                />
                {/* Center pulse dot */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/40"
                    animate={{ scale: [1, 1.12, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Search className="w-4 h-4 text-white" />
                  </motion.div>
                </div>
              </div>

              <div className="text-center">
                <motion.h2
                  className="text-xl font-bold text-gray-900 mb-1"
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  Verificando tu acceso…
                </motion.h2>
                <p className="text-sm text-gray-400 font-mono tracking-wide">
                  +52 {telefono.slice(0, 3)} {telefono.slice(3, 6)} {telefono.slice(6)}
                </p>
              </div>
            </div>

            {/* Shimmer skeleton cards */}
            <div className="space-y-3">
              {[
                { w: 'w-full', h: 'h-28' },
                { w: 'w-full', h: 'h-20' },
                { w: 'w-full', h: 'h-20' },
                { w: 'w-3/4',  h: 'h-14' },
              ].map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.4, ease: 'easeOut' }}
                  className={`${s.w} ${s.h} rounded-2xl relative overflow-hidden bg-gray-100`}
                >
                  {/* Shimmer sweep */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
                  />
                </motion.div>
              ))}
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-primary"
                  animate={{ scale: [1, 1.6, 1], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* ── ERROR: NOT REGISTERED ── */}
        {viewState === 'error-not-found' && (
          <div className="space-y-6">
            <Button variant="ghost" onClick={handleReset} className="text-gray-500">
              <ChevronLeft className="w-5 h-5 mr-1" /> Volver
            </Button>
            <Card className="border-0 shadow-xl overflow-hidden">
              <div className="bg-gradient-to-br from-amber-500 to-orange-500 p-8 text-white text-center">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Número no registrado</h2>
                <p className="text-orange-100">
                  El número <strong className="text-white">{telefono}</strong> todavía no tiene una tarjeta de beneficios activa.
                </p>
              </div>
              <CardContent className="p-6 space-y-4 text-center">
                <p className="text-gray-700 font-medium">
                  Para poder acceder a tu billetera y acumular puntos, necesitas registrarte en nuestro programa de lealtad.
                </p>
                <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-xl text-left border border-orange-100">
                  <Gift className="w-8 h-8 text-primary shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">¡El registro es gratis!</p>
                    <p className="text-gray-500 text-sm">
                      Únete hoy mismo a través de WhatsApp y comienza a disfrutar de envíos gratis y beneficios exclusivos.
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={() => window.location.href = `${whatsappUrl}?text=Quiero%20registrarme`} 
                  className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white h-12 font-semibold shadow-lg shadow-green-500/30"
                >
                  <Phone className="w-5 h-5 mr-2" />
                  Registrarme por WhatsApp
                </Button>
                <Button onClick={handleReset} variant="outline" className="w-full text-gray-600 border-gray-200 h-12">
                  <Search className="w-4 h-4 mr-2" />
                  Buscar otro número
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── ERROR: GENERIC ── */}
        {viewState === 'error-generic' && (
          <div className="space-y-4">
            <Button variant="ghost" onClick={handleReset} className="text-gray-500">
              <ChevronLeft className="w-5 h-5 mr-1" /> Volver
            </Button>
            <Card className="border-0 shadow-xl">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Error de conexión</h2>
                <p className="text-gray-500">{access.accessError || 'No pudimos verificar tu acceso. Revisa tu conexión e intenta de nuevo.'}</p>
                <Button onClick={() => {void access.restore();}} variant="outline" className="border-orange-300 text-orange-600">
                  Intentar de nuevo
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {viewState === 'search' && (
          <section className="loyalty-entry" aria-labelledby="loyalty-entry-title">
            <div className="loyalty-entry-story">
              <p className="loyalty-eyebrow">TU ESPACIO / TUS PUNTOS</p>
              <h1 id="loyalty-entry-title" className="loyalty-portal-heading">Lo que has ganado, <em>siempre contigo.</em></h1>
              <p className="loyalty-entry-lead">Consulta tus entregas, beneficios disponibles y movimientos en una sola tarjeta.</p>
              <div className="loyalty-entry-note">
                <span className="loyalty-entry-note-mark"><Star size={23} fill="currentColor" aria-hidden="true" /></span>
                <div><strong>Una tarjeta para cada entrega</strong><p>Tu avance y tu meta se actualizan con los datos de tu cuenta.</p></div>
              </div>
            </div>
            <div className="loyalty-entry-card">
              <div className="loyalty-entry-card-heading">
                <span className="loyalty-card-kicker">ACCESO A TU TARJETA</span>
                <h2>Consulta tus puntos</h2>
                <p>Escribe el celular con el que te registraste.</p>
              </div>
              <form onSubmit={handleBuscar} className="loyalty-entry-form">
                <label htmlFor="loyalty-client-phone">Número celular</label>
                <div className="loyalty-entry-phone">
                  <span>+52</span>
                  <input
                    id="loyalty-client-phone"
                    ref={inputRef}
                    value={telefono}
                    onChange={(event) => setTelefono(event.target.value.replace(/\D/g, '').slice(0, 10))}
                    disabled={access.busy}
                    placeholder="10 dígitos"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    required
                    aria-describedby="loyalty-client-phone-help"
                  />
                  <small>{telefono.length}/10</small>
                </div>
                <p id="loyalty-client-phone-help">Te enviaremos un código por WhatsApp para proteger tu tarjeta.</p>
                {access.accessError && <p className="loyalty-access-error" role="alert">{access.accessError}</p>}
                <button type="submit" disabled={telefono.length !== 10 || access.busy}>{access.busy ? 'Enviando tu código…' : 'Recibir código por WhatsApp'} <ArrowRight size={18} aria-hidden="true" /></button>
              </form>
              <div className="loyalty-entry-register">
                <p>¿Todavía no estás registrado?</p>
                <a href={whatsappUrl + '?text=Quiero%20registrarme'} target="_blank" rel="noopener noreferrer"><Phone size={17} aria-hidden="true" /> Regístrate por WhatsApp</a>
              </div>
            </div>
          </section>
        )}
        {viewState === 'otp' && (
          <CustomerOtpCard challenge={access.challenge} phone={telefono} code={access.codigo} busy={access.busy}
            error={access.accessError} onCode={access.setCodigo} onVerify={() => {void access.verifyCode();}}
            onResend={() => {void access.requestCode(true);}} onChangeNumber={handleReset} />
        )}

        {/* --- RESULT --- */}
        {viewState === 'result' && cliente && (
          <motion.div
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="loyalty-dashboard w-full"
          >
            {access.refreshError && <div className="loyalty-data-error" role="alert"><p>{access.refreshError}</p><button type="button" onClick={() => {void access.refresh();}}>Actualizar tarjeta</button></div>}
            <div className="loyalty-dashboard-intro">
              <div>
                <p className="loyalty-eyebrow">MI ESPACIO ESTRELLA</p>
                <h1 className="loyalty-portal-heading">Hola, {cliente.nombre || 'bienvenido'}.</h1>
                <p>Aquí están tus puntos, beneficios y movimientos.</p>
              </div>
              <div className="loyalty-dashboard-actions">
                <button type="button" onClick={handleShare} className="loyalty-share-action">
                  <Share2 size={18} aria-hidden="true" /> Compartir tarjeta
                </button>
                <a className="loyalty-contact-action" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <Phone size={17} aria-hidden="true" /> Ayuda
                </a>
              </div>
            </div>

            <nav className="loyalty-dashboard-jumps" aria-label="Secciones de mi tarjeta">
              <a href="#loyalty-overview">Mis puntos</a>
              <a href="#loyalty-card">Mi QR</a>
              <a href="#loyalty-benefits">Beneficios</a>
              <a href="#loyalty-history">Movimientos</a>
            </nav>
            <div className="loyalty-dashboard-columns">
              <div className="loyalty-dashboard-primary" id="loyalty-overview">
                <ProgressCard
                  cliente={cliente}
                  metaVip={metaVip}
                  progreso={progreso}
                  enviosRestantes={enviosRestantes}
                  displayPointsRounded={displayPointsRounded}
                  onCanjear={() => setShowCanjeModal(true)}
                />
                <ClientStats cliente={cliente} historial={historial} />
              </div>

              <div className="loyalty-dashboard-secondary">
                <section className="loyalty-qr-card" id="loyalty-card" aria-labelledby="loyalty-qr-title">
                  <div className="loyalty-qr-heading">
                    <span className="loyalty-card-kicker">TU TARJETA</span>
                    <h2 id="loyalty-qr-title">Lista para sumar</h2>
                    <p>Muestra tu código al pedir para registrar tus entregas.</p>
                  </div>
                  <div className="loyalty-qr-content">
                    <div className="loyalty-qr-image">
                      <img src={generateCloudinaryVIPCard(cliente.telefono)} alt="Código QR de tu tarjeta Estrella" width="174" height="174" />
                    </div>
                    <div className="loyalty-qr-detail">
                      <span>ESTRELLA · PUNTOS</span>
                      <strong>{cliente.es_vip ? 'Miembro VIP' : cliente.rango || 'Miembro'}</strong>
                      <p>Tu código es personal. Tenlo a mano cuando hagas tu siguiente pedido.</p>
                    </div>
                  </div>
                </section>
                <div id="loyalty-benefits"><WalletSection cliente={cliente} onClienteUpdate={setCliente} /></div>
              </div>
            </div>

            <div className="loyalty-dashboard-history" id="loyalty-history">
              {access.historyError ? <div className="loyalty-data-error" role="alert"><p>{access.historyError}</p><button type="button" onClick={() => {void access.retryHistory();}}>Reintentar movimientos</button></div> : <HistorialTimeline historial={historial} cuponActivo={cliente?.cupon_activo} />}
            </div>          </motion.div>
        )}
      </main>

      

      <footer className="loyalty-portal-footer">
        <span>© {new Date().getFullYear()} Estrella</span>
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">Contacto por WhatsApp</a>
      </footer>

      <AnimatePresence>
        {showRating && activeRegistroId && (
          <RatingModal 
            registroId={activeRegistroId} 
            onClose={() => setShowRating(false)} 
          />
        )}
        {cliente && (
          <CanjeModal
            isOpen={showCanjeModal}
            onClose={() => {setShowCanjeModal(false); void access.refresh();}}
            cliente={cliente}
          />
        )}
      </AnimatePresence>


    </motion.div>
  );
}


import { useState, useEffect, useRef } from 'react';
import { getMetaPuntos } from '@/lib/constants';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Phone, Search, Gift, Star, ArrowRight,
  TrendingUp, Clock, Download,
  ChevronLeft, QrCode, AlertCircle, Sun, Moon,
  Truck, X, Share2, Utensils, Heart, LogOut
} from 'lucide-react';
import { toast } from '@/components/ui/toast-native';
import QRCode from 'qrcode';
import { supabase, getClienteByTelefono, subscribeToCliente, getHistorialCliente } from '@/lib/supabase';
import { PromosBanner } from '@/components/client/PromosBanner';
import { ClientStats } from '@/components/ClientStats';
import { RatingModal } from '@/components/RatingModal';
import { CanjeModal } from '@/components/client/CanjeModal';
import { WalletSection } from '@/components/client/WalletSection';
import { ProgressCard } from '@/components/client/ProgressCard';
import { HistorialTimeline } from '@/components/client/HistorialTimeline';
import { PinEntry } from '@/components/client/PinEntry';
import AuthorityCounter from '@/components/client/AuthorityCounter';
import { OnboardingWelcome } from '@/components/client/OnboardingWelcome';
import { BottomNav, type TabType } from '@/components/client/BottomNav';
import { useSchedule } from '@/hooks/useSchedule';
import { useDarkMode } from '@/hooks/useDarkMode';
import { generateCloudinaryVIPCard } from '@/lib/utils';
import type { Cliente, RegistroMovimiento } from '@/types';


type ViewState = 'search' | 'loading' | 'pin-setup' | 'pin-verify' | 'result' | 'error-not-found' | 'error-generic';


export function ClienteView() {
  const { tel: routeTel } = useParams<{ tel?: string }>();
  const [telefono, setTelefono] = useState('');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [viewState, setViewState] = useState<ViewState>('search');
  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [historial, setHistorial] = useState<RegistroMovimiento[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<TabType>('home');

  // Onboarding: mostrar solo en primera visita (sin sesión guardada ni deep link)
  const [showOnboarding, setShowOnboarding] = useState(() => {
    const done = localStorage.getItem('estrella_onboarding_done');
    const hasSession = !!localStorage.getItem('estrella_cliente');
    const hasDeepLink = window.location.pathname.includes('/loyalty/') ||
      new URLSearchParams(window.location.search).has('tel');
    return !done && !hasSession && !hasDeepLink;
  });

  const [showRating, setShowRating] = useState(false);
  const [activeRegistroId, setActiveRegistroId] = useState<string | null>(null);

  const [showCanjeModal, setShowCanjeModal] = useState(false);

  // ── PIN state ────────────────────────────────────────────────────
  const [pinError, setPinError] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinAttempts, setPinAttempts] = useState(0);
  // pinConfirm removed — never used in render or logic
  const [pinSetupStep, setPinSetupStep] = useState<'enter' | 'confirm'>('enter');
  const [pinFirst, setPinFirst] = useState(''); // primer PIN ingresado en setup


  const { storeState, contacto } = useSchedule();
  const { isDark, toggle } = useDarkMode();
  const whatsappUrl = `https://wa.me/${(contacto?.whatsapp || '529631550244').replace(/\D/g, '')}`;

  // Scroll-aware header shadow
  const [navScrolled, setNavScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 6);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Al montar, restauramos la sesión.
  // Usamos sessionStorage para saber si el PIN ya fue verificado en esta sesión.
  // Esto evita pedir PIN en cada refresh, pero sí en cada nueva visita/pestaña.
  useEffect(() => {
    const saved = localStorage.getItem('estrella_cliente');
    if (saved) {
      try {
        const parsed: Cliente = JSON.parse(saved);
        setCliente(parsed);
        const pinVerifiedThisSession = sessionStorage.getItem('pin_verified') === 'true';
        if (pinVerifiedThisSession) {
          // PIN ya verificado en esta pestaña → mostrar perfil directo
          setViewState('result');
        } else {
          // Nueva visita → siempre pedir PIN (o crear si no tiene)
          setViewState(parsed.pin ? 'pin-verify' : 'pin-setup');
        }
        getHistorialCliente(parsed.id).then(setHistorial).catch(() => {});
        getClienteByTelefono(parsed.telefono).then(freshData => {
          if (freshData && !('found' in freshData)) {
            setCliente(freshData);
            // Si los datos frescos muestran que no tiene PIN, forzar setup
            if (!freshData.pin && !pinVerifiedThisSession) setViewState('pin-setup');
          }
        }).catch(() => {});
      } catch {
        localStorage.removeItem('estrella_cliente');
      }
    }
  }, []);


  // Cada vez que cambia el cliente, actualizamos (o borramos) la sesión guardada
  useEffect(() => {
    if (cliente) {
      localStorage.setItem('estrella_cliente', JSON.stringify(cliente));
    }
  }, [cliente]);

  // DEEP LINKING: Detectar teléfono en la URL (?tel=9611234567) O en la ruta /loyalty/:tel
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const telParam = routeTel || params.get('tel');
    if (telParam && telParam.length >= 10) {
      const cleanTel = telParam.replace(/\D/g, '').slice(-10);
      setTelefono(cleanTel);
      localStorage.removeItem('estrella_cliente');
      setCliente(null);
      setViewState('loading');
      getClienteByTelefono(cleanTel).then(async (data) => {
        if (data && !('found' in data)) {
          if (data.acepta_terminos === false) {
            setViewState('error-not-found');
            return;
          }
          const histData = await getHistorialCliente(data.id);
          setHistorial(histData);
          setCliente(data);
          // Redirigir a PIN setup o verify
          setViewState(data.pin ? 'pin-verify' : 'pin-setup');
        } else if (data && 'found' in data) {
          setViewState('error-not-found');
        } else {
          setViewState('error-generic');
        }
      });
    }
  }, [routeTel]);


  // Suscripción en tiempo real
  const clienteId = cliente?.id;
  useEffect(() => {
    if (!clienteId) return;
    const unsubscribe = subscribeToCliente(clienteId, (updated) => {
      setCliente(updated);
      // Mantenemos la sesión actualizada en storage también
      localStorage.setItem('estrella_cliente', JSON.stringify(updated));
    });

    // Usamos un solo canal para no duplicar conexiones de WebSocket
    // escuchando la misma tabla.
    const eventsChannel = supabase
      .channel(`events_${clienteId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'registros_puntos', filter: `cliente_id=eq.${clienteId}` },
        async (payload: { new: { id: string; tipo: string } }) => {
          // Reload history
          const fresh = await getHistorialCliente(clienteId);
          setHistorial(fresh);
          // Show rating modal only for real point accumulations
          if (payload.new.tipo === 'acumulacion') {
            setActiveRegistroId(payload.new.id);
            setShowRating(true);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`[Realtime] Events channel error for ${clienteId}: ${status}`);
        }
      });

    return () => {
      unsubscribe();
      supabase.removeChannel(eventsChannel);
    };
  }, [clienteId]);

  // ── Auto-cleanup: si cupon_activo ya fue marcado como 'usado' en
  //    la tabla cupones, lo limpiamos del estado local para que no se muestre.
  //    También maneja cupones legacy que no tienen entrada en la tabla cupones.
  useEffect(() => {
    if (!cliente?.cupon_activo) return;
    supabase
      .from('cupones')
      .select('estado')
      .eq('codigo', cliente.cupon_activo)
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.estado !== 'activo') {
          // El cupón ya fue usado o cancelado — limpiar del estado
          setCliente(prev => prev ? { ...prev, cupon_activo: null } : prev);
          const stored = localStorage.getItem('estrella_cliente');
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              localStorage.setItem('estrella_cliente', JSON.stringify({ ...parsed, cupon_activo: null }));
            } catch { /* ignore */ }
          }
        }
        // Si data es null (cupón legacy sin entrada en tabla cupones), lo dejamos visible
        // ya que solo el comando /usar o el botón BTN_CUPON lo pueden limpiar.
      });
  }, [cliente?.cupon_activo]);


  useEffect(() => {
    if (!cliente?.qr_code) return;
    QRCode.toDataURL(cliente.qr_code, {
      width: 260,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    }).then(setQrDataUrl).catch(console.error);
  }, [cliente?.qr_code]);

  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault();
    const tel = telefono.trim();
    if (!tel) return;

    setViewState('loading');
    setCliente(null);
    setQrDataUrl(null);

    // Run fetch + 4-second minimum timer in parallel "” whichever finishes last wins
    const MIN_LOADING_MS = 4000;
    const [data] = await Promise.all([
      getClienteByTelefono(tel),
      new Promise<void>(res => setTimeout(res, MIN_LOADING_MS)),
    ]);

    if (data === null) {
      setViewState('error-generic');
    } else if ('found' in data) {
      setViewState('error-not-found');
    } else {
      if (data.acepta_terminos === false) {
        setViewState('error-not-found');
        return;
      }
      const histData = await getHistorialCliente(data.id);
      setHistorial(histData);
      setCliente(data);
      // Si no tiene PIN → obligar a crear uno; si tiene → verificar
      setViewState(data.pin ? 'pin-verify' : 'pin-setup');
    }
  };

  // ── Verificar PIN ingresado ─────────────────────────────────────────
  const handlePinVerify = async (pin: string) => {
    if (!cliente) return;
    // Máximo 5 intentos
    if (pinAttempts >= 4) {
      toast.error('Demasiados intentos', 'Espera unos minutos e intenta de nuevo');
      return;
    }
    setPinLoading(true);
    const { data } = await supabase.rpc('verify_cliente_pin', {
      p_telefono: cliente.telefono,
      p_pin: pin,
    });
    setPinLoading(false);

    if (data?.ok) {
      setPinError(false);
      setPinAttempts(0);
      localStorage.setItem('estrella_cliente', JSON.stringify(cliente));
      // Marcar PIN como verificado en esta sesión (evita re-pedir en refresh)
      sessionStorage.setItem('pin_verified', 'true');
      setViewState('result');
    } else {
      setPinAttempts(prev => prev + 1);
      setPinError(true);
      setTimeout(() => setPinError(false), 800); // resetear para re-shake si vuelve a fallar
      toast.error('PIN incorrecto', `Intento ${pinAttempts + 1}/5`);
    }
  };

  // ── Configurar nuevo PIN (2 pasos: ingresar + confirmar) ─────────────────
  const handlePinSetup = async (pin: string) => {
    if (!cliente) return;
    if (pinSetupStep === 'enter') {
      // Primer ingreso → pedir confirmación
      setPinFirst(pin);
      setPinSetupStep('confirm');
      return;
    }
    // Confirmación → verificar que coincidan
    if (pin !== pinFirst) {
      setPinError(true);
      setTimeout(() => setPinError(false), 800);
      toast.error('Los PIN no coinciden', 'Vuelve a intentarlo');
      setPinSetupStep('enter');
      setPinFirst('');
      return;
    }
    // Guardar en DB
    setPinLoading(true);
    const { data } = await supabase.rpc('set_cliente_pin', {
      p_telefono: cliente.telefono,
      p_pin: pin,
    });
    setPinLoading(false);
    if (data?.ok) {
      setCliente(prev => prev ? { ...prev, pin } : prev);
      localStorage.setItem('estrella_cliente', JSON.stringify({ ...cliente, pin }));
      sessionStorage.setItem('pin_verified', 'true');
      toast.success('¡PIN creado!', 'Tu cuenta está protegida 🔒');
      setViewState('result');
    } else {
      toast.error('Error al guardar PIN', data?.error || 'Intenta de nuevo');
      setPinSetupStep('enter');
    }
  };


  const handleReset = () => {
    // Cerrar sesión: limpiamos todo incluyendo la sesión guardada en localStorage
    localStorage.removeItem('estrella_cliente');
    setCliente(null);
    setTelefono('');
    setHistorial([]);
    setViewState('search');
    setShowQR(false);
    setQrDataUrl(null);
    setShowRating(false);
    setActiveRegistroId(null);
    // Reset PIN state
    setPinError(false);
    setPinLoading(false);
    setPinAttempts(0);
    setPinSetupStep('enter');
    setPinFirst('');

    // Limpiar sesión de PIN para que la próxima vez se pida de nuevo
    sessionStorage.removeItem('pin_verified');
    setTimeout(() => inputRef.current?.focus(), 100);

  };


  const isVip = cliente?.es_vip === true || (cliente?.envios_totales ? cliente.envios_totales >= 15 : false);
  const metaVip = getMetaPuntos(cliente?.rango, isVip);
  // Si el cliente es nuevo y tiene 0 puntos, no mostramos el mensaje de gratis.
  const puntosEnCiclo = cliente ? cliente.puntos % metaVip : 0;
  const progreso = cliente ? (puntosEnCiclo / metaVip) * 100 : 0;
  const enviosRestantes = cliente
    ? (puntosEnCiclo === 0 && cliente.envios_totales === 0
        ? metaVip                        // cliente nuevo: aún le faltan todos
        : metaVip - puntosEnCiclo)       // en ciclo activo o inicio de nuevo ciclo
    : metaVip;

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
      const ctrl = animate(displayPoints, puntosEnCiclo, { duration: 1.2, ease: 'easeOut' });
      return ctrl.stop;
    }
  }, [viewState, cliente?.id, puntosEnCiclo]);

  // â”€â”€ Confetti when cycle is complete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (viewState === 'result' && cliente && enviosRestantes === 0 && cliente.envios_totales > 0) {
      const t = setTimeout(() => {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.55 }, colors: ['#2563eb', '#f59e0b', '#10b981', '#f97316', '#8b5cf6'] });
        setTimeout(() => confetti({ particleCount: 60, spread: 100, origin: { y: 0.4, x: 0.2 }, colors: ['#2563eb', '#fbbf24'] }), 300);
        setTimeout(() => confetti({ particleCount: 60, spread: 100, origin: { y: 0.4, x: 0.8 }, colors: ['#10b981', '#f97316'] }), 500);
      }, 1400);
      return () => clearTimeout(t);
    }
  }, [viewState, cliente?.id, enviosRestantes]);

  // â”€â”€ Descargar QR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `estrella-qr-${cliente?.telefono || 'mi-codigo'}.png`;
    a.click();
    toast.success('¡QR descargado!', 'Guardado en tu galería');
  };

  // Wallet handlers moved to WalletSection component

  // El QR ya se genera arriba, quitamos el efecto duplicado.

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.02, y: -10 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-orange-50/30 dark:from-gray-950 dark:via-gray-900 dark:to-orange-950/20 transition-colors duration-300"
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
        className={`fixed top-0 inset-x-0 z-50 bg-white/80 dark:bg-card/80 backdrop-blur-md transition-all duration-300
          ${navScrolled ? 'shadow-xl shadow-orange-100/40 dark:shadow-orange-900/20' : ''}`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner">
                <img src="/logo.png" className="w-7 h-7 object-contain" alt="Estrella" />
              </div>
              <div className="font-bold text-lg text-orange-600 dark:text-orange-500 tracking-tight">
                Estrella<span className="text-orange-300">.</span>
              </div>
            </div>

            {/* Estado tienda */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 backdrop-blur-sm">
              <span className={`w-1.5 h-1.5 rounded-full ${storeState.isOpen ? 'bg-green-400 animate-pulse' : 'bg-red-300'}`} />
              {storeState.isOpen ? 'Abierto' : 'Cerrado'}
            </div>

            {/* Controles derechos */}
            <div className="flex items-center gap-2">
              <Badge
                variant={storeState.isOpen ? 'default' : 'secondary'}
                className={`sm:hidden text-[11px] px-3 py-1 font-black ${storeState.isOpen
                  ? 'bg-green-500 shadow-lg shadow-green-500/30'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600'}`}
              >
                {storeState.isOpen ? 'ABIERTO' : 'CERRADO'}
              </Badge>
              <button
                onClick={toggle}
                aria-label="Cambiar tema"
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shadow-inner"
              >
                {isDark
                  ? <Sun className="w-5 h-5 text-amber-300" />
                  : <Moon className="w-5 h-5 text-gray-600" />}
              </button>
              {cliente && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 ml-1 text-xs gap-1"
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
      <main className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pt-20 sm:pt-24"
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
                  Buscando tu cuenta...
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
                  El número <strong className="text-white">{telefono}</strong> no tiene una cuenta VIP activa.
                </p>
              </div>
              <CardContent className="p-6 space-y-4 text-center">
                <p className="text-gray-700 font-medium">
                  Para poder acceder a tu billetera y acumular puntos, necesitas registrarte en nuestro programa de lealtad.
                </p>
                <div className="flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl text-left border border-orange-100 dark:border-orange-900/20">
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
                <p className="text-gray-500">No se pudo conectar al servidor. Verifica tu internet e intenta de nuevo.</p>
                <Button onClick={handleReset} variant="outline" className="border-orange-300 text-orange-600">
                  Intentar de nuevo
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {viewState === 'search' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col -mx-4 sm:-mx-6 lg:-mx-8 -mt-4 min-h-[calc(100vh-4rem)]"
          >
            {/* ── HERO ── */}
            <div className="relative flex flex-col items-center justify-center px-6 pt-14 pb-12 bg-gradient-primary overflow-hidden">
              {/* Blobs */}
              <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-52 h-52 bg-black/10 rounded-full translate-y-1/3 -translate-x-1/4" />

              {/* Logo badge */}
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 22 }}
                className="relative z-10 w-20 h-20 bg-white/15 backdrop-blur-sm rounded-3xl flex items-center justify-center mb-5 border border-white/20 shadow-2xl"
              >
                <Star className="w-9 h-9 text-white fill-white/40" />
              </motion.div>

              <motion.div
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.18, duration: 0.4 }}
                className="relative z-10 text-center"
              >
                <h1 className="text-4xl font-black text-white tracking-tight mb-2">Billetera Digital</h1>
                <p className="text-white/80 text-base font-medium max-w-xs mx-auto">
                  Descubre tus beneficios y envíos gratis acumulados
                </p>
              </motion.div>

              {/* Stats row */}
              <motion.div
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.28, duration: 0.4 }}
                className="relative z-10 flex gap-8 mt-8"
              >
                {[
                  { val: '35K+', label: 'Entregas' },
                  { val: '6 años', label: 'Experiencia' },
                  { val: '100%', label: 'Garantía' },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="text-white font-black text-lg">{s.val}</p>
                    <p className="text-white/70 text-xs font-medium">{s.label}</p>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* ── FORM PANEL ── */}
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 260, damping: 26 }}
              className="flex-1 bg-gray-50 dark:bg-gray-950 -mt-6 rounded-t-[32px] px-5 pt-8 pb-28 space-y-5"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 text-center">
                Ingresa tu número
              </p>

              {/* Phone input */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none gap-2.5 z-10">
                  <span className="text-gray-800 dark:text-gray-200 font-bold text-lg">+52</span>
                  <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
                </div>
                <Input
                  ref={inputRef}
                  value={telefono}
                  onChange={(e) => {
                    const onlyDigits = e.target.value.replace(/\D/g, '');
                    setTelefono(onlyDigits);
                  }}
                  placeholder="10 dígitos"
                  className="pl-[4.5rem] pr-14 h-16 text-2xl font-black rounded-2xl border-2 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all tracking-widest shadow-sm"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  required
                  autoFocus
                />
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                  <span className={`text-sm font-bold tabular-nums transition-colors ${
                    telefono.length === 10 ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'
                  }`}>
                    {telefono.length}/10
                  </span>
                </div>
              </div>

              {/* Digit progress dots */}
              <div className="flex gap-1.5 justify-center">
                {Array.from({ length: 10 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="h-1 rounded-full"
                    animate={{
                      backgroundColor: i < telefono.length ? '#2563eb' : '#e5e7eb',
                      width: i < telefono.length ? 20 : 10,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                ))}
              </div>

              {/* CTA */}
              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }}>
                <Button
                  type="button"
                  onClick={(e) => handleBuscar(e as any)}
                  disabled={telefono.length < 10}
                  className="w-full h-14 bg-gradient-primary text-white font-bold text-lg rounded-2xl shadow-xl shadow-primary/30 disabled:opacity-40 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                >
                  Consultar mi saldo
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </motion.div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                <span className="text-xs text-gray-400 font-medium">¿Nuevo aquí?</span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
              </div>

              {/* Register via WhatsApp */}
              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }}>
                <Button
                  type="button"
                  onClick={() => window.open(`${whatsappUrl}?text=Quiero%20registrarme`, '_blank')}
                  className="w-full h-12 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-2 border-gray-200 dark:border-gray-800 font-semibold text-sm rounded-2xl hover:border-green-400 hover:text-green-700 transition-all flex items-center justify-center gap-2"
                >
                  <Phone className="w-4 h-4 text-green-500" />
                  Regístrate gratis por WhatsApp
                </Button>
              </motion.div>

              {/* Benefit chips */}
              <div className="grid grid-cols-3 gap-3 pt-1">
                {[
                  { icon: Gift, label: '6to gratis', sub: 'Cada 5 envíos', cls: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' },
                  { icon: Star, label: 'Fidelidad', sub: 'Suma beneficios', cls: 'text-primary bg-orange-50 dark:bg-orange-900/20' },
                  { icon: Truck, label: 'Garantizado', sub: 'Envío seguro', cls: 'text-green-600 bg-green-50 dark:bg-green-900/20' },
                ].map(({ icon: Icon, label, sub, cls }) => (
                  <div key={label} className="flex flex-col items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm text-center">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cls}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <p className="text-[11px] font-black text-gray-800 dark:text-gray-200 leading-tight">{label}</p>
                    <p className="text-[10px] text-gray-400 leading-tight">{sub}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════
            PIN SETUP — obligar a crear PIN (primer acceso)
        ══════════════════════════════════════════════════ */}
        {(viewState === 'pin-setup' || viewState === 'pin-verify') && cliente && (
          <>
            {/* Fondo translúcido — solo mobile */}
            <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-30 lg:hidden" />

            {/* ── Mobile: bottom sheet que sube desde abajo ── */}
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mt-3 mb-1" />
              <div className="px-6 py-8 space-y-8">
                {viewState === 'pin-setup' ? (
                  <>
                    <div className="text-center">
                      <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                        <span className="text-4xl">🔒</span>
                      </div>
                      <h2 className="text-2xl font-black text-gray-800 dark:text-white leading-tight">
                        {pinSetupStep === 'enter' ? 'Crea tu PIN de seguridad' : 'Confirma tu PIN'}
                      </h2>
                      <p className="text-base text-muted-foreground mt-2 font-medium">
                        {pinSetupStep === 'enter'
                          ? 'Elige 4 dígitos para proteger tu cuenta'
                          : 'Vuelve a ingresar los mismos 4 dígitos'}
                      </p>
                    </div>
                    <PinEntry key={pinSetupStep} onComplete={handlePinSetup} disabled={pinLoading} error={pinError} />
                    {pinLoading && <p className="text-center text-sm text-primary animate-pulse">Guardando...</p>}
                  </>
                ) : (
                  <>
                    <div className="text-center">
                      <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                        <span className="text-4xl">🔑</span>
                      </div>
                      <h2 className="text-2xl font-black text-gray-800 dark:text-white leading-tight">Ingresa tu PIN</h2>
                      <p className="text-base text-muted-foreground mt-2 font-medium">
                        Hola, <strong>{cliente.nombre || cliente.telefono}</strong> 👋
                      </p>
                    </div>
                    <PinEntry onComplete={handlePinVerify} disabled={pinLoading} error={pinError} />
                    {pinLoading && <p className="text-center text-sm text-primary animate-pulse">Verificando...</p>}
                    {pinAttempts > 0 && (
                      <p className="text-center text-sm font-bold text-red-500 bg-red-50 dark:bg-red-900/20 py-2.5 rounded-xl">
                        Intento {pinAttempts}/5 — {5 - pinAttempts} restante{5 - pinAttempts !== 1 ? 's' : ''}
                      </p>
                    )}
                    <button onClick={handleReset} className="w-full text-center text-sm font-bold text-gray-400 hover:text-gray-600 py-3 mt-2">
                      No soy yo — Cambiar número
                    </button>
                  </>
                )}
              </div>
            </motion.div>

            {/* ── Desktop: card centrado ── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="hidden lg:flex items-center justify-center min-h-[60vh]"
            >
              <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-8 space-y-6">
                {viewState === 'pin-setup' ? (
                  <>
                    <div className="text-center">
                      <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-4xl">🔒</span>
                      </div>
                      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                        {pinSetupStep === 'enter' ? 'Crea tu PIN' : 'Confirma tu PIN'}
                      </h2>
                      <p className="text-sm text-muted-foreground mt-2">
                        {pinSetupStep === 'enter'
                          ? 'Elige 4 dígitos para proteger tu cuenta'
                          : 'Ingresa nuevamente los mismos 4 dígitos'}
                      </p>
                    </div>
                    <PinEntry key={pinSetupStep} onComplete={handlePinSetup} disabled={pinLoading} error={pinError} />
                    {pinLoading && <p className="text-center text-sm text-primary animate-pulse">Guardando...</p>}
                  </>
                ) : (
                  <>
                    <div className="text-center">
                      <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-4xl">🔑</span>
                      </div>
                      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Ingresa tu PIN</h2>
                      <p className="text-sm text-muted-foreground mt-2">
                        Hola, <strong>{cliente.nombre || cliente.telefono}</strong> 👋
                      </p>
                    </div>
                    <PinEntry onComplete={handlePinVerify} disabled={pinLoading} error={pinError} />
                    {pinLoading && <p className="text-center text-sm text-primary animate-pulse">Verificando...</p>}
                    {pinAttempts > 0 && (
                      <p className="text-center text-xs text-red-500">
                        Intento {pinAttempts}/5 — {5 - pinAttempts} restante{5 - pinAttempts !== 1 ? 's' : ''}
                      </p>
                    )}
                    <button onClick={handleReset} className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1">
                      No soy yo — Cambiar número
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}

        {/* --- RESULT --- */}
        {viewState === 'result' && cliente && (
          <motion.div
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full overflow-hidden pb-24 lg:pb-0"
          >
            {/* Header Actions (Share & Exit) - Solo visible en mobile arriba */}
            <div className="flex items-center justify-between px-4 pb-4 lg:hidden">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {activeTab === 'home' ? 'Inicio' : activeTab === 'wallet' ? 'Billetera' : 'Perfil'}
              </h2>
              <div className="flex items-center gap-2">
                <button onClick={handleShare} className="w-9 h-9 rounded-full flex items-center justify-center bg-orange-50 dark:bg-orange-900/30 text-primary">
                  <Share2 className="w-4 h-4" />
                </button>
                <button onClick={handleReset} className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-800">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 items-start">
              
              {/* HOME TAB (Mobile) OR LEFT SIDEBAR (Desktop) */}
              <div className={`w-full lg:w-96 shrink-0 min-w-0 lg:sticky lg:top-24 space-y-6 overflow-hidden ${activeTab === 'home' ? 'block' : 'hidden lg:block'}`}>
                {/* Desktop Header */}
                <div className="hidden lg:flex items-center justify-between px-2 pb-2">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Mi Tarjeta VIP</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={handleShare} className="w-9 h-9 rounded-full flex items-center justify-center bg-orange-50 dark:bg-orange-900/30 text-primary">
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button onClick={handleReset} className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-800">
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Cloudinary VIP Card */}
                <div className="relative w-full max-w-[420px] mx-auto rounded-[20px] overflow-hidden shadow-[0_20px_40px_-15px_rgba(0,0,0,0.3)] transition-transform hover:-translate-y-1 ring-1 ring-black/5 dark:ring-white/10">
                  <img src={generateCloudinaryVIPCard(cliente.telefono)} alt="Tarjeta VIP" className="w-full h-auto object-cover" />
                </div>
                <ProgressCard 
                  cliente={cliente}
                  metaVip={metaVip}
                  progreso={progreso}
                  enviosRestantes={enviosRestantes}
                  displayPointsRounded={displayPointsRounded}
                  onCanjear={() => setShowCanjeModal(true)}
                />
              </div>

              {/* MIDDLE COLUMN (Wallet & Stats) */}
              <div className={`w-full min-w-0 space-y-6 lg:max-w-xl ${activeTab === 'wallet' ? 'block' : 'hidden lg:block'}`}>
                <WalletSection cliente={cliente} />
                <ClientStats cliente={cliente} historial={historial} />
              </div>

              {/* RIGHT COLUMN (Profile / History) */}
              <div className={`w-full min-w-0 space-y-6 lg:max-w-md ${activeTab === 'profile' ? 'block' : 'hidden lg:block'}`}>
                <HistorialTimeline historial={historial} cuponActivo={cliente?.cupon_activo} />
              </div>

            </div>
          </motion.div>
        )}
      </main>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
      
      <footer className="hidden lg:block border-t border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-gradient-primary rounded-md flex items-center justify-center shadow-sm">
                <Truck className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">Estrella Delivery</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5" /> Lun - Dom: 9 AM - 10 PM
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 text-center text-[10px] text-gray-300 dark:text-gray-600">
            © {new Date().getFullYear()} Estrella Delivery - Hecho con <Heart className="w-2.5 h-2.5 text-red-400 fill-red-400 inline mx-0.5" /> para nuestros clientes
          </div>
        </div>
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
            onClose={() => { setShowCanjeModal(false); if (cliente?.telefono) getClienteByTelefono(cliente.telefono).then(d => {if(d && !('found' in d)) setCliente(d)}) }}
            cliente={cliente as Cliente}
          />
        )}
      </AnimatePresence>
      {/* Floating WhatsApp button */}
      <motion.a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-24 lg:bottom-6 right-5 z-40 w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center shadow-xl shadow-green-500/40 transition-colors"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.8, type: 'spring', stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.93 }}
        aria-label="Contactar por WhatsApp"
      >
        <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      </motion.a>

    </motion.div>
  );
}


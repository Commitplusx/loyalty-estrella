import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Star, Phone, Search, Gift, DollarSign, Ticket,
  TrendingUp, Clock, MapPin, Sparkles, Download,
  ChevronLeft, QrCode, AlertCircle, Loader2, History, Crown, Sun, Moon,
  Wallet, Truck, Utensils, X, CheckCircle2, Share2, Heart
} from 'lucide-react';
import { toast } from '@/components/ui/toast-native';
import QRCode from 'qrcode';
import { supabase, getClienteByTelefono, subscribeToCliente, getHistorialCliente, canjearSaldoBilleteraRPC } from '@/lib/supabase';
import { PromosBanner } from '@/components/client/PromosBanner';
import { ClientStats } from '@/components/ClientStats';
import { RatingModal } from '@/components/RatingModal';
import { CanjeModal } from '@/components/client/CanjeModal';
import AuthorityCounter from '@/components/client/AuthorityCounter';
import { useSchedule } from '@/hooks/useSchedule';
import { useDarkMode } from '@/hooks/useDarkMode';
import type { Cliente, RegistroMovimiento } from '@/types';

type ViewState = 'search' | 'loading' | 'result' | 'error-not-found' | 'error-generic';

export function ClienteView() {
  const { tel: routeTel } = useParams<{ tel?: string }>();
  const [telefono, setTelefono] = useState('');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [viewState, setViewState] = useState<ViewState>('search');
  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [historial, setHistorial] = useState<RegistroMovimiento[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [showRating, setShowRating] = useState(false);
  const [activeRegistroId, setActiveRegistroId] = useState<string | null>(null);

  const [showCanjeModal, setShowCanjeModal] = useState(false);

  // Wallet Redemption
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletMode, setWalletMode] = useState<'select' | 'food' | 'delivery' | 'success'>('select');
  const [foodAmount, setFoodAmount] = useState('');
  const [deliveryCost, setDeliveryCost] = useState('');
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletMsg, setWalletMsg] = useState('');

  const { storeState, horasFelices, formatTime, contacto } = useSchedule();
  const { isDark, toggle } = useDarkMode();
  const whatsappUrl = `https://wa.me/${(contacto?.whatsapp || '529631550244').replace(/\D/g, '')}`;

  // Historial tab filter
  const [historialTab, setHistorialTab] = useState<'todo' | 'puntos' | 'canjes'>('todo');
  // Lazy load historial
  const [historialLimit, setHistorialLimit] = useState(10);

  // Scroll-aware header shadow
  const [navScrolled, setNavScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 6);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Al montar, restauramos la sesión del cliente desde localStorage (intencional).
  useEffect(() => {
    const saved = localStorage.getItem('estrella_cliente');
    if (saved) {
      try {
        const parsed: Cliente = JSON.parse(saved);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCliente(parsed);
        setViewState('result');
        // También recargamos el historial actualizado y los datos frescos del cliente
        getHistorialCliente(parsed.id).then(setHistorial).catch(() => {});
        getClienteByTelefono(parsed.telefono).then(freshData => {
          if (freshData && !('found' in freshData)) {
            setCliente(freshData);
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
      // BUG-03 fix: clear localStorage before deep-link search to avoid race condition
      // with the restore-session useEffect that runs simultaneously
      localStorage.removeItem('estrella_cliente');
      setCliente(null);
      // Ejecutar búsqueda automática
      setViewState('loading');
      getClienteByTelefono(cleanTel).then(async (data) => {
        if (data && !('found' in data)) {
          const histData = await getHistorialCliente(data.id);
          setHistorial(histData);
          setCliente(data);
          setViewState('result');
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

    // BUG-02 fix: Unified single channel instead of two separate ones
    // listening to the same table/filter — avoids duplicate WebSocket connections
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
      .subscribe();

    return () => {
      unsubscribe();
      supabase.removeChannel(eventsChannel);
    };
  }, [clienteId]);

  // Generar QR cuando hay cliente
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

    // Run fetch + 4-second minimum timer in parallel — whichever finishes last wins
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
      const histData = await getHistorialCliente(data.id);
      setHistorial(histData);
      setCliente(data);
      setViewState('result');
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
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const isVip = cliente?.es_vip === true;
  // Meta de envíos por rango (3 para oro, 4 para plata/VIP, 5 para bronce)
  const metaVip = cliente
    ? (cliente.rango === 'oro' ? 3 : (cliente.rango === 'plata' || isVip ? 4 : 5))
    : 5;
  // Bug #5 fix: un cliente nuevo con 0 puntos no debe mostrar "¡Gratis!"
  const puntosEnCiclo = cliente ? cliente.puntos % metaVip : 0;
  const progreso = cliente ? (puntosEnCiclo / metaVip) * 100 : 0;
  const enviosRestantes = cliente
    ? (puntosEnCiclo === 0 && cliente.envios_totales === 0
        ? metaVip                        // cliente nuevo: aún le faltan todos
        : metaVip - puntosEnCiclo)       // en ciclo activo o inicio de nuevo ciclo
    : metaVip;
  const MAX_ENVIO_GRATIS = 45; // Tope máximo de cobertura por envío gratis

  // ── Compartir tarjeta de lealtad ─────────────────────────────────────────
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

  // ── Animated points counter ───────────────────────────────────────────────
  const displayPoints = useMotionValue(0);
  const displayPointsRounded = useTransform(displayPoints, v => Math.round(v));
  useEffect(() => {
    if (viewState === 'result' && cliente) {
      const ctrl = animate(displayPoints, puntosEnCiclo, { duration: 1.2, ease: 'easeOut' });
      return ctrl.stop;
    }
  }, [viewState, cliente?.id, puntosEnCiclo]);

  // ── Confetti when cycle is complete ──────────────────────────────────────
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

  // ── Descargar QR ─────────────────────────────────────────────────────────
  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `estrella-qr-${cliente?.telefono || 'mi-codigo'}.png`;
    a.click();
    toast.success('¡QR descargado!', 'Guardado en tu galería');
  };

  // ── Canjeadores de billetera ──────────────────────────────────────────────
  const handleCanjeComida = async () => {
    const monto = parseFloat(foodAmount);
    if (!cliente || isNaN(monto) || monto <= 0 || monto > (cliente.saldo_billetera || 0)) return;
    if (cliente.cupon_activo) {
      setWalletMsg(`❌ Ya tienes un cupón activo: ${cliente.cupon_activo}. Úsalo antes de generar otro.`);
      return;
    }
    setWalletLoading(true);
    const res = await canjearSaldoBilleteraRPC(cliente.id, monto, 'Descuento en comida');
    setWalletLoading(false);

    if (res.ok) {
      const codigo = res.codigo || 'SIN-CODIGO';
      // BUG-01 fix: ensure nuevoSaldo is always a valid number before calling .toFixed()
      const nuevoSaldo = typeof res.nuevo_saldo === 'number'
        ? res.nuevo_saldo
        : Math.max(0, (cliente.saldo_billetera || 0) - monto);
      setWalletMsg(`✅ Se descontaron $${monto.toFixed(2)} de tu billetera VIP.\n🎟️ Código de descuento: ${codigo}`);
      setWalletMode('success');
      // Actualizar estado local con datos reales del DB (incluye cupon_activo)
      setCliente(prev => prev ? { ...prev, saldo_billetera: nuevoSaldo, cupon_activo: codigo } : prev);

      // Notificar por WhatsApp en segundo plano
      supabase.functions.invoke('notificar-whatsapp', {
        body: {
          tipo: 'canje_billetera',
          cliente_tel: cliente.telefono,
          cliente_nombre: cliente.nombre,
          codigo_canje: codigo,
          monto: monto.toFixed(2),
          saldo_restante: nuevoSaldo.toFixed(2)
        }
      }).catch(console.error);
    } else {
      setWalletMsg(`❌ ${res.error || 'Error al procesar el canje'}`);
    }
  };

  const handleCanjeEnvio = async () => {
    if (!cliente) return;
    if (cliente.cupon_activo) {
      setWalletMsg(`❌ Ya tienes un cupón activo: ${cliente.cupon_activo}. Úsalo antes de generar otro.`);
      return;
    }
    const costoReal = parseFloat(deliveryCost) || MAX_ENVIO_GRATIS;
    const cobertura = Math.min(costoReal, MAX_ENVIO_GRATIS);
    const diferencia = Math.max(0, costoReal - MAX_ENVIO_GRATIS);
    if (cobertura > (cliente.saldo_billetera || 0)) {
      setWalletMsg(`❌ Saldo insuficiente. El canje de envío requiere al menos $${cobertura.toFixed(2)}`);
      return;
    }
    setWalletLoading(true);
    const res = await canjearSaldoBilleteraRPC(cliente.id, cobertura, 'Canje de envío gratis');
    setWalletLoading(false);

    if (res.ok) {
      const codigo = res.codigo || 'SIN-CODIGO';
      // BUG-01 fix: ensure nuevoSaldo is always a valid number
      const nuevoSaldo = typeof res.nuevo_saldo === 'number'
        ? res.nuevo_saldo
        : Math.max(0, (cliente.saldo_billetera || 0) - cobertura);
      const msg = diferencia > 0
        ? `✅ Cobertura de $${cobertura.toFixed(2)} aplicada.\n💳 Diferencia a pagar: $${diferencia.toFixed(2)}\n🎟️ Código: ${codigo}`
        : `✅ Envío cubierto totalmente ($${cobertura.toFixed(2)}) con tu Billetera VIP.\n🎟️ Código: ${codigo}`;
      setWalletMsg(msg);
      setWalletMode('success');
      // Actualizar estado local con datos reales del DB (incluye cupon_activo)
      setCliente(prev => prev ? { ...prev, saldo_billetera: nuevoSaldo, cupon_activo: codigo } : prev);

      // Notificar por WhatsApp en segundo plano
      supabase.functions.invoke('notificar-whatsapp', {
        body: {
          tipo: 'canje_billetera',
          cliente_tel: cliente.telefono,
          cliente_nombre: cliente.nombre,
          codigo_canje: codigo,
          monto: cobertura.toFixed(2),
          saldo_restante: nuevoSaldo.toFixed(2)
        }
      }).catch(console.error);
    } else {
      setWalletMsg(`❌ ${res.error || 'Error al procesar el canje'}`);
    }
  };

  const resetWalletModal = () => {
    setShowWalletModal(false);
    setWalletMode('select');
    setFoodAmount('');
    setDeliveryCost('');
    setWalletMsg('');
    setWalletLoading(false);
  };

  // BUG-14 fix: removed duplicate QR generation useEffect.
  // QR is already generated by the useEffect above (lines 162-170) whenever
  // cliente.qr_code changes, making this second one redundant.

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.02, y: -10 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-gray-950 dark:via-gray-900 dark:to-blue-950/20 transition-colors duration-300"
    >
      {/* Header — fixed blue like Home page */}
      <header
        className={`fixed top-0 inset-x-0 z-50 bg-blue-600 transition-all duration-300
          ${navScrolled ? 'shadow-xl shadow-blue-700/40' : ''}`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                <img src="/logo.png" className="w-6 h-6 object-contain" alt="Estrella" />
              </div>
              <span className="font-bold text-white tracking-tight">
                Estrella<span className="text-blue-200">.</span>
              </span>
            </div>

            {/* Estado tienda */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/15 text-white backdrop-blur-sm">
              <span className={`w-1.5 h-1.5 rounded-full ${storeState.isOpen ? 'bg-green-400 animate-pulse' : 'bg-red-300'}`} />
              {storeState.isOpen ? (storeState.isHappyHour ? '🔥 Hora Feliz' : 'Abierto') : 'Cerrado'}
            </div>

            {/* Controles derechos */}
            <div className="flex items-center gap-2">
              <Badge
                variant={storeState.isOpen ? 'default' : 'secondary'}
                className={`sm:hidden text-[10px] px-2 py-0.5 ${storeState.isOpen
                  ? storeState.isHappyHour ? 'bg-amber-500' : 'bg-green-500'
                  : 'bg-white/20 text-white'}`}
              >
                {storeState.isOpen ? (storeState.isHappyHour ? 'HORA FELIZ' : 'ABIERTO') : 'CERRADO'}
              </Badge>
              <button
                onClick={toggle}
                aria-label="Cambiar tema"
                className="w-8 h-8 rounded-full flex items-center justify-center bg-white/15 hover:bg-white/25 transition-colors"
              >
                {isDark
                  ? <Sun className="w-4 h-4 text-amber-300" />
                  : <Moon className="w-4 h-4 text-white" />}
              </button>
              {cliente && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="text-white/80 hover:text-white hover:bg-white/15 ml-1 text-xs gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Salir
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main — padding-top to clear fixed header + bottom safe-area for iPhone home bar */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pt-20 sm:pt-24"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}>

        {/* ── LOADING — premium ── */}
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
                {/* Outer ring — spins fast */}
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 border-r-blue-400"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                />
                {/* Middle ring — spins slow, opposite */}
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
                  Buscando tu cuenta…
                </motion.h2>
                <p className="text-sm text-gray-400 font-mono tracking-wide">
                  +52 {telefono.slice(0, 3)} {telefono.slice(3, 6)} {telefono.slice(6)}
                </p>
              </div>
            </div>

            {/* Shimmer skeleton cards — staggered */}
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
                  className="w-1.5 h-1.5 rounded-full bg-blue-400"
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
                  El número <strong className="text-white">{telefono}</strong> aún no tiene cuenta en Estrella Delivery.
                </p>
              </div>
              <CardContent className="p-6 space-y-4 text-center">
                <p className="text-gray-700 font-medium">
                  Para crear tu cuenta y empezar a acumular puntos, pide a un repartidor o al administrador que te registre en el sistema.
                </p>
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl text-left">
                  <Phone className="w-8 h-8 text-blue-500 shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">¿Cómo registrarte?</p>
                    <p className="text-gray-500 text-sm">
                      En tu próximo pedido, pide al repartidor que registre tu número. ¡Es gratis y empieza a contar de inmediato!
                    </p>
                  </div>
                </div>
                <Button onClick={handleReset} className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white h-12">
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
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="grid lg:grid-cols-[1fr_minmax(auto,450px)_1fr] gap-6 lg:gap-8 items-start"
          style={{ background: 'transparent' }}
          >
            {/* Left Column (PC) / Bottom (Mobile): Authority Counter y Promos */}
            <div className="space-y-6 order-2 lg:order-1 pt-2 lg:pt-0">
              <div className="hidden lg:block">
                <AuthorityCounter />
              </div>
              <PromosBanner />
            </div>

            {/* Center Column: El Formulario Principal */}
            <div className="space-y-6 order-1 lg:order-2">
              <div className="block lg:hidden">
                <AuthorityCounter />
              </div>

              <div className="text-center">
                <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-2">
                  Consulta tus <span className="text-gradient">puntos</span>
                </h1>
                <p className="text-muted-foreground text-lg mb-4">Ingresa tu número para ver tu fidelidad</p>
              </div>

              <Card className="border-0 shadow-xl ring-1 ring-orange-100 dark:ring-orange-900/30">
                <CardContent className="p-6">
                  <form onSubmit={handleBuscar} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Número de teléfono</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          ref={inputRef}
                          value={telefono}
                          onChange={(e) => {
                            const onlyDigits = e.target.value.replace(/\D/g, '');
                            setTelefono(onlyDigits);
                          }}
                          placeholder="Ej: 0999123456"
                          className="pl-10 h-14 text-lg"
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={10}
                          required
                        />
                      </div>
                    </div>
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        type="submit"
                        disabled={telefono.length < 10}
                        className="w-full h-14 bg-gradient-primary hover:opacity-90 text-white font-semibold text-lg disabled:opacity-50"
                      >
                        <Search className="w-5 h-5 mr-2" />
                        Consultar mis puntos
                      </Button>
                    </motion.div>
                  </form>
                </CardContent>
              </Card>

              {/* Info cards (Mobile only or stacked) */}
              <div className="grid sm:grid-cols-2 gap-4 lg:hidden">
                <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-amber-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <CardContent className="p-4 flex items-center gap-4 relative z-10">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-500/20 dark:to-orange-500/10 rounded-xl flex items-center justify-center shrink-0 border border-orange-200 dark:border-orange-500/30">
                      <Gift className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <p className="font-extrabold text-foreground tracking-tight">5 = 1 Gratis</p>
                      <p className="text-sm font-medium text-orange-600/70 dark:text-orange-400/70">Mucha más fidelidad</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <CardContent className="p-4 flex items-center gap-4 relative z-10">
                    <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shrink-0 shadow-inner shadow-orange-500/50">
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="font-extrabold text-foreground tracking-tight">Hora Feliz</p>
                      <p className="text-sm font-medium text-amber-600/70 dark:text-amber-500/70">Tus envíos a $35</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
            
            {/* Right Column (PC): Info cards PC & Horarios */}
            <div className="space-y-6 order-3 lg:order-3 pt-2 lg:pt-0">
              <div className="space-y-4 hidden lg:block">
                <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-amber-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <CardContent className="p-4 flex items-center gap-4 relative z-10">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-500/20 dark:to-orange-500/10 rounded-xl flex items-center justify-center shrink-0 border border-orange-200 dark:border-orange-500/30">
                      <Gift className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <p className="font-extrabold text-foreground tracking-tight">5 = 1 Gratis</p>
                      <p className="text-sm font-medium text-orange-600/70 dark:text-orange-400/70">Mucha más fidelidad</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <CardContent className="p-4 flex items-center gap-4 relative z-10">
                    <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shrink-0 shadow-inner shadow-orange-500/50">
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="font-extrabold text-foreground tracking-tight">Hora Feliz</p>
                      <p className="text-sm font-medium text-amber-600/70 dark:text-amber-500/70">Tus envíos a $35</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Horario */}
              <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Clock className="w-6 h-6 text-orange-500" />
                    <h3 className="font-bold text-xl text-foreground">Horario de Atención</h3>
                  </div>
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between p-4 bg-muted/30 dark:bg-muted/50 rounded-xl mb-4 gap-2">
                    <span className="text-muted-foreground font-medium text-sm lg:text-base">Lunes a Domingo</span>
                    <span className="font-bold text-foreground text-sm lg:text-base">9:00 AM - 10:00 PM</span>
                  </div>
                  {horasFelices.filter(h => h.activo).length > 0 && (
                    <div className="relative overflow-hidden p-5 bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-2xl shadow-lg shadow-orange-500/20 mt-2">
                      {/* Artistic glows */}
                      <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-white/20 rounded-full blur-3xl pointer-events-none"></div>
                      <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-24 h-24 bg-black/10 rounded-full blur-2xl pointer-events-none"></div>
                      
                      <div className="relative z-10 flex items-center gap-3 mb-5">
                        <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm shadow-inner">
                          <Sparkles className="w-6 h-6 text-yellow-100" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-xl lg:text-xl text-white tracking-tight leading-tight drop-shadow-sm">Horas Felices</h4>
                          <p className="text-orange-100 text-xs font-semibold uppercase tracking-wider">Envíos a solo $35</p>
                        </div>
                      </div>
                      
                      <div className="relative z-10 grid gap-2.5">
                        {horasFelices.filter(h => h.activo).map((hora) => (
                          <div key={hora.dia} className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-3 px-3 py-3 sm:px-4 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-sm transition-all hover:bg-white/20">
                            <span className="text-white font-medium flex items-center gap-2 text-sm lg:text-base drop-shadow-sm">
                              <span className="w-2 h-2 bg-yellow-300 rounded-full animate-pulse shadow-[0_0_8px_rgba(253,224,71,0.8)] shrink-0"></span>
                              <span className="truncate">{hora.nombre}</span>
                            </span>
                            <span className="font-bold text-yellow-100 tracking-wide bg-black/20 px-2 py-1 sm:px-3 sm:py-1 rounded-lg text-xs sm:text-sm backdrop-blur-sm shadow-inner w-fit">
                              {formatTime(hora.hora_inicio)} - {formatTime(hora.hora_fin)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}

        {/* ── RESULT ── */}
        {viewState === 'result' && cliente && (
          <motion.div
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full"
          >
            {/* ── DESKTOP: 2-column sidebar layout | MOBILE: single column ── */}
            <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
            {/* ── LEFT SIDEBAR (Profile + Progress + QR) ── */}
            <div className="w-full lg:w-80 xl:w-96 shrink-0 lg:sticky lg:top-24 space-y-4">

              {/* Profile Header */}
              <Card className="border-0 shadow-lg dark:bg-card">
                <CardContent className="p-5 space-y-4">
                  {/* Avatar + nombre */}
                  <div className="flex items-center gap-3">
                    {(() => {
                      const initial = (cliente.nombre || '?')[0].toUpperCase();
                      const avatarColors = [
                        'bg-blue-500', 'bg-violet-500', 'bg-emerald-500',
                        'bg-rose-500', 'bg-amber-500', 'bg-cyan-500',
                      ];
                      const colorIdx = (cliente.telefono?.charCodeAt(cliente.telefono.length - 1) || 0) % avatarColors.length;
                      return isVip ? (
                        <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 bg-amber-100 shadow-md">
                          <Crown className="w-7 h-7 text-amber-500" />
                        </div>
                      ) : (
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${avatarColors[colorIdx]} shadow-md`}>
                          <span className="text-xl font-black text-white">{initial}</span>
                        </div>
                      );
                    })()}
                    <div className="min-w-0 flex-1">
                      <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">{cliente.nombre}</h1>
                      <p className="text-xs text-gray-400">{cliente.telefono}{isVip && <span className="ml-2 text-amber-500 font-semibold">· VIP</span>}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={handleShare} title="Compartir" className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-500 transition-colors">
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={handleReset} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Rango badge */}
                  {(() => {
                    const rango = cliente.rango || 'bronce';
                    const rangoConfig: Record<string, { label: string; emoji: string; color: string; nextLabel: string; nextMeta: number; currentMeta: number }> = {
                      bronce: { label: 'Bronce', emoji: '🥉', color: 'bg-amber-700/10 text-amber-700 border-amber-700/20', nextLabel: 'Plata', nextMeta: 20, currentMeta: 0 },
                      plata:  { label: 'Plata',  emoji: '🥈', color: 'bg-slate-400/10 text-slate-600 border-slate-400/20', nextLabel: 'Oro', nextMeta: 50, currentMeta: 20 },
                      oro:    { label: 'Oro',    emoji: '🥇', color: 'bg-amber-400/10 text-amber-600 border-amber-400/20', nextLabel: 'Leyenda', nextMeta: 100, currentMeta: 50 },
                    };
                    const cfg = rangoConfig[rango] || rangoConfig.bronce;
                    const envTot = cliente.envios_totales || 0;
                    const pct = Math.min(100, Math.round(((envTot - cfg.currentMeta) / (cfg.nextMeta - cfg.currentMeta)) * 100));
                    return (
                      <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ${cfg.color}`}>
                        <span className="text-lg">{cfg.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold uppercase tracking-wider">{cfg.label}</span>
                            <span className="text-[10px] font-medium opacity-70">{envTot} · {cfg.nextLabel}</span>
                          </div>
                          <div className="h-1.5 bg-black/10 rounded-full overflow-hidden">
                            <motion.div className="h-full bg-current rounded-full opacity-60"
                              initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                              transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Cupón activo */}
                  {cliente.cupon_activo && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                      className="relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 p-4 text-white shadow-md shadow-orange-500/30">
                      <div className="absolute -top-4 -right-4 w-20 h-20 bg-white/20 rounded-full blur-2xl pointer-events-none" />
                      <div className="relative z-10">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <motion.span animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>🎟️</motion.span>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">Cupón activo</span>
                        </div>
                        <p className="font-mono font-black text-2xl tracking-[0.18em] mb-1.5">{cliente.cupon_activo}</p>
                        <button onClick={() => { navigator.clipboard.writeText(cliente.cupon_activo!); toast.success('¡Copiado!', 'Listo para usar'); }}
                          className="text-[11px] font-bold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors">📋 Copiar</button>
                      </div>
                    </motion.div>
                  )}

                  {/* Foto de fachada */}
                  {(cliente as any).foto_fachada_url && (
                    <div className="rounded-xl overflow-hidden shadow-sm">
                      <img src={(cliente as any).foto_fachada_url} alt="Fachada" className="w-full h-28 object-cover" />
                      <div className="bg-gray-50 dark:bg-gray-800 px-3 py-1.5">
                        <p className="text-[10px] text-gray-400 flex items-center gap-1"><MapPin className="w-3 h-3" /> Dirección registrada</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>{/* end left sidebar */}

            {/* ── RIGHT CONTENT AREA ── */}
            <div className="flex-1 min-w-0 space-y-6">

              {/* Progress + QR side by side on desktop */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5 items-start">

              {/* Progress card — full width on mobile, left slot on desktop */}
              <div className="space-y-6">
                {/* Mobile toggle — hidden on desktop */}
                <div className="flex lg:hidden justify-center gap-2">
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      variant={!showQR ? 'default' : 'outline'}
                      onClick={() => setShowQR(false)}
                      className={!showQR ? 'bg-gradient-primary text-white' : ''}
                    >
                      <TrendingUp className="w-4 h-4 mr-2" />
                      Mi Progreso
                    </Button>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      variant={showQR ? 'default' : 'outline'}
                      onClick={() => setShowQR(true)}
                      className={showQR ? 'bg-gradient-primary text-white' : ''}
                    >
                      <QrCode className="w-4 h-4 mr-2" />
                      Mi QR
                    </Button>
                  </motion.div>
                </div>

                {!showQR ? (
                  <>
                    {/* Progress card */}
                    {isVip ? (
                      <>
                        {!showWalletModal ? (
                          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                            {/* Saldo */}
                            <div className="p-5 border-b border-gray-50">
                              <div className="flex items-center gap-2 mb-1">
                                <Wallet className="w-4 h-4 text-amber-500" />
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Billetera VIP</span>
                              </div>
                              <p className="text-3xl font-black text-gray-900 mt-2">${(cliente.saldo_billetera || 0).toFixed(2)}</p>
                              <p className="text-xs text-gray-400 mt-0.5">Saldo disponible</p>
                            </div>

                            {/* Cupón activo — bloquea el canje */}
                            {cliente.cupon_activo ? (
                              <div className="p-4">
                                <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 space-y-2">
                                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">🎟️ Cupón activo</p>
                                  <p className="font-mono font-black text-amber-700 text-xl tracking-widest">{cliente.cupon_activo}</p>
                                  <p className="text-xs text-amber-600/80">Usa este código con el repartidor. No puedes generar otro hasta que se marque como usado.</p>
                                  <button
                                    onClick={() => navigator.clipboard.writeText(cliente.cupon_activo!)}
                                    className="text-xs font-bold text-amber-600 bg-amber-200/60 px-3 py-1.5 rounded-lg hover:bg-amber-300/60 transition-colors"
                                  >
                                    Copiar código
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-4 space-y-3">
                                {(cliente.saldo_billetera || 0) > 0 ? (
                                  <button
                                    onClick={() => { setShowWalletModal(true); setWalletMode('select'); }}
                                    className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-amber-600 transition-colors"
                                  >
                                    <Wallet className="w-4 h-4" />
                                    Canjear saldo
                                  </button>
                                ) : (
                                  <p className="text-center text-gray-400 text-xs py-1">Acumula saldo realizando envíos</p>
                                )}
                                <p className="text-center text-xs text-gray-400">💡 Descuento en comida o envío gratis (hasta $45)</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                            {/* Header */}
                            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                              <div>
                                <p className="font-bold text-gray-900">Canjear saldo</p>
                                <p className="text-sm text-gray-400">Disponible: <strong className="text-gray-700">${(cliente.saldo_billetera || 0).toFixed(2)}</strong></p>
                              </div>
                              <button onClick={resetWalletModal} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
                                <X className="w-5 h-5" />
                              </button>
                            </div>

                            <div className="p-6 space-y-4">
                              {walletMode === 'select' && (
                                <div className="space-y-4">
                                  <p className="text-gray-600 dark:text-gray-400 text-sm text-center">¿Cómo quieres usar tu saldo?</p>
                                  {/* Opción 1: Descuento en comida */}
                                  <button
                                    onClick={() => { setWalletMode('food'); setWalletMsg(''); }}
                                    className="w-full p-4 rounded-2xl border-2 border-orange-200 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all text-left group"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                                        <Utensils className="w-6 h-6 text-orange-500" />
                                      </div>
                                      <div>
                                        <p className="font-bold text-gray-900 dark:text-white">Descuento en Comida</p>
                                        <p className="text-xs text-gray-500">Descuenta cualquier monto de tu pedido</p>
                                      </div>
                                    </div>
                                  </button>
                                  {/* Opción 2: Envío gratis */}
                                  <button
                                    onClick={() => { setWalletMode('delivery'); setWalletMsg(''); }}
                                    className="w-full p-4 rounded-2xl border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left group"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                                        <Truck className="w-6 h-6 text-blue-500" />
                                      </div>
                                      <div>
                                        <p className="font-bold text-gray-900 dark:text-white">Envío Gratis</p>
                                        <p className="text-xs text-gray-500">Cubre hasta $45 de costo de entrega</p>
                                      </div>
                                    </div>
                                  </button>
                                  <button
                                    onClick={resetWalletModal}
                                    className="w-full py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                                  >
                                    Cancelar y volver
                                  </button>
                                </div>
                              )}

                              {walletMode === 'food' && (
                                <>
                                  <button onClick={() => setWalletMode('select')} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-2">
                                    <ChevronLeft className="w-4 h-4" /> Volver
                                  </button>
                                  <div className="bg-orange-50 dark:bg-orange-900/10 rounded-2xl p-4">
                                    <p className="font-semibold text-gray-800 dark:text-white mb-1 flex items-center gap-2"><Utensils className="w-4 h-4 text-orange-500" /> Descuento en Comida</p>
                                    <p className="text-xs text-gray-500 mb-3">Indica el monto que quieres descontar de tu saldo</p>
                                    <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                      <input
                                        type="number"
                                        min="1"
                                        max={cliente.saldo_billetera || 0}
                                        step="0.01"
                                        value={foodAmount}
                                        onChange={e => setFoodAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full pl-8 pr-4 py-3 border-2 border-orange-200 rounded-xl text-lg font-bold text-gray-900 dark:text-white dark:bg-gray-800 focus:outline-none focus:border-orange-400"
                                      />
                                    </div>
                                    {walletMsg && <p className="mt-2 text-xs text-red-500">{walletMsg}</p>}
                                  </div>
                                  <button
                                    disabled={walletLoading || !foodAmount || parseFloat(foodAmount) <= 0 || parseFloat(foodAmount) > (cliente.saldo_billetera || 0)}
                                    onClick={handleCanjeComida}
                                    className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg"
                                  >
                                    {walletLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                                    Confirmar Descuento
                                  </button>
                                </>
                              )}

                              {walletMode === 'delivery' && (
                                <>
                                  <button onClick={() => setWalletMode('select')} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-2">
                                    <ChevronLeft className="w-4 h-4" /> Volver
                                  </button>
                                  <div className="bg-blue-50 dark:bg-blue-900/10 rounded-2xl p-4 space-y-3">
                                    <p className="font-semibold text-gray-800 dark:text-white flex items-center gap-2"><Truck className="w-4 h-4 text-blue-500" /> Canje por Envío</p>
                                    <div className="text-xs text-gray-500 bg-white dark:bg-gray-800 rounded-xl p-3 space-y-1">
                                      <p>• Cobertura máxima: <strong className="text-blue-600">${MAX_ENVIO_GRATIS}.00</strong></p>
                                      <p>• Si tu envío cuesta más, pagas la diferencia</p>
                                    </div>
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Costo real de tu envío (opcional)</label>
                                    <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={deliveryCost}
                                        onChange={e => setDeliveryCost(e.target.value)}
                                        placeholder={`${MAX_ENVIO_GRATIS}.00`}
                                        className="w-full pl-8 pr-4 py-3 border-2 border-blue-200 rounded-xl text-lg font-bold text-gray-900 dark:text-white dark:bg-gray-800 focus:outline-none focus:border-blue-400"
                                      />
                                    </div>
                                    {deliveryCost && parseFloat(deliveryCost) > MAX_ENVIO_GRATIS && (
                                      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                                        ⚠️ Tu billetera cubre <strong>${MAX_ENVIO_GRATIS}</strong><br/>
                                        Diferencia a pagar: <strong>${(parseFloat(deliveryCost) - MAX_ENVIO_GRATIS).toFixed(2)}</strong>
                                      </div>
                                    )}
                                    {walletMsg && <p className="text-xs text-red-500">{walletMsg}</p>}
                                  </div>
                                  <button
                                    disabled={walletLoading || (cliente.saldo_billetera || 0) < Math.min(parseFloat(deliveryCost) || MAX_ENVIO_GRATIS, MAX_ENVIO_GRATIS)}
                                    onClick={handleCanjeEnvio}
                                    className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:from-blue-600 hover:to-indigo-600 transition-all shadow-lg"
                                  >
                                    {walletLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Truck className="w-5 h-5" />}
                                    Aplicar Canje
                                  </button>
                                </>
                              )}

                              {walletMode === 'success' && (
                                <div className="text-center py-2 space-y-5">
                                  <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
                                    <CheckCircle2 className="w-10 h-10 text-green-500" />
                                  </div>
                                  <p className="font-bold text-gray-900 dark:text-white text-lg">¡Canje Exitoso!</p>
                                  
                                  {/* Extract code from walletMsg */}
                                  {(() => {
                                    const cMatch = walletMsg.match(/(CANJE-[A-Z0-9]+)/i);
                                    const code = cMatch ? cMatch[1] : null;
                                    return code ? (
                                      <div className="relative bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-50 dark:from-amber-900/30 dark:via-yellow-900/20 dark:to-amber-900/30 border-2 border-dashed border-amber-400 rounded-2xl p-5 space-y-2">
                                        <p className="text-xs uppercase tracking-widest text-amber-500 font-bold">Tu código de descuento</p>
                                        <p className="font-mono font-black text-2xl text-amber-700 dark:text-amber-300 tracking-[0.25em]">{code}</p>
                                        <p className="text-[11px] text-amber-600/70 dark:text-amber-400/70">Muestra o dicta este código al repartidor</p>
                                        <button
                                          onClick={() => navigator.clipboard.writeText(code).then(() => toast.success('¡Copiado!', 'Código listo para usar')).catch(() => toast.error('Error', 'No se pudo copiar al portapapeles'))}
                                          className="mt-2 text-xs font-bold text-amber-600 bg-amber-200/60 dark:bg-amber-800/40 dark:text-amber-300 px-4 py-2 rounded-lg hover:bg-amber-300/60 transition-colors"
                                        >
                                          📋 Copiar código
                                        </button>
                                      </div>
                                    ) : (
                                      <p className="text-gray-500 text-sm whitespace-pre-line">{walletMsg}</p>
                                    );
                                  })()}
                                  
                                  <p className="text-xs text-gray-400 dark:text-gray-500 italic">También te lo enviamos por WhatsApp 📲</p>
                                  <button
                                    onClick={resetWalletModal}
                                    className="w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold hover:from-green-600 hover:to-emerald-600 transition-all shadow-md"
                                  >
                                    Volver a mi perfil
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Progress Card — minimalist */}
                        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                          <div className="p-5 border-b border-gray-50">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Tu Progreso</p>
                                <p className="text-3xl font-black text-gray-900">
                                  <motion.span>{displayPointsRounded}</motion.span>
                                  <span className="text-lg text-gray-300 font-medium"> / {metaVip}</span>
                                </p>
                              </div>
                              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                                <Gift className="w-6 h-6 text-blue-500" />
                              </div>
                            </div>
                            <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                              <motion.div
                                className="bg-blue-500 h-full rounded-full"
                                initial={{ width: '0%' }}
                                animate={{ width: `${progreso}%` }}
                                transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
                              />
                            </div>
                            {/* Motivational alert when 1 away */}
                            {enviosRestantes === 1 && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 1.3 }}
                                className="mt-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2"
                              >
                                <motion.span
                                  animate={{ scale: [1, 1.3, 1] }}
                                  transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                                  className="text-lg"
                                >
                                  🎉
                                </motion.span>
                                <p className="text-xs font-bold text-green-700">¡Solo te falta <span className="text-green-600">1 envío</span> para el gratis!</p>
                              </motion.div>
                            )}
                            {enviosRestantes === 0 && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 1.3 }}
                                className="mt-3 flex items-center gap-2 bg-emerald-500 rounded-xl px-3 py-2.5"
                              >
                                <span className="text-lg">🎊</span>
                                <p className="text-xs font-bold text-white">¡Tu próximo envío es COMPLETAMENTE GRATIS!</p>
                              </motion.div>
                            )}
                            {enviosRestantes > 1 && (
                              <p className="text-xs text-gray-400 mt-2 text-center">
                                {enviosRestantes} envío{enviosRestantes > 1 ? 's' : ''} más para envío gratis
                              </p>
                            )}
                          </div>
                          <div className="p-4">
                            <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
                              {Array.from({ length: metaVip }).map((_, idx) => {
                                const filled = idx < (cliente.puntos % metaVip);
                                return (
                                  <div
                                    key={idx}
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 ${
                                      filled ? 'bg-blue-500 shadow-sm shadow-blue-300' : 'bg-gray-100'
                                    }`}
                                  >
                                    <Star className={`w-5 h-5 ${filled ? 'text-white fill-white' : 'text-gray-300'}`} />
                                  </div>
                                );
                              })}
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <div className="text-center">
                                <p className="text-xl font-black text-gray-900">{cliente.envios_totales}</p>
                                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Totales</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xl font-black text-blue-500">{cliente.puntos % metaVip}</p>
                                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Puntos</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xl font-black text-emerald-500">{cliente.envios_gratis_disponibles}</p>
                                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Gratis</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Botón de Canje */}
                        <button
                          onClick={() => setShowCanjeModal(true)}
                          className="w-full mt-3 py-3 rounded-xl bg-blue-600 text-white font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors shadow-sm"
                        >
                          <Ticket className="w-5 h-5" />
                          Canjear Beneficio
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  // QR View — mobile only (on desktop it's in the center column)
                  <Card className="border-0 shadow-xl lg:hidden">
                    <CardContent className="p-6 flex flex-col items-center text-center gap-4">
                      <h2 className="text-lg font-bold text-gray-800">Tu Código QR Personal</h2>
                      <p className="text-sm text-gray-500">Muéstraselo al repartidor</p>
                      {qrDataUrl ? (
                        <div className="p-4 bg-white rounded-2xl shadow-inner border border-gray-100">
                          <img src={qrDataUrl} alt="Tu QR" className="w-56 h-56 rounded-xl" />
                        </div>
                      ) : (
                        <div className="w-56 h-56 bg-gray-100 rounded-2xl flex items-center justify-center animate-pulse">
                          <QrCode className="w-16 h-16 text-gray-300" />
                        </div>
                      )}
                      <p className="text-xs text-gray-400">{cliente.telefono} · {cliente.nombre}</p>
                    </CardContent>
                  </Card>
                )}
              </div>{/* end progress card column */}

              {/* ── QR column (desktop: right of progress, mobile: hidden — inside mobile toggle) ── */}
              <div className="hidden lg:flex flex-col items-center gap-3 shrink-0">
                <Card className="border-0 shadow-lg dark:bg-card">
                  <CardContent className="p-4 flex flex-col items-center gap-3">
                    <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tu QR Personal</h3>
                    <div className="p-3 bg-white rounded-2xl shadow-inner border border-gray-100 dark:border-gray-700 dark:bg-gray-900">
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt="Tu QR" className="w-40 h-40 rounded-xl" />
                      ) : (
                        <div className="w-40 h-40 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center animate-pulse">
                          <QrCode className="w-12 h-12 text-gray-300" />
                        </div>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{cliente.nombre}</p>
                      <p className="text-[10px] text-gray-400">{cliente.telefono}</p>
                    </div>
                    {qrDataUrl && (
                      <button onClick={handleDownloadQR}
                        className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 rounded-xl py-2 transition-colors">
                        <Download className="w-3.5 h-3.5" /> Guardar QR
                      </button>
                    )}
                  </CardContent>
                </Card>
              </div>{/* end QR column */}

              </div>{/* end progress+QR grid */}

              {/* ── Stats + Historial (full width below progress+QR) ── */}
              <div className="space-y-5">
                {/* Wrapped Stats */}
                <ClientStats cliente={cliente} historial={historial} />

                {/* Historial Estrella con Tabs */}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <History className="w-5 h-5 text-blue-500" />
                    Historial Estrella
                  </h3>
                  {/* Tabs */}
                  <div className="flex gap-1.5 mb-4 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                    {(['todo', 'puntos', 'canjes'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setHistorialTab(tab)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          historialTab === tab
                            ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        {tab === 'todo' ? 'Todo' : tab === 'puntos' ? '⭐ Puntos' : '🎁 Canjes'}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-3">
                    {historial.length === 0 ? (
                      <p className="text-gray-500 italic text-center text-sm py-4">Aún no hay movimientos</p>
                    ) : (
                      historial
                        .filter(mov => {
                          if (historialTab === 'puntos') return mov.tipo !== 'canje';
                          if (historialTab === 'canjes') return mov.tipo === 'canje';
                          return true;
                        })
                        .slice(0, historialLimit)
                        .map((mov: RegistroMovimiento) => {
                        // Extract coupon code from description if present
                        const codeMatch = mov.descripcion?.match(/Código:\s*(CANJE-[A-Z0-9]+)/i);
                        const couponCode = codeMatch ? codeMatch[1] : null;
                        const isCanje = mov.tipo === 'canje';
                        const isCashback = mov.tipo === 'acumulacion' && !!mov.monto_saldo;

                        return (
                          <div key={mov.id ?? `${mov.cliente_id}-${mov.created_at}`}>
                            <Card className={`border-0 shadow-sm overflow-hidden transition-all hover:shadow-md ${isCanje && couponCode ? 'ring-2 ring-amber-400/60' : 'bg-white dark:bg-card'}`}>
                              <CardContent className="p-4 flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                                  isCashback ? 'bg-amber-100 dark:bg-amber-900/30' 
                                  : isCanje ? 'bg-emerald-100 dark:bg-emerald-900/30' 
                                  : 'bg-orange-100 dark:bg-orange-900/30'
                                }`}>
                                  {isCashback
                                    ? <DollarSign className="w-6 h-6 text-amber-500" />
                                    : isCanje
                                      ? <Gift className="w-6 h-6 text-emerald-500" />
                                      : <Star className="w-6 h-6 text-orange-500 fill-orange-500" />
                                  }
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-gray-900 dark:text-white text-sm">
                                    {isCashback ? `Envío Registrado (+$${mov.monto_saldo?.toFixed(2)} Cashback)`
                                      : isCanje ? (mov.monto_saldo !== undefined && mov.monto_saldo < 0 ? 'Uso de Billetera VIP' : 'Canje de Envío Gratis')
                                      : '+1 Punto Acumulado'}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {new Date(mov.created_at).toLocaleDateString()} a las {new Date(mov.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    {mov.monto_saldo !== undefined && mov.monto_saldo < 0 && (
                                      <span className="font-semibold text-rose-500 ml-2">(-${Math.abs(mov.monto_saldo).toFixed(2)})</span>
                                    )}
                                  </p>
                                </div>
                              </CardContent>
                              {/* Coupon Ticket — always visible for recovery */}
                              {couponCode && (
                                <div className="px-4 pb-4 -mt-1">
                                  <div className="relative bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-dashed border-amber-300 dark:border-amber-600 rounded-xl p-3 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-lg">🎟️</span>
                                      <div className="min-w-0">
                                        <p className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">Tu código de descuento</p>
                                        <p className="font-mono font-black text-amber-700 dark:text-amber-300 text-base tracking-widest truncate">{couponCode}</p>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => navigator.clipboard.writeText(couponCode).then(() => toast.success('¡Copiado!', 'Código listo para usar')).catch(() => toast.error('Error', 'No se pudo copiar'))}
                                      className="shrink-0 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-200/60 dark:bg-amber-800/40 px-2.5 py-1.5 rounded-lg hover:bg-amber-300/60 transition-colors"
                                    >
                                      Copiar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </Card>
                          </div>
                        );
                      })
                    )}
                    {/* Ver más button */}
                    {historial.filter(mov => {
                      if (historialTab === 'puntos') return mov.tipo !== 'canje';
                      if (historialTab === 'canjes') return mov.tipo === 'canje';
                      return true;
                    }).length > historialLimit && (
                      <button
                        onClick={() => setHistorialLimit(prev => prev + 10)}
                        className="w-full py-2.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors border border-blue-100 dark:border-blue-800"
                      >
                        Ver más movimientos ↓
                      </button>
                    )}
                  </div>
                </div>

                {/* Free delivery alert */}
                {cliente.envios_gratis_disponibles > 0 && (
                  <Card className="border-0 shadow-lg bg-gradient-to-br from-green-500 to-emerald-500 text-white">
                    <CardContent className="p-6 text-center">
                      <Gift className="w-12 h-12 mx-auto mb-3" />
                      <h3 className="text-xl font-bold mb-1">
                        ¡Tienes {cliente.envios_gratis_disponibles} envío{cliente.envios_gratis_disponibles > 1 ? 's' : ''} gratis!
                      </h3>
                      <p className="text-green-100">Muestra tu código QR al repartidor para canjearlo</p>
                    </CardContent>
                  </Card>
                )}
              </div>{/* end stats+historial */}

            </div>{/* end right content area */}

          </div>{/* end flex sidebar+right */}
          </motion.div>
        )}
      </main>

      <footer className="border-t border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center shadow-sm">
                <Truck className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">Estrella Delivery</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5" /> Lun – Dom: 9 AM – 10 PM
            </div>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-green-600 dark:text-green-400 font-semibold hover:underline flex items-center gap-1">
              Hacer un pedido →
            </a>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 text-center text-[10px] text-gray-300 dark:text-gray-600">
            © {new Date().getFullYear()} Estrella Delivery — Hecho con <Heart className="w-2.5 h-2.5 text-red-400 fill-red-400 inline mx-0.5" /> para nuestros clientes
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
        className="fixed bottom-6 right-5 z-40 w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center shadow-xl shadow-green-500/40 transition-colors"
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


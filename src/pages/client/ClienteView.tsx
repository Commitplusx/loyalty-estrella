import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Star, Phone, Search, Gift, DollarSign,
  TrendingUp, Clock, MapPin, Sparkles,
  ChevronLeft, QrCode, AlertCircle, Loader2, History, Crown, Sun, Moon,
  Wallet, Truck, Utensils, X, CheckCircle2
} from 'lucide-react';
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
  const [historial, setHistorial] = useState<RegistroMovimiento[]>([]);;
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

  const { storeState, horasFelices, formatTime } = useSchedule();
  const { isDark, toggle } = useDarkMode();

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

    // Suscripción al historial: cuando se añade un nuevo registro para este
    // cliente, recargamos la lista de movimientos automáticamente
    const histChannel = supabase
      .channel(`historial_${clienteId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'registros_puntos', filter: `cliente_id=eq.${clienteId}` },
        async () => {
          const fresh = await getHistorialCliente(clienteId);
          setHistorial(fresh);
        }
      )
      .subscribe();

    // Canal para el modal de calificación — solo se activa en acumulaciones,
    // NO en canjes de billetera ni envíos gratis (Bug #3 fix)
    const channelName = `realtime_ratings_${clienteId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'registros_puntos',
          filter: `cliente_id=eq.${clienteId}`,
        },
        (payload: { new: { id: string; tipo: string } }) => {
          // Solo mostrar el modal cuando es una acumulación de punto real
          if (payload.new.tipo === 'acumulacion') {
            setActiveRegistroId(payload.new.id);
            setShowRating(true);
          }
        }
      )
      .subscribe();

    return () => {
      unsubscribe();
      supabase.removeChannel(channel);
      supabase.removeChannel(histChannel);
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

    const data = await getClienteByTelefono(tel);

    if (data === null) {
      // Real DB / network error
      setViewState('error-generic');
    } else if ('found' in data) {
      // Discriminant: number not registered
      setViewState('error-not-found');
    } else {
      // It's a Cliente
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

  // ── Canjeadores de billetera ──────────────────────────────────────────────
  const handleCanjeComida = async () => {
    const monto = parseFloat(foodAmount);
    if (!cliente || isNaN(monto) || monto <= 0 || monto > (cliente.saldo_billetera || 0)) return;
    setWalletLoading(true);
    const res = await canjearSaldoBilleteraRPC(cliente.id, cliente.id, monto);
    setWalletLoading(false);
    if (res.success) {
      const codigo = res.codigo || 'SIN-CODIGO';
      setWalletMsg(`✅ Se descontaron $${monto.toFixed(2)} de tu billetera VIP.\n🎟️ Código de descuento: ${codigo}`);
      setWalletMode('success');
      setCliente(prev => prev ? { ...prev, saldo_billetera: (prev.saldo_billetera || 0) - monto } : prev);
      
      // Notificar por WhatsApp en segundo plano
      supabase.functions.invoke('notificar-whatsapp', {
        body: {
          tipo: 'canje_billetera',
          cliente_tel: cliente.telefono,
          cliente_nombre: cliente.nombre,
          codigo_canje: codigo,
          monto: monto.toFixed(2),
          saldo_restante: ((cliente.saldo_billetera || 0) - monto).toFixed(2)
        }
      }).catch(console.error);
    } else {
      setWalletMsg(`❌ ${res.message}`);
    }
  };

  const handleCanjeEnvio = async () => {
    if (!cliente) return;
    const costoReal = parseFloat(deliveryCost) || MAX_ENVIO_GRATIS;
    const cobertura = Math.min(costoReal, MAX_ENVIO_GRATIS);
    const diferencia = Math.max(0, costoReal - MAX_ENVIO_GRATIS);
    if (cobertura > (cliente.saldo_billetera || 0)) {
      setWalletMsg(`❌ Saldo insuficiente. El canje de envío requiere al menos $${cobertura.toFixed(2)}`);
      return;
    }
    setWalletLoading(true);
    const res = await canjearSaldoBilleteraRPC(cliente.id, 'cliente', cobertura);
    setWalletLoading(false);
    if (res.success) {
      const codigo = res.codigo || 'SIN-CODIGO';
      const msg = diferencia > 0
        ? `✅ Cobertura de $${cobertura.toFixed(2)} aplicada. \n💳 Diferencia a pagar: $${diferencia.toFixed(2)}\n🎟️ Código: ${codigo}`
        : `✅ Envío cubierto totalmente ($${cobertura.toFixed(2)}) con tu Billetera VIP.\n🎟️ Código: ${codigo}`;
      setWalletMsg(msg);
      setWalletMode('success');
      setCliente(prev => prev ? { ...prev, saldo_billetera: (prev.saldo_billetera || 0) - cobertura } : prev);
      
      // Notificar por WhatsApp en segundo plano
      supabase.functions.invoke('notificar-whatsapp', {
        body: {
          tipo: 'canje_billetera',
          cliente_tel: cliente.telefono,
          cliente_nombre: cliente.nombre,
          codigo_canje: codigo,
          monto: cobertura.toFixed(2),
          saldo_restante: ((cliente.saldo_billetera || 0) - cobertura).toFixed(2)
        }
      }).catch(console.error);
    } else {
      setWalletMsg(`❌ ${res.message}`);
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

  // Generar QR cuando se muesre y exista cliente
  useEffect(() => {
    if (showQR && cliente?.qr_code) {
      QRCode.toDataURL(cliente.qr_code, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('Error al generar QR:', err));
    }
  }, [showQR, cliente?.qr_code]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.02, y: -10 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="min-h-screen bg-gradient-to-br from-orange-50/50 via-white to-slate-100 dark:from-background dark:via-card dark:to-background transition-colors duration-300"
    >
      {/* Header */}
      <header className="bg-white/90 dark:bg-background/90 backdrop-blur-md shadow-sm dark:shadow-none sticky top-0 z-50 border-b border-transparent dark:border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="relative mr-2">
                <img src="/logo.png" className="w-10 h-10 object-contain drop-shadow-md" alt="Estrella Delivery" />
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                Estrella <span className="text-orange-500">Delivery</span>
              </span>
            </div>
            <Badge
              variant={storeState.isOpen ? 'default' : 'secondary'}
              className={storeState.isOpen
                ? storeState.isHappyHour ? 'bg-amber-500' : 'bg-green-500'
                : ''}
            >
              {storeState.isOpen
                ? storeState.isHappyHour ? 'HORA FELIZ' : 'ABIERTO'
                : 'CERRADO'}
            </Badge>

            {/* Botón tema claro/oscuro */}
            <button
              onClick={toggle}
              aria-label="Cambiar tema"
              className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 dark:bg-card hover:bg-orange-50 dark:hover:bg-muted transition-colors"
            >
              {isDark
                ? <Sun className="w-4 h-4 text-amber-400" />
                : <Moon className="w-4 h-4 text-gray-500" />
              }
            </button>

            {/* Botón de cerrar sesión — solo visible cuando hay cliente activo */}
            {cliente && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-destructive/10 dark:hover:text-red-400 ml-1 text-xs gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Cerrar sesión
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── LOADING ── */}
        {viewState === 'loading' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-orange-100 mb-4 animate-pulse">
                <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-1">Consultando tu cuenta…</h2>
              <p className="text-gray-500 text-sm">Buscando el número {telefono}</p>
            </div>
            {/* Skeleton cards */}
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-2xl bg-gray-200 animate-pulse"
                  style={{ opacity: 1 - i * 0.2 }}
                />
              ))}
            </div>
          </div>
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
            style={{ willChange: "transform, opacity" }}
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
                          maxLength={15}
                          required
                        />
                      </div>
                    </div>
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        type="submit"
                        disabled={telefono.length < 7}
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
            style={{ willChange: "transform, opacity" }}
          >
            {/* Profile Header Card */}
            <div className="mb-6">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-2xl">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.15),transparent_60%)]" />
                <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="relative z-10 flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${isVip ? 'bg-gradient-to-br from-amber-400 to-yellow-500 shadow-lg shadow-amber-500/30' : 'bg-white/10 backdrop-blur-sm'}`}>
                    {isVip ? <Crown className="w-7 h-7 text-white" /> : <Star className="w-7 h-7 text-orange-300" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-bold truncate">¡Hola, {cliente.nombre}!</h1>
                    <p className="text-sm text-white/60 truncate">{cliente.telefono}</p>
                  </div>
                  <Button variant="ghost" onClick={handleReset} className="text-white/50 hover:text-white hover:bg-white/10 shrink-0">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Salir
                  </Button>
                </div>
                {isVip && (
                  <div className="relative z-10 mt-3 flex items-center gap-2">
                    <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs">✨ VIP</Badge>
                    <span className="text-xs text-white/40">Meta de {metaVip} envíos por ciclo</span>
                  </div>
                )}
              </div>
            </div>

            {/* PC: 3 columns | Mobile: single column */}
            <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-6 lg:gap-8 items-start">

              {/* ── LEFT COLUMN: Progress card ── */}
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
                          <Card className="border-0 shadow-xl overflow-hidden ring-1 ring-amber-500/30">
                            <div className="relative p-6 text-white bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
                              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(251,191,36,0.12),transparent_60%)]" />
                              <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl" />
                              <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-4">
                                  <Wallet className="w-4 h-4 text-amber-400" />
                                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest">Billetera VIP</span>
                                </div>
                                <div className="flex items-end justify-between mb-5">
                                  <div>
                                    <p className="text-xs text-white/40 mb-1">Saldo disponible</p>
                                    <p className="text-4xl font-black tracking-tight">${(cliente.saldo_billetera || 0).toFixed(2)}</p>
                                  </div>
                                  <div className="text-right space-y-1">
                                    <p className="text-2xl font-bold text-white/90">{cliente.envios_totales}</p>
                                    <p className="text-[10px] text-white/40 uppercase tracking-wider">envíos</p>
                                  </div>
                                </div>
                                {(cliente.saldo_billetera || 0) > 0 ? (
                                  <button
                                    onClick={() => { setShowWalletModal(true); setWalletMode('select'); }}
                                    className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-900 font-bold text-sm flex items-center justify-center gap-2 hover:from-amber-400 hover:to-yellow-400 transition-all shadow-lg shadow-amber-500/20"
                                  >
                                    <Wallet className="w-4 h-4" />
                                    Canjear Saldo
                                  </button>
                                ) : (
                                  <p className="text-center text-white/30 font-medium text-xs">Acumula saldo realizando envíos</p>
                                )}
                              </div>
                            </div>
                            <CardContent className="p-4 bg-white dark:bg-card">
                              <div className="p-3 bg-amber-50 dark:bg-amber-900/15 rounded-xl text-xs text-amber-700 dark:text-amber-300 text-center">
                                💡 Canjea por <strong>descuento en comida</strong> o por <strong>envío gratis</strong> (hasta $45)
                              </div>
                            </CardContent>
                          </Card>
                        ) : (
                          <Card className="border-0 shadow-2xl overflow-hidden ring-2 ring-amber-400 bg-white dark:bg-gray-900">
                            {/* Header del interface de canje */}
                            <div className="bg-gradient-to-r from-amber-400 to-yellow-500 p-6 text-white relative">
                              <button onClick={resetWalletModal} className="absolute top-4 right-4 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30">
                                <X className="w-4 h-4" />
                              </button>
                              <div className="flex items-center gap-3 mb-1">
                                <Wallet className="w-6 h-6" />
                                <h2 className="font-bold text-xl">Canjear Billetera</h2>
                              </div>
                              <p className="text-amber-100 text-sm">Disponible: <strong className="text-white">${(cliente.saldo_billetera || 0).toFixed(2)}</strong></p>
                            </div>

                            <div className="p-6 space-y-4">
                              {walletMode === 'select' && (
                                <div className="space-y-4">
                                  <p className="text-gray-600 dark:text-gray-400 text-sm text-center">¿Cómo quieres usar tu saldo?</p>
                                  {/* Opción 1: Descuento en comida */}
                                  <button
                                    onClick={() => setWalletMode('food')}
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
                                    onClick={() => setWalletMode('delivery')}
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
                                          onClick={() => navigator.clipboard.writeText(code)}
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
                          </Card>
                        )}
                      </>
                    ) : (
                      <>
                        <Card className="border-0 shadow-xl overflow-hidden">
                        <div className="p-6 text-white bg-gradient-to-br from-orange-500 to-amber-500">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <p className="text-sm mb-1 text-orange-100">Tu Progreso</p>
                              <p className="text-4xl font-bold">
                                {cliente.puntos % metaVip} <span className="text-2xl text-orange-200">/ {metaVip}</span>
                              </p>
                            </div>
                            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                              <Gift className="w-8 h-8 text-white" />
                            </div>
                          </div>
                          <div className="bg-white/20 rounded-full h-4 overflow-hidden">
                            <div
                              className="bg-white h-full rounded-full transition-all duration-1000 ease-out"
                              style={{ width: `${progreso}%` }}
                            />
                          </div>
                          <p className="text-center mt-3 text-orange-100">
                            {enviosRestantes === 0
                              ? '¡Tu próximo envío es GRATIS! 🎉'
                              : `Te faltan ${enviosRestantes} envío${enviosRestantes > 1 ? 's' : ''} para tu envío gratis`}
                          </p>
                        </div>
                        <CardContent className="p-6">
                          <div className="flex items-center justify-center gap-2 mb-6">
                            {Array.from({ length: metaVip }).map((_, idx) => {
                              const filled = idx < (cliente.puntos % metaVip);
                              return (
                                <div
                                  key={idx}
                                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center transition-all duration-500 ${
                                    filled
                                      ? 'bg-gradient-primary shadow-lg scale-105'
                                      : 'bg-gray-100 border-2 border-dashed border-gray-300'
                                  }`}
                                >
                                  <Star className={`w-6 h-6 ${filled ? 'text-white fill-white' : 'text-gray-400'}`} />
                                </div>
                              );
                            })}
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="bg-gray-50 rounded-xl p-4 text-center">
                              <p className="text-2xl font-bold text-gray-900">{cliente.envios_totales}</p>
                              <p className="text-xs text-gray-500">Envíos totales</p>
                            </div>
                            <div className="bg-orange-50 rounded-xl p-4 text-center">
                              <p className="text-2xl font-bold text-orange-600">{cliente.puntos % metaVip}</p>
                              <p className="text-xs text-gray-500">Puntos actuales</p>
                            </div>
                            <div className="bg-green-50 rounded-xl p-4 text-center">
                              <p className="text-2xl font-bold text-green-600">{cliente.envios_gratis_disponibles}</p>
                              <p className="text-xs text-gray-500">Envíos gratis</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      
                      {/* Botón de Canje */}
                      <button
                        onClick={() => setShowCanjeModal(true)}
                        className="w-full mt-4 py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold flex items-center justify-center gap-3 hover:from-orange-600 hover:to-amber-600 shadow-xl transition-all hover:scale-[1.02] hover:-translate-y-1"
                      >
                        <Ticket className="w-6 h-6" />
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
              </div>

              {/* ── CENTER COLUMN: QR (desktop only) ── */}
              <div className="hidden lg:flex flex-col items-center gap-3">
                <div className="p-5 bg-white rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 dark:bg-card">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="Tu QR" className="w-44 h-44 rounded-lg" />
                  ) : (
                    <div className="w-44 h-44 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center animate-pulse">
                      <QrCode className="w-12 h-12 text-gray-300" />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-center text-gray-400 dark:text-gray-500 max-w-[180px]">
                  Muéstrale este QR al repartidor para registrar tu envío
                </p>
                <div className="w-full p-2.5 bg-gray-50 dark:bg-card rounded-xl text-center space-y-0.5">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{cliente.nombre}</p>
                  <p className="text-[10px] text-gray-400">{cliente.telefono}</p>
                </div>
              </div>

              {/* ── RIGHT COLUMN: Stats + History + Free alert ── */}
              <div className="space-y-5">
                {/* Wrapped Stats */}
                <ClientStats cliente={cliente} historial={historial} />

                {/* Historial Estrella */}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <History className="w-5 h-5 text-orange-500" />
                    Historial Estrella
                  </h3>
                  <div className="space-y-3">
                    {historial.length === 0 ? (
                      <p className="text-gray-500 italic text-center text-sm py-4">Aún no hay movimientos</p>
                    ) : (
                      historial.map((mov: RegistroMovimiento) => {
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
                                      onClick={() => { navigator.clipboard.writeText(couponCode); }}
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
              </div>

            </div>
          </motion.div>
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <p className="text-muted-foreground text-sm">Estrella Delivery — Tu servicio de envíos de confianza</p>
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
    </motion.div>
  );
}

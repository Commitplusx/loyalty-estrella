import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Star, Phone, Search, Gift, DollarSign,
  TrendingUp, Clock, MapPin, Sparkles,
  ChevronLeft, QrCode, AlertCircle, Loader2, History, Crown, Sun, Moon
} from 'lucide-react';
import QRCode from 'qrcode';
import { supabase, getClienteByTelefono, subscribeToCliente, getHistorialCliente } from '@/lib/supabase';
import { AuthorityCounter } from '@/components/client/AuthorityCounter';
import { PromosBanner } from '@/components/client/PromosBanner';
import { ClientStats } from '@/components/ClientStats';
import { RatingModal } from '@/components/RatingModal';
import { useSchedule } from '@/hooks/useSchedule';
import { useDarkMode } from '@/hooks/useDarkMode';
import type { Cliente, RegistroMovimiento } from '@/types';

type ViewState = 'search' | 'loading' | 'result' | 'error-not-found' | 'error-generic';

export function ClienteView() {
  const [telefono, setTelefono] = useState('');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [viewState, setViewState] = useState<ViewState>('search');
  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [historial, setHistorial] = useState<RegistroMovimiento[]>([]);;
  const inputRef = useRef<HTMLInputElement>(null);

  const [showRating, setShowRating] = useState(false);
  const [activeRegistroId, setActiveRegistroId] = useState<string | null>(null);

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
        // También recargamos el historial actualizado
        getHistorialCliente(parsed.id).then(setHistorial).catch(() => {});
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

    // Canal para el modal de calificación (ya existía antes)
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
        (payload: { new: { id: string } }) => {
          setActiveRegistroId(payload.new.id);
          setShowRating(true);
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
  const metaVip = cliente ? (cliente.rango === 'oro' ? 3 : (cliente.rango === 'plata' || isVip ? 4 : 5)) : 5;
  const progreso = cliente ? ((cliente.puntos % metaVip) / metaVip) * 100 : 0;
  const enviosRestantes = cliente ? (metaVip - (cliente.puntos % metaVip)) % metaVip : metaVip;

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
      style={{ willChange: "transform, opacity" }}
      className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 transition-colors duration-300"
    >
      {/* Header */}
      <header className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm shadow-sm dark:shadow-gray-800 sticky top-0 z-50 border-b border-transparent dark:border-gray-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
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
              className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 hover:bg-orange-50 dark:hover:bg-gray-700 transition-colors"
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
                className="text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 ml-1 text-xs gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Cerrar sesión
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className={`mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-all duration-500 ease-in-out ${viewState === 'search' ? 'max-w-5xl lg:max-w-6xl' : 'max-w-3xl'}`}>

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
            className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start"
            style={{ willChange: "transform, opacity" }}
          >
            {/* Left Column: Acciones principales */}
            <div className="space-y-6">
              <AuthorityCounter />

              <div className="text-center lg:text-left">
                <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                  Consulta tus <span className="text-gradient">puntos</span>
                </h1>
                <p className="text-gray-600 text-lg">Ingresa tu número para ver tu fidelidad</p>
              </div>

              <PromosBanner />

            <Card className="border-0 shadow-xl">
              <CardContent className="p-6">
                <form onSubmit={handleBuscar} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Número de teléfono</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <Input
                        ref={inputRef}
                        value={telefono}
                        onChange={(e) => {
                          // Bug #8 fix: sanitize input to only allow digits
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

            </div>
            
            {/* Right Column: Info & Horarios */}
            <div className="space-y-6 pt-2 lg:pt-8">
              {/* Info cards */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                      <Gift className="w-6 h-6 text-orange-500" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">5 = 1 Gratis</p>
                      <p className="text-sm text-gray-500">Por cada 5 envíos</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                      <Sparkles className="w-6 h-6 text-amber-500" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">Hora Feliz</p>
                      <p className="text-sm text-gray-500">Lun, Mié y Sáb $35</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Horario */}
              <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Clock className="w-6 h-6 text-orange-500" />
                    <h3 className="font-bold text-xl text-gray-900">Horario de Atención</h3>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl mb-4">
                    <span className="text-gray-700 font-medium">Lunes a Domingo</span>
                    <span className="font-bold text-gray-900">9:00 AM - 10:00 PM</span>
                  </div>
                  {horasFelices.filter(h => h.activo).length > 0 && (
                    <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-orange-100/50">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="w-5 h-5 text-amber-500" />
                        <h4 className="font-bold text-lg text-gray-900">Horas Felices - Envío a $35</h4>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {horasFelices.filter(h => h.activo).map((hora) => (
                          <div key={hora.dia} className="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm">
                            <span className="text-gray-700 font-medium">{hora.nombre}</span>
                            <span className="font-bold text-amber-600">
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
            className="space-y-6"
            style={{ willChange: "transform, opacity" }}
          >
            <Button variant="ghost" onClick={handleReset} className="text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors">
              <ChevronLeft className="w-5 h-5 mr-1" /> Volver
            </Button>

            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-2">
                {isVip && <Crown className="w-7 h-7 text-amber-500 fill-amber-400" />}
                ¡Hola, {cliente.nombre}!
                {isVip && <Crown className="w-7 h-7 text-amber-500 fill-amber-400" />}
              </h1>
              {isVip ? (
                <p className="text-amber-600 font-semibold text-sm mt-1">✨ Cliente VIP — Meta exclusiva de {metaVip} envíos</p>
              ) : (
                <p className="text-gray-600">Este es tu progreso de fidelización</p>
              )}
            </div>

            {/* Toggle */}
            <div className="flex justify-center gap-2">
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
                  Mi Código QR
                </Button>
              </motion.div>
            </div>

            {!showQR ? (
              <>
                {/* Progress card */}
                {isVip ? (
                  <Card className="border-0 shadow-xl overflow-hidden ring-2 ring-amber-400">
                    <div className="p-6 text-white bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-600">
                      <div className="flex items-center gap-2 mb-3 justify-center">
                        <Crown className="w-5 h-5 text-white fill-white" />
                        <span className="font-bold text-white tracking-widest text-sm uppercase">Mi Billetera VIP</span>
                        <Crown className="w-5 h-5 text-white fill-white" />
                      </div>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-sm mb-1 text-amber-100">Saldo a Favor</p>
                          <p className="text-5xl font-black">${(cliente.saldo_billetera || 0).toFixed(2)}</p>
                        </div>
                        <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
                          <DollarSign className="w-8 h-8 text-white" />
                        </div>
                      </div>
                      <p className="text-center mt-3 text-amber-100 font-medium">
                        Úsalo para pagar envíos gratis o descuentos en comida
                      </p>
                    </div>
                    <CardContent className="p-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 rounded-xl p-4 text-center">
                          <p className="text-2xl font-bold text-gray-900">{cliente.envios_totales}</p>
                          <p className="text-xs text-gray-500">Envíos totales</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-4 text-center">
                          <p className="text-2xl font-bold text-amber-600">${(cliente.saldo_billetera || 0).toFixed(2)}</p>
                          <p className="text-xs text-gray-500">Saldo Disponible</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
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
                          : `Te faltan ${enviosRestantes} envío${enviosRestantes > 1 ? 's' : ''} para el delivery gratis`}
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
                          <p className="text-xs text-gray-500">Gratis disponibles</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Wrapped Stats */}
                <ClientStats cliente={cliente} historial={historial} />

                {/* Historial Estrella */}
                <div className="mt-8 mb-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <History className="w-5 h-5 text-orange-500" />
                    Historial Estrella
                  </h3>
                  <div className="space-y-3">
                    {historial.length === 0 ? (
                      <p className="text-gray-500 italic text-center text-sm py-4">Aún no hay movimientos</p>
                    ) : (
                      historial.map((mov: RegistroMovimiento) => (
                        // Bug #10 fix: use fallback key if id is missing
                        <Card key={mov.id ?? `${mov.cliente_id}-${mov.created_at}`} className="border-0 shadow-sm bg-white overflow-hidden">
                          <CardContent className="p-4 flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${mov.tipo === 'acumulacion' ? (mov.monto_saldo ? 'bg-amber-100' : 'bg-orange-100') : 'bg-emerald-100'}`}>
                              {mov.tipo === 'acumulacion' 
                                ? (mov.monto_saldo ? <DollarSign className="w-6 h-6 text-amber-500" /> : <Star className="w-6 h-6 text-orange-500 fill-orange-500" />)
                                : <Gift className="w-6 h-6 text-emerald-500 disabled" />}
                            </div>
                            <div className="flex-1">
                              <p className="font-bold text-gray-900">
                                {mov.tipo === 'acumulacion' 
                                  ? (mov.monto_saldo ? `Envío Registrado (+$${mov.monto_saldo.toFixed(2)} Cashback)` : '+1 Punto Acumulado')
                                  : (mov.monto_saldo !== undefined && mov.monto_saldo < 0 ? `Uso de Billetera VIP` : 'Canje de Envío Gratis')}
                              </p>
                              <p className="text-sm text-gray-500 mt-0.5">
                                {new Date(mov.created_at).toLocaleDateString()} a las {new Date(mov.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                {mov.monto_saldo !== undefined && mov.monto_saldo < 0 && (
                                  <span className="font-semibold text-rose-500 ml-2">(-${Math.abs(mov.monto_saldo).toFixed(2)})</span>
                                )}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      ))
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
              </>
            ) : (
              // QR View
              <Card className="border-0 shadow-xl">
                <CardContent className="p-6 flex flex-col items-center text-center gap-4">
                  <h2 className="text-lg font-bold text-gray-800">Tu Código QR Personal</h2>
                  <p className="text-sm text-gray-500">Muéstraselo al repartidor para registrar tu envío</p>

                  {qrDataUrl ? (
                    <div className="p-4 bg-white rounded-2xl shadow-inner border border-gray-100">
                      <img src={qrDataUrl} alt="Tu QR" className="w-56 h-56 rounded-xl" />
                    </div>
                  ) : (
                    <div className="w-56 h-56 bg-gray-100 rounded-2xl flex items-center justify-center animate-pulse">
                      <QrCode className="w-16 h-16 text-gray-300" />
                    </div>
                  )}

                  <div className="w-full p-3 bg-orange-50 rounded-xl">
                    <p className="text-xs font-mono text-orange-600 break-all">{cliente.qr_code}</p>
                  </div>

                  <p className="text-xs text-gray-400">{cliente.telefono} · {cliente.nombre}</p>
                </CardContent>
              </Card>
            )}

            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Cobertura Total</p>
                    <p className="text-sm text-gray-500">Servicio en toda la ciudad</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </main>

      <footer className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <p className="text-gray-500 text-sm">Estrella Delivery — Tu delivery de confianza</p>
      </footer>
      <AnimatePresence>
        {showRating && activeRegistroId && (
          <RatingModal 
            registroId={activeRegistroId} 
            onClose={() => setShowRating(false)} 
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

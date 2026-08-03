import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  Loader2, 
  Phone, 
  MessageCircle, 
  Navigation, 
  MapPin, 
  Home, 
  Bike, 
  ChevronDown, 
  CheckCircle2, 
  Clock, 
  ChevronUp, 
  Package, 
  ShoppingCart,
  ShieldCheck,
  ArrowLeft
} from 'lucide-react';
import { useJsApiLoader, GoogleMap, OverlayView, Polyline } from '@react-google-maps/api';
import { motion, AnimatePresence } from 'framer-motion';
import { UBER_EATS_MAP_STYLE } from '../utils/mapStyles';

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const MAPS_LIBRARIES: ("places")[] = ["places"];

export function TrackerPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const pedidoId = searchParams.get('pedido');
  
  const [pedido, setPedido] = useState<any>(null);
  const [repartidor, setRepartidor] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Bottom Sheet state
  const [isExpanded, setIsExpanded] = useState(false);
  const touchStartY = useRef(0);

  // Route & ETA states
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Bug #1 & #2 fix: usar refs para los canales Realtime para evitar closure leaks
  const orderChannelRef = useRef<any>(null);
  const driverChannelRef = useRef<any>(null);
  // Bug #5 fix: flag para evitar fetchInitialData paralelos
  const isFetchingRef = useRef(false);

  // Load Google Maps
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script-tracker',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: MAPS_LIBRARIES
  });

  const fetchRepartidor = async (repId: string) => {
    try {
      const { data: repData } = await supabase
        .from('repartidores')
        .select('*')
        .or(`id.eq.${repId},user_id.eq.${repId}`)
        .maybeSingle();
      
      if (repData) {
        setRepartidor(repData);
        return repData;
      }
    } catch (e) {
      console.error('Error fetching repartidor:', e);
    }
    return null;
  };

  useEffect(() => {
    if (!pedidoId) {
      setLoading(false);
      return;
    }

    // Bug #1 & #2 fix: subscribeToDriver usa ref para poder limpiar correctamente el canal anterior
    const subscribeToDriver = (repId: string) => {
      if (driverChannelRef.current) {
        supabase.removeChannel(driverChannelRef.current);
        driverChannelRef.current = null;
      }

      const ch = supabase.channel(`driver-tracker-${repId}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'repartidores', filter: `id=eq.${repId}` },
          (payload) => {
            setRepartidor((prev: any) => prev ? {
              ...prev,
              lat: payload.new.lat,
              lng: payload.new.lng
            } : prev);
          }
        ).subscribe();

      driverChannelRef.current = ch;
    };

    // Bug #5 fix: evitar llamadas paralelas a fetchInitialData
    const fetchInitialData = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      try {
        // Soporta UUID largo o ID corto de 6 caracteres
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pedidoId);

        let query = supabase.from('pedidos').select('*, repartidores(*)');
        if (isUUID) {
          query = query.eq('id', pedidoId);
        } else {
          query = query.eq('wb_message_id', pedidoId);
        }

        const { data: orderData, error } = await query.maybeSingle();

        if (orderData) {
          setPedido(orderData);

          // Asignar repartidor si ya viene en join o buscarlo
          if (orderData.repartidores) {
            const repObj = Array.isArray(orderData.repartidores) ? orderData.repartidores[0] : orderData.repartidores;
            setRepartidor(repObj);
            if (repObj?.id) {
              subscribeToDriver(repObj.id);
            }
          } else if (orderData.repartidor_id) {
            fetchRepartidor(orderData.repartidor_id).then(repData => {
              if (repData && repData.id) {
                subscribeToDriver(repData.id);
              }
            });
          }

          // Suscribirse a cambios en tiempo real del pedido
          // Limpiar canal anterior del pedido si existe
          if (orderChannelRef.current) {
            supabase.removeChannel(orderChannelRef.current);
            orderChannelRef.current = null;
          }

          const oc = supabase.channel(`order-tracker-${orderData.id}-${Date.now()}`)
            .on(
              'postgres_changes',
              { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `id=eq.${orderData.id}` },
              (payload) => {
                setPedido((prev: any) => ({ ...prev, ...payload.new }));

                if (payload.new.repartidor_id) {
                  fetchRepartidor(payload.new.repartidor_id).then(repData => {
                    if (repData && repData.id) {
                      subscribeToDriver(repData.id);
                    }
                  });
                }
              }
            ).subscribe();

          orderChannelRef.current = oc;
          setLoading(false);
        } else {
          console.warn('Pedido no encontrado:', error);
          setLoading(false);
        }
      } finally {
        isFetchingRef.current = false;
      }
    };

    fetchInitialData();

    // Actualizar datos al volver a la app / pestaña
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchInitialData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      // Bug #1 & #2 fix: cleanup usa refs, no variables locales
      if (orderChannelRef.current) {
        supabase.removeChannel(orderChannelRef.current);
        orderChannelRef.current = null;
      }
      if (driverChannelRef.current) {
        supabase.removeChannel(driverChannelRef.current);
        driverChannelRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pedidoId]);

  // Coordenadas base
  const defaultCenter = useMemo(() => ({ lat: 16.2516, lng: -92.1332 }), []); // Comitán por defecto
  
  // Origen del mandadito (donde se recoge el paquete o la tienda)
  const originLocation = useMemo(() => pedido?.lat && pedido?.lng 
    ? { lat: Number(pedido.lat), lng: Number(pedido.lng) } 
    : null, [pedido?.lat, pedido?.lng]);
  
  // Destino del mandadito (donde se entrega)
  const destinationLocation = useMemo(() => pedido?.lat_entrega && pedido?.lng_entrega
    ? { lat: Number(pedido.lat_entrega), lng: Number(pedido.lng_entrega) }
    : null, [pedido?.lat_entrega, pedido?.lng_entrega]);

  // Posición del repartidor
  const driverLocation = useMemo(() => repartidor?.lat && repartidor?.lng
    ? { lat: Number(repartidor.lat), lng: Number(repartidor.lng) }
    : null, [repartidor?.lat, repartidor?.lng]);

  const mapRef = useRef<google.maps.Map | null>(null);

  const fitMapToBounds = useCallback(() => {
    if (!mapRef.current || !window.google?.maps) return;
    
    const bounds = new window.google.maps.LatLngBounds();
    let count = 0;
    
    if (originLocation) { bounds.extend(originLocation); count++; }
    if (destinationLocation) { bounds.extend(destinationLocation); count++; }
    if (driverLocation) { bounds.extend(driverLocation); count++; }
    
    if (count > 1) {
      mapRef.current.fitBounds(bounds, { 
        top: 90, 
        right: 70, 
        bottom: window.innerWidth < 768 ? 320 : 90, 
        left: window.innerWidth < 768 ? 70 : 420 
      });
    } else if (count === 1) {
      mapRef.current.setZoom(15);
      mapRef.current.setCenter(driverLocation || destinationLocation || originLocation || defaultCenter);
    }
  }, [originLocation, destinationLocation, driverLocation, defaultCenter]);

  useEffect(() => {
    fitMapToBounds();
  }, [fitMapToBounds]);

  const lastDirectionsFetch = useRef<number>(0);

  // Calcular ruta y ETA
  useEffect(() => {
    const isEnCamino = pedido?.estado === 'en_camino' || pedido?.estado === 'en_camino_destino' || pedido?.estado === 'en_camino_origen';
    
    if (isEnCamino && driverLocation && destinationLocation && isLoaded && window.google) {
      const now = Date.now();
      if (now - lastDirectionsFetch.current < 30000) return; // Throttle 30s
      lastDirectionsFetch.current = now;

      const targetDest = (pedido?.estado === 'en_camino_origen' && originLocation) ? originLocation : destinationLocation;

      const directionsService = new window.google.maps.DirectionsService();
      directionsService.route(
        {
          origin: driverLocation,
          destination: targetDest,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === window.google.maps.DirectionsStatus.OK && result) {
            setDirections(result);
            if (result.routes[0]?.legs[0]?.duration?.text) {
              setEta(result.routes[0].legs[0].duration.text);
            }
          }
        }
      );
    } else if (!isEnCamino) {
      setDirections(null);
      setEta(null);
      lastDirectionsFetch.current = 0;
    }
  }, [pedido?.estado, driverLocation?.lat, driverLocation?.lng, destinationLocation?.lat, destinationLocation?.lng, originLocation?.lat, originLocation?.lng, isLoaded]);

  if (!pedidoId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <Package className="w-12 h-12 text-gray-400 mb-3" />
        <h2 className="text-xl font-bold text-gray-900 mb-1">ID de pedido inválido</h2>
        <p className="text-sm text-gray-500 mb-6">No encontramos el enlace de seguimiento correspondiente.</p>
        <button onClick={() => navigate('/')} className="px-6 py-3 bg-gray-900 text-white font-bold rounded-2xl">
          Ir al Inicio
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="w-9 h-9 text-yellow-500 animate-spin mb-3" />
        <p className="text-sm font-semibold text-gray-600">Localizando tu pedido...</p>
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <Package className="w-12 h-12 text-gray-400 mb-3" />
        <h2 className="text-xl font-bold text-gray-900 mb-1">Pedido no encontrado</h2>
        <p className="text-sm text-gray-500 mb-6">El pedido #{pedidoId} no existe o ya ha expirado.</p>
        <button onClick={() => navigate('/')} className="px-6 py-3 bg-gray-900 text-white font-bold rounded-2xl">
          Volver a la App
        </button>
      </div>
    );
  }

  // Mapeo de pasos (1 a 4)
  let currentStep = 1;
  const estado = pedido?.estado;
  if (estado === 'entregado') currentStep = 4;
  else if (estado === 'en_camino' || estado === 'en_camino_destino') currentStep = 3;
  else if (estado === 'en_camino_origen' || estado === 'asignado' || estado === 'ofrecido') currentStep = 2;
  else currentStep = 1;

  const isCompra = pedido?.descripcion?.includes('[COMPRA') || pedido?.descripcion?.toLowerCase().includes('compra');

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="h-[100dvh] w-full flex flex-col md:flex-row bg-gray-50 overflow-hidden font-sans relative"
    >
      {/* Botón Volver (Flotante superior) */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
        <button 
          onClick={() => navigate('/')}
          className="w-10 h-10 bg-white/90 backdrop-blur-md rounded-full shadow-lg border border-gray-100 flex items-center justify-center text-gray-800 hover:bg-white active:scale-95 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-full shadow-lg border border-gray-100 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-black text-gray-900">
            #{pedido.wb_message_id || pedido.id.slice(0, 6).toUpperCase()}
          </span>
        </div>
      </div>

      {/* MAPA (Fondo en móvil / Izquierda en Desktop) */}
      <div className="w-full h-full md:w-2/3 bg-gray-200 absolute md:relative inset-0 md:inset-auto z-0">
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center text-red-500 bg-red-50">
            Error al cargar el mapa de Google.
          </div>
        )}
        {!isLoaded && !loadError && (
          <div className="absolute inset-0 flex flex-col gap-2 items-center justify-center bg-gray-100 text-gray-400">
            <MapPin className="w-8 h-8 animate-bounce text-yellow-500" />
            <span className="text-sm font-medium">Cargando mapa en tiempo real...</span>
          </div>
        )}
        {isLoaded && (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            zoom={14}
            center={defaultCenter}
            onLoad={(map) => {
              mapRef.current = map;
              fitMapToBounds();
            }}
            options={{
              disableDefaultUI: true,
              zoomControl: true,
              gestureHandling: 'greedy',
              maxZoom: 18,
              styles: UBER_EATS_MAP_STYLE
            }}
          >
            {/* Polyline de Ruta */}
            {directions && (
              <Polyline
                path={directions.routes[0]?.legs?.flatMap(leg => leg.steps.flatMap(step => step.path)) || []}
                options={{
                  strokeColor: '#2563eb',
                  strokeWeight: 6,
                  strokeOpacity: 0.85,
                }}
              />
            )}

            {/* Marcador Origen (Paquete / Tienda) */}
            {originLocation && (
              <OverlayView
                position={originLocation}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              >
                <motion.div 
                  initial={{ scale: 0, y: 15 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                >
                  <div className="relative">
                    <div className="w-11 h-11 bg-white rounded-2xl shadow-xl border-[3px] border-yellow-500 flex items-center justify-center relative z-10">
                      {isCompra ? (
                        <ShoppingCart className="w-5 h-5 text-yellow-600" />
                      ) : (
                        <Package className="w-5 h-5 text-yellow-600" />
                      )}
                    </div>
                  </div>
                </motion.div>
              </OverlayView>
            )}

            {/* Marcador Destino (Casa del Cliente) */}
            {destinationLocation && (
              <OverlayView
                position={destinationLocation}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              >
                <motion.div 
                  initial={{ scale: 0, y: 15 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                >
                  <div className="relative">
                    <div className="w-11 h-11 bg-emerald-500 rounded-2xl shadow-xl border-[3px] border-white flex items-center justify-center relative z-10">
                      <Home className="w-5 h-5 text-white" />
                    </div>
                  </div>
                </motion.div>
              </OverlayView>
            )}

            {/* Marcador Repartidor (Moto en Vivo) */}
            {driverLocation && (
              <OverlayView
                position={driverLocation}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              >
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                >
                  <div className="relative">
                    <div className="w-12 h-12 bg-gray-900 rounded-full shadow-2xl border-[3px] border-white flex items-center justify-center z-10 relative">
                      <Bike className="w-6 h-6 text-white" />
                    </div>
                    {/* Efecto Pulso */}
                    <div className="absolute inset-0 bg-yellow-400 rounded-full animate-ping opacity-30 z-0"></div>
                  </div>
                </motion.div>
              </OverlayView>
            )}
          </GoogleMap>
        )}
      </div>

      {/* Floating Status Pill (Móvil cuando el sheet está colapsado) */}
      <AnimatePresence>
        {!isExpanded && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 left-4 right-4 md:hidden z-10 flex justify-center pointer-events-none"
          >
            <div className="bg-white/95 backdrop-blur-md px-5 py-2.5 rounded-full shadow-lg border border-gray-100 flex items-center gap-2.5">
              <div className={`w-2.5 h-2.5 rounded-full ${
                estado === 'cancelado' ? 'bg-red-500' :
                estado === 'entregado' ? 'bg-emerald-500' :
                estado?.includes('en_camino') ? 'bg-blue-600 animate-pulse' :
                'bg-yellow-500 animate-pulse'
              }`} />
              <span className="text-xs font-extrabold text-gray-900 uppercase tracking-wide">
                {estado === 'buscando_repartidor' ? 'Buscando Repartidor' :
                 estado === 'en_camino_origen' ? 'Recogiendo Paquete' :
                 estado === 'en_camino_destino' || estado === 'en_camino' ? 'En Camino a Tu Entrega' :
                 estado === 'entregado' ? '¡Entregado!' : (estado?.replace('_', ' ') || 'PROCESANDO')}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PANEL LATERAL (Bottom Sheet en móvil / Lateral en Desktop) */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className={`w-full bg-white shadow-[0_-15px_40px_rgba(0,0,0,0.12)] md:shadow-[-10px_0_30px_rgba(0,0,0,0.05)] z-20 flex flex-col absolute bottom-0 md:relative rounded-t-[32px] md:rounded-none h-[90vh] md:h-full md:w-1/3 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] md:translate-y-0 ${
          isExpanded ? 'translate-y-0' : 'translate-y-[56vh]'
        }`}
      >
        {/* Mobile Drag Handle */}
        <div 
          className="w-full flex justify-center items-center pt-4 pb-3 md:hidden shrink-0 cursor-pointer active:bg-gray-50 transition-colors rounded-t-[32px] relative"
          onClick={() => setIsExpanded(!isExpanded)}
          onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => {
            const touchEndY = e.changedTouches[0].clientY;
            if (touchStartY.current - touchEndY > 30) setIsExpanded(true);
            if (touchEndY - touchStartY.current > 30) setIsExpanded(false);
          }}
        >
          <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
          <div className="absolute right-6 bg-gray-100 p-1 rounded-full text-gray-500">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </div>
        </div>

        {/* Contenido con scroll */}
        <div className={`flex-1 p-5 md:p-6 custom-scrollbar ${isExpanded ? 'overflow-y-auto' : 'overflow-hidden md:overflow-y-auto'}`}>
          
          {/* Header de Estado Principal */}
          <div className="flex items-center justify-between mb-6 md:mt-2">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${
                estado?.includes('en_camino') ? 'bg-blue-600 text-white shadow-blue-500/20' : 
                estado === 'entregado' ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 
                estado === 'cancelado' ? 'bg-red-500 text-white shadow-red-500/20' :
                'bg-yellow-50 text-yellow-600 border border-yellow-200'
              }`}>
                {estado?.includes('en_camino') ? (
                  <Navigation className="w-6 h-6" />
                ) : estado === 'entregado' ? (
                  <CheckCircle2 className="w-7 h-7" />
                ) : isCompra ? (
                  <ShoppingCart className="w-7 h-7" />
                ) : (
                  <Package className="w-7 h-7" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-black text-gray-900 leading-tight uppercase">
                  {estado === 'buscando_repartidor' ? 'Buscando Repartidor' :
                   estado === 'en_camino_origen' ? 'Repartidor en Camino' :
                   estado === 'en_camino_destino' || estado === 'en_camino' ? 'Tu Pedido Va En Camino' :
                   estado === 'entregado' ? '¡Pedido Entregado!' :
                   estado === 'cancelado' ? 'Pedido Cancelado' : 'Procesando Envío'}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-[12px] font-bold text-gray-400">
                    {estado === 'buscando_repartidor' ? 'Asignando el repartidor más cercano' :
                     estado === 'en_camino_origen' ? 'Va por el paquete al origen' :
                     estado?.includes('en_camino') ? 'En ruta a la dirección de entrega' :
                     estado === 'entregado' ? '¡Gracias por confiar en Estrella!' : 'Mandadito en curso'}
                  </p>
                  
                  {eta && estado?.includes('en_camino') && (
                    <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1 text-[11px] font-bold border border-blue-100 shadow-sm">
                      <Clock className="w-3 h-3" />
                      {eta}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stepper Timeline Progress */}
          {estado !== 'cancelado' && (
            <div className={`mb-6 mt-2 ${!isExpanded ? 'hidden md:block' : 'block'}`}>
              <div className="flex items-center justify-between relative px-2">
                {/* Background Line */}
                <div className="absolute left-4 right-4 top-1/2 h-1 bg-gray-100 -z-10 -translate-y-1/2 rounded-full" />
                
                {/* Active Line */}
                <div 
                  className="absolute left-4 top-1/2 h-1 bg-emerald-500 -z-10 -translate-y-1/2 rounded-full transition-all duration-500"
                  style={{ width: `calc(${((currentStep - 1) / 3) * 100}% - 8px)` }}
                />

                {/* Steps */}
                {[1, 2, 3, 4].map((step) => (
                  <div key={step} className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                      step <= currentStep 
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' 
                        : 'bg-white border-2 border-gray-200 text-gray-400'
                    }`}>
                      {step < currentStep ? <CheckCircle2 className="w-4 h-4" /> : step}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2.5 px-0 text-[11px] font-bold">
                <span className={currentStep >= 1 ? 'text-emerald-600' : 'text-gray-400'}>Recibido</span>
                <span className={currentStep >= 2 ? 'text-emerald-600' : 'text-gray-400'}>Asignado</span>
                <span className={currentStep >= 3 ? 'text-emerald-600' : 'text-gray-400'}>En ruta</span>
                <span className={currentStep >= 4 ? 'text-emerald-600' : 'text-gray-400'}>Entregado</span>
              </div>
            </div>
          )}

          {/* Tarjeta del Repartidor Asignado */}
          {repartidor && (
            <div className="bg-gray-50 border border-gray-200/70 rounded-2xl p-4 shadow-sm mb-4">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Tu Repartidor Asignado</h4>
              <div className="flex items-center gap-3.5">
                {/* Bug #8 fix: w-14 h-14 — w-13 no existe en Tailwind */}
                <div className="w-14 h-14 rounded-2xl bg-white overflow-hidden shrink-0 border border-gray-200 shadow-sm flex items-center justify-center text-xl font-black text-gray-400">
                  {repartidor.foto_url ? (
                    <img src={repartidor.foto_url} alt={repartidor.nombre} className="w-full h-full object-cover" />
                  ) : (
                    <img 
                      src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(repartidor.nombre || 'Repartidor')}&backgroundColor=111827`} 
                      className="w-full h-full" 
                      alt="Driver avatar"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold text-gray-900 text-base leading-tight truncate">{repartidor.nombre}</p>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    {repartidor.vehiculo || 'Motocicleta'} {repartidor.placa ? `• ${repartidor.placa}` : ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Desglose de Direcciones */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-4 mb-4">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-yellow-50 border border-yellow-200 flex items-center justify-center shrink-0 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-yellow-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Punto de Recolección / Origen</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5 leading-snug">{pedido.direccion || 'Ubicación de origen'}</p>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-3 flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
                <Home className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Punto de Entrega / Destino</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5 leading-snug">{pedido.referencias_entrega || 'Ubicación de entrega'}</p>
              </div>
            </div>
          </div>

          {/* Toggle de Detalles del Pedido */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <button 
              onClick={() => setShowDetails(!showDetails)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-bold text-gray-800">Ver detalles del mandadito</span>
              {showDetails ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>
            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-4 pb-4 overflow-hidden"
                >
                  <div className="pt-3 border-t border-gray-100 text-sm text-gray-600 font-medium whitespace-pre-wrap leading-relaxed">
                    {pedido.descripcion || 'Sin descripción adicional.'}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center text-sm font-bold text-gray-900">
                    <span>Total pagado/a pagar:</span>
                    <span className="text-base text-gray-900">${pedido.total || 0}.00 MXN</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>

        {/* Action Buttons (Fijo al fondo) */}
        <div className="p-4 md:p-6 border-t border-gray-100 bg-white grid grid-cols-2 gap-3 shrink-0 pb-safe">
          <a 
            href={repartidor?.telefono ? `https://wa.me/52${repartidor.telefono.replace(/\D/g, '')}?text=Hola,%20soy%20el%20cliente%20del%20mandadito%20${pedido.wb_message_id || pedido.id.slice(0, 6)}` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { if (!repartidor?.telefono) e.preventDefault(); }}
            className={`flex items-center justify-center gap-2 py-3.5 rounded-2xl transition-all ${
              repartidor?.telefono 
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold active:scale-95' 
                : 'bg-gray-100 text-gray-400 cursor-not-allowed font-semibold'
            }`}
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-sm">WhatsApp</span>
          </a>
          
          <a 
            href={repartidor?.telefono ? `tel:${repartidor.telefono}` : '#'}
            onClick={(e) => { if (!repartidor?.telefono) e.preventDefault(); }}
            className={`flex items-center justify-center gap-2 py-3.5 rounded-2xl transition-all ${
              repartidor?.telefono 
                ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold active:scale-95' 
                : 'bg-gray-100 text-gray-400 cursor-not-allowed font-semibold'
            }`}
          >
            <Phone className="w-5 h-5" />
            <span className="text-sm">Llamar</span>
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
}

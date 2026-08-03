import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { 
  Package, 
  CheckCircle2, 
  ShieldCheck, 
  Star, 
  MessageCircle, 
  Phone, 
  Navigation, 
  Home, 
  Bike, 
  Clock, 
  ShoppingCart 
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { GoogleMap, OverlayView, Polyline } from '@react-google-maps/api';
import { UBER_EATS_MAP_STYLE } from '../../utils/mapStyles';

interface ActiveTrackingViewProps {
  setCurrentView: (view: string) => void;
  isLoaded: boolean; // Bug #3 fix: recibir isLoaded desde MainShell en lugar de chequear window.google
}

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

export function ActiveTrackingView({ setCurrentView, isLoaded }: ActiveTrackingViewProps) {
  const { pedidoActivo, setPedidoActivo } = useAppStore();
  const [repartidor, setRepartidor] = useState<any>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const touchStartY = useRef(0);
  const mapRef = useRef<google.maps.Map | null>(null);
  const lastDirectionsFetch = useRef<number>(0);

  // Bug #7 fix: mover el cálculo de estado ANTES de los efectos pero DESPUÉS del guard implícito.
  // Usamos valores opcionales seguros aquí para que no crashee si pedidoActivo es null.
  const estado = pedidoActivo?.estado ?? null;
  const isCompra = !!(
    pedidoActivo?.descripcion?.includes('[COMPRA') ||
    pedidoActivo?.descripcion?.toLowerCase().includes('compra')
  );

  let currentStep = 1;
  if (estado === 'entregado') currentStep = 4;
  else if (estado === 'en_camino' || estado === 'en_camino_destino') currentStep = 3;
  else if (estado === 'en_camino_origen' || estado === 'asignado' || estado === 'ofrecido') currentStep = 2;

  // Repartidor inicial desde el pedido
  useEffect(() => {
    if (!pedidoActivo) return;

    const rep = Array.isArray(pedidoActivo.repartidores)
      ? pedidoActivo.repartidores[0]
      : pedidoActivo.repartidores;

    if (rep) {
      setRepartidor(rep);
    } else if (pedidoActivo.repartidor_id) {
      supabase
        .from('repartidores')
        .select('*')
        .or(`id.eq.${pedidoActivo.repartidor_id},user_id.eq.${pedidoActivo.repartidor_id}`)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setRepartidor(data);
        });
    }
  }, [pedidoActivo?.id]); // Solo re-ejecutar si cambia el pedido, no en cada actualización de estado

  // Bug #1 & #2 fix: Usar ref para el canal del repartidor para evitar el closure leak
  const driverChannelRef = useRef<any>(null);

  useEffect(() => {
    if (!repartidor?.id) return;

    // Limpiar canal anterior si existe antes de crear uno nuevo
    if (driverChannelRef.current) {
      supabase.removeChannel(driverChannelRef.current);
      driverChannelRef.current = null;
    }

    const channel = supabase.channel(`driver-live-${repartidor.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'repartidores', filter: `id=eq.${repartidor.id}` },
        (payload) => {
          setRepartidor((prev: any) => prev ? {
            ...prev,
            lat: payload.new.lat,
            lng: payload.new.lng
          } : prev);
        }
      ).subscribe();

    driverChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      driverChannelRef.current = null;
    };
  }, [repartidor?.id]);

  const defaultCenter = useMemo(() => ({ lat: 16.2516, lng: -92.1332 }), []);

  const originLocation = useMemo(() => pedidoActivo?.lat && pedidoActivo?.lng
    ? { lat: Number(pedidoActivo.lat), lng: Number(pedidoActivo.lng) }
    : null, [pedidoActivo?.lat, pedidoActivo?.lng]);

  const destinationLocation = useMemo(() => pedidoActivo?.lat_entrega && pedidoActivo?.lng_entrega
    ? { lat: Number(pedidoActivo.lat_entrega), lng: Number(pedidoActivo.lng_entrega) }
    : null, [pedidoActivo?.lat_entrega, pedidoActivo?.lng_entrega]);

  const driverLocation = useMemo(() => repartidor?.lat && repartidor?.lng
    ? { lat: Number(repartidor.lat), lng: Number(repartidor.lng) }
    : null, [repartidor?.lat, repartidor?.lng]);

  const fitMapToBounds = useCallback(() => {
    if (!mapRef.current || !window.google?.maps) return;

    const bounds = new window.google.maps.LatLngBounds();
    let count = 0;

    if (originLocation) { bounds.extend(originLocation); count++; }
    if (destinationLocation) { bounds.extend(destinationLocation); count++; }
    if (driverLocation) { bounds.extend(driverLocation); count++; }

    if (count > 1) {
      mapRef.current.fitBounds(bounds, {
        top: 80,
        right: 60,
        bottom: 320,
        left: 60
      });
    } else if (count === 1) {
      mapRef.current.setZoom(15);
      mapRef.current.setCenter(driverLocation || destinationLocation || originLocation || defaultCenter);
    }
  }, [originLocation, destinationLocation, driverLocation, defaultCenter]);

  useEffect(() => {
    fitMapToBounds();
  }, [fitMapToBounds]);

  // Ruta y ETA
  useEffect(() => {
    const isEnCamino = estado === 'en_camino' || estado === 'en_camino_destino' || estado === 'en_camino_origen';

    if (isEnCamino && driverLocation && destinationLocation && isLoaded && window.google) {
      const now = Date.now();
      if (now - lastDirectionsFetch.current < 30000) return;
      lastDirectionsFetch.current = now;

      const targetDest = (estado === 'en_camino_origen' && originLocation) ? originLocation : destinationLocation;

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
  }, [estado, driverLocation?.lat, driverLocation?.lng, destinationLocation?.lat, destinationLocation?.lng, originLocation?.lat, originLocation?.lng, isLoaded]);

  // Bug #7 fix: guard DESPUÉS de todos los hooks
  if (!pedidoActivo) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <Package className="w-12 h-12 text-gray-400 mb-3" />
        <h2 className="text-xl font-bold text-gray-900 mb-1">No hay envíos activos</h2>
        <p className="text-sm text-gray-500 mb-6">Cuando solicites un paquete o mandadito, lo podrás rastrear en vivo aquí.</p>
        <button
          onClick={() => setCurrentView('home')}
          className="px-6 py-3 bg-gray-900 text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-all"
        >
          Volver al Inicio
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden bg-gray-50">

      {/* MAPA GOOGLE EN TIEMPO REAL — Bug #3 fix: usar isLoaded en lugar de window.google */}
      <div className="flex-1 w-full bg-gray-200 relative z-0">
        {!isLoaded && (
          <div className="absolute inset-0 flex flex-col gap-2 items-center justify-center bg-gray-100 text-gray-400">
            <Bike className="w-8 h-8 animate-bounce text-yellow-500" />
            <span className="text-sm font-medium">Cargando mapa...</span>
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
            {/* Ruta Azul */}
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

            {/* Marcador Origen */}
            {originLocation && (
              <OverlayView
                position={originLocation}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              >
                <div className="absolute -translate-x-1/2 -translate-y-1/2">
                  {/* Bug #8 & #9 fix: w-10 h-10 y w-5 h-5 — w-13/w-4.5 no existen en Tailwind */}
                  <div className="w-10 h-10 bg-white rounded-2xl shadow-xl border-[3px] border-yellow-500 flex items-center justify-center">
                    {isCompra ? (
                      <ShoppingCart className="w-5 h-5 text-yellow-600" />
                    ) : (
                      <Package className="w-5 h-5 text-yellow-600" />
                    )}
                  </div>
                </div>
              </OverlayView>
            )}

            {/* Marcador Destino */}
            {destinationLocation && (
              <OverlayView
                position={destinationLocation}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              >
                <div className="absolute -translate-x-1/2 -translate-y-1/2">
                  <div className="w-10 h-10 bg-emerald-500 rounded-2xl shadow-xl border-[3px] border-white flex items-center justify-center">
                    <Home className="w-5 h-5 text-white" />
                  </div>
                </div>
              </OverlayView>
            )}

            {/* Marcador Repartidor Moto */}
            {driverLocation && (
              <OverlayView
                position={driverLocation}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              >
                <div className="absolute -translate-x-1/2 -translate-y-1/2">
                  <div className="relative">
                    <div className="w-11 h-11 bg-gray-900 rounded-full shadow-2xl border-[3px] border-white flex items-center justify-center z-10 relative">
                      <Bike className="w-5 h-5 text-white" />
                    </div>
                    <div className="absolute inset-0 bg-yellow-400 rounded-full animate-ping opacity-30 z-0"></div>
                  </div>
                </div>
              </OverlayView>
            )}
          </GoogleMap>
        )}
      </div>

      {/* Top Header flotante */}
      <div className="absolute top-0 inset-x-0 p-4 pt-6 z-20 flex justify-between items-center pointer-events-none mt-safe">
        <button
          onClick={() => setCurrentView('home')}
          className="pointer-events-auto p-3 bg-white/90 backdrop-blur-md rounded-full shadow-md text-gray-900 hover:bg-white active:scale-95 transition-all border border-gray-100"
        >
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
        </button>
        <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-full shadow-md font-extrabold text-xs text-gray-900 border border-gray-100">
          #{pedidoActivo.wb_message_id || pedidoActivo.id.slice(0, 6).toUpperCase()}
        </div>
      </div>

      {/* Bottom Sheet Card — Bug #4 fix: clases correctas para collapsed/expanded */}
      <div
        className={`absolute bottom-0 inset-x-0 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-30 flex flex-col pt-3 pb-8 px-6 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] rounded-t-[2.5rem] ${
          isExpanded ? 'translate-y-0' : 'translate-y-[52%]'
        }`}
      >
        {/* Mobile Drag Handle */}
        <div
          className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
          onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => {
            const touchEndY = e.changedTouches[0].clientY;
            if (touchStartY.current - touchEndY > 30) setIsExpanded(true);
            if (touchEndY - touchStartY.current > 30) setIsExpanded(false);
          }}
        ></div>

        {/* Status Header */}
        <div className="flex items-center gap-4 mb-6 mt-1">
          {/* Bug #8 fix: w-14 h-14 en vez de w-13 h-13 */}
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border ${
            currentStep === 4 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
            currentStep === 3 ? 'bg-blue-50 text-blue-600 border-blue-200' :
            'bg-yellow-50 text-yellow-600 border-yellow-200'
          }`}>
            {currentStep === 4 ? <CheckCircle2 className="w-6 h-6" /> :
             currentStep === 3 ? <Navigation className="w-6 h-6" /> :
             <Package className="w-6 h-6" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-gray-900 leading-tight truncate">
                {estado === 'buscando_repartidor' ? 'Buscando Repartidor' :
                 estado === 'en_camino_origen' ? 'Recogiendo Paquete' :
                 estado?.includes('en_camino') ? 'En Camino a Tu Entrega' :
                 estado === 'entregado' ? '¡Entregado con Éxito!' : 'Mandadito en Curso'}
              </h2>
              {eta && estado?.includes('en_camino') && (
                <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1 text-[10px] font-bold border border-blue-100 shrink-0">
                  <Clock className="w-3 h-3" />
                  {eta}
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-gray-500 mt-0.5">
              {estado === 'buscando_repartidor' ? 'Encontramos a un conductor en breve' :
               estado === 'en_camino_origen' ? 'El conductor va hacia el punto de recolección' :
               estado?.includes('en_camino') ? 'Tu pedido está en ruta directa a tu dirección' :
               'Tu mandadito ha llegado a su destino'}
            </p>
          </div>
        </div>

        {/* Stepper Progress */}
        <div className="relative mb-6">
          <div className="absolute top-1/2 left-2 right-2 h-1 bg-gray-100 -translate-y-1/2 rounded-full"></div>
          <div
            className="absolute top-1/2 left-2 h-1 bg-emerald-500 -translate-y-1/2 rounded-full transition-all duration-700 ease-out"
            style={{ width: `calc(${((currentStep - 1) / 3) * 100}% - 12px)` }}
          ></div>
          <div className="flex justify-between relative z-10 px-0">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`w-4 h-4 rounded-full border-2 transition-colors duration-500 ${
                  step < currentStep ? 'bg-emerald-500 border-emerald-500' :
                  step === currentStep ? 'bg-white border-emerald-500 ring-2 ring-emerald-100' :
                  'bg-white border-gray-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Repartidor Info */}
        {repartidor && currentStep < 4 && (
          <div className="bg-gray-50 rounded-2xl p-3.5 flex items-center justify-between border border-gray-100 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-white border border-gray-200 overflow-hidden shadow-sm flex items-center justify-center text-lg font-black text-gray-400">
                {repartidor.foto_url ? (
                  <img src={repartidor.foto_url} alt="Driver" className="w-full h-full object-cover" />
                ) : (
                  <img
                    src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(repartidor.nombre || 'Repartidor')}&backgroundColor=111827`}
                    className="w-full h-full"
                    alt="Driver avatar"
                  />
                )}
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm leading-tight">{repartidor.nombre}</p>
                <div className="flex items-center text-[11px] font-medium text-gray-500 mt-0.5">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 mr-1" />
                  5.0 • {repartidor.vehiculo || 'Moto'} {repartidor.placa ? `• ${repartidor.placa}` : ''}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <a
                href={repartidor.telefono ? `https://wa.me/52${repartidor.telefono.replace(/\D/g, '')}` : '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { if (!repartidor.telefono) e.preventDefault(); }}
                className="w-9 h-9 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full flex items-center justify-center hover:bg-emerald-100 transition-colors shadow-sm"
              >
                <MessageCircle className="w-4 h-4" />
              </a>
              <a
                href={repartidor.telefono ? `tel:${repartidor.telefono}` : '#'}
                onClick={(e) => { if (!repartidor.telefono) e.preventDefault(); }}
                className="w-9 h-9 bg-blue-50 text-blue-600 border border-blue-200 rounded-full flex items-center justify-center hover:bg-blue-100 transition-colors shadow-sm"
              >
                <Phone className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}

        {/* Botón de finalización */}
        {currentStep === 4 && (
          <button
            onClick={() => {
              setPedidoActivo(null);
              setCurrentView('home');
            }}
            className="w-full bg-gray-900 text-white font-bold py-3.5 rounded-2xl shadow-xl hover:bg-gray-800 active:scale-95 transition-all text-base mt-2"
          >
            Volver al inicio
          </button>
        )}
      </div>
    </div>
  );
}

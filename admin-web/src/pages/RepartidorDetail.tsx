import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, MapPin, Navigation, Phone, ShieldCheck, CheckCircle2, Ban, Map as MapIcon } from 'lucide-react';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import { toast } from 'sonner';
import { handleDbError } from '../lib/errorHandler';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '1rem'
};

const getCustomPin = (color: string) => {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 0C11.1634 0 4 7.16344 4 16C4 28 20 40 20 40C20 40 36 28 36 16C36 7.16344 28.8366 0 20 0Z" fill="${color}"/>
      <circle cx="20" cy="16" r="8" fill="white"/>
      <path d="M22.5 17H17.5V18.5H22.5V17Z" fill="${color}"/>
      <path d="M20.5 13.5H19.5V17H20.5V13.5Z" fill="${color}"/>
    </svg>
  `)}`;
};

const uberMapStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#f5f5f5" }] },
  { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#f5f5f5" }] },
  { "featureType": "administrative.land_parcel", "elementType": "labels.text.fill", "stylers": [{ "color": "#bdbdbd" }] },
  { "featureType": "poi", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] },
  { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#ffffff" }] },
  { "featureType": "road.arterial", "elementType": "geometry", "stylers": [{ "color": "#ffffff" }, { "weight": 1.5 }] },
  { "featureType": "road.arterial", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#dadada" }, { "weight": 2 }] },
  { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
  { "featureType": "road.local", "elementType": "geometry", "stylers": [{ "color": "#ffffff" }, { "weight": 1 }] },
  { "featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] },
  { "featureType": "transit.line", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] },
  { "featureType": "transit.station", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#c9c9c9" }] },
  { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] }
];

export function RepartidorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [repartidor, setRepartidor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  
  // Coordenadas en tiempo real y Rutas
  const [position, setPosition] = useState({ lat: 19.4326, lng: -99.1332 }); // default CDMX
  const [rutaHistorial, setRutaHistorial] = useState<google.maps.LatLngLiteral[]>([]);
  const [showRuta, setShowRuta] = useState(false);

  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });

  const onLoad = useCallback(function callback(map: google.maps.Map) {
    mapRef.current = map;
  }, []);

  const onUnmount = useCallback(function callback() {
    mapRef.current = null;
  }, []);

  useEffect(() => {
    const fetchRepartidor = async () => {
      try {
        setLoading(true);
        if (!id) return;
        
        const { data, error } = await supabase
          .from('repartidores')
          .select('*')
          .eq('id', id)
          .single();
          
        if (error) throw error;
        setRepartidor(data);
        
        if (data.lat && data.lng) {
          setPosition({
            lat: data.lat,
            lng: data.lng
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRepartidor();
  }, [id]);

  // Suscripción a tiempo real
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`repartidor_tracking_${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'repartidores',
          filter: `id=eq.${id}`
        },
        (payload) => {
          console.log('Update recibido en tiempo real:', payload.new);
          const newRep = payload.new as any;
          setRepartidor(newRep);
          if (newRep.lat && newRep.lng) {
            const newPos = {
              lat: newRep.lat,
              lng: newRep.lng
            };
            setPosition(newPos);
            // Centrar el mapa automáticamente si se mueve
            if (mapRef.current) {
               mapRef.current.panTo(newPos);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const toggleRuta = async () => {
    if (showRuta) {
      setShowRuta(false);
      return;
    }
    
    // Simular o hacer fetch
    try {
      const { data, error } = await supabase
        .from('rutas_historial')
        .select('lat, lng')
        .eq('repartidor_id', id)
        .order('created_at', { ascending: false })
        .limit(50);
        
      if (error || !data || data.length === 0) {
        // Fallback simulación para Demo: Generar puntos artificiales desde la posición actual
        const fakeRoute = [];
        let currLat = position.lat;
        let currLng = position.lng;
        for (let i = 0; i < 20; i++) {
          fakeRoute.push({ lat: currLat, lng: currLng });
          currLat -= 0.0005 + (Math.random() * 0.0002);
          currLng -= 0.0005 + (Math.random() * 0.0002);
        }
        setRutaHistorial(fakeRoute);
        toast.info("Mostrando ruta simulada (No hay datos reales aún)");
      } else {
        setRutaHistorial(data);
      }
      setShowRuta(true);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleBan = async () => {
    if (!repartidor) return;
    const nuevoEstado = !repartidor.activo;
    
    // Optistic UI
    setRepartidor({ ...repartidor, activo: nuevoEstado });
    
    const { error } = await supabase.from('repartidores').update({ activo: nuevoEstado }).eq('id', repartidor.id);
    
    if (error) {
      handleDbError(error, 'No se pudo actualizar el estado del repartidor');
      setRepartidor({ ...repartidor, activo: !nuevoEstado }); // revert
    } else {
      toast.success(nuevoEstado ? 'Repartidor restaurado y en línea' : 'Repartidor desconectado exitosamente');
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-zinc-500">Cargando perfil del repartidor...</div>;
  }

  if (!repartidor) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <h2 className="text-xl font-bold text-zinc-700">Repartidor no encontrado</h2>
        <button onClick={() => navigate('/repartidores')} className="mt-4 px-4 py-2 bg-zinc-900 text-white rounded-lg">Volver</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto lg:h-[calc(100vh-8rem)] flex flex-col">
      {/* Top Navigation */}
      <button 
        onClick={() => navigate('/repartidores')}
        className="flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        <ArrowLeft size={16} /> Volver a Flota
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 lg:min-h-0">
        {/* Columna Izquierda: Perfil y Stats */}
        <div className="lg:col-span-1 flex flex-col gap-6 lg:overflow-y-auto custom-scrollbar">
           
           {/* Perfil */}
           <div className={`p-6 rounded-2xl border flex flex-col items-center text-center shadow-sm ${!repartidor.activo ? 'bg-rose-50 border-rose-200' : 'bg-white border-zinc-200'}`}>
              <div className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl font-black mb-4 shadow-sm border ${!repartidor.activo ? 'bg-rose-100 border-rose-300 text-rose-600' : 'bg-zinc-100 border-zinc-300 text-zinc-900'}`}>
                {repartidor.nombre ? repartidor.nombre.charAt(0).toUpperCase() : 'R'}
              </div>
              <h1 className={`text-2xl font-black tracking-tight leading-tight ${!repartidor.activo ? 'text-rose-900' : 'text-zinc-900'}`}>
                {repartidor.nombre}
              </h1>
              <span className={`mt-2 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${repartidor.activo ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-white text-zinc-500 border-zinc-200'}`}>
                {repartidor.activo ? 'Activo / Online' : 'Inactivo'}
              </span>
           </div>

           {/* Detalles Info */}
           <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 space-y-4">
              <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Información Operativa</h4>
              
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-zinc-100 rounded-xl text-zinc-600"><Phone size={18} /></div>
                <div>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Teléfono</p>
                  <p className="text-sm font-bold text-zinc-900 mt-0.5 tracking-tight">{repartidor.telefono || 'No registrado'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-zinc-100 rounded-xl text-zinc-600"><Navigation size={18} /></div>
                <div>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Vehículo y Placa</p>
                  <p className="text-sm font-bold text-zinc-900 mt-0.5 tracking-tight">{repartidor.vehiculo || 'No registrado'} - {repartidor.placa}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl"><MapPin size={18} /></div>
                <div>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Coordenadas Live</p>
                  <p className="text-xs font-bold text-emerald-900 mt-0.5 tracking-tight">
                    {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
                  </p>
                </div>
              </div>
           </div>

           {/* Danger Zone */}
           <div className="bg-white p-6 rounded-2xl shadow-sm border border-rose-200 mt-auto">
             <h4 className="text-[11px] font-bold text-rose-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <ShieldCheck size={16} /> Controles Críticos
              </h4>
              <button 
                onClick={() => setIsConfirmOpen(true)}
                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors text-xs tracking-tight shadow-sm ${
                  !repartidor.activo 
                    ? 'bg-zinc-900 hover:bg-black text-white'
                    : 'bg-white border border-rose-200 hover:bg-rose-50 text-rose-600'
                }`}
              >
                {!repartidor.activo ? (
                  <><CheckCircle2 size={16} /> Restaurar Acceso a la Flota</>
                ) : (
                  <><Ban size={16} /> Suspender / Desconectar Repartidor</>
                )}
              </button>
           </div>
        </div>

        {/* Columna Derecha: Live Tracking Map */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 relative h-64 md:h-80 lg:h-auto lg:min-h-[400px]">
           <div className="absolute top-6 left-6 z-10 bg-white/90 backdrop-blur-sm p-3 rounded-xl shadow-md border border-zinc-200 flex flex-col gap-3">
             <div>
               <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Rastreo por Satélite (GPS)</p>
               <p className="text-sm font-black text-zinc-900 mt-1 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Conexión en Tiempo Real
               </p>
             </div>
             <button
               onClick={toggleRuta}
               className={`text-xs font-bold px-3 py-2 rounded-lg transition-colors border flex items-center gap-2 ${showRuta ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}
             >
               <MapIcon size={14} />
               {showRuta ? 'Ocultar Migas de Pan' : 'Auditar Última Ruta'}
             </button>
           </div>

           <div className="w-full h-full rounded-xl overflow-hidden bg-zinc-100 flex items-center justify-center">
             {!isLoaded ? (
                <div className="flex flex-col items-center text-zinc-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-zinc-400 mb-3"></div>
                  <p className="text-xs font-bold uppercase tracking-widest">Cargando Mapas...</p>
                </div>
             ) : (
               <GoogleMap
                 mapContainerStyle={mapContainerStyle}
                 center={position}
                 zoom={17}
                 onLoad={onLoad}
                 onUnmount={onUnmount}
                 options={{
                   disableDefaultUI: false,
                   zoomControl: true,
                   streetViewControl: false,
                   mapTypeControl: false,
                   fullscreenControl: true,
                   styles: uberMapStyle
                 }}
               >
                 {showRuta && rutaHistorial.length > 0 && (
                   <Polyline
                     path={rutaHistorial}
                     options={{
                       strokeColor: "#4f46e5", // Indigo-600
                       strokeOpacity: 0.8,
                       strokeWeight: 4,
                       geodesic: true,
                     }}
                   />
                 )}
                 <Marker 
                   position={position}
                   animation={google.maps.Animation.DROP}
                   icon={{
                     url: getCustomPin(repartidor.activo ? '#10b981' : '#f43f5e'),
                     scaledSize: new window.google.maps.Size(40, 40),
                     anchor: new window.google.maps.Point(20, 20)
                   }}
                 />
               </GoogleMap>
             )}
           </div>
        </div>
      </div>

      <ConfirmSheet 
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={toggleBan}
        title={repartidor?.activo ? "Desconectar Repartidor" : "Restaurar Acceso"}
        description={repartidor?.activo 
          ? `¿Estás seguro que deseas suspender a ${repartidor?.nombre}? Se desconectará su GPS y no podrá recibir más pedidos.`
          : `¿Deseas restaurar el acceso a ${repartidor?.nombre}? Volverá a aparecer en línea y recibir asignaciones.`
        }
        confirmText={repartidor?.activo ? "Desconectar" : "Restaurar"}
        cancelText="Cancelar"
        isDestructive={repartidor?.activo}
      />
    </div>
  );
}

import { useCallback, useRef, useState, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, DirectionsRenderer } from '@react-google-maps/api';
import { Navigation, Store, Bike, Crosshair } from 'lucide-react';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '0.75rem'
};

// Estilo gris/plateado
const radarMapStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#f5f5f5" }] },
  { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#f5f5f5" }] },
  { "featureType": "administrative.land_parcel", "elementType": "labels.text.fill", "stylers": [{ "color": "#bdbdbd" }] },
  { "featureType": "poi", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] },
  { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#ffffff" }] },
  { "featureType": "road.arterial", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#dadada" }] },
  { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
  { "featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] },
  { "featureType": "transit.line", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] },
  { "featureType": "transit.station", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#c9c9c9" }] },
  { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] }
];

const getCustomPin = (color: string) => {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C8.268 0 2 6.268 2 14C2 23.5 16 32 16 32C16 32 30 23.5 30 14C30 6.268 23.732 0 16 0Z" fill="${color}"/>
      <circle cx="16" cy="14" r="6" fill="white"/>
    </svg>
  `)}`;
};

const getBikePin = (color: string) => {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 0C10.059 0 2 8.059 2 18C2 30 20 40 20 40C20 40 38 30 38 18C38 8.059 29.941 0 20 0Z" fill="${color}"/>
      <g transform="translate(8, 6)" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="18.5" cy="17.5" r="3.5" fill="none" />
        <circle cx="5.5" cy="17.5" r="3.5" fill="none" />
        <circle cx="15" cy="5" r="1" fill="white" />
        <path d="M12 17.5V14l-3-3 4-3 2 3h2" fill="none" />
      </g>
    </svg>
  `)}`;
};

const LIBRARIES: ("visualization" | "places" | "drawing" | "geometry")[] = ['visualization'];

export function RadarMap({ pedidos, repartidores }: { pedidos: any[], repartidores: any[] }) {
  const [selectedRepartidorId, setSelectedRepartidorId] = useState<string | null>(null);
  const [selectedPedidoId, setSelectedPedidoId] = useState<string | null>(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: LIBRARIES,
    version: '3.64'
  });

  const onLoad = useCallback(function callback(map: google.maps.Map) {
    mapRef.current = map;
  }, []);

  const onUnmount = useCallback(function callback() {
    mapRef.current = null;
  }, []);

  const repartidoresActivos = repartidores.filter(r => r.lat && r.lng && r.activo);
  
  // Pedidos que queremos mostrar en el mapa (que tienen coords de restaurante)
  // Idealmente queremos restaurantes de pedidos en curso
  const pedidosEnCurso = pedidos.filter(p => ['en_camino', 'asignado', 'preparando', 'buscando_repartidor'].includes(p.estado) && p.lat && p.lng);

  const handleCenterFleet = () => {
    if (!mapRef.current || repartidoresActivos.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    repartidoresActivos.forEach(rep => {
      if (rep.lat && rep.lng) {
        bounds.extend({ lat: parseFloat(rep.lat), lng: parseFloat(rep.lng) });
      }
    });
    mapRef.current.fitBounds(bounds);
  };

  useEffect(() => {
    if (!selectedRepartidorId || !window.google) {
      setEta(null);
      return;
    }

    const rep = repartidoresActivos.find(r => r.id === selectedRepartidorId);
    if (!rep || !rep.lat || !rep.lng) return;

    // Buscar pedido asignado a este repartidor
    const pedido = pedidosEnCurso.find(p => p.repartidor_id === rep.user_id && p.lat && p.lng);
    if (!pedido) {
      setEta(null);
      return;
    }

    setEta('Calculando...');

    setEta('Trazando ruta...');
    setDirections(null);

    const directionsService = new google.maps.DirectionsService();
    directionsService.route({
      origin: { lat: parseFloat(rep.lat), lng: parseFloat(rep.lng) },
      destination: { lat: parseFloat(pedido.lat), lng: parseFloat(pedido.lng) },
      travelMode: google.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status === 'OK' && result) {
        setDirections(result);
        const leg = result.routes[0].legs[0];
        setEta(`${leg.duration?.text} (${leg.distance?.text})`);
      } else {
        setEta(`Ruta no disponible (${status})`);
      }
    });
  }, [selectedRepartidorId]); // Solo recalcular al hacer clic en un repartidor para evitar loops infinitos

  return (
    <div className="w-full h-full relative bg-zinc-100">
      <div className="absolute top-4 left-4 z-10 bg-white/90 text-zinc-900 p-3 rounded-xl shadow-lg border border-zinc-200 backdrop-blur-md">
        <h3 className="font-bold text-xs uppercase tracking-widest text-zinc-900 mb-2 flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          Radar en Vivo
        </h3>
        <p className="text-xs text-zinc-500 mb-3">
          Mostrando {repartidoresActivos.length} repartidores
        </p>
        <button 
          onClick={handleCenterFleet}
          disabled={repartidoresActivos.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-black disabled:opacity-50 text-white text-xs font-bold py-2 rounded-lg transition-colors"
        >
          <Crosshair size={14} />
          Centrar Flota
        </button>
      </div>

      {!isLoaded ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-zinc-400 mb-3"></div>
          <p className="text-xs font-bold uppercase tracking-widest">Cargando Google Maps...</p>
        </div>
      ) : (
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={{ lat: 16.2326, lng: -92.1285 }} // Default center
          zoom={14}
          onLoad={onLoad}
          onUnmount={onUnmount}
          options={{
            disableDefaultUI: false,
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true,
            styles: radarMapStyle
          }}
        >
          {/* Marcadores de Repartidores */}
          {repartidoresActivos.map(rep => {
            const iconSettings = rep.foto_url 
              ? {
                  url: rep.foto_url,
                  scaledSize: new google.maps.Size(36, 36),
                }
              : {
                  url: getBikePin('#10b981'), // Emerald 500
                  scaledSize: new google.maps.Size(40, 40),
                  anchor: new google.maps.Point(20, 40)
                };

            const isHovered = hoveredMarkerId === `rep-${rep.id}`;
            
            return (
              <Marker 
                key={`rep-${rep.id}`}
                position={{ lat: parseFloat(rep.lat), lng: parseFloat(rep.lng) }}
                title={rep.nombre}
                icon={iconSettings}
                onClick={() => setSelectedRepartidorId(rep.id)}
                onMouseOver={() => setHoveredMarkerId(`rep-${rep.id}`)}
                onMouseOut={() => setHoveredMarkerId(null)}
                animation={isHovered && window.google ? google.maps.Animation.BOUNCE : undefined}
              >
                {selectedRepartidorId === rep.id && (
                  <InfoWindow onCloseClick={() => setSelectedRepartidorId(null)}>
                    <div className="p-1 flex flex-col gap-1 min-w-[140px]">
                      <p className="font-bold text-zinc-900 text-sm tracking-tight">{rep.nombre}</p>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 uppercase">
                        <Navigation size={10} /> En Línea
                      </div>
                      {eta && (
                        <div className="mt-1 pt-1 border-t border-zinc-100 text-[10px] font-bold text-zinc-700 flex flex-col">
                          <span className="text-[9px] text-zinc-400 uppercase tracking-widest mb-0.5">Tiempo a Destino</span>
                          <span className="text-emerald-600">{eta}</span>
                        </div>
                      )}
                    </div>
                  </InfoWindow>
                )}
              </Marker>
            )
          })}

          {/* Marcadores de Pedidos (Restaurantes) */}
          {pedidosEnCurso.map(p => {
            const isHovered = hoveredMarkerId === `ped-${p.id}`;
            
            return (
              <Marker 
                key={`ped-${p.id}`}
                position={{ lat: parseFloat(p.lat), lng: parseFloat(p.lng) }}
                title={p.restaurante}
                icon={{
                  url: getCustomPin('#f59e0b'), // Amber 500
                  scaledSize: new google.maps.Size(28, 28),
                  anchor: new google.maps.Point(14, 28)
                }}
                onClick={() => setSelectedPedidoId(p.id)}
                onMouseOver={() => setHoveredMarkerId(`ped-${p.id}`)}
                onMouseOut={() => setHoveredMarkerId(null)}
                animation={isHovered && window.google ? google.maps.Animation.BOUNCE : undefined}
              >
                {selectedPedidoId === p.id && (
                  <InfoWindow onCloseClick={() => setSelectedPedidoId(null)}>
                    <div className="p-1 flex flex-col gap-1 min-w-[140px]">
                      <p className="font-bold text-zinc-900 text-sm tracking-tight">{p.restaurante}</p>
                      <p className="text-[10px] text-zinc-500 font-mono">#{p.id.split('-')[0]}</p>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 uppercase mt-1">
                        <Store size={10} /> {p.estado.replace('_', ' ')}
                      </div>
                      
                      {p.repartidor_id && (
                        <div className="mt-1 pt-1 border-t border-zinc-100 flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
                          <Bike size={10} /> 
                          {repartidores.find(r => r.user_id === p.repartidor_id)?.nombre || 'Repartidor'}
                        </div>
                      )}
                    </div>
                  </InfoWindow>
                )}
              </Marker>
            )
          })}
          
          {/* Ruta Dibujada */}
          {directions && (
            <DirectionsRenderer
              directions={directions}
              options={{
                suppressMarkers: true, // Ya tenemos nuestros propios pines custom
                polylineOptions: {
                  strokeColor: '#10b981', // Emerald 500 para que haga match
                  strokeOpacity: 0.8,
                  strokeWeight: 4
                }
              }}
            />
          )}
        </GoogleMap>
      )}
    </div>
  );
}

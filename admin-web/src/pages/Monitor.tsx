import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Map as MapIcon, Loader2, AlertCircle, Layers, Flame } from 'lucide-react';
import { GoogleMap, useJsApiLoader, HeatmapLayer, OverlayView } from '@react-google-maps/api';
import { useAppStore } from '../store/useAppStore';

const LIBRARIES: ("visualization" | "places" | "drawing" | "geometry")[] = ['visualization'];

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '1rem'
};

const center = {
  lat: 16.2514,
  lng: -92.1340
};

// Uber-like silver map style
const silverMapStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#f5f5f5" }] },
  { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#f5f5f5" }] },
  { "featureType": "administrative.land_parcel", "elementType": "labels.text.fill", "stylers": [{ "color": "#bdbdbd" }] },
  { "featureType": "poi", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] },
  { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] },
  { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] },
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

export function Monitor() {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: LIBRARIES,
    version: '3.64' // Pin version to 3.64 since HeatmapLayer is removed in 3.65+
  });

  const [viewMode, setViewMode] = useState<'flota' | 'heatmap'>('flota');
  const { repartidores: globalRepartidores } = useAppStore();
  const repartidores = globalRepartidores.filter(r => r.lat && r.lng && r.activo);

  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);

  useEffect(() => {
    if (mapInstance && repartidores.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      repartidores.forEach(r => bounds.extend(new window.google.maps.LatLng(r.lat, r.lng)));
      mapInstance.fitBounds(bounds);
    }
  }, [mapInstance, repartidores]);

  const fetchHeatmap = async () => {
    try {
      const { data, error } = await supabase
        .from('pedidos')
        .select('lat, lng')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setHeatmapData(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const init = async () => {
      if (viewMode === 'heatmap') {
        setLoadingData(true);
        await fetchHeatmap();
        setLoadingData(false);
      }
    };
    init();
  }, [viewMode]);

  // Convert raw coords to google.maps.LatLng objects for Heatmap
  const heatmapPositions = useMemo(() => {
    if (!isLoaded || heatmapData.length === 0) return [];
    return heatmapData.map(point => new window.google.maps.LatLng(point.lat, point.lng));
  }, [heatmapData, isLoaded]);

  if (loadError) {
    return (
      <div className="flex-1 bg-white rounded-2xl p-8 flex flex-col items-center justify-center text-center">
        <AlertCircle size={48} className="text-rose-500 mb-4" />
        <p className="text-rose-600 font-bold">Error cargando Google Maps. Revisa tu API Key.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-black text-zinc-900 tracking-tight flex items-center gap-2">
            <MapIcon size={28} className="text-blue-600" />
            God's Eye
          </h2>
          <p className="text-zinc-500 text-sm mt-1 tracking-tight">Monitor en vivo y mapas de calor.</p>
        </div>
        
        <div className="flex bg-zinc-100 p-1 rounded-lg border border-zinc-200 w-max">
          <button
            onClick={() => setViewMode('flota')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${viewMode === 'flota' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
          >
            <Layers size={16} /> Flota Activa
          </button>
          <button
            onClick={() => setViewMode('heatmap')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${viewMode === 'heatmap' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'}`}
          >
            <Flame size={16} className={viewMode === 'heatmap' ? 'text-rose-500' : ''} /> Mapa de Calor
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden relative isolate">
        {(!isLoaded || loadingData) && (
          <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
            <Loader2 size={32} className="text-blue-600 animate-spin mb-4" />
            <p className="text-sm font-bold text-zinc-900">Iniciando satélites...</p>
          </div>
        )}
        
        {isLoaded && (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={center}
            zoom={14}
            onLoad={(map) => setMapInstance(map)}
            onUnmount={() => setMapInstance(null)}
            options={{
              styles: silverMapStyle,
              disableDefaultUI: true,
              zoomControl: true,
            }}
          >
            {viewMode === 'flota' && repartidores.map(rep => (
              <OverlayView
                key={rep.id}
                position={{ lat: rep.lat, lng: rep.lng }}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                getPixelPositionOffset={(width, height) => ({
                  x: -(width / 2),
                  y: -(height / 2),
                })}
              >
                <div className="relative w-8 h-8 group flex items-center justify-center cursor-pointer">
                  <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-25"></div>
                  <div className="w-6 h-6 bg-blue-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white z-10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
                  </div>
                  <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white text-xs font-bold px-2 py-1 rounded whitespace-nowrap shadow-xl pointer-events-none z-20">
                    {rep.nombre}
                  </div>
                </div>
              </OverlayView>
            ))}

            {viewMode === 'heatmap' && heatmapPositions.length > 0 && (
              <HeatmapLayer
                data={heatmapPositions}
                options={{
                  radius: 25,
                  opacity: 0.9,
                  gradient: [
                    'rgba(0, 255, 255, 0)',
                    'rgba(0, 255, 255, 1)',
                    'rgba(0, 191, 255, 1)',
                    'rgba(0, 127, 255, 1)',
                    'rgba(0, 63, 255, 1)',
                    'rgba(0, 0, 255, 1)',
                    'rgba(0, 0, 223, 1)',
                    'rgba(0, 0, 191, 1)',
                    'rgba(0, 0, 159, 1)',
                    'rgba(0, 0, 127, 1)',
                    'rgba(63, 0, 91, 1)',
                    'rgba(127, 0, 63, 1)',
                    'rgba(191, 0, 31, 1)',
                    'rgba(255, 0, 0, 1)'
                  ]
                }}
              />
            )}
          </GoogleMap>
        )}
      </div>
    </div>
  );
}

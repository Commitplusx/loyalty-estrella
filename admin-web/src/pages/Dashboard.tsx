import { PackageOpen, Users, TrendingUp, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { useAppStore } from '../store/useAppStore';

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

const LIBRARIES: ("visualization" | "places" | "drawing" | "geometry")[] = ['visualization'];

export function Dashboard() {
  const navigate = useNavigate();
  const [pedidosActivos, setPedidosActivos] = useState(0);
  const [repartidoresConectados, setRepartidoresConectados] = useState(0);
  const [gananciasHoy, setGananciasHoy] = useState(0);
  const [alertas, setAlertas] = useState(0);
  const [chartData, setChartData] = useState<any[]>([]);
  
  // Realtime Fleet from Global Cache
  const { repartidores } = useAppStore();
  const flota = repartidores.filter(r => r.lat !== null && r.activo);
  const [selectedRepartidorId, setSelectedRepartidorId] = useState<string | null>(null);
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

  useEffect(() => {
    // 1. Carga Inicial
    const fetchData = async () => {
      try {
        const { count: pedidosCount } = await supabase
          .from('pedidos')
          .select('id', { count: 'exact' })
          .not('estado', 'in', '("entregado","cancelado","pendiente_pago")');
        
        setPedidosActivos(pedidosCount || 0);

        const { count: repsCount } = await supabase
          .from('repartidores')
          .select('id', { count: 'exact' });
        
        setRepartidoresConectados(repsCount || 0);

        const { count: alertasCount } = await supabase
          .from('pedidos')
          .select('id', { count: 'exact' })
          .eq('estado', 'buscando_repartidor');
        
        setAlertas(alertasCount || 0);

        // Ganancias de hoy y datos para gráfico
        const hoyInicio = new Date();
        hoyInicio.setHours(0, 0, 0, 0);

        const { data: pedidosHoy } = await supabase
          .from('pedidos')
          .select('total, created_at, estado')
          .gte('created_at', hoyInicio.toISOString());

        if (pedidosHoy) {
          // Ganancias netas (15% de comisión de los entregados)
          const ganancias = pedidosHoy
            .filter(p => p.estado === 'entregado')
            .reduce((sum, p) => sum + ((Number(p.total) || 0) * 0.15), 0);
          setGananciasHoy(Math.round(ganancias));

          // Agrupar por hora para el gráfico
          const hourlyCounts = new Array(24).fill(0);
          pedidosHoy.forEach(p => {
            const date = new Date(p.created_at);
            hourlyCounts[date.getHours()]++;
          });

          // Solo mostramos horas relevantes de operación (ej. 8am a 11pm)
          const newChartData = [];
          for (let i = 8; i <= 23; i += 2) {
            newChartData.push({
              hora: `${i.toString().padStart(2, '0')}:00`,
              pedidos: hourlyCounts[i] + hourlyCounts[i+1] // sumamos bloques de 2 horas para suavizar
            });
          }
          setChartData(newChartData);
        }
      } catch (e) {
        console.error("Error fetching dashboard data:", e);
      }
    };

    fetchData();

    // Realtime Listener para Pedidos (Graficas y Alertas)
    const channelPedidos = supabase
      .channel('public:pedidos:dashboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelPedidos);
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        <MetricCard 
          title="Pedidos Activos" 
          value={pedidosActivos.toString()} 
          icon={PackageOpen} 
          trend="+12% vs ayer"
          colorClass="bg-blue-500"
          onClick={() => navigate('/pedidos')}
        />
        
        <MetricCard 
          title="Repartidores Activos" 
          value={repartidoresConectados.toString()} 
          icon={Users} 
          trend="Flota al 85%"
          colorClass="bg-emerald-500"
          onClick={() => navigate('/repartidores')}
        />

        <MetricCard 
          title="Ganancias (Hoy)" 
          value={`$${gananciasHoy}`} 
          icon={TrendingUp} 
          trend="+4.3% vs semana pasada"
          colorClass="bg-indigo-500"
        />

        <div 
          onClick={() => navigate('/pedidos')}
          className={`p-6 rounded-2xl border cursor-pointer transition-all hover:shadow-md ${alertas > 0 ? 'bg-rose-50 border-rose-200 hover:border-rose-300' : 'bg-white border-zinc-200 shadow-sm hover:border-zinc-300'}`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className={`text-xs font-bold uppercase tracking-widest ${alertas > 0 ? 'text-rose-600' : 'text-zinc-500'}`}>Alertas Críticas</p>
              <h3 className={`text-3xl font-black mt-1 tracking-tight ${alertas > 0 ? 'text-rose-700' : 'text-zinc-900'}`}>{alertas}</h3>
            </div>
            <div className={`p-2.5 rounded-xl ${alertas > 0 ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-zinc-100 text-zinc-400'}`}>
              <AlertTriangle size={20} strokeWidth={2.5} />
            </div>
          </div>
          <p className={`text-xs mt-4 font-bold tracking-tight ${alertas > 0 ? 'text-rose-500' : 'text-zinc-400'}`}>
            {alertas > 0 ? 'Pedidos sin asignar. Requiere intervención.' : 'Todo en orden.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico Principal */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 flex flex-col">
          <h3 className="text-base font-bold text-zinc-900 tracking-tight mb-6">Volumen de Pedidos (Hoy)</h3>
          <div className="flex-1 w-full min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorPedidos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#18181b" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#18181b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                <XAxis dataKey="hora" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 12, fontWeight: 500 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 12, fontWeight: 500 }} dx={-10} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e4e4e7', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#18181b' }}
                />
                <Area type="monotone" dataKey="pedidos" stroke="#18181b" strokeWidth={3} fillOpacity={1} fill="url(#colorPedidos)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Live Fleet Map */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4 flex flex-col h-72 lg:h-auto lg:min-h-[400px] relative">
          <div className="absolute top-6 left-6 z-10 bg-white/90 backdrop-blur-sm p-3 rounded-xl shadow-md border border-zinc-200">
             <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Torre de Control</p>
             <p className="text-sm font-black text-zinc-900 mt-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Flota en Tiempo Real
             </p>
          </div>
          <div className="flex-1 w-full rounded-xl overflow-hidden bg-zinc-100 flex items-center justify-center">
             {!isLoaded ? (
                <div className="flex flex-col items-center text-zinc-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-zinc-400 mb-3"></div>
                  <p className="text-xs font-bold uppercase tracking-widest">Cargando Mapas...</p>
                </div>
             ) : (
               <GoogleMap
                 mapContainerStyle={mapContainerStyle}
                 center={{ lat: 16.2326, lng: -92.1285 }} // Default center (can be auto bounds later)
                 zoom={13}
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
                 {flota.map(rep => {
                   if (!rep.lat || !rep.lng) return null;
                   
                   // Si tiene foto, la usamos como pin. Si no, usamos el pin SVG
                   const colorHex = rep.activo ? '#10b981' : '#f43f5e';
                   const iconSettings = rep.foto_url 
                     ? {
                         url: rep.foto_url,
                         scaledSize: new google.maps.Size(40, 40),
                       }
                     : {
                         url: getCustomPin(colorHex),
                         scaledSize: new google.maps.Size(36, 36),
                         anchor: new google.maps.Point(18, 36)
                       };

                   return (
                     <Marker 
                       key={rep.id}
                       position={{ lat: rep.lat, lng: rep.lng }}
                       title={rep.nombre}
                       icon={iconSettings}
                       onClick={() => setSelectedRepartidorId(rep.id)}
                       onMouseOver={() => setSelectedRepartidorId(rep.id)}
                     >
                       {selectedRepartidorId === rep.id && (
                         <InfoWindow onCloseClick={() => setSelectedRepartidorId(null)}>
                           <div className="p-2 flex flex-col gap-2 min-w-[140px]">
                             <p className="font-bold text-zinc-900 tracking-tight text-sm">{rep.nombre}</p>
                             <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded-md mb-1 w-max">
                               <PackageOpen size={12} />
                               {rep.pedidos ? rep.pedidos.filter((p: any) => p.estado === 'en_camino').length : 0} en ruta
                             </div>
                             <button 
                               onClick={() => navigate(`/repartidores/${rep.id}`)}
                               className="text-xs bg-zinc-900 hover:bg-black text-white px-3 py-2 rounded-lg font-bold transition-colors w-full tracking-tight"
                             >
                               Ver Perfil
                             </button>
                           </div>
                         </InfoWindow>
                       )}
                     </Marker>
                   )
                 })}
               </GoogleMap>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, trend, colorClass = 'bg-zinc-900', onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className={`bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 transition-all ${onClick ? 'cursor-pointer hover:shadow-md hover:border-zinc-300' : 'hover:shadow-sm'}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{title}</p>
          <h3 className="text-3xl font-black text-zinc-900 mt-1 tracking-tight">{value}</h3>
        </div>
        <div className={`p-2.5 rounded-xl ${colorClass} text-white shadow-sm`}>
          <Icon size={20} strokeWidth={2.5} />
        </div>
      </div>
      <p className="text-[11px] text-zinc-600 font-bold mt-4 bg-zinc-100 inline-block px-2 py-0.5 rounded-md tracking-tight">
        {trend}
      </p>
    </div>
  );
}

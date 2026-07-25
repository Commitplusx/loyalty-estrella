import { Package, MapPin, Truck, CheckCircle2, ShieldCheck, Star } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

interface ActiveTrackingViewProps {
  setCurrentView: (view: string) => void;
}

export function ActiveTrackingView({ setCurrentView }: ActiveTrackingViewProps) {
  const { pedidoActivo, setPedidoActivo } = useAppStore();

  const mapStatus = pedidoActivo ? (
    pedidoActivo.estado === 'buscando_repartidor' ? 0 :
    pedidoActivo.estado === 'en_camino_origen' ? 1 :
    pedidoActivo.estado === 'en_camino_destino' ? 2 :
    pedidoActivo.estado === 'entregado' ? 3 : 0
  ) : 0;

  const statuses = [
    { id: 'buscando', text: 'Buscando repartidor', sub: 'Encontramos a alguien en breve', icon: Package },
    { id: 'camino_origen', text: 'En camino al origen', sub: 'El repartidor va por tu pedido', icon: Truck },
    { id: 'camino_destino', text: 'En camino al destino', sub: 'Tu pedido está en ruta', icon: MapPin },
    { id: 'entregado', text: 'Entregado', sub: '¡El pedido ha llegado!', icon: CheckCircle2 }
  ];

  const CurrentIcon = statuses[mapStatus]?.icon || Package;
  
  // @ts-ignore - The structure returned from Supabase might be an array or an object
  const rep = pedidoActivo?.repartidores?.[0] || pedidoActivo?.repartidores;

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex-1 bg-gray-100 relative">
        <div className="absolute inset-0 flex items-center justify-center flex-col text-gray-400">
           <MapPin className="w-12 h-12 mb-4 opacity-50" />
           <p className="font-medium">Mapa en tiempo real (Próximamente)</p>
        </div>
      </div>

      <div className="absolute top-0 inset-x-0 p-6 pt-6 sm:pt-8 z-20 flex justify-between items-center pointer-events-none mt-safe">
         <button className="pointer-events-auto p-3 bg-white rounded-full shadow-md text-gray-900 hover:bg-gray-50 transition-colors">
           <ShieldCheck className="w-5 h-5" />
         </button>
         <div className="bg-white px-4 py-2 rounded-full shadow-md font-bold text-sm text-gray-900">
           {pedidoActivo ? (mapStatus < 3 ? `#${pedidoActivo.id.split('-')[0]}` : 'Completado') : ''}
         </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.08)] z-30 flex flex-col pt-3 pb-8 px-6 transition-all duration-500 ease-in-out md:max-w-2xl md:mx-auto md:mb-8 md:rounded-3xl border border-gray-100">
         <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6 md:hidden"></div>
         
         <div className="flex items-center gap-4 mb-8 mt-2 md:mt-4">
           <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border border-gray-100 ${
             mapStatus === 3 ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'
           }`}>
             <CurrentIcon className="w-7 h-7" />
           </div>
           <div className="flex-1">
             <h2 className="text-xl font-bold text-gray-900 leading-tight mb-1">{statuses[mapStatus]?.text}</h2>
             <p className="text-sm font-medium text-gray-500">{statuses[mapStatus]?.sub}</p>
           </div>
         </div>

         <div className="relative mb-8">
           <div className="absolute top-1/2 left-2 right-2 h-1 bg-gray-100 -translate-y-1/2 rounded-full"></div>
           <div 
              className="absolute top-1/2 left-2 h-1 bg-gray-900 -translate-y-1/2 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `calc(${(mapStatus / 3) * 100}% - 16px)` }}
           ></div>
           <div className="flex justify-between relative z-10 px-0">
             {[0, 1, 2, 3].map((step) => (
               <div 
                key={step} 
                className={`w-4 h-4 rounded-full border-4 transition-colors duration-500 ${
                  step < mapStatus ? 'bg-gray-900 border-gray-900' :
                  step === mapStatus ? 'bg-white border-gray-900 ring-2 ring-gray-200 ring-offset-2' : 
                  'bg-white border-gray-200'
                }`}
               />
             ))}
           </div>
         </div>

         {mapStatus > 0 && mapStatus < 3 && rep && (
           <div className="bg-gray-50 rounded-3xl p-4 flex items-center justify-between border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white border border-gray-200 overflow-hidden shadow-sm flex items-center justify-center text-xl font-black text-gray-300">
                  {rep.foto_url ? (
                    <img src={rep.foto_url} alt="Driver" className="w-full h-full object-cover" />
                  ) : (
                    rep.nombre?.charAt(0) || 'R'
                  )}
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{rep.nombre}</p>
                  <div className="flex items-center text-xs font-medium text-gray-500 mt-0.5">
                    <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400 mr-1" />
                    5.0 • {rep.vehiculo || 'Moto'} • {rep.placa}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <a href={`https://wa.me/52${rep.telefono?.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-gray-900 text-white rounded-full flex items-center justify-center hover:bg-gray-800 transition-colors shadow-md">
                   <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                </a>
              </div>
           </div>
         )}

        {mapStatus === 3 && (
           <div>
             <button 
              onClick={() => {
                setPedidoActivo(null);
                setCurrentView('home');
              }}
              className="w-full bg-gray-900 text-white font-bold py-4 rounded-2xl shadow-xl hover:bg-gray-800 transition-colors text-lg mt-4"
             >
               Volver al inicio
             </button>
           </div>
        )}
      </div>
    </div>
  );
}

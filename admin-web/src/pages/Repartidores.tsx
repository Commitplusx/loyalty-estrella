import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { DataTable } from '../components/ui/DataTable';
import { useNavigate } from 'react-router-dom';
import { Users, Search, MapPin, ChevronRight, UserPlus } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { AddRepartidorSheet } from '../components/ui/AddRepartidorSheet';

export function Repartidores() {
  const { repartidores, repartidoresLoaded, setRepartidores, updateRepartidor } = useAppStore();
  const [loading, setLoading] = useState(!repartidoresLoaded);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchRepartidores = async () => {
      try {
        const { data, error } = await supabase
          .from('repartidores')
          .select('*');

        if (error) throw error;
        setRepartidores(data || []);
      } catch (error) {
        console.error('Error fetching repartidores:', error);
      } finally {
        setLoading(false);
      }
    };

    if (!repartidoresLoaded) {
      fetchRepartidores();
    } else {
      setLoading(false);
    }

    // Suscripción a tiempo real para la lista
    const channel = supabase
      .channel('public:repartidores:lista')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'repartidores' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            updateRepartidor(payload.new);
          } else if (payload.eventType === 'DELETE') {
            fetchRepartidores(); // Fallback to full fetch on delete to ensure correctness
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [repartidoresLoaded, updateRepartidor]);

  const filtered = repartidores.filter(r => 
    (r.nombre?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (r.telefono?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const columns = [
    {
      header: 'Nombre',
      accessor: (row: any) => (
        <div 
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => navigate(`/repartidores/${row.id}`)}
        >
          <div className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center font-bold text-zinc-900 shadow-sm transition-transform group-hover:scale-105">
            {row.nombre ? row.nombre.charAt(0) : 'R'}
          </div>
          <div>
            <p className="font-bold text-zinc-900 tracking-tight group-hover:text-blue-600 transition-colors">{row.nombre || 'Desconocido'}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{row.telefono || 'Sin teléfono'}</p>
          </div>
        </div>
      )
    },
    {
      header: 'Vehículo / Placa',
      className: 'hidden md:table-cell',
      accessor: (row: any) => {
        const hasVehiculo = row.vehiculo && row.vehiculo !== 'No registrado';
        const hasPlaca = row.placa && row.placa !== '---';

        return (
          <div>
            {hasVehiculo ? (
              <>
                <p className="font-bold text-zinc-900 tracking-tight">{row.vehiculo}</p>
                {hasPlaca ? (
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">{row.placa}</p>
                ) : (
                  <span className="inline-block mt-1 px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-200 rounded text-[9px] font-black uppercase tracking-widest">
                    Sin Placa
                  </span>
                )}
              </>
            ) : (
              <div className="flex flex-col items-start gap-1">
                <span className="text-xs text-zinc-400 font-medium italic">Sin vehículo</span>
                <span className="inline-block px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-200 rounded text-[9px] font-black uppercase tracking-widest">
                  Sin Placa
                </span>
              </div>
            )}
          </div>
        );
      }
    },
    {
      header: 'Ubicación Actual',
      className: 'hidden lg:table-cell',
      accessor: (row: any) => (
        <div>
          {row.lat ? (
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-zinc-100 text-zinc-500 rounded-md border border-zinc-200">
                <MapPin size={14} />
              </div>
              <span className="font-mono text-[11px] font-bold text-zinc-600 tracking-tight">
                {row.lat.toFixed(4)}, {row.lng.toFixed(4)}
              </span>
            </div>
          ) : (
            <span className="text-xs text-zinc-400 font-medium italic">Sin señal GPS</span>
          )}
        </div>
      )
    },
    {
      header: 'Estado',
      accessor: (row: any) => (
        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${row.activo ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-500 border-zinc-200'}`}>
          {row.activo ? 'Online' : 'Inactivo'}
        </span>
      )
    },
    {
      header: '',
      accessor: (row: any) => (
        <button 
          onClick={() => navigate(`/repartidores/${row.id}`)} 
          className="p-2 text-zinc-400 hover:text-zinc-900 transition-colors rounded-lg hover:bg-zinc-100"
        >
          <ChevronRight size={20} />
        </button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-zinc-900 tracking-tight flex items-center gap-2">
            <Users size={22} className="text-zinc-900" />
            Flota de Repartidores
          </h2>
          <p className="text-zinc-500 text-sm mt-0.5 tracking-tight">Directorio y monitoreo del equipo en campo.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row w-full md:w-auto items-center gap-3">
          <div className="relative w-full sm:w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={16} className="text-zinc-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-zinc-200 rounded-lg py-2 pl-9 pr-4 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-all shadow-sm"
            />
          </div>
          
          <button 
            onClick={() => setIsAddSheetOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg font-bold text-sm transition-colors shadow-sm whitespace-nowrap"
          >
            <UserPlus size={16} />
            Registrar Repartidor
          </button>
        </div>
      </div>

      <DataTable 
        columns={columns} 
        data={filtered} 
        isLoading={loading} 
        keyExtractor={(row) => row.id} 
      />

      <AddRepartidorSheet 
        isOpen={isAddSheetOpen} 
        onClose={() => setIsAddSheetOpen(false)} 
      />
    </div>
  );
}

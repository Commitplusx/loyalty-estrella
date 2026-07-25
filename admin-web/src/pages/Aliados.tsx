import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { DataTable } from '../components/ui/DataTable';
import { useNavigate } from 'react-router-dom';
import { Store, Search, ShieldCheck, ChevronRight } from 'lucide-react';

export function Aliados() {
  const [aliados, setAliados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'activos' | 'solicitudes'>('activos');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchAliados = async () => {
    try {
      const { data, error } = await supabase.from('restaurantes').select('*');
      if (error) {
        console.error(error);
      } else {
        setAliados(data || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAliados();
  }, []);

  const handleToggleEstado = async (id: string, currentEstado: boolean) => {
    const nuevoEstado = !currentEstado;
    setAliados(prev => prev.map(a => a.id === id ? { ...a, activo: nuevoEstado } : a));
    
    try {
      await supabase.from('restaurantes').update({ activo: nuevoEstado }).eq('id', id);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSelectRestaurante = (id: string) => {
    navigate(`/aliados/${id}`);
  };

  const activos = aliados.filter(a => a.estado !== 'pendiente' && a.estatus !== 'pendiente' && a.aprobado !== false);
  const solicitudes = aliados.filter(a => a.estado === 'pendiente' || a.estatus === 'pendiente' || a.aprobado === false);

  const filteredActivos = activos.filter(a => 
    (a.nombre?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (a.correo?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const filteredSolicitudes = solicitudes.filter(a => 
    (a.nombre?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (a.correo?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const columns = [
    {
      header: 'Restaurante / Sucursal',
      accessor: (row: any) => (
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => handleSelectRestaurante(row.id)}>
          <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900 overflow-hidden shrink-0 transition-transform group-hover:scale-105 shadow-sm">
            {row.foto_fachada_url ? (
              <img src={row.foto_fachada_url} alt={row.nombre} className="w-full h-full object-cover" />
            ) : (
              <Store size={20} />
            )}
          </div>
          <div>
            <p className="font-bold text-zinc-900 tracking-tight text-sm flex items-center gap-1.5 group-hover:text-blue-600 transition-colors">
              {row.nombre}
              {row.es_socio && <ShieldCheck size={14} className="text-emerald-500" />}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">{row.etiqueta_zona || 'Sin Zona'}</p>
          </div>
        </div>
      )
    },
    {
      header: 'Contacto',
      className: 'hidden md:table-cell',
      accessor: (row: any) => (
        <div>
          <p className="font-bold text-zinc-700 text-sm tracking-tight">{row.telefono || 'Sin teléfono'}</p>
          <p className="text-[11px] text-zinc-400 font-medium mt-0.5 truncate max-w-[150px]">{row.correo || 'Sin correo'}</p>
        </div>
      )
    },
    {
      header: 'Estado Operativo',
      accessor: (row: any) => (
        <label className="flex items-center cursor-pointer group">
          <input 
            type="checkbox" 
            className="sr-only peer" 
            checked={row.activo}
            onChange={(e) => {
              e.stopPropagation();
              handleToggleEstado(row.id, row.activo);
            }}
          />
          <div className="w-10 lg:w-11 h-5 lg:h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 lg:after:h-5 after:w-4 lg:after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
          <span className={`ml-2 lg:ml-3 text-xs lg:text-sm font-bold uppercase tracking-widest ${row.activo ? 'text-emerald-600' : 'text-zinc-400'}`}>
            {row.activo ? 'Abierto' : 'Pausado'}
          </span>
        </label>
      )
    },
    {
      header: '',
      accessor: (row: any) => (
        <button onClick={() => handleSelectRestaurante(row.id)} className="p-2 text-zinc-400 hover:text-zinc-900 transition-colors rounded-lg hover:bg-zinc-100">
          <ChevronRight size={20} />
        </button>
      )
    }
  ];

  const columnsSolicitudes = [
    columns[0], // Restaurante
    columns[1], // Contacto
    {
      header: 'Acción',
      accessor: (row: any) => (
        <div className="flex items-center gap-2">
          <button 
            onClick={async (e) => {
               e.stopPropagation();
               await supabase.from('restaurantes').update({ estado: 'activo', estatus: 'activo', aprobado: true }).eq('id', row.id);
               fetchAliados();
            }}
            className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
          >
            Aprobar
          </button>
          <button 
            onClick={async (e) => {
               e.stopPropagation();
               await supabase.from('restaurantes').update({ estado: 'rechazado', estatus: 'rechazado' }).eq('id', row.id);
               fetchAliados();
            }}
            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-lg transition-colors"
          >
            Rechazar
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-zinc-900 tracking-tight flex items-center gap-2">
            <Store size={22} className="text-zinc-900" />
            Gestión de Aliados
          </h2>
          <p className="text-zinc-500 text-sm mt-0.5 tracking-tight">Administra restaurantes, sucursales y zonas de cobertura.</p>
        </div>
        
        <div className="relative w-full md:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-zinc-400" />
          </div>
          <input
            type="text"
            placeholder="Buscar por nombre o correo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-zinc-200 rounded-lg py-2 pl-9 pr-4 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-all shadow-sm"
          />
        </div>
      </div>

      <div className="flex space-x-1 border-b border-zinc-200">
        <button
          onClick={() => setActiveTab('activos')}
          className={`py-3 px-6 text-sm font-bold uppercase tracking-widest transition-colors relative ${
            activeTab === 'activos'
              ? 'text-zinc-900'
              : 'text-zinc-400 hover:text-zinc-600'
          }`}
        >
          Directorio
          {activeTab === 'activos' && (
            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-zinc-900"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('solicitudes')}
          className={`py-3 px-6 text-sm font-bold uppercase tracking-widest transition-colors relative flex items-center gap-2 ${
            activeTab === 'solicitudes'
              ? 'text-zinc-900'
              : 'text-zinc-400 hover:text-zinc-600'
          }`}
        >
          Nuevas Solicitudes
          {solicitudes.length > 0 && (
            <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-md animate-pulse">
              {solicitudes.length}
            </span>
          )}
          {activeTab === 'solicitudes' && (
            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-zinc-900"></span>
          )}
        </button>
      </div>

      {activeTab === 'activos' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
          <DataTable columns={columns} data={filteredActivos} isLoading={loading} keyExtractor={(row) => row.id} />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden min-h-[300px]">
          {filteredSolicitudes.length > 0 ? (
            <DataTable columns={columnsSolicitudes} data={filteredSolicitudes} isLoading={loading} keyExtractor={(row) => row.id} />
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-500">
              <Store size={48} className="text-zinc-200 mb-4" />
              <h3 className="text-lg font-bold text-zinc-900 tracking-tight">No hay solicitudes pendientes</h3>
              <p className="text-sm tracking-tight mt-1">Las nuevas solicitudes de registro aparecerán aquí.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

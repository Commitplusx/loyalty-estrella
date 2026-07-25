import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { DataTable } from '../components/ui/DataTable';
import { useNavigate } from 'react-router-dom';
import { Users, Search, Star, ChevronRight } from 'lucide-react';

export function Clientes() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const fetchClientes = async () => {
    try {
      const { data, error } = await supabase.from('clientes').select('*').limit(50);
      
      if (error) {
        setClientes([
          { id: '1', nombre: 'Kaleb Dominguez', telefono: '9631234567', puntos: 450, estado: 'activo', pedidos_totales: 12, fecha_registro: '2025-01-15' },
          { id: '2', nombre: 'Ana García', telefono: '9637654321', puntos: 120, estado: 'activo', pedidos_totales: 3, fecha_registro: '2025-11-22' },
          { id: '3', nombre: 'Usuario Suspendido', telefono: '9630000000', puntos: 0, estado: 'baneado', pedidos_totales: 0, fecha_registro: '2026-03-10' },
        ]);
      } else {
        setClientes(data || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  const handleSelectCliente = (cliente: any) => {
    navigate(`/clientes/${cliente.id}`);
  };

  const filtered = clientes.filter(c => 
    (c.nombre?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (c.telefono || '').includes(searchTerm)
  );

  const columns = [
    {
      header: 'Cliente',
      accessor: (row: any) => (
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => handleSelectCliente(row)}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition-transform group-hover:scale-105 shadow-sm border ${row.estado === 'baneado' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-white text-zinc-900 border-zinc-200'}`}>
            {row.nombre ? row.nombre.charAt(0).toUpperCase() : '?'}
          </div>
          <div>
            <p className="font-bold text-zinc-900 tracking-tight text-sm group-hover:text-blue-600 transition-colors">{row.nombre}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{row.telefono}</p>
          </div>
        </div>
      )
    },
    {
      header: 'Lealtad',
      accessor: (row: any) => (
        <div className="flex items-center gap-1.5 text-zinc-900 font-bold text-sm tracking-tight">
          <Star size={14} className="fill-amber-400 text-amber-400" />
          {row.puntos || 0} pts
        </div>
      )
    },
    {
      header: 'Pedidos',
      accessor: (row: any) => (
        <span className="font-bold text-zinc-700">{row.pedidos_totales || 0}</span>
      )
    },
    {
      header: 'Estado',
      accessor: (row: any) => (
        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${row.estado === 'activo' ? 'bg-zinc-100 text-zinc-900 border-zinc-200' : 'bg-rose-50 text-rose-600 border-rose-200'}`}>
          {row.estado}
        </span>
      )
    },
    {
      header: '',
      accessor: (row: any) => (
        <button onClick={() => handleSelectCliente(row)} className="p-2 text-zinc-400 hover:text-zinc-900 transition-colors rounded-lg hover:bg-zinc-100">
          <ChevronRight size={20} />
        </button>
      )
    }
  ];

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-zinc-900 tracking-tight flex items-center gap-2">
            <Users size={22} className="text-zinc-900" />
            Base de Clientes
          </h2>
          <p className="text-zinc-500 text-sm mt-0.5 tracking-tight">CRM, historial de pedidos y programa de lealtad.</p>
        </div>
        
        <div className="relative w-full md:w-72">
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
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
        <DataTable columns={columns} data={filtered} isLoading={loading} keyExtractor={(row) => row.id} />
      </div>

    </div>
  );
}

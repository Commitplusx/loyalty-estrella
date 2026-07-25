import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { DataTable } from '../components/ui/DataTable';
import { Wallet, ArrowDownRight, ArrowUpRight, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export function Finanzas() {
  const [loading, setLoading] = useState(true);
  const [liquidaciones, setLiquidaciones] = useState<any[]>([]);
  const [stats, setStats] = useState({ cobroEfectivo: 0, pagosTarjeta: 0, gananciasApp: 0 });
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const fetchFinanzas = async () => {
      try {
        setLoading(true);
        // Traer pedidos entregados para cálculos
        const { data: pedidos, error } = await supabase
          .from('pedidos')
          .select(`
            id, 
            total,
            metodo_pago,
            created_at,
            restaurante_id,
            restaurantes ( nombre )
          `)
          .eq('estado', 'entregado');
          
        if (error) throw error;
        
        let cobroEfectivo = 0;
        let pagosTarjeta = 0;
        let gananciasApp = 0;
        
        const liquidacionesMap = new Map();
  
        (pedidos || []).forEach((p: any) => {
          const precio = Number(p.total) || 0;
          const comision = precio * 0.15; // 15% comisión app aprox
          
          gananciasApp += comision;
          
          if (p.metodo_pago === 'efectivo' || p.metodo_pago === 'cash') {
            cobroEfectivo += precio;
          } else {
            pagosTarjeta += precio;
          }
          
          const restId = p.restaurante_id;
          if (!restId) return;
          
          if (!liquidacionesMap.has(restId)) {
            liquidacionesMap.set(restId, {
              id: restId,
              tipo: 'restaurante',
              nombre: (p.restaurantes as any)?.nombre || 'Desconocido',
              monto: 0,
              fecha: new Date(p.created_at).toLocaleDateString(),
              estado: 'pendiente'
            });
          }
          
          const liq = liquidacionesMap.get(restId);
          
          if (p.metodo_pago === 'efectivo' || p.metodo_pago === 'cash') {
             // El restaurante le debe a la app la comisión
             liq.monto -= comision;
          } else {
             // La app le debe al restaurante el total menos la comisión
             liq.monto += (precio - comision);
          }
        });
        
        setStats({
          cobroEfectivo,
          pagosTarjeta,
          gananciasApp
        });
        
        setLiquidaciones(Array.from(liquidacionesMap.values()));

        // Process data for the chart (last 7 days grouped by day)
        const dailyStats: Record<string, number> = {};
        const today = new Date();
        // Initialize last 7 days to 0
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
          dailyStats[dateStr] = 0;
        }

        (pedidos || []).forEach((p: any) => {
          const d = new Date(p.created_at);
          const dateStr = d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
          if (dailyStats[dateStr] !== undefined) {
            dailyStats[dateStr] += (Number(p.total) || 0) * 0.15; // Ganancias
          }
        });

        const formattedChartData = Object.keys(dailyStats).map(key => ({
          name: key,
          ganancia: Math.round(dailyStats[key])
        }));

        setChartData(formattedChartData);
      } catch (error) {
        console.error('Error fetching finanzas:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFinanzas();
  }, []);

  const columns = [
    {
      header: 'Entidad',
      accessor: (row: any) => (
        <div>
          <p className="font-bold text-zinc-900 tracking-tight">{row.nombre}</p>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">{row.tipo}</p>
        </div>
      )
    },
    {
      header: 'Fecha',
      accessor: (row: any) => (
        <span className="text-zinc-600 font-medium">{row.fecha}</span>
      )
    },
    {
      header: 'Monto',
      accessor: (row: any) => (
        <span className={`font-black tracking-tight ${row.monto > 0 ? 'text-zinc-900' : 'text-zinc-500'}`}>
          {row.monto > 0 ? '+' : ''}${Math.abs(row.monto).toFixed(2)}
        </span>
      )
    },
    {
      header: 'Estado',
      accessor: (row: any) => (
        <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${
          row.estado === 'pagado' 
            ? 'bg-zinc-100 text-zinc-900 border-zinc-200' 
            : 'bg-white text-zinc-500 border-zinc-200'
        }`}>
          {row.estado}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black text-zinc-900 flex items-center gap-2 tracking-tight">
          <Wallet size={22} className="text-zinc-900" />
          Finanzas y Liquidaciones
        </h2>
        <p className="text-zinc-500 text-sm mt-0.5 tracking-tight">Control de cortes de caja, adeudos de repartidores y comisiones.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 text-zinc-500 mb-4">
            <div className="p-2.5 bg-amber-500 rounded-xl text-white shadow-sm"><ArrowDownRight size={20} strokeWidth={2.5}/></div>
            <h3 className="font-bold text-xs uppercase tracking-widest text-amber-600">Por Cobrar (Efectivo)</h3>
          </div>
          <p className="text-3xl font-black text-zinc-900 tracking-tight">${stats.cobroEfectivo.toLocaleString()}</p>
          <p className="text-xs text-zinc-400 font-medium mt-1">Efectivo en manos de repartidores</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 text-zinc-500 mb-4">
            <div className="p-2.5 bg-rose-500 rounded-xl text-white shadow-sm"><ArrowUpRight size={20} strokeWidth={2.5}/></div>
            <h3 className="font-bold text-xs uppercase tracking-widest text-rose-600">Por Pagar (Tarjetas)</h3>
          </div>
          <p className="text-3xl font-black text-zinc-900 tracking-tight">${stats.pagosTarjeta.toLocaleString()}</p>
          <p className="text-xs text-zinc-400 font-medium mt-1">Adeudos a restaurantes por Conekta</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 text-zinc-500 mb-4">
            <div className="p-2.5 bg-emerald-500 rounded-xl text-white shadow-sm"><TrendingUp size={20} strokeWidth={2.5} /></div>
            <h3 className="font-bold text-xs uppercase tracking-widest text-emerald-600">Ganancias App</h3>
          </div>
          <p className="text-3xl font-black text-zinc-900 tracking-tight">${stats.gananciasApp.toLocaleString()}</p>
          <p className="text-xs text-zinc-400 font-medium mt-1">Comisiones netas generadas</p>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
        <div className="mb-6">
          <h3 className="font-bold text-zinc-900 tracking-tight text-sm">Rendimiento de Ganancias (Últimos 7 Días)</h3>
          <p className="text-xs text-zinc-500 mt-1">Evolución de las comisiones retenidas por la plataforma.</p>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorGanancia" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E4E7" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717A' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717A' }} tickFormatter={(value) => `$${value}`} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                formatter={(value: any) => [`$${value}`, 'Ganancias']}
              />
              <Area type="monotone" dataKey="ganancia" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorGanancia)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
        <div className="p-4 border-b border-zinc-200 flex justify-between items-center bg-white">
          <h3 className="font-bold text-zinc-900 tracking-tight text-sm">Movimientos y Cortes</h3>
          <button className="text-xs bg-zinc-900 text-white px-4 py-2 rounded-lg font-bold tracking-tight hover:bg-black transition-colors shadow-sm">
            Generar Cortes Hoy
          </button>
        </div>
        <DataTable columns={columns} data={liquidaciones} isLoading={loading} keyExtractor={(row) => row.id} />
      </div>
    </div>
  );
}

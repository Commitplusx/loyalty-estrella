import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { toast } from 'react-hot-toast';
import { MapPin, Navigation, Package, ArrowRight, Loader2, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Home() {
  const { user, setUser } = useAppStore();
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!origen || !destino || !descripcion) {
      toast.error('Por favor llena todos los campos');
      return;
    }

    setLoading(true);
    try {
      // Create order
      const { data, error } = await supabase.from('pedidos').insert({
        cliente_tel: user?.phone || 'Desconocido',
        descripcion: descripcion,
        direccion: origen, // Usamos direccion como origen
        referencias_entrega: destino, // Usamos referencias_entrega como destino para este MVP
        origen: 'mandadito_app',
        tipo_pedido: 'mandadito',
        estado: 'buscando_repartidor',
        metodo_pago: 'efectivo',
        total: 50, // Tarifa base estática para el MVP
        items: [],
      }).select().single();

      if (error) throw error;
      
      toast.success('¡Mandadito solicitado con éxito!');
      setOrigen('');
      setDestino('');
      setDescripcion('');
      navigate('/tracking');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error al solicitar mandadito');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-600">
            <Package size={24} />
            <h1 className="font-black tracking-tight text-zinc-900 text-lg">Estrella Envíos</h1>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-zinc-500 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
          >
            <span className="hidden sm:inline">Cerrar Sesión</span>
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8 flex flex-col md:flex-row gap-6 md:gap-10">
        
        {/* Left Col / Header on Mobile */}
        <div className="md:w-1/2 flex flex-col justify-center">
          <div className="bg-blue-600 rounded-3xl p-8 md:p-12 text-white shadow-lg shadow-blue-600/20 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 p-4 opacity-10">
              <Package size={200} />
            </div>
            <h2 className="text-3xl md:text-5xl font-black mb-4 relative z-10 leading-tight">¿Qué te llevamos hoy?</h2>
            <p className="text-blue-100 text-base md:text-lg font-medium relative z-10 max-w-xs">
              Pide lo que necesites, desde despensa hasta las llaves que olvidaste. Un repartidor lo hará por ti al instante.
            </p>
          </div>
        </div>

        {/* Right Col / Form */}
        <div className="md:w-1/2">
          <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-xl shadow-zinc-200/50 border border-zinc-100 p-6 md:p-8 space-y-6">
          
          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2">
              ¿Qué necesitas?
            </label>
            <textarea
              required
              rows={3}
              placeholder="Ej. Comprar 2 cocas en el Oxxo y traer mis llaves..."
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium resize-none"
            />
          </div>

          <div className="relative pl-8 space-y-4">
            {/* Timeline Line */}
            <div className="absolute left-[11px] top-6 bottom-6 w-0.5 bg-zinc-200"></div>
            
            {/* Origen */}
            <div className="relative">
              <div className="absolute -left-8 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-2 border-zinc-300 rounded-full flex items-center justify-center z-10">
                <div className="w-2 h-2 bg-zinc-400 rounded-full"></div>
              </div>
              <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                Punto de Recolección (Origen)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MapPin size={16} className="text-zinc-400" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Dirección o lugar exacto"
                  value={origen}
                  onChange={(e) => setOrigen(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-3 pl-10 pr-4 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium"
                />
              </div>
            </div>

            {/* Destino */}
            <div className="relative">
              <div className="absolute -left-8 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-2 border-blue-500 rounded-full flex items-center justify-center z-10">
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
              </div>
              <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                Punto de Entrega (Destino)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Navigation size={16} className="text-blue-500" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Tu dirección"
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-3 pl-10 pr-4 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-bold text-zinc-500">Tarifa Estimada</span>
              <span className="text-xl font-black text-zinc-900">$50.00</span>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent rounded-xl shadow-md shadow-blue-600/20 text-sm font-black text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-[0.98]"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'Pedir Mandadito'}
              {!loading && <ArrowRight size={18} />}
            </button>
            <p className="text-[10px] text-center text-zinc-400 font-medium mt-3">
              Pago en efectivo al recibir. La tarifa puede variar según la distancia real.
            </p>
          </div>
        </form>
        </div>
      </main>
    </div>
  );
}

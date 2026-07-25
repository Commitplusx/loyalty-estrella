import { useState, useEffect } from 'react';
import { Settings, Bike, Map, ChevronRight, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';

export function Ajustes() {
  const [activeView, setActiveView] = useState<'menu' | 'motos' | 'excepciones' | 'promociones' | 'logs'>('menu');

  if (activeView !== 'menu') {
    return (
      <div className="space-y-6">
        <button 
          onClick={() => setActiveView('menu')}
          className="flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          <ArrowLeft size={16} /> Volver a Ajustes
        </button>
        
        {activeView === 'motos' && <MotosView />}
        {activeView === 'excepciones' && <ExcepcionesView />}
        {activeView === 'logs' && <SystemLogsView />}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-xl font-black text-zinc-900 tracking-tight flex items-center gap-2">
          <Settings size={22} className="text-zinc-900" />
          Herramientas y Ajustes
        </h2>
        <p className="text-zinc-500 text-sm mt-0.5 tracking-tight">Configuraciones heredadas de la plataforma móvil.</p>
      </div>

      <div className="space-y-4">
        {/* Flota de Motos */}
        <button 
          onClick={() => setActiveView('motos')}
          className="w-full bg-white p-5 rounded-2xl shadow-sm border border-zinc-200 hover:border-blue-300 hover:shadow-md transition-all flex items-center group text-left"
        >
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl mr-4 group-hover:scale-110 transition-transform">
            <Bike size={24} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-zinc-900">Flota de Motos</h3>
            <p className="text-sm text-zinc-500 mt-0.5">Directorio, placas y apodos del parque vehicular.</p>
          </div>
          <ChevronRight size={20} className="text-zinc-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
        </button>

        {/* Excepciones de Precio */}
        <button 
          onClick={() => setActiveView('excepciones')}
          className="w-full bg-white p-5 rounded-2xl shadow-sm border border-zinc-200 hover:border-amber-300 hover:shadow-md transition-all flex items-center group text-left"
        >
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl mr-4 group-hover:scale-110 transition-transform">
            <Map size={24} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-zinc-900">Excepciones de Precio</h3>
            <p className="text-sm text-zinc-500 mt-0.5">Colonias con tarifa fija o zonas de alta dificultad.</p>
          </div>
          <ChevronRight size={20} className="text-zinc-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
        </button>

        {/* System Logs */}
        <button 
          onClick={() => setActiveView('logs')}
          className="w-full bg-white p-5 rounded-2xl shadow-sm border border-zinc-200 hover:border-zinc-400 hover:shadow-md transition-all flex items-center group text-left"
        >
          <div className="p-3 bg-zinc-100 text-zinc-900 rounded-xl mr-4 group-hover:scale-110 transition-transform">
            <Settings size={24} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-zinc-900">Registro de Auditoría</h3>
            <p className="text-sm text-zinc-500 mt-0.5">Bitácora de actividades y eventos críticos del sistema (System Logs).</p>
          </div>
          <ChevronRight size={20} className="text-zinc-400 group-hover:text-zinc-900 group-hover:translate-x-1 transition-all" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------
// VISTAS INTERNAS (Componentes)
// ---------------------------

function MotosView() {
  const [motos, setMotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [placa, setPlaca] = useState('');
  const [alias, setAlias] = useState('');
  const [saving, setSaving] = useState(false);

  const [motoToDelete, setMotoToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchMotos();
  }, []);

  const fetchMotos = async () => {
    try {
      const { data } = await supabase.from('motos').select('*');
      if (data) setMotos(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placa || !alias) return;
    setSaving(true);
    try {
      await supabase.from('motos').insert([{ placa, alias }]);
      setPlaca('');
      setAlias('');
      fetchMotos();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!motoToDelete) return;
    try {
      await supabase.from('motos').delete().eq('id', motoToDelete);
      setMotoToDelete(null);
      fetchMotos();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
        <h3 className="text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
          <Bike className="text-blue-500" /> Registrar Motocicleta
        </h3>
        <form onSubmit={handleSave} className="flex flex-col sm:flex-row gap-3">
          <input 
            type="text" 
            placeholder="Placas (ej. X1A2B)" 
            value={placa} 
            onChange={(e) => setPlaca(e.target.value.toUpperCase())}
            className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
          <input 
            type="text" 
            placeholder="Alias / Apodo" 
            value={alias} 
            onChange={(e) => setAlias(e.target.value)}
            className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
          <button 
            type="submit" 
            disabled={saving || !placa || !alias}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-zinc-500 animate-pulse">Cargando flota...</div>
        ) : motos.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">No hay motocicletas registradas.</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200 text-xs uppercase tracking-widest text-zinc-500">
                <th className="p-4 font-bold">Alias</th>
                <th className="p-4 font-bold">Placas</th>
                <th className="p-4 font-bold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {motos.map(m => (
                <tr key={m.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="p-4 font-bold text-zinc-900">{m.alias}</td>
                  <td className="p-4 text-zinc-500 font-mono text-sm">{m.placa}</td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => setMotoToDelete(m.id)}
                      className="text-rose-500 hover:text-rose-700 font-bold text-xs bg-rose-50 px-3 py-1.5 rounded-md transition-colors"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmSheet
        isOpen={!!motoToDelete}
        onClose={() => setMotoToDelete(null)}
        onConfirm={confirmDelete}
        title="¿Eliminar Motocicleta?"
        description="Esta motocicleta se eliminará permanentemente del inventario de la flota."
        confirmText="Sí, Eliminar"
        isDestructive={true}
      />
    </div>
  );
}

function ExcepcionesView() {
  const [excepciones, setExcepciones] = useState<any[]>([]);
  const [zonas, setZonas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [coloniaTexto, setColoniaTexto] = useState('');
  const [zonaId, setZonaId] = useState('');
  const [dificultadAlta, setDificultadAlta] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  const [excToDelete, setExcToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [resExc, resZonas] = await Promise.all([
        supabase.from('excepciones_precio').select('*, zonas_entrega(nombre, color_emoji)'),
        supabase.from('zonas_entrega').select('id, nombre, color_emoji, precio')
      ]);
      if (resExc.data) setExcepciones(resExc.data);
      if (resZonas.data) {
        setZonas(resZonas.data);
        if (resZonas.data.length > 0) setZonaId(resZonas.data[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coloniaTexto || !zonaId) return;
    setSaving(true);
    try {
      const zonaForzada = zonas.find(z => z.id === zonaId)?.nombre || '';
      await supabase.from('excepciones_precio').insert([{
        colonia_texto: coloniaTexto.toLowerCase(),
        zona_id: zonaId,
        zona_forzada: zonaForzada,
        dificultad_alta: dificultadAlta,
        motivo: motivo || null,
        activo: true
      }]);
      setColoniaTexto('');
      setMotivo('');
      setDificultadAlta(false);
      fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from('excepciones_precio').update({ activo: !current }).eq('id', id);
    fetchData();
  };

  const confirmDelete = async () => {
    if (!excToDelete) return;
    await supabase.from('excepciones_precio').delete().eq('id', excToDelete);
    setExcToDelete(null);
    fetchData();
  };

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 p-6 rounded-2xl shadow-sm border border-amber-200">
        <h3 className="text-lg font-bold text-amber-900 mb-4 flex items-center gap-2">
          <Map className="text-amber-600" /> Añadir Excepción
        </h3>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <input 
              type="text" 
              placeholder="Nombre de la Colonia (ej. Centro)" 
              value={coloniaTexto} 
              onChange={(e) => setColoniaTexto(e.target.value)}
              className="flex-1 bg-white border border-amber-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500"
            />
            <select 
              value={zonaId} 
              onChange={(e) => setZonaId(e.target.value)}
              className="flex-1 bg-white border border-amber-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500"
            >
              <option value="" disabled>Selecciona la tarifa a forzar...</option>
              {zonas.map(z => (
                <option key={z.id} value={z.id}>{z.color_emoji || '📍'} {z.nombre} (${z.precio})</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <input 
              type="text" 
              placeholder="Motivo (opcional, ej. Zona de difícil acceso)" 
              value={motivo} 
              onChange={(e) => setMotivo(e.target.value)}
              className="flex-1 w-full bg-white border border-amber-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500"
            />
            <label className="flex items-center gap-2 text-sm font-bold text-amber-900 whitespace-nowrap cursor-pointer">
              <input 
                type="checkbox" 
                checked={dificultadAlta} 
                onChange={(e) => setDificultadAlta(e.target.checked)}
                className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              ⚠️ Dificultad Alta
            </label>
            <button 
              type="submit" 
              disabled={saving || !coloniaTexto || !zonaId}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50 w-full sm:w-auto"
            >
              {saving ? 'Guardando...' : 'Guardar Regla'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-zinc-500 animate-pulse">Cargando excepciones...</div>
        ) : excepciones.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">No hay excepciones registradas.</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200 text-xs uppercase tracking-widest text-zinc-500">
                <th className="p-4 font-bold">Colonia</th>
                <th className="p-4 font-bold">Tarifa Forzada</th>
                <th className="p-4 font-bold text-center">Estado</th>
                <th className="p-4 font-bold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {excepciones.map(exc => (
                <tr key={exc.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="p-4">
                    <p className="font-bold text-zinc-900 capitalize flex items-center gap-2">
                      {exc.colonia_texto}
                      {exc.dificultad_alta && <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded uppercase tracking-wider">Peligro</span>}
                    </p>
                    {exc.motivo && <p className="text-xs text-zinc-500 mt-0.5">{exc.motivo}</p>}
                  </td>
                  <td className="p-4 text-zinc-700 font-medium">
                    {exc.zonas_entrega?.color_emoji} {exc.zona_forzada}
                  </td>
                  <td className="p-4 text-center">
                    <button 
                      onClick={() => toggleActive(exc.id, exc.activo)}
                      className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${
                        exc.activo ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                      }`}
                    >
                      {exc.activo ? 'Activa' : 'Inactiva'}
                    </button>
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => setExcToDelete(exc.id)}
                      className="text-rose-500 hover:text-rose-700 font-bold text-xs bg-rose-50 px-3 py-1.5 rounded-md transition-colors"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmSheet
        isOpen={!!excToDelete}
        onClose={() => setExcToDelete(null)}
        onConfirm={confirmDelete}
        title="¿Eliminar Excepción de Precio?"
        description="Esta regla dejará de aplicar en el sistema de repartidores inmediatamente."
        confirmText="Sí, Eliminar"
        isDestructive={true}
      />
    </div>
  );
}

function SystemLogsView() {
  return <div className="p-4 bg-white rounded-2xl border border-zinc-200">
    <h3 className="font-bold mb-4">Logs del Sistema</h3>
    <p className="text-sm text-zinc-500">Módulo en construcción...</p>
  </div>;
}

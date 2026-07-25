import { useState, useEffect } from 'react';
import { Megaphone, Ticket, Zap, Info, Bell, AlertTriangle, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';

export function Marketing() {
  const [activeTab, setActiveTab] = useState<'cupones' | 'anuncios' | 'avisos'>('cupones');

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-zinc-900 tracking-tight flex items-center gap-2">
          <Megaphone size={28} className="text-rose-500" />
          Centro de Marketing
        </h2>
        <p className="text-zinc-500 text-sm mt-1 tracking-tight">Atrae más clientes y comunícate con ellos en tiempo real.</p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-zinc-200">
        <button
          onClick={() => setActiveTab('cupones')}
          className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'cupones' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          <Ticket size={16} /> Cupones y Descuentos
        </button>
        <button
          onClick={() => setActiveTab('anuncios')}
          className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'anuncios' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          <Zap size={16} /> Anuncios Flash
        </button>
        <button
          onClick={() => setActiveTab('avisos')}
          className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'avisos' ? 'border-rose-500 text-rose-500' : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          <Bell size={16} /> Avisos / Control
        </button>
      </div>

      {/* Content */}
      {activeTab === 'cupones' && <CuponesView />}
      {activeTab === 'anuncios' && <AnunciosView />}
      {activeTab === 'avisos' && <AvisosView />}
    </div>
  );
}

// ------------------------------------------------------------------
// COMPONENTE: CUPONES Y PROMOCIONES (promociones_dinamicas)
// ------------------------------------------------------------------
function CuponesView() {
  const [promos, setPromos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState('envio_fijo');
  const [valor, setValor] = useState('');
  const [usoMaximo, setUsoMaximo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [requiereCodigo, setRequiereCodigo] = useState(false);
  const [saving, setSaving] = useState(false);

  // Confirm Sheet state
  const [promoToDelete, setPromoToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchPromos();
  }, []);

  const fetchPromos = async () => {
    setLoading(true);
    const { data } = await supabase.from('cupones_plataforma').select('*').order('created_at', { ascending: false });
    if (data) setPromos(data);
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descripcion || !valor) return;
    setSaving(true);
    try {
      await supabase.from('cupones_plataforma').insert([{
        descripcion,
        tipo,
        valor: parseFloat(valor),
        uso_maximo: usoMaximo ? parseInt(usoMaximo) : null,
        codigo: requiereCodigo ? codigo.toUpperCase() : null,
        usos_actuales: 0,
        activa: true
      }]);
      // Reset Form
      setDescripcion('');
      setValor('');
      setUsoMaximo('');
      setCodigo('');
      setRequiereCodigo(false);
      fetchPromos();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const togglePromo = async (id: string, activa: boolean) => {
    await supabase.from('cupones_plataforma').update({ activa: !activa }).eq('id', id);
    fetchPromos();
  };

  const confirmDelete = async () => {
    if (!promoToDelete) return;
    await supabase.from('cupones_plataforma').delete().eq('id', promoToDelete);
    setPromoToDelete(null);
    fetchPromos();
  };

  return (
    <div className="space-y-6">
      {/* Formulario de Nueva Promo */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
        <h3 className="text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
          <Ticket className="text-rose-500" /> Crear Promoción
        </h3>
        
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Descripción para el Cliente</label>
            <input 
              required
              type="text" 
              placeholder="Ej. Envío gratis en tu primer pedido" 
              value={descripcion} 
              onChange={e => setDescripcion(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Tipo de Descuento</label>
              <select 
                value={tipo} 
                onChange={e => setTipo(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500"
              >
                <option value="envio_fijo">🚛 Envío Fijo (ej. $20)</option>
                <option value="porcentaje">🏷️ Porcentaje (ej. 15%)</option>
                <option value="monto_fijo">💰 Monto Fijo (ej. -$50)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                Valor ({tipo === 'porcentaje' ? '%' : '$'})
              </label>
              <input 
                required
                type="number" 
                min="0"
                step="0.01"
                placeholder={tipo === 'porcentaje' ? '15' : '20'}
                value={valor} 
                onChange={e => setValor(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Límite de usos totales</label>
              <input 
                type="number" 
                min="1"
                placeholder="0 o vacío = Sin límite" 
                value={usoMaximo} 
                onChange={e => setUsoMaximo(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 flex flex-col md:flex-row gap-4 items-center">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <input 
                type="checkbox" 
                checked={requiereCodigo} 
                onChange={e => setRequiereCodigo(e.target.checked)}
                className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 cursor-pointer"
                id="reqCodigo"
              />
              <label htmlFor="reqCodigo" className="text-sm font-bold text-zinc-700 cursor-pointer">
                El cliente debe ingresar un código secreto
              </label>
            </div>
            
            {requiereCodigo ? (
              <input 
                required
                type="text" 
                placeholder="CÓDIGO (ej. VERANO24)" 
                value={codigo} 
                onChange={e => setCodigo(e.target.value.toUpperCase().replace(/\s/g, ''))}
                className="flex-1 w-full uppercase font-mono bg-white border border-rose-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-rose-500"
              />
            ) : (
              <div className="flex-1 flex items-center gap-2 text-xs text-zinc-400">
                <Info size={14} /> Se aplicará en automático a todos los pedidos.
              </div>
            )}

            <button 
              type="submit" 
              disabled={saving}
              className="w-full md:w-auto bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-8 py-2.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? 'Guardando...' : 'Crear Promoción'}
            </button>
          </div>
        </form>
      </div>

      {/* Lista de Promos */}
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-zinc-500 animate-pulse">Cargando promociones...</div>
        ) : promos.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">No hay promociones.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-zinc-100">
            {promos.map(p => {
              const porcentajeUso = p.uso_maximo ? Math.min((p.usos_actuales / p.uso_maximo) * 100, 100) : 0;
              const agotada = p.uso_maximo && p.usos_actuales >= p.uso_maximo;
              
              return (
                <div key={p.id} className={`p-6 transition-colors ${agotada ? 'opacity-60 bg-zinc-50' : 'hover:bg-zinc-50'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex gap-2 items-center">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                        p.tipo === 'porcentaje' ? 'bg-blue-100 text-blue-700' :
                        p.tipo === 'envio_fijo' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {(p.tipo || 'descuento').replace('_', ' ')}
                      </span>
                      {p.codigo ? (
                        <span className="text-[10px] font-mono font-bold bg-zinc-200 text-zinc-700 px-2 py-0.5 rounded">
                          CODE: {p.codigo}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded">
                          AUTO
                        </span>
                      )}
                    </div>
                    <div className="text-xl font-black text-zinc-900 tracking-tight">
                      {p.tipo === 'porcentaje' ? `${p.valor}%` : `$${p.valor}`}
                    </div>
                  </div>
                  
                  <p className="font-bold text-zinc-900 mb-4 leading-tight">{p.descripcion}</p>
                  
                  {p.uso_maximo ? (
                    <div className="mb-4">
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                        <span>{p.usos_actuales} usos</span>
                        <span>{p.uso_maximo} límite</span>
                      </div>
                      <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-1.5 rounded-full ${agotada ? 'bg-zinc-400' : 'bg-rose-500'}`} 
                          style={{ width: `${porcentajeUso}%` }}
                        ></div>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">
                      {p.usos_actuales} usos (Sin límite)
                    </div>
                  )}


                  <div className="flex gap-2 pt-4 border-t border-zinc-100">
                    <button 
                      onClick={() => togglePromo(p.id, p.activa)}
                      disabled={agotada}
                      className={`flex-1 text-xs font-bold py-2 rounded-lg transition-colors ${
                        agotada ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed' :
                        p.activa ? 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                      }`}
                    >
                      {agotada ? 'AGOTADA' : p.activa ? 'Pausar' : 'Reactivar'}
                    </button>
                    <button 
                      onClick={() => setPromoToDelete(p.id)}
                      className="text-rose-500 hover:bg-rose-50 p-2 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      BORRAR
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmSheet
        isOpen={!!promoToDelete}
        onClose={() => setPromoToDelete(null)}
        onConfirm={confirmDelete}
        title="¿Borrar Promoción?"
        description="Esta promoción será eliminada de forma permanente y los usuarios ya no podrán utilizarla."
        confirmText="Sí, Borrar"
        isDestructive={true}
      />
    </div>
  );
}

// ------------------------------------------------------------------
// COMPONENTE: ANUNCIOS FLASH (anuncios_flash) Migrado de Ajustes
// ------------------------------------------------------------------
function AnunciosView() {
  const [anuncios, setAnuncios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mensaje, setMensaje] = useState('');
  const [saving, setSaving] = useState(false);
  const [anuncioToDelete, setAnuncioToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchAnuncios();
  }, []);

  const fetchAnuncios = async () => {
    try {
      const { data } = await supabase.from('anuncios_flash').select('*').order('created_at', { ascending: false });
      if (data) setAnuncios(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mensaje.trim()) return;
    setSaving(true);
    try {
      // Desactivar todos los demás primero
      await supabase.from('anuncios_flash').update({ activo: false }).neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('anuncios_flash').insert([{ mensaje: mensaje.trim(), activo: true }]);
      setMensaje('');
      fetchAnuncios();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (id: string, currentStatus: boolean) => {
    if (!currentStatus) {
      await supabase.from('anuncios_flash').update({ activo: false }).neq('id', '00000000-0000-0000-0000-000000000000');
    }
    await supabase.from('anuncios_flash').update({ activo: !currentStatus }).eq('id', id);
    fetchAnuncios();
  };

  const confirmDelete = async () => {
    if (!anuncioToDelete) return;
    await supabase.from('anuncios_flash').delete().eq('id', anuncioToDelete);
    setAnuncioToDelete(null);
    fetchAnuncios();
  };

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 p-6 rounded-2xl shadow-sm border border-amber-200">
        <h3 className="text-lg font-bold text-amber-900 mb-2 flex items-center gap-2">
          <Zap className="text-amber-500" /> Nuevo Anuncio Flash
        </h3>
        <p className="text-sm text-amber-700/80 mb-5 tracking-tight font-medium">
          Aparecerá en color rojo brillante hasta arriba de la app de los clientes. Al publicar uno nuevo, los anteriores se ocultarán en automático para no estorbar.
        </p>
        <form onSubmit={handleSave} className="flex flex-col sm:flex-row gap-3">
          <input 
            type="text" 
            placeholder="Ej: 🚨 ¡Lluvias fuertes! Tiempos de entrega extendidos a 60 min." 
            value={mensaje} 
            onChange={(e) => setMensaje(e.target.value)}
            className="flex-1 bg-white border border-amber-200 rounded-xl px-5 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-medium transition-all"
          />
          <button 
            type="submit" 
            disabled={saving || !mensaje.trim()}
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-8 py-3.5 rounded-xl transition-all disabled:opacity-50 shadow-sm shadow-amber-500/20 active:scale-95"
          >
            {saving ? 'Publicando...' : 'Publicar Ahora'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-zinc-500 animate-pulse font-medium">Cargando historial de anuncios...</div>
        ) : anuncios.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 font-medium">No hay anuncios registrados.</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/80 border-b border-zinc-200 text-[10px] uppercase tracking-widest text-zinc-500">
                <th className="p-4 font-black">Mensaje Publicado</th>
                <th className="p-4 font-black text-center w-40">Estado Actual</th>
                <th className="p-4 font-black text-right w-24">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {anuncios.map(anuncio => (
                <tr key={anuncio.id} className="hover:bg-zinc-50/50 transition-colors group">
                  <td className="p-4 font-bold text-zinc-700">{anuncio.mensaje}</td>
                  <td className="p-4 text-center">
                    <button 
                      onClick={() => toggleActivo(anuncio.id, anuncio.activo)}
                      className={`text-[10px] uppercase tracking-widest font-black px-4 py-1.5 rounded-full transition-all ${
                        anuncio.activo 
                        ? 'bg-rose-100 text-rose-600 shadow-sm' 
                        : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'
                      }`}
                    >
                      {anuncio.activo ? '● EN VIVO' : 'OCULTO'}
                    </button>
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => setAnuncioToDelete(anuncio.id)}
                      className="text-zinc-300 hover:text-rose-500 p-2 rounded-lg transition-colors"
                      title="Eliminar permanentemente"
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
        isOpen={!!anuncioToDelete}
        onClose={() => setAnuncioToDelete(null)}
        onConfirm={confirmDelete}
        title="¿Borrar Anuncio Flash?"
        description="Esta acción eliminará el anuncio de forma permanente de la pantalla de inicio de la aplicación."
        confirmText="Sí, Borrar Anuncio"
        isDestructive={true}
      />
    </div>
  );
}

// ─── AVISOS / CONTROL VIEW ──────────────────────────────────────────────────
function AvisosView() {
  const [servicioPausado, setServicioPausado] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Push Notifications State
  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Kill Switch Sheet
  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const [targetKillState, setTargetKillState] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoadingConfig(true);
    // Asumimos que el ID 1 es la configuración global
    const { data } = await supabase.from('configuracion_app').select('servicio_pausado').eq('id', 1).single();
    if (data) {
      setServicioPausado(data.servicio_pausado);
    }
    setLoadingConfig(false);
  };

  const handleToggleKillSwitch = (nuevoEstado: boolean) => {
    setTargetKillState(nuevoEstado);
    setShowKillConfirm(true);
  };

  const confirmKillSwitch = async () => {
    try {
      await supabase.from('configuracion_app').upsert({ id: 1, servicio_pausado: targetKillState });
      setServicioPausado(targetKillState);
    } catch (e: any) {
      alert(`Error al actualizar estado: ${e.message}`);
    } finally {
      setShowKillConfirm(false);
    }
  };

  const handleSendPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo || !mensaje) return;
    setEnviando(true);
    try {
      // Idealmente aquí se llamaría a un Edge Function
      await new Promise(res => setTimeout(res, 1500)); // Simulando envío
      alert(`¡Notificación "${titulo}" enviada a todos los usuarios con éxito! (Simulación por ahora)`);
      setTitulo('');
      setMensaje('');
    } catch (e) {
      console.error(e);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* KILL SWITCH (Botón de Pánico) */}
        <div className={`p-8 rounded-2xl shadow-sm border transition-colors ${servicioPausado ? 'bg-rose-50 border-rose-200' : 'bg-white border-zinc-200'}`}>
          <div className="flex items-center gap-4 mb-4">
            <div className={`p-4 rounded-full ${servicioPausado ? 'bg-rose-100 text-rose-600' : 'bg-zinc-100 text-zinc-600'}`}>
              <AlertTriangle size={32} />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight">Kill-Switch Global</h3>
              <p className={`text-sm tracking-tight font-medium ${servicioPausado ? 'text-rose-600' : 'text-zinc-500'}`}>
                {servicioPausado ? '¡EL SERVICIO ESTÁ DETENIDO!' : 'El servicio opera con normalidad'}
              </p>
            </div>
          </div>
          <p className="text-sm text-zinc-600 mb-6 font-medium leading-relaxed">
            Al activar el botón de pánico, la aplicación bloqueará inmediatamente que los usuarios puedan realizar nuevos pedidos. Utilízalo únicamente en emergencias climáticas extremas o fallas críticas del sistema.
          </p>
          
          <button
            disabled={loadingConfig}
            onClick={() => handleToggleKillSwitch(!servicioPausado)}
            className={`w-full py-4 rounded-xl font-black tracking-widest uppercase transition-all shadow-sm ${
              servicioPausado 
              ? 'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50' 
              : 'bg-rose-600 text-white hover:bg-rose-700 hover:shadow-md hover:shadow-rose-600/20'
            }`}
          >
            {loadingConfig ? 'Cargando...' : servicioPausado ? 'Reactivar Servicio' : 'APAGAR APLICACIÓN'}
          </button>
        </div>

        {/* PUSH NOTIFICATIONS CENTER */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-zinc-200">
           <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Send size={24} /></div>
              <h3 className="text-xl font-black tracking-tight text-zinc-900">Centro de Difusión (Push)</h3>
           </div>
           
           <form onSubmit={handleSendPush} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Título del Mensaje</label>
                <input 
                  type="text" 
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ej. ¡Lluvia de Descuentos!"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-3 px-4 text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={50}
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Cuerpo de la Notificación</label>
                <textarea 
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  placeholder="Escribe el mensaje que leerán tus usuarios..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-3 px-4 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                  maxLength={150}
                  required
                />
                <div className="text-right mt-1 text-[10px] text-zinc-400 font-bold">{mensaje.length}/150</div>
              </div>
              
              <button
                type="submit"
                disabled={enviando}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {enviando ? 'Enviando Alerta...' : <><Megaphone size={18} /> Lanzar Alerta Global</>}
              </button>
           </form>
        </div>

      </div>

      <ConfirmSheet
        isOpen={showKillConfirm}
        onClose={() => setShowKillConfirm(false)}
        onConfirm={confirmKillSwitch}
        title={targetKillState ? "¿APAGAR LA APLICACIÓN?" : "¿REACTIVAR SERVICIO?"}
        description={targetKillState 
          ? "ESTA ES UNA ACCIÓN CRÍTICA. Ningún usuario podrá realizar pedidos nuevos hasta que vuelvas a encender la aplicación. Los pedidos en curso seguirán su flujo normal."
          : "La aplicación volverá a estar abierta para todo el público inmediatamente."}
        confirmText={targetKillState ? "SÍ, APAGAR TODO" : "SÍ, REACTIVAR"}
        isDestructive={targetKillState}
      />
    </div>
  );
}

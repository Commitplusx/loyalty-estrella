import { useState, useEffect, useRef } from 'react';
import { Megaphone, Ticket, Zap, Info, Bell, AlertTriangle, Send, Image, Upload, Loader2, Wand2, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import { toast } from 'sonner';

export function Marketing() {
  const [activeTab, setActiveTab] = useState<'cupones' | 'anuncios' | 'avisos' | 'banners'>('cupones');

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
        <button
          onClick={() => setActiveTab('banners')}
          className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'banners' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          <Image size={16} /> Banners Hero
        </button>
      </div>

      {/* Content */}
      {activeTab === 'cupones' && <CuponesView />}
      {activeTab === 'anuncios' && <AnunciosView />}
      {activeTab === 'avisos' && <AvisosView />}
      {activeTab === 'banners' && <BannersView />}
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
  const [activeTab, setActiveTab] = useState<'cupones' | 'anuncios' | 'avisos' | 'banners'>('cupones');
  
  // Estados para Cupones
  const [cupones, setCupones] = useState<any[]>([]);
  const [loadingCupones, setLoadingCupones] = useState(true);
  
  // Estados para Banners
  const [heroBanners, setHeroBanners] = useState<any[]>([]);
  const [loadingBanners, setLoadingBanners] = useState(true);

  // Estados para Push Global
  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [generandoIA, setGenerandoIA] = useState(false);

  // Estado del botón de pánico
  const [servicioPausado, setServicioPausado] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);

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
      const { data, error } = await supabase.functions.invoke('enviar-push-marketing', {
        body: { title: titulo, body: mensaje }
      });

      if (error) throw error;
      
      const successCount = data?.exitos || 0;
      const errorCount = data?.errores || 0;
      
      toast.success(`¡Notificación enviada con éxito a ${successCount} dispositivos! (Inactivos eliminados: ${errorCount})`, { duration: 5000 });
      setTitulo('');
      setMensaje('');
    } catch (e: any) {
      console.error(e);
      if (e.message?.includes('Failed to send a request')) {
        toast.error('Conexión bloqueada por tu red (AdBlock/Antivirus). Por favor, apágalo para esta página y recarga la pestaña (F5).', { duration: 8000 });
      } else {
        toast.error(`Error al enviar notificaciones: ${e.message}`, { duration: 5000 });
      }
    } finally {
      setEnviando(false);
    }
  };

  const generarTextoIA = async () => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      toast.error('Falta configurar VITE_GEMINI_API_KEY en tu archivo .env', { duration: 5000 });
      return;
    }

    setGenerandoIA(true);
    toast.loading('Generando magia con IA...', { id: 'ai-toast' });

    try {
      const prompt = `Eres un experto en marketing persuasivo para una app de comida a domicilio (Estrella Eats).
Genera una notificación push muy atractiva para enviar a todos los usuarios.
REGLAS ESTRICTAS:
1. Usa emojis para llamar la atención.
2. Genera e incluye SIEMPRE un código de cupón corto y llamativo (ej. ANTOJO15, PIZZA20) que ofrezca un 15% o 20% de descuento en la app.
3. Puedes hablar de comida deliciosa, antojos de fin de semana, hambre o postres.
4. El mensaje (body) debe tener MÁXIMO 130 caracteres.
5. El título debe ser corto y llamativo (max 40 caracteres).

Responde ÚNICAMENTE con un JSON válido en este formato exacto:
{
  "titulo": "Tu título aquí",
  "mensaje": "Tu mensaje aquí"
}`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.9,
            responseMimeType: "application/json"
          }
        })
      });

      if (!res.ok) throw new Error('Error al contactar a Gemini API');
      
      const data = await res.json();
      const textResponse = data.candidates[0].content.parts[0].text;
      const result = JSON.parse(textResponse);

      setTitulo(result.titulo);
      setMensaje(result.mensaje);
      toast.success('¡Texto generado con éxito!', { id: 'ai-toast' });
    } catch (e: any) {
      console.error('Error IA:', e);
      toast.error('Hubo un error al generar el texto con IA.', { id: 'ai-toast' });
    } finally {
      setGenerandoIA(false);
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
           <div className="flex items-center justify-between mb-6">
             <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Send size={24} /></div>
                <h3 className="text-xl font-black tracking-tight text-zinc-900">Centro de Difusión (Push)</h3>
             </div>
             <button 
               type="button" 
               onClick={generarTextoIA}
               disabled={generandoIA}
               className="bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
             >
               {generandoIA ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} 
               {generandoIA ? 'Pensando...' : 'IA'}
             </button>
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

// ------------------------------------------------------------------
// COMPONENTE: BANNERS HERO (app_banners)
// ------------------------------------------------------------------
function BannersView() {
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [subtitulo, setSubtitulo] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [bannerToDelete, setBannerToDelete] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDynamic, setIsDynamic] = useState(false);

  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    setLoading(true);
    const { data } = await supabase.from('app_banners').select('*').order('creado_en', { ascending: false });
    if (data) setBanners(data);
    setLoading(false);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setImageFile(file);
      setIsDynamic(false);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo) return;
    setSaving(true);
    try {
      let finalImageUrl = 'dynamic-gradient';

      if (!isDynamic && imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `banner_${Date.now()}.${fileExt}`;
        const filePath = `banners/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('publicidad')
          .upload(filePath, imageFile, { cacheControl: '3600', upsert: true });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('publicidad').getPublicUrl(filePath);
        finalImageUrl = data.publicUrl;
      }

      await supabase.from('app_banners').insert([{
        titulo,
        subtitulo,
        imagen_url: finalImageUrl,
        link_url: linkUrl || null,
        activo: true
      }]);
      
      setTitulo('');
      setSubtitulo('');
      setLinkUrl('');
      setImageFile(null);
      setImagePreview(null);
      setIsDynamic(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchBanners();
    } catch (err) {
      console.error(err);
      alert('Error al guardar el banner.');
    } finally {
      setSaving(false);
    }
  };

  const toggleBanner = async (id: string, activo: boolean) => {
    await supabase.from('app_banners').update({ activo: !activo }).eq('id', id);
    fetchBanners();
  };

  const confirmDelete = async () => {
    if (!bannerToDelete) return;
    await supabase.from('app_banners').delete().eq('id', bannerToDelete);
    setBannerToDelete(null);
    fetchBanners();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
        <h3 className="text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
          <Image className="text-blue-500" /> Crear Hero Banner
        </h3>
        
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Título del Banner</label>
              <input required type="text" placeholder="Ej. Pide tus favoritos al instante" value={titulo} onChange={e => setTitulo(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Subtítulo</label>
              <input type="text" placeholder="Ej. Descubre los mejores restaurantes cerca de ti" value={subtitulo} onChange={e => setSubtitulo(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Diseño del Banner</label>
            <div className="flex flex-col md:flex-row gap-4 items-start">
               <div className="flex-1 w-full flex gap-2">
                 <button 
                   type="button" 
                   onClick={() => setIsDynamic(true)} 
                   className={`flex-1 py-3 rounded-xl border flex items-center justify-center gap-2 font-bold transition-all ${isDynamic ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
                 >
                   <Wand2 size={18} /> Diseño Dinámico (Auto)
                 </button>
                 <button 
                   type="button" 
                   onClick={() => fileInputRef.current?.click()} 
                   className={`flex-1 py-3 rounded-xl border flex items-center justify-center gap-2 font-bold transition-all ${!isDynamic && imagePreview ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
                 >
                   <Upload size={18} /> Subir Imagen Propia
                 </button>
                 <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="hidden" />
               </div>
               
               {/* Vista Previa */}
               <div className="w-full md:w-64 h-24 rounded-xl overflow-hidden border border-zinc-200 relative flex items-center justify-center bg-zinc-50">
                 {isDynamic ? (
                   <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-500 flex items-center justify-center">
                     <span className="text-white font-black text-sm drop-shadow-md px-4 text-center">{titulo || 'Título aquí'}</span>
                   </div>
                 ) : imagePreview ? (
                   <img src={imagePreview} className="absolute inset-0 w-full h-full object-cover" />
                 ) : (
                   <span className="text-zinc-400 text-xs font-bold uppercase">Sin imagen</span>
                 )}
               </div>
            </div>
            <p className="text-xs text-zinc-500 mt-2">Puedes subir una imagen desde tu galería o computadora, o elegir diseño automático si solo tienes texto.</p>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">URL de Destino (Link opcional al hacer clic)</label>
            <input type="text" placeholder="Ej. /menu/mi-restaurante" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500" />
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={saving || (!isDynamic && !imageFile)} className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-8 py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? 'Guardando...' : 'Crear Banner'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-zinc-500 animate-pulse">Cargando banners...</div>
        ) : banners.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">No hay banners registrados.</div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {banners.map(b => {
              const isDyn = b.imagen_url === 'dynamic-gradient';
              return (
                <div key={b.id} className="p-6 flex flex-col md:flex-row gap-6 items-center hover:bg-zinc-50 transition-colors">
                  <div className={`w-full md:w-64 h-32 rounded-xl relative overflow-hidden flex items-center justify-center shadow-inner ${isDyn ? 'bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-500' : 'bg-cover bg-center bg-zinc-200'}`} style={!isDyn ? { backgroundImage: `url(${b.imagen_url})` } : {}}>
                     {isDyn && (
                       <div className="absolute inset-0 p-4 flex flex-col justify-center text-center">
                         <h4 className="text-white font-black text-sm leading-tight drop-shadow-md">{b.titulo}</h4>
                         {b.subtitulo && <p className="text-blue-100 text-[10px] mt-1 drop-shadow-md">{b.subtitulo}</p>}
                       </div>
                     )}
                  </div>
                  
                  <div className="flex-1 w-full text-sm">
                     <p className="text-zinc-900 font-black text-base mb-1">{b.titulo}</p>
                     <p className="text-zinc-500 mb-1"><span className="font-bold text-zinc-700">Link:</span> {b.link_url || 'Ninguno'}</p>
                     <p className="text-zinc-500 mb-3"><span className="font-bold text-zinc-700">Estado:</span> {b.activo ? <span className="text-emerald-600 font-bold">Activo</span> : <span className="text-zinc-400 font-bold">Inactivo</span>}</p>
                     
                     <div className="flex gap-2">
                       <button onClick={() => toggleBanner(b.id, b.activo)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${b.activo ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                         {b.activo ? 'Desactivar' : 'Activar'}
                       </button>
                       <button onClick={() => setBannerToDelete(b.id)} className="px-4 py-1.5 rounded-lg text-xs font-bold text-rose-500 hover:bg-rose-50 transition-colors">
                         Eliminar
                       </button>
                     </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmSheet
        isOpen={!!bannerToDelete}
        onClose={() => setBannerToDelete(null)}
        onConfirm={confirmDelete}
        title="¿Borrar Banner?"
        description="Este banner será eliminado de forma permanente."
        confirmText="Sí, Borrar"
        isDestructive={true}
      />
    </div>
  );
}

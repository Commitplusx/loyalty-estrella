import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Store, MapPin, Phone, Mail, Edit3, ShieldCheck, Key, Package } from 'lucide-react';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';

export function AliadoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [restaurante, setRestaurante] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  
  // Comision State
  const [editingComision, setEditingComision] = useState(false);
  const [newComision, setNewComision] = useState('0');
  const [savingComision, setSavingComision] = useState(false);

  useEffect(() => {
    const fetchRestaurante = async () => {
      try {
        setLoading(true);
        if (!id) return;
        
        const { data, error } = await supabase
          .from('restaurantes')
          .select('*')
          .eq('id', id)
          .single();
          
        if (error) throw error;
        setRestaurante(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRestaurante();
  }, [id]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-zinc-500">Cargando perfil del aliado...</div>;
  }

  if (!restaurante) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <h2 className="text-xl font-bold text-zinc-700">Aliado no encontrado</h2>
        <button onClick={() => navigate('/aliados')} className="mt-4 px-4 py-2 bg-zinc-900 text-white rounded-lg">Volver</button>
      </div>
    );
  }

  const confirmResetPin = async () => {
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    try {
      const { error } = await supabase
        .from('restaurantes')
        .update({ pin: newPin })
        .eq('id', restaurante.id);
        
      if (error) {
         if (error.message.includes('pin')) {
            const { error: err2 } = await supabase.from('restaurantes').update({ password: newPin }).eq('id', restaurante.id);
            if (err2) throw err2;
         } else {
            throw error;
         }
      }
      
      alert(`¡PIN reseteado con éxito!\n\nEl nuevo PIN de acceso para el restaurante es: ${newPin}\n\nPor favor, comunícalo al aliado.`);
    } catch (e: any) {
      alert(`Hubo un error al intentar resetear el PIN: ${e.message}`);
    } finally {
      setShowConfirmPin(false);
    }
  };

  const handleSaveComision = async () => {
    const val = parseFloat(newComision);
    if (isNaN(val) || val < 0 || val > 100) {
      alert('Por favor ingresa un porcentaje válido entre 0 y 100.');
      return;
    }
    
    setSavingComision(true);
    try {
      const { error } = await supabase
        .from('restaurantes')
        .update({ comision_porcentaje: val })
        .eq('id', restaurante.id);
        
      if (error) throw error;
      setRestaurante({ ...restaurante, comision_porcentaje: val });
      setEditingComision(false);
    } catch (e: any) {
      alert(`Error al guardar la comisión: ${e.message}`);
    } finally {
      setSavingComision(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Navigation */}
      <button 
        onClick={() => navigate('/aliados')}
        className="flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        <ArrowLeft size={16} /> Volver a Aliados
      </button>

      {/* Hero Header */}
      <div className="relative h-64 md:h-80 w-full rounded-3xl overflow-hidden bg-zinc-900 shadow-sm border border-zinc-200">
        {restaurante.foto_fachada_url ? (
          <img src={restaurante.foto_fachada_url} className="absolute inset-0 w-full h-full object-cover opacity-50 mix-blend-overlay" alt={restaurante.nombre} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <Store size={120} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/60 to-transparent" />
        
        <div className="absolute bottom-8 left-8 right-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight flex items-center gap-3">
              {restaurante.nombre}
              {restaurante.es_socio && <ShieldCheck size={32} className="text-emerald-400" />}
            </h1>
            <p className="text-zinc-400 text-sm font-bold uppercase tracking-widest mt-2 flex items-center gap-2">
              <MapPin size={16} /> {restaurante.etiqueta_zona || 'Sin Zona Asignada'}
            </p>
          </div>
          
          <div className="flex gap-3">
             <button className="px-5 py-2.5 bg-white text-zinc-900 font-bold rounded-xl shadow-sm text-sm tracking-tight flex items-center gap-2 hover:bg-zinc-100 transition-colors">
               <Edit3 size={16}/> Editar Perfil
             </button>
          </div>
        </div>
      </div>

      {/* Grid de Detalles */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Columna Izquierda: Info Básica */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
             <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-6">Contacto y Ubicación</h4>
             
             <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 bg-zinc-100 rounded-xl text-zinc-600"><Phone size={18} /></div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Teléfono Principal</p>
                    <p className="text-sm font-bold text-zinc-900 mt-1 tracking-tight">{restaurante.telefono || 'No registrado'}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="p-2.5 bg-zinc-100 rounded-xl text-zinc-600"><Mail size={18} /></div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Correo Electrónico</p>
                    <p className="text-sm font-bold text-zinc-900 mt-1 tracking-tight">{restaurante.correo || 'No registrado'}</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="p-2.5 bg-zinc-100 rounded-xl text-zinc-600"><MapPin size={18} /></div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Coordenadas GPS</p>
                    <p className="text-sm font-bold text-zinc-900 mt-1 tracking-tight">Lat: {restaurante.lat}<br/>Lng: {restaurante.lng}</p>
                  </div>
                </div>
             </div>
          </div>
        </div>

        {/* Columna Derecha: Finanzas y Acciones */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Finanzas */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
             <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-6">Finanzas y Comisiones</h4>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl shadow-sm text-center md:text-left flex flex-col md:flex-row items-center gap-4 group">
                  <div className="p-4 bg-emerald-100 rounded-full text-emerald-600"><Store size={24} /></div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Comisión App</p>
                      {!editingComision && (
                        <button 
                          onClick={() => {
                            setNewComision((restaurante.comision_porcentaje || 0).toString());
                            setEditingComision(true);
                          }}
                          className="text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-emerald-200 rounded-md"
                        >
                          <Edit3 size={14} />
                        </button>
                      )}
                    </div>
                    
                    {editingComision ? (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="relative">
                          <input 
                            type="number" 
                            min="0" max="100"
                            value={newComision}
                            onChange={(e) => setNewComision(e.target.value)}
                            className="w-20 bg-white border border-emerald-300 rounded-lg py-1.5 px-3 text-lg font-black text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <span className="absolute right-3 top-2 text-emerald-500 font-bold">%</span>
                        </div>
                        <button 
                          onClick={handleSaveComision}
                          disabled={savingComision}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <ShieldCheck size={18} />
                        </button>
                        <button 
                          onClick={() => setEditingComision(false)}
                          disabled={savingComision}
                          className="bg-zinc-200 hover:bg-zinc-300 text-zinc-600 p-2 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <ArrowLeft size={18} />
                        </button>
                      </div>
                    ) : (
                      <p className="text-4xl font-black text-emerald-900 tracking-tight">
                        {restaurante.comision_porcentaje || 0}%
                      </p>
                    )}
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 p-6 rounded-2xl shadow-sm text-center md:text-left flex flex-col md:flex-row items-center gap-4">
                  <div className="p-4 bg-blue-100 rounded-full text-blue-600"><Package size={24} /></div>
                  <div>
                    <p className="text-[11px] font-bold text-blue-600 uppercase tracking-widest mb-1">Envío Base</p>
                    <p className="text-4xl font-black text-blue-900 tracking-tight">$45</p>
                  </div>
                </div>
             </div>
          </div>
          
          {/* Danger Zone */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-rose-200">
             <h4 className="text-xs font-bold text-rose-500 uppercase tracking-widest mb-6">Zona de Peligro</h4>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <button 
                  onClick={() => setShowConfirmPin(true)}
                  className="w-full bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-900 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors tracking-tight text-sm shadow-sm"
               >
                  <Key size={18} /> Forzar Reseteo de PIN
                </button>
                <button className="w-full bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors tracking-tight text-sm shadow-sm">
                  <Store size={18} /> Cerrar Restaurante (Forzado)
                </button>
             </div>
          </div>
          
        </div>
      </div>

      <ConfirmSheet
        isOpen={showConfirmPin}
        onClose={() => setShowConfirmPin(false)}
        onConfirm={confirmResetPin}
        title="¿Forzar Reseteo de PIN?"
        description={`Esto invalidará el PIN actual de ${restaurante.nombre}. Se generará uno nuevo que deberás proporcionarle al dueño para que pueda iniciar sesión.`}
        confirmText="Sí, Resetear PIN"
        isDestructive={true}
      />
    </div>
  );
}

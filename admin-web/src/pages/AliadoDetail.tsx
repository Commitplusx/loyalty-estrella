import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Store, MapPin, Phone, Mail, Edit3, ShieldCheck, Key, Package, Image as ImageIcon, Loader2, Save, X, Network } from 'lucide-react';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import { MenuAdmin } from '../components/restaurantes/MenuAdmin';

export function AliadoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [restaurante, setRestaurante] = useState<any>(null);
  const [matrices, setMatrices] = useState<any[]>([]);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  
  // Image Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // Comision State
  const [editingComision, setEditingComision] = useState(false);
  const [newComision, setNewComision] = useState('0');
  const [savingComision, setSavingComision] = useState(false);

  // Email State
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  // Hierarchy State
  const [editingHierarchy, setEditingHierarchy] = useState(false);
  const [selectedMatrizId, setSelectedMatrizId] = useState<string>('none');
  const [savingHierarchy, setSavingHierarchy] = useState(false);

  // Funciones para cargar imagen
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !restaurante) return;
    const file = e.target.files[0];
    
    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `restaurantes/${restaurante.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('public-assets')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('public-assets').getPublicUrl(filePath);
      
      const { error: dbError } = await supabase
        .from('restaurantes')
        .update({ foto_fachada_url: data.publicUrl })
        .eq('id', restaurante.id);
        
      if (dbError) throw dbError;
      
      setRestaurante({ ...restaurante, foto_fachada_url: data.publicUrl });
      alert('Foto de perfil actualizada con éxito');
    } catch (error: any) {
      console.error(error);
      alert('Error al subir la imagen: ' + error.message);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    const fetchRestaurante = async () => {
      try {
        setLoading(true);
        if (!id) return;
        
        const [restRes, matRes, branchesRes] = await Promise.all([
          supabase.from('restaurantes').select('*').eq('id', id).single(),
          supabase.from('restaurantes').select('id, nombre').is('matriz_id', null).neq('id', id),
          supabase.from('restaurantes').select('id, nombre, telefono, direccion, activo, foto_fachada_url').eq('matriz_id', id)
        ]);
          
        if (restRes.error) throw restRes.error;
        setRestaurante(restRes.data);
        if (matRes.data) setMatrices(matRes.data);
        if (branchesRes.data) setSucursales(branchesRes.data);
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

  const handleSaveEmail = async () => {
    if (!newEmail || !newPassword) {
      alert('Por favor, ingresa el correo y la contraseña.');
      return;
    }
    
    if (!newEmail.includes('@')) {
      alert('Por favor, ingresa un correo válido.');
      return;
    }

    if (newPassword.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setSavingEmail(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No estás autenticado');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            type: 'asignar_restaurante',
            email: newEmail.trim(),
            password: newPassword,
            restaurante_id: restaurante.id
          })
        }
      );

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Error al asignar el correo');
      }

      setRestaurante({ ...restaurante, correo: newEmail.trim(), admin_id: result.user_id });
      setEditingEmail(false);
      setNewPassword('');
      alert('¡Correo y contraseña asignados con éxito!\nYa puede iniciar sesión en la app de aliados.');
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSaveHierarchy = async () => {
    setSavingHierarchy(true);
    try {
      const isMatriz = selectedMatrizId === 'none';
      const matrizId = isMatriz ? null : selectedMatrizId;
      
      const { error } = await supabase
        .from('restaurantes')
        .update({
          matriz_id: matrizId,
          es_matriz: isMatriz,
          // Si lo volvemos sucursal, le quitamos el admin_id
          ...(isMatriz ? {} : { admin_id: null })
        })
        .eq('id', restaurante.id);
        
      if (error) throw error;
      
      setRestaurante({
        ...restaurante,
        matriz_id: matrizId,
        es_matriz: isMatriz,
        ...(isMatriz ? {} : { admin_id: null })
      });
      setEditingHierarchy(false);
      alert('Jerarquía actualizada con éxito.');
    } catch (e: any) {
      alert(`Error al guardar: ${e.message}`);
    } finally {
      setSavingHierarchy(false);
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
             <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
             <button 
               onClick={() => fileInputRef.current?.click()} 
               disabled={uploadingImage}
               className="px-5 py-2.5 bg-white text-zinc-900 font-bold rounded-xl shadow-sm text-sm tracking-tight flex items-center gap-2 hover:bg-zinc-100 transition-colors disabled:opacity-50"
             >
               {uploadingImage ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16}/>} 
               {uploadingImage ? 'Subiendo...' : 'Cambiar Foto'}
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
                
                {!restaurante.matriz_id ? (
                  <div className="flex items-start gap-4 group/email">
                    <div className="p-2.5 bg-zinc-100 rounded-xl text-zinc-600"><Mail size={18} /></div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Correo Electrónico</p>
                        {!editingEmail && (
                          <button 
                            onClick={() => {
                              setNewEmail(restaurante.correo || '');
                              setNewPassword('');
                              setEditingEmail(true);
                            }}
                            className="text-zinc-400 p-1 hover:bg-zinc-100 hover:text-zinc-900 rounded-md transition-colors"
                            title="Asignar correo"
                          >
                            <Edit3 size={16} />
                          </button>
                        )}
                      </div>
                      
                      {editingEmail ? (
                        <div className="mt-2 space-y-2 bg-zinc-50 p-3 rounded-xl border border-zinc-200">
                          <input
                            type="email"
                            placeholder="Correo del dueño"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                          />
                          <input
                            type="text"
                            placeholder="Contraseña temporal"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                          />
                          <div className="flex items-center gap-2 pt-1">
                            <button 
                              onClick={handleSaveEmail}
                              disabled={savingEmail}
                              className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white py-1.5 rounded-lg flex items-center justify-center gap-1 text-xs font-bold transition-colors disabled:opacity-50"
                            >
                              {savingEmail ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                              Guardar
                            </button>
                            <button 
                              onClick={() => setEditingEmail(false)}
                              disabled={savingEmail}
                              className="bg-zinc-200 hover:bg-zinc-300 text-zinc-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm font-bold text-zinc-900 mt-1 tracking-tight break-all">
                          {restaurante.correo || 'No registrado'}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-xl text-blue-600"><ShieldCheck size={18} /></div>
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Acceso Centralizado</p>
                      <p className="text-xs text-blue-900 mt-1 font-medium leading-relaxed">
                        El menú y las credenciales de acceso se administran directamente desde la Matriz.
                      </p>
                    </div>
                  </div>
                )}
                
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
          
          {/* Jerarquía - Oculta temporalmente por requerimiento del cliente
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200">
             <div className="flex items-center justify-between mb-6">
               <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Jerarquía de Negocio</h4>
               {!editingHierarchy && (
                  <button 
                    onClick={() => {
                      setSelectedMatrizId(restaurante.matriz_id || 'none');
                      setEditingHierarchy(true);
                    }}
                    className="text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 p-1.5 rounded-lg transition-colors"
                  >
                    <Edit3 size={16} />
                  </button>
               )}
             </div>
             
             <div className="flex items-start gap-4">
               <div className={`p-2.5 rounded-xl ${restaurante.matriz_id ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                 <Network size={20} />
               </div>
               <div className="flex-1 w-full">
                 {editingHierarchy ? (
                   <div className="space-y-3">
                     <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Tipo de Establecimiento</p>
                     <select 
                       value={selectedMatrizId}
                       onChange={(e) => setSelectedMatrizId(e.target.value)}
                       className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-2 px-3 text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
                     >
                       <option value="none">Independiente / Matriz</option>
                       {matrices.map(m => (
                         <option key={m.id} value={m.id}>Sucursal de: {m.nombre}</option>
                       ))}
                     </select>
                     <div className="flex gap-2">
                        <button 
                          onClick={handleSaveHierarchy}
                          disabled={savingHierarchy}
                          className="flex-1 bg-zinc-900 text-white font-bold text-xs py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                        >
                          {savingHierarchy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
                        </button>
                        <button 
                          onClick={() => setEditingHierarchy(false)}
                          disabled={savingHierarchy}
                          className="bg-zinc-100 text-zinc-600 font-bold text-xs px-3 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors"
                        >
                          Cancelar
                        </button>
                     </div>
                   </div>
                 ) : (
                   <div>
                     <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Tipo de Establecimiento</p>
                     {restaurante.matriz_id ? (
                       <p className="text-sm font-bold text-indigo-900 mt-1 tracking-tight">
                         Sucursal (Depende de otra Matriz)
                       </p>
                     ) : (
                       <p className="text-sm font-bold text-amber-900 mt-1 tracking-tight">
                         Independiente / Matriz
                       </p>
                     )}
                   </div>
                 )}
               </div>
             </div>
          </div>
          */}
          
        </div>
      </div>
      
      {/* Sección de Sucursales (Oculta temporalmente)
      {!restaurante.matriz_id && sucursales.length > 0 && (
        <div className="mt-8 bg-zinc-50 rounded-3xl p-6 border border-zinc-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-zinc-200 rounded-xl text-zinc-700">
              <Network size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-zinc-900 tracking-tight">Sucursales de este Negocio</h3>
              <p className="text-sm text-zinc-500 tracking-tight">Selecciona una sucursal para administrarla individualmente.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sucursales.map(suc => (
              <div 
                key={suc.id} 
                onClick={() => navigate(`/aliados/${suc.id}`)}
                className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-zinc-300 transition-all cursor-pointer group flex items-start gap-4"
              >
                <div className="w-16 h-16 rounded-xl bg-zinc-100 overflow-hidden shrink-0 border border-zinc-200">
                  {suc.foto_fachada_url ? (
                    <img src={suc.foto_fachada_url} alt={suc.nombre} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400">
                      <Store size={24} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-zinc-900 text-sm tracking-tight truncate group-hover:text-blue-600 transition-colors">{suc.nombre}</h4>
                  <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1 truncate"><Phone size={12}/> {suc.telefono || 'Sin teléfono'}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${suc.activo ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{suc.activo ? 'Abierto' : 'Pausado'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      */}
      
      {/* Menu Admin Section */}
      <div className="mt-8 bg-zinc-50 rounded-3xl p-6 border border-zinc-200">
        <MenuAdmin restauranteId={restaurante.id} />
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

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit3, Trash2, Image as ImageIcon, GripVertical, Loader2, Save, X } from 'lucide-react';
import { BottomSheet } from '../ui/BottomSheet';
import { ConfirmSheet } from '../ui/ConfirmSheet';

interface Categoria {
  id: string;
  nombre: string;
  emoji: string;
  orden: number;
  activa: boolean;
}

interface MenuItem {
  id: string;
  categoria_id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  disponible: boolean;
  foto_url: string | null;
  orden: number;
}

export function MenuAdmin({ restauranteId }: { restauranteId: string }) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // States for Category Form
  const [isCatSheetOpen, setIsCatSheetOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Categoria | null>(null);
  const [catNombre, setCatNombre] = useState('');
  const [catEmoji, setCatEmoji] = useState('🍽️');
  const [catSaving, setCatSaving] = useState(false);

  // States for Item Form
  const [isItemSheetOpen, setIsItemSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemNombre, setItemNombre] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemPrecio, setItemPrecio] = useState('');
  const [itemCatId, setItemCatId] = useState('');
  const [itemFotoUrl, setItemFotoUrl] = useState('');
  const [itemSaving, setItemSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // States for Confirm Deletion
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [catsRes, itemsRes] = await Promise.all([
        supabase.from('menu_categorias').select('*').eq('restaurante_id', restauranteId).order('orden'),
        supabase.from('menu_items').select('*').eq('restaurante_id', restauranteId).order('orden')
      ]);

      if (catsRes.error) throw catsRes.error;
      if (itemsRes.error) throw itemsRes.error;

      setCategorias(catsRes.data || []);
      setItems(itemsRes.data || []);
    } catch (e: any) {
      console.error(e);
      alert('Error cargando el menú: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (restauranteId) {
      fetchData();
    }
  }, [restauranteId]);

  // CATEGORY FUNCTIONS
  const openCatSheet = (cat: Categoria | null = null) => {
    if (cat) {
      setEditingCat(cat);
      setCatNombre(cat.nombre);
      setCatEmoji(cat.emoji || '🍽️');
    } else {
      setEditingCat(null);
      setCatNombre('');
      setCatEmoji('🍽️');
    }
    setIsCatSheetOpen(true);
  };

  const saveCategoria = async () => {
    if (!catNombre.trim()) return;
    setCatSaving(true);
    try {
      if (editingCat) {
        const { error } = await supabase.from('menu_categorias')
          .update({ nombre: catNombre.trim(), emoji: catEmoji })
          .eq('id', editingCat.id);
        if (error) throw error;
      } else {
        const newOrder = categorias.length > 0 ? Math.max(...categorias.map(c => c.orden)) + 1 : 1;
        const { error } = await supabase.from('menu_categorias')
          .insert([{ restaurante_id: restauranteId, nombre: catNombre.trim(), emoji: catEmoji, orden: newOrder, activa: true }]);
        if (error) throw error;
      }
      await fetchData();
      setIsCatSheetOpen(false);
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setCatSaving(false);
    }
  };

  // ITEM FUNCTIONS
  const openItemSheet = (catId: string, item: MenuItem | null = null) => {
    setItemCatId(catId);
    if (item) {
      setEditingItem(item);
      setItemNombre(item.nombre);
      setItemDesc(item.descripcion || '');
      setItemPrecio(item.precio.toString());
      setItemFotoUrl(item.foto_url || '');
    } else {
      setEditingItem(null);
      setItemNombre('');
      setItemDesc('');
      setItemPrecio('');
      setItemFotoUrl('');
    }
    setIsItemSheetOpen(true);
  };

  const saveItem = async () => {
    if (!itemNombre.trim() || !itemPrecio) return;
    setItemSaving(true);
    try {
      const payload = {
        restaurante_id: restauranteId,
        categoria_id: itemCatId,
        nombre: itemNombre.trim(),
        descripcion: itemDesc.trim() || null,
        precio: parseFloat(itemPrecio),
        foto_url: itemFotoUrl || null,
      };

      if (editingItem) {
        const { error } = await supabase.from('menu_items').update(payload).eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const catItems = items.filter(i => i.categoria_id === itemCatId);
        const newOrder = catItems.length > 0 ? Math.max(...catItems.map(c => c.orden || 0)) + 1 : 1;
        const { error } = await supabase.from('menu_items').insert([{ ...payload, orden: newOrder, disponible: true }]);
        if (error) throw error;
      }
      await fetchData();
      setIsItemSheetOpen(false);
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setItemSaving(false);
    }
  };

  const toggleItemAvailability = async (id: string, current: boolean) => {
    try {
      setItems(prev => prev.map(i => i.id === id ? { ...i, disponible: !current } : i));
      const { error } = await supabase.from('menu_items').update({ disponible: !current }).eq('id', id);
      if (error) throw error;
    } catch (e: any) {
      console.error(e);
      await fetchData(); // rollback
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      const { error } = await supabase.from('menu_items').delete().eq('id', itemToDelete);
      if (error) throw error;
      await fetchData();
    } catch (e: any) {
      alert('Error al eliminar: ' + e.message);
    } finally {
      setShowConfirmDelete(false);
      setItemToDelete(null);
    }
  };

  // UPLOAD IMAGE
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `platillos/${restauranteId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('public-assets')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('public-assets').getPublicUrl(filePath);
      setItemFotoUrl(data.publicUrl);
    } catch (error: any) {
      console.error(error);
      alert('Error al subir la imagen: ' + error.message);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-zinc-400" size={32} /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-zinc-900 tracking-tight">Menú del Restaurante</h2>
          <p className="text-sm text-zinc-500">Organiza las categorías y los platillos que ven los clientes.</p>
        </div>
        <button 
          onClick={() => openCatSheet()}
          className="bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm"
        >
          <Plus size={16} /> Agregar Categoría
        </button>
      </div>

      {categorias.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-400 mb-4">
            <GripVertical size={32} />
          </div>
          <h3 className="text-lg font-bold text-zinc-900 tracking-tight">El menú está vacío</h3>
          <p className="text-sm text-zinc-500 max-w-sm mx-auto mt-2">Crea tu primera categoría para empezar a agregar platillos al restaurante.</p>
          <button 
            onClick={() => openCatSheet()}
            className="mt-6 bg-zinc-900 text-white px-6 py-2.5 rounded-xl font-bold shadow-sm"
          >
            Crear Primera Categoría
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {categorias.map(cat => {
            const catItems = items.filter(i => i.categoria_id === cat.id);
            return (
              <div key={cat.id} className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                {/* Category Header */}
                <div className="bg-zinc-50 border-b border-zinc-200 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-zinc-100 flex items-center justify-center text-lg">
                      {cat.emoji || '🍽️'}
                    </div>
                    <div>
                      <h3 className="font-black text-zinc-900 text-lg tracking-tight">{cat.nombre}</h3>
                      <p className="text-xs text-zinc-500 font-medium">{catItems.length} platillos</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => openItemSheet(cat.id)}
                      className="text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                    >
                      <Plus size={14} /> Añadir Platillo
                    </button>
                    <button 
                      onClick={() => openCatSheet(cat)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-700 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-lg transition-colors"
                      title="Editar Categoría"
                    >
                      <Edit3 size={16} />
                    </button>
                  </div>
                </div>

                {/* Items List */}
                <div className="divide-y divide-zinc-100">
                  {catItems.length === 0 ? (
                    <div className="p-8 text-center text-zinc-400 text-sm font-medium">
                      No hay platillos en esta categoría.
                    </div>
                  ) : (
                    catItems.map(item => (
                      <div key={item.id} className="p-4 flex gap-4 hover:bg-zinc-50/50 transition-colors group">
                        {/* Image */}
                        <div className="w-20 h-20 bg-zinc-100 rounded-xl border border-zinc-200 overflow-hidden shrink-0 flex items-center justify-center relative group/img">
                          {item.foto_url ? (
                            <img src={item.foto_url} alt={item.nombre} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="text-zinc-300" size={24} />
                          )}
                        </div>
                        
                        {/* Details */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h4 className="font-bold text-zinc-900 tracking-tight text-[15px]">{item.nombre}</h4>
                              <p className="text-zinc-500 text-xs mt-0.5 line-clamp-2 leading-relaxed max-w-xl">{item.descripcion || 'Sin descripción'}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-black text-emerald-600 text-lg">${item.precio}</span>
                            </div>
                          </div>
                          
                          {/* Actions */}
                          <div className="flex items-center gap-4 mt-3">
                            <label className="flex items-center cursor-pointer gap-2">
                              <div className="relative">
                                <input 
                                  type="checkbox" 
                                  className="sr-only peer" 
                                  checked={item.disponible}
                                  onChange={() => toggleItemAvailability(item.id, item.disponible)}
                                />
                                <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                              </div>
                              <span className={`text-[11px] font-bold uppercase tracking-widest ${item.disponible ? 'text-emerald-600' : 'text-zinc-400'}`}>
                                {item.disponible ? 'Disponible' : 'Agotado'}
                              </span>
                            </label>

                            <div className="w-px h-4 bg-zinc-200"></div>

                            <button onClick={() => openItemSheet(cat.id, item)} className="text-[11px] font-bold text-zinc-500 hover:text-blue-600 uppercase tracking-widest flex items-center gap-1 transition-colors">
                              <Edit3 size={12}/> Editar
                            </button>
                            
                            <button onClick={() => { setItemToDelete(item.id); setShowConfirmDelete(true); }} className="text-[11px] font-bold text-zinc-400 hover:text-rose-600 uppercase tracking-widest flex items-center gap-1 transition-colors md:opacity-0 group-hover:opacity-100">
                              <Trash2 size={12}/> Eliminar
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CATEGORY SHEET */}
      <BottomSheet isOpen={isCatSheetOpen} onClose={() => !catSaving && setIsCatSheetOpen(false)}>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-zinc-900 tracking-tight">{editingCat ? 'Editar Categoría' : 'Nueva Categoría'}</h3>
            <button onClick={() => setIsCatSheetOpen(false)} className="p-2 bg-zinc-100 text-zinc-500 rounded-full hover:bg-zinc-200 transition-colors">
              <X size={20} />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Nombre de la categoría</label>
              <input 
                type="text" 
                value={catNombre} 
                onChange={(e) => setCatNombre(e.target.value)}
                placeholder="Ej. Hamburguesas"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Emoji (Opcional)</label>
              <input 
                type="text" 
                value={catEmoji} 
                onChange={(e) => setCatEmoji(e.target.value)}
                maxLength={2}
                className="w-20 text-center bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
          </div>
          
          <button 
            onClick={saveCategoria} 
            disabled={catSaving || !catNombre.trim()}
            className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl shadow-sm flex items-center justify-center gap-2 transition-colors"
          >
            {catSaving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
            {catSaving ? 'Guardando...' : 'Guardar Categoría'}
          </button>
        </div>
      </BottomSheet>

      {/* ITEM SHEET */}
      <BottomSheet isOpen={isItemSheetOpen} onClose={() => !itemSaving && setIsItemSheetOpen(false)}>
        <div className="p-6 space-y-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between sticky top-0 bg-white z-10 pb-2">
            <h3 className="text-xl font-black text-zinc-900 tracking-tight">{editingItem ? 'Editar Platillo' : 'Nuevo Platillo'}</h3>
            <button onClick={() => setIsItemSheetOpen(false)} className="p-2 bg-zinc-100 text-zinc-500 rounded-full hover:bg-zinc-200 transition-colors">
              <X size={20} />
            </button>
          </div>
          
          <div className="space-y-5">
            {/* Image Upload Area */}
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Fotografía del Platillo</label>
              <div 
                className="w-full aspect-video md:aspect-[21/9] bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-100 hover:border-blue-300 transition-all relative overflow-hidden group"
                onClick={() => fileInputRef.current?.click()}
              >
                {itemFotoUrl ? (
                  <>
                    <img src={itemFotoUrl} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <p className="text-white font-bold text-sm flex items-center gap-2"><Edit3 size={16}/> Cambiar Foto</p>
                    </div>
                  </>
                ) : (
                  <>
                    {uploadingImage ? (
                      <div className="flex flex-col items-center text-blue-500">
                        <Loader2 className="animate-spin mb-2" size={32}/>
                        <span className="font-bold text-sm">Subiendo imagen...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-zinc-400">
                        <ImageIcon size={32} className="mb-2 text-zinc-300" />
                        <span className="font-bold text-sm text-zinc-500">Click para subir foto</span>
                        <span className="text-xs mt-1">PNG, JPG hasta 5MB</span>
                      </div>
                    )}
                  </>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Nombre del platillo *</label>
              <input 
                type="text" 
                value={itemNombre} 
                onChange={(e) => setItemNombre(e.target.value)}
                placeholder="Ej. Hamburguesa Clásica"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Precio ($) *</label>
              <div className="relative">
                <span className="absolute left-4 top-3 text-zinc-400 font-bold">$</span>
                <input 
                  type="number" 
                  value={itemPrecio} 
                  onChange={(e) => setItemPrecio(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-8 pr-4 py-3 text-zinc-900 font-black text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Descripción</label>
              <textarea 
                value={itemDesc} 
                onChange={(e) => setItemDesc(e.target.value)}
                placeholder="Ingredientes, tamaño, detalles..."
                rows={3}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
              />
            </div>
            
            <div className="pt-4">
              <button 
                onClick={saveItem} 
                disabled={itemSaving || !itemNombre.trim() || !itemPrecio || uploadingImage}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl shadow-sm flex items-center justify-center gap-2 transition-colors"
              >
                {itemSaving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                {itemSaving ? 'Guardando...' : 'Guardar Platillo'}
              </button>
            </div>
          </div>
        </div>
      </BottomSheet>

      <ConfirmSheet
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={handleDeleteItem}
        title="¿Eliminar Platillo?"
        description="Esta acción no se puede deshacer. El platillo desaparecerá del menú del restaurante."
        confirmText="Sí, Eliminar"
        isDestructive={true}
      />
    </div>
  );
}

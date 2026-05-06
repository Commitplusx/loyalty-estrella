import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, MessageCircle, Store, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function RestauranteMenuPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [restaurante, setRestaurante] = useState<any>(null);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const [
        { data: rest },
        { data: cats },
        { data: prods }
      ] = await Promise.all([
        supabase.from('restaurantes').select('*').eq('id', id).single(),
        supabase.from('menu_categorias').select('*').eq('restaurante_id', id).eq('activa', true).order('orden'),
        supabase.from('menu_items').select('*').eq('restaurante_id', id).eq('disponible', true).order('orden')
      ]);

      setRestaurante(rest);
      setCategorias(cats || []);
      setItems(prods || []);
      setLoading(false);
    }
    load();
  }, [id]);

  const handlePedir = () => {
    if (!restaurante) return;
    // Envía el mensaje por WhatsApp al BOT de Estrella (o directo al restaurante si prefieres, 
    // pero el esquema es que pidan al Bot)
    const numeroBot = '529631234567'; // Aquí el número de tu bot de Estrella Delivery
    const mensaje = `Hola, quiero pedir del menú de *${restaurante.nombre}*:\n\n`;
    const url = `https://wa.me/${numeroBot}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
  };

  if (loading) return <div className="text-center py-20 text-muted-foreground">Cargando menú...</div>;
  if (!restaurante) return <div className="text-center py-20">Restaurante no encontrado.</div>;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <h1 className="text-xl font-bold truncate max-w-[200px]">{restaurante.nombre}</h1>
          </div>
          <Button variant="outline" size="sm" onClick={handlePedir} className="gap-2 text-green-600 border-green-200 hover:bg-green-50 dark:hover:bg-green-950/30">
            <MessageCircle className="w-4 h-4" />
            Pedir
          </Button>
        </div>
      </header>

      {/* Portada */}
      <div className="bg-gradient-to-br from-orange-100 to-orange-50 dark:from-orange-950/30 dark:to-background border-b py-8 px-4 text-center">
        <div className="w-20 h-20 mx-auto bg-white dark:bg-zinc-800 rounded-2xl shadow-lg flex items-center justify-center mb-4">
          <Store className="w-10 h-10 text-orange-500" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Menú Digital</h2>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Explora los platillos de {restaurante.nombre}. Arma tu pedido y envíalo directo por WhatsApp.
        </p>
      </div>

      <main className="max-w-xl mx-auto p-4 space-y-8 mt-4">
        {categorias.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">Este restaurante aún no ha subido su menú.</p>
        ) : (
          categorias.map(cat => {
            const catItems = items.filter(i => i.categoria_id === cat.id);
            if (catItems.length === 0) return null;
            return (
              <div key={cat.id} className="space-y-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <span>{cat.emoji}</span> {cat.nombre}
                </h3>
                <div className="grid gap-4">
                  {catItems.map(item => (
                    <Card key={item.id} className="overflow-hidden border-border/50 hover:border-orange-200 transition-colors">
                      <div className="flex p-3 gap-4">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-start justify-between">
                            <h4 className="font-bold text-base leading-tight">{item.nombre}</h4>
                            <span className="font-bold text-orange-600 dark:text-orange-400 whitespace-nowrap ml-2">
                              ${item.precio.toFixed(2)}
                            </span>
                          </div>
                          {item.descripcion && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{item.descripcion}</p>
                          )}
                        </div>
                        {item.foto_url && (
                          <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-muted">
                            <img src={item.foto_url} alt={item.nombre} className="w-full h-full object-cover" />
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* Floating Action Button para pedir */}
      <div className="fixed bottom-6 left-0 right-0 px-4 z-50 pointer-events-none flex justify-center">
        <Button 
          size="lg" 
          onClick={handlePedir}
          className="pointer-events-auto rounded-full shadow-xl shadow-green-500/20 bg-green-600 hover:bg-green-700 text-white gap-2 pl-6 pr-8 h-14 text-lg"
        >
          <MessageCircle className="w-6 h-6" />
          Pedir por WhatsApp
        </Button>
      </div>
    </div>
  );
}

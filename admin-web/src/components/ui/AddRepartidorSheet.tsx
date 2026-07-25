import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';
import { UserPlus, Loader2 } from 'lucide-react';

interface AddRepartidorSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddRepartidorSheet({ isOpen, onClose, onSuccess }: AddRepartidorSheetProps) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [alias, setAlias] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre || !telefono) {
      toast.error('El nombre y el teléfono son obligatorios');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          type: 'repartidor',
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          alias: alias.trim() || undefined,
        }
      });

      if (error) {
        throw new Error(error.message || 'Error al invocar la función');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success('Repartidor registrado exitosamente');
      setNombre('');
      setTelefono('');
      setAlias('');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error creando repartidor:', err);
      toast.error(err.message || 'Error al registrar al repartidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="text-center sm:text-left">
        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto sm:mx-0 mb-4 shadow-sm border border-blue-100">
          <UserPlus size={24} />
        </div>
        <h3 className="text-xl font-black text-zinc-900 tracking-tight">Registrar Nuevo Repartidor</h3>
        <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
          Ingresa los datos del nuevo repartidor. El sistema creará su cuenta y le enviará un mensaje de WhatsApp (si está configurado) con su PIN de acceso temporal.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
              Nombre Completo *
            </label>
            <input
              type="text"
              required
              placeholder="Ej. Juan Pérez"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
              Teléfono (WhatsApp) *
            </label>
            <input
              type="tel"
              required
              placeholder="Ej. 9631234567"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
              Alias (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej. El Rápido"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium"
            />
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Creando cuenta...
                </>
              ) : (
                'Registrar Repartidor'
              )}
            </button>
          </div>
        </form>
      </div>
    </BottomSheet>
  );
}

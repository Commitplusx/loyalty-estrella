import { X, Star, Home, History, CreditCard, User, LogOut, Package2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface NavigationSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  setCurrentView: (view: string) => void;
  handleLogout: () => void;
}

export function NavigationSidebar({ isOpen, onClose, user, setCurrentView, handleLogout }: NavigationSidebarProps) {
  const navItems = [
    { icon: Home,        label: 'Inicio',          action: () => { setCurrentView('home');    onClose(); } },
    { icon: History,     label: 'Mis Envíos',      action: () => { setCurrentView('history'); onClose(); } },
    { icon: User,        label: 'Mi Perfil',        action: () => { setCurrentView('loyalty'); onClose(); } },
    { icon: CreditCard,  label: 'Métodos de pago', action: () => { toast('Próximamente 🚀'); } },
  ];

  const { data: profile } = useQuery({
    queryKey: ['cliente', user?.phone],
    queryFn: async () => {
      if (!user?.phone) return null;
      const { data } = await supabase
        .from('clientes')
        .select('nombre, puntos, rango')
        .eq('telefono', user.phone.replace(/\D/g, ''))
        .maybeSingle();
      return data;
    },
    enabled: !!user?.phone,
  });

  const initials = (() => {
    const name = profile?.nombre;
    if (!name) return user?.phone?.slice(-2) ?? '★';
    const parts = name.trim().split(' ');
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  })();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 bg-white flex flex-col
          w-72 border-r border-gray-100
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:translate-x-0 md:w-64 md:shrink-0
        `}
      >
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
              <Star className="w-4 h-4 text-white fill-white" />
            </div>
            <span className="font-black text-gray-900 text-lg tracking-tight">Estrella</span>
          </div>
          <button
            onClick={onClose}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* User card */}
        <div className="px-4 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-900 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">
                {profile?.nombre ?? user?.phone ?? 'Invitado'}
              </p>
              <p className="text-xs text-yellow-600 font-semibold truncate">
                {profile?.rango ?? 'Cliente Estrella'} · {profile?.puntos ?? 0} pts
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={idx}
                onClick={item.action}
                className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors duration-150 text-left"
              >
                <Icon className="w-4 h-4 text-gray-400 group-hover:text-gray-700 shrink-0 transition-colors" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Bottom: brand tagline + logout */}
        <div className="p-4 border-t border-gray-100 space-y-3 shrink-0">
          {/* Mini brand block */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
            <Package2 className="w-4 h-4 text-yellow-500 shrink-0" />
            <span className="text-xs text-gray-500 leading-tight">
              Servicio de envíos en<br />
              <span className="font-bold text-gray-700">Comitán de Domínguez</span>
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors duration-150 text-left"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}

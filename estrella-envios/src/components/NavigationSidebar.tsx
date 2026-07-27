import { motion } from 'framer-motion';
import { 
  X, Star, Home, History, CreditCard, User, Settings, LogOut, ChevronRight
} from 'lucide-react';
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
    { icon: Home, label: 'Inicio', action: () => { setCurrentView('home'); onClose(); } },
    { icon: History, label: 'Mis Envíos', action: () => { setCurrentView('history'); onClose(); } },
    { icon: CreditCard, label: 'Métodos de pago', action: () => { toast.remove(); toast('Próximamente'); } },
    { icon: User, label: 'Mi Perfil', action: () => { setCurrentView('loyalty'); onClose(); } },
    { icon: Settings, label: 'Configuración', action: () => { toast.remove(); toast('Próximamente'); } },
  ];

  const { data: profile } = useQuery({
    queryKey: ['cliente', user?.phone],
    queryFn: async () => {
      if (!user?.phone) return null;
      const cleanPhone = user.phone.replace(/\D/g, '');
      const { data, error } = await supabase
        .from('clientes')
        .select('nombre, puntos, rango')
        .eq('telefono', cleanPhone)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.phone,
  });

  const getInitials = (name: string) => {
    if (!name) return user?.phone ? user.phone.substring(user.phone.length - 2) : '🌟';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <>
      {/* Sidebar Panel */}
      <div 
        className={`fixed inset-y-0 left-0 bg-white z-50 w-[85%] max-w-sm transform transition-transform duration-500 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } md:relative md:translate-x-0 flex flex-col border-r border-gray-100 shadow-2xl md:shadow-none md:w-80`}
      >
        <div className="p-6 md:p-8 flex justify-between items-center border-b border-gray-50 mt-safe md:mt-0 relative overflow-hidden">
          {/* Subtle glow effect behind logo */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/4"></div>
          
          <div className="flex items-center gap-3 relative z-10">
            <div className="bg-gradient-to-tr from-yellow-400 to-yellow-500 p-2.5 rounded-xl shadow-lg shadow-yellow-400/30">
              <Star className="text-white fill-white w-5 h-5" />
            </div>
            <span className="text-2xl font-black text-gray-900 tracking-tight">Estrella</span>
          </div>
          <button 
            onClick={onClose} 
            className="md:hidden p-2.5 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors relative z-10"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        
        <div className="p-6 md:p-8 flex-1 overflow-y-auto custom-scrollbar">
          {/* User Profile Card */}
          <div className="flex items-center gap-4 mb-10 p-4 bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-3xl shadow-sm">
            <div className="w-14 h-14 bg-gray-900 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-md shrink-0">
              {profile?.nombre ? getInitials(profile.nombre) : (user?.phone ? user.phone.substring(user.phone.length - 2) : '🌟')}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-lg truncate">
                {profile?.nombre || user?.phone || 'Invitado'}
              </h3>
              <p className="text-yellow-600 text-xs font-bold uppercase tracking-wider mt-0.5">
                {profile?.rango || 'Cliente Estrella'} • {profile?.puntos || 0} pts
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {navItems.map((item, idx) => (
              <motion.button 
                whileHover={{ scale: 1.01, x: 4 }}
                whileTap={{ scale: 0.98 }}
                key={idx} 
                onClick={item.action} 
                className="w-full flex items-center gap-3.5 p-3 rounded-[16px] hover:bg-gray-50 transition-colors text-left text-gray-600 font-semibold hover:text-gray-900 group"
              >
                <div className="w-[34px] h-[34px] rounded-[10px] bg-white border border-gray-100 flex items-center justify-center group-hover:border-yellow-200 group-hover:bg-yellow-50 group-hover:shadow-sm transition-all duration-300">
                  <item.icon className="w-[18px] h-[18px] text-gray-400 group-hover:text-yellow-600 transition-colors duration-300" />
                </div>
                <span className="text-[14.5px] flex-1">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 duration-300" />
              </motion.button>
            ))}
          </nav>
        </div>
        
        {/* Logout Section */}
        <div className="p-6 md:p-8 pb-safe border-t border-gray-50">
          <button 
            onClick={handleLogout} 
            className="w-full p-4 text-red-500 font-bold hover:bg-red-50 rounded-2xl transition-all flex justify-center items-center gap-2 border border-transparent hover:border-red-100"
          >
            <LogOut size={20} /> Cerrar Sesión
          </button>
        </div>
      </div>
    </>
  );
}

import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Package, Users, Store, Settings, LogOut, Wallet, Menu, Command, Map, Megaphone } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useAppStore } from '../../store/useAppStore';
import { useOrderAlarms } from '../../hooks/useOrderAlarms';
import { supabase } from '../../lib/supabase';
import { useEffect } from 'react';

const MENU_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Panel' },
  { path: '/pedidos', icon: Package, label: 'Pedidos', badge: 3 },
  { path: '/repartidores', icon: Users, label: 'Equipo' },
  { path: '/clientes', icon: Users, label: 'Clientes' },
  { path: '/finanzas', icon: Wallet, label: 'Finanzas' },
  { path: '/aliados', icon: Store, label: 'Aliados' },
  { path: '/zonas', icon: Map, label: 'Zonas y Tarifas' },
  { path: '/monitor', icon: Map, label: 'Monitor' },
  { path: '/marketing', icon: Megaphone, label: 'Marketing' },
  { path: '/ajustes', icon: Settings, label: 'Ajustes' },
];

export function AdminLayout() {
  useOrderAlarms(); // Global Audio Alarms 🚨

  const { signOut } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };


  const { pedidosLoaded, repartidoresLoaded, setPedidos, setRepartidores } = useAppStore();

  useEffect(() => {
    // 1. Inicializar Datos (Solo si no están en caché)
    if (!pedidosLoaded) {
      supabase.from('pedidos').select('*').order('created_at', { ascending: false }).limit(100)
        .then(({ data }) => data && setPedidos(data));
    }
    if (!repartidoresLoaded) {
      supabase.from('repartidores').select('*')
        .then(({ data }) => data && setRepartidores(data));
    }
  }, [pedidosLoaded, repartidoresLoaded, setPedidos, setRepartidores]);

  useEffect(() => {
    // 2. Suscripciones Globales en Tiempo Real (Solo 1 vez al montar el layout)
    const channelPedidos = supabase.channel('global:pedidos_v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          useAppStore.getState().updatePedido(payload.new);
        } else {
          supabase.from('pedidos').select('*').order('created_at', { ascending: false }).limit(100)
            .then(({ data }) => data && useAppStore.getState().setPedidos(data));
        }
      }).subscribe();

    const channelRepartidores = supabase.channel('global:repartidores_v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'repartidores' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          useAppStore.getState().updateRepartidor(payload.new);
        } else {
          supabase.from('repartidores').select('*')
            .then(({ data }) => data && useAppStore.getState().setRepartidores(data));
        }
      }).subscribe();

    return () => {
      supabase.removeChannel(channelPedidos);
      supabase.removeChannel(channelRepartidores);
    };
  }, []);

  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="flex h-screen w-full bg-zinc-50 overflow-hidden text-zinc-900 relative">
      {/* Mobile Backdrop Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-zinc-900/20 backdrop-blur-sm z-30 lg:hidden transition-opacity"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar - Clean White Theme */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40 w-72 lg:w-64 flex flex-col bg-white border-r border-zinc-200 shadow-sm transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Header Premium */}
        <div className="h-16 px-6 border-b border-zinc-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-zinc-900 rounded-lg shadow-sm">
              <Command size={20} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-black tracking-tight text-zinc-900 leading-none">Estrella Eats</p>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">Control Tower</p>
            </div>
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1 custom-scrollbar">
          {MENU_ITEMS.map((item) => (
            <motion.div key={item.path} whileHover={{ x: 6 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
              <NavLink
                to={item.path}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200 group relative ${
                    isActive
                      ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/20'
                      : 'text-zinc-500 hover:bg-blue-50 hover:text-blue-600 font-medium'
                  }`
                }
              >
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <item.icon size={18} strokeWidth={2.5} />
                </motion.div>
                <span className="text-sm tracking-tight">{item.label}</span>
                
                {item.badge && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 bg-zinc-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            </motion.div>
          ))}
        </nav>

        {/* Botón Logout */}
        <div className="p-4 border-t border-zinc-200">
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleLogout}
            className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-zinc-900 hover:bg-rose-600 text-white rounded-xl transition-colors font-bold shadow-sm"
          >
            <LogOut size={18} strokeWidth={2.5} />
            <span className="text-sm tracking-wide">Cerrar Sesión</span>
          </motion.button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0 overflow-hidden w-full">
        {/* Topbar flotante súper limpia */}
        <header className={`h-16 items-center justify-between px-4 lg:px-8 bg-zinc-50/80 backdrop-blur-xl border-b border-zinc-200/50 sticky top-0 z-10 w-full ${location.pathname === '/pedidos' ? 'flex lg:hidden' : 'flex'}`}>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50 rounded-lg transition-colors"
            >
              <Menu size={20} />
            </button>
            <h2 className="text-sm lg:text-base font-bold text-zinc-900 tracking-tight">
              {location.pathname === '/pedidos' ? 'Torre de Control' : 'Panel de Control'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white border border-zinc-200 rounded-full shadow-sm flex items-center justify-center">
              <span className="text-xs font-bold text-zinc-900">AD</span>
            </div>
          </div>
        </header>

        {/* Área de Outlet (Vistas) */}
        <div className="flex-1 overflow-auto p-4 lg:p-8 custom-scrollbar w-full relative">
          <div className="max-w-7xl mx-auto h-full w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="h-full w-full"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../store/useAppStore';
import { useJsApiLoader } from '@react-google-maps/api';
import { NavigationSidebar } from '../components/NavigationSidebar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { motion, AnimatePresence } from 'framer-motion';

// Views
import { HomeView } from '../components/views/HomeView';
import { NewDeliveryFlow } from '../components/views/NewDeliveryFlow';
import { ActiveTrackingView } from '../components/views/ActiveTrackingView';
import { HistoryView } from '../components/views/HistoryView';
import { LoyaltyView } from '../components/views/LoyaltyView';
import { EatsInfoView } from '../components/views/EatsInfoView';

const MAPS_LIBRARIES: ("places")[] = ["places"];

export function MainShell() {
  const { user, setUser, setPedidoActivo } = useAppStore();
  
  const [currentView, setCurrentView] = useState('home'); // home, newDelivery, activeTracking
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // Shared state that HomeView uses to start the flow
  const [orderType, setOrderType] = useState<'envio' | 'compra' | null>(null);
  const [activeStep, setActiveStep] = useState(0);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: MAPS_LIBRARIES
  });

  const queryClient = useQueryClient();

  useQuery({
    queryKey: ['pedidoActivo', user?.phone],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pedidos')
        .select('*, repartidores(nombre, telefono, foto_url)')
        .eq('cliente_tel', user!.phone)
        .eq('tipo_pedido', 'mandadito')
        .not('estado', 'in', '("entregado","cancelado")')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setPedidoActivo(data);
        if (currentView !== 'activeTracking') {
          setCurrentView('activeTracking');
        }
      } else {
        setPedidoActivo(null);
        if (currentView === 'activeTracking') {
          setCurrentView('home');
        }
      }
      return data;
    },
    enabled: !!user?.phone,
  });

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel('mandadito_updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'pedidos',
        filter: `cliente_tel=eq.${user.phone}`,
      }, (payload) => {
        // En lugar de fetchear a mano, invalidamos la caché
        queryClient.invalidateQueries({ queryKey: ['pedidoActivo'] });
        queryClient.invalidateQueries({ queryKey: ['historial'] });

        if (payload.new.estado === 'entregado' || payload.new.estado === 'cancelado') {
          setPedidoActivo(null);
          setCurrentView('home');
        }
      }).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient, setPedidoActivo]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <div className="w-full h-[100dvh] bg-gray-50 flex font-sans overflow-hidden">
      
      {/* Sidebar Desktop */}
      <NavigationSidebar 
        isOpen={isMenuOpen} 
        onClose={() => setIsMenuOpen(false)} 
        user={user}
        setCurrentView={setCurrentView}
        handleLogout={handleLogout}
      />

      {/* Vistas Principales */}
      <div className="flex-1 overflow-hidden relative bg-white flex flex-col shadow-2xl z-10 w-full h-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            className="w-full h-full flex flex-col absolute inset-0"
          >
            <ErrorBoundary>
              {(() => {
                switch (currentView) {
                  case 'home':
                    return (
                      <HomeView 
                        setIsMenuOpen={setIsMenuOpen} 
                        setCurrentView={setCurrentView} 
                        setOrderType={setOrderType}
                        setActiveStep={setActiveStep}
                        isLoaded={isLoaded}
                      />
                    );
                  case 'newDelivery':
                    return <NewDeliveryFlow setCurrentView={setCurrentView} isLoaded={isLoaded} />;
                  case 'activeTracking':
                    return <ActiveTrackingView setCurrentView={setCurrentView} />;
                  case 'history':
                    return <HistoryView setCurrentView={setCurrentView} />;
                  case 'loyalty':
                    return <LoyaltyView setCurrentView={setCurrentView} />;
                  case 'eatsInfo':
                    return <EatsInfoView setCurrentView={setCurrentView} />;
                  default:
                    return (
                      <HomeView 
                        setIsMenuOpen={setIsMenuOpen} 
                        setCurrentView={setCurrentView} 
                        setOrderType={setOrderType}
                        setActiveStep={setActiveStep}
                        isLoaded={isLoaded}
                      />
                    );
                }
              })()}
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

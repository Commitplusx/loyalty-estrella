import { Package, ShieldCheck, Clock, Star, CreditCard, ChevronRight, ChevronDown, Bell, ArrowRight, MapPin } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';
import { MapLocationPicker } from '../MapLocationPicker';

interface HomeViewProps {
  setIsMenuOpen: (isOpen: boolean) => void;
  setCurrentView: (view: string) => void;
  setOrderType: (type: 'envio' | 'compra' | null) => void;
  setOrderType: (type: 'envio' | 'compra' | null) => void;
  setActiveStep: (step: number) => void;
  isLoaded: boolean;
}

export function HomeView({ setIsMenuOpen, setCurrentView, setOrderType, setActiveStep, isLoaded }: HomeViewProps) {
  const { currentAddress, setCurrentAddress, currentLocation, setCurrentLocation } = useAppStore();
  const [isSelectingLocation, setIsSelectingLocation] = useState(false);

  useEffect(() => {
    // Solo busca ubicación si no la hemos buscado antes (por defecto dice 'Buscando tu ubicación...')
    if (currentAddress !== 'Buscando tu ubicación...' && currentAddress !== 'Ubicación desconocida' && currentAddress !== 'Toca para agregar ubicación') return;

    if (!navigator.geolocation) {
      setCurrentAddress('Ubicación manual');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Wait for google maps to be available in window
        const checkGoogleAndGeocode = () => {
          if (window.google && window.google.maps) {
            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode(
              { location: { lat: position.coords.latitude, lng: position.coords.longitude } },
              (results, status) => {
                if (status === 'OK' && results && results[0]) {
                  // Extract just the street and number for a cleaner look
                  const streetName = results[0].address_components.find(c => c.types.includes('route'))?.short_name;
                  const streetNumber = results[0].address_components.find(c => c.types.includes('street_number'))?.short_name;
                  
                  if (streetName) {
                    setCurrentAddress(`${streetName} ${streetNumber || ''}`.trim());
                  } else {
                    setCurrentAddress(results[0].formatted_address.split(',')[0]);
                  }
                  setCurrentLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
                } else {
                  setCurrentAddress('Ubicación desconocida');
                }
              }
            );
          } else {
            // Try again in 500ms
            setTimeout(checkGoogleAndGeocode, 500);
          }
        };
        checkGoogleAndGeocode();
      },
      () => {
        setCurrentAddress('Toca para agregar ubicación');
      },
      { timeout: 10000 }
    );
  }, [currentAddress, setCurrentAddress, setCurrentLocation]);

  return (
    <div className="flex flex-col h-full bg-white relative w-full min-h-0">
      <header className="px-5 pt-4 sm:pt-6 pb-3 flex justify-between items-center bg-white/90 backdrop-blur-xl sticky top-0 z-20 border-b border-gray-100/50">
        
        {/* Avatar */}
        <button 
          className="md:hidden relative w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-[0_2px_10px_rgb(0,0,0,0.06)] ring-1 ring-gray-100 hover:ring-yellow-400 transition-all focus:outline-none shrink-0" 
          onClick={() => setIsMenuOpen(true)}
        >
           <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Estrella&backgroundColor=f8fafc" alt="Profile" className="w-full h-full object-cover" />
        </button>
        <div className="hidden md:block w-10 shrink-0"></div> {/* Spacer for desktop to keep center alignment */}

        {/* Location Pill */}
        <div className="flex-1 flex justify-center px-2">
          <button 
            className="group flex flex-col items-center cursor-pointer focus:outline-none"
            onClick={() => setIsSelectingLocation(true)}
          >
            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.15em] mb-0.5">Entregar en</span>
            <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-50 group-hover:bg-gray-100 active:bg-gray-200 rounded-full transition-colors border border-gray-200/60 shadow-sm">
              <span className="text-[13px] font-bold text-gray-900 truncate max-w-[130px] sm:max-w-[200px] tracking-tight">{currentAddress}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-800 transition-colors" />
            </div>
          </button>
        </div>

        {/* Notifications */}
        <button className="relative p-2.5 bg-white rounded-full hover:bg-gray-50 active:bg-gray-100 transition-all border border-gray-200/60 shadow-sm focus:outline-none group shrink-0">
          <Bell className="w-[18px] h-[18px] text-gray-700 group-hover:text-gray-900 transition-colors" />
          <span className="absolute top-2 right-2.5 w-[7px] h-[7px] bg-red-500 border border-white rounded-full"></span>
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-5 pb-6 custom-scrollbar min-h-0">
        <div className="max-w-5xl mx-auto w-full">
          <div className="mt-4 mb-6 relative rounded-[1.5rem] p-6 md:p-10 overflow-hidden border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white flex flex-col md:flex-row md:items-center gap-6">
            <div className="absolute -right-8 -top-8 w-32 h-32 md:w-80 md:h-80 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-full opacity-50"></div>
            
            <div className="relative z-10 flex-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-700 text-xs font-semibold mb-3 border border-yellow-100">
                <div className="w-2.5 h-2.5 bg-yellow-500 rounded-full flex items-center justify-center">
                  <Star className="w-[6px] h-[6px] text-white fill-white" />
                </div>
                Estrella Express
              </div>
              <h2 className="text-2xl md:text-4xl font-black text-gray-900 mb-2.5 leading-tight">Lo que necesites,<br/>en minutos.</h2>
              <p className="text-gray-500 text-[13px] md:text-base mb-6 max-w-sm">Olvídate del tráfico. Comida, compras del súper, encargos de farmacia o documentos urgentes. Vamos por ti al instante.</p>
              
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => { setOrderType(null); setCurrentView('newDelivery'); setActiveStep(0); }}
                className="w-full md:w-auto md:min-w-[260px] bg-gray-900 text-white font-medium py-3.5 px-6 rounded-xl flex items-center justify-between shadow-lg shadow-gray-900/20 text-base group"
              >
                <span>Solicitar un envío</span>
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center group-hover:bg-white/30 transition-colors">
                  <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" />
                </div>
              </motion.button>
            </div>
            
            {/* Desktop Illustration */}
            <div className="hidden md:flex flex-1 justify-center relative z-10">
               <div className="w-56 h-56 bg-gradient-to-tr from-gray-50 to-gray-100 rounded-3xl border border-gray-200 shadow-xl transform rotate-3 flex items-center justify-center">
                 <Package className="w-24 h-24 text-gray-300" />
               </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 mb-6">
            <div className="bg-gray-50 rounded-[20px] p-4 border border-gray-100">
              <ShieldCheck className="w-6 h-6 text-green-500 mb-3" />
              <h3 className="font-semibold text-gray-900 text-[15px] leading-tight">Envíos Seguros</h3>
              <p className="text-[11px] md:text-xs text-gray-500 mt-1">Rastreo en tiempo real</p>
            </div>
            <div className="bg-gray-50 rounded-[20px] p-4 border border-gray-100">
              <Clock className="w-6 h-6 text-blue-500 mb-3" />
              <h3 className="font-semibold text-gray-900 text-[15px] leading-tight">Entrega Rápida</h3>
              <p className="text-[11px] md:text-xs text-gray-500 mt-1">En minutos</p>
            </div>
            <div className="hidden md:block bg-gray-50 rounded-[20px] p-4 border border-gray-100">
              <Star className="w-6 h-6 text-yellow-500 mb-3 fill-yellow-500" />
              <h3 className="font-semibold text-gray-900 text-[15px] leading-tight">Conductores Top</h3>
              <p className="text-xs text-gray-500 mt-1">Calificados por ti</p>
            </div>
            <div className="hidden md:block bg-gray-50 rounded-[20px] p-4 border border-gray-100">
              <CreditCard className="w-6 h-6 text-purple-500 mb-3" />
              <h3 className="font-semibold text-gray-900 text-[15px] leading-tight">Paga Fácil</h3>
              <p className="text-xs text-gray-500 mt-1">Efectivo al recibir</p>
            </div>
          </div>
        </div>
      </main>

      {/* Map Location Picker Overlay */}
      <AnimatePresence>
        {isSelectingLocation && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="fixed inset-0 z-[100] bg-white flex flex-col"
          >
            <MapLocationPicker
              isLoaded={isLoaded}
              initialLat={currentLocation?.lat}
              initialLng={currentLocation?.lng}
              onCancel={() => setIsSelectingLocation(false)}
              onSelect={(address, lat, lng) => {
                setCurrentAddress(address);
                setCurrentLocation({ lat, lng });
                setIsSelectingLocation(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

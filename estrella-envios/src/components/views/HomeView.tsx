import { Package, ShieldCheck, Clock, Star, CreditCard, ChevronRight, ChevronDown, Bell, ArrowRight, MapPin, Utensils, Gift, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store/useAppStore';
import { MapLocationPicker } from '../MapLocationPicker';

interface HomeViewProps {
  setIsMenuOpen: (isOpen: boolean) => void;
  setCurrentView: (view: string) => void;
  setOrderType: (type: 'envio' | 'compra' | null) => void;
  setActiveStep: (step: number) => void;
  isLoaded: boolean;
}

export function HomeView({ setIsMenuOpen, setCurrentView, setOrderType, setActiveStep, isLoaded }: HomeViewProps) {
  const { currentAddress, setCurrentAddress, currentLocation, setCurrentLocation, user } = useAppStore();
  const [isSelectingLocation, setIsSelectingLocation] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [greeting, setGreeting] = useState('Hola');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Buenos días');
    else if (hour < 19) setGreeting('Buenas tardes');
    else setGreeting('Buenas noches');
  }, []);

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
    <div className="flex flex-col h-full bg-white relative w-full">
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

      <header 
        className={`px-5 pt-8 pb-4 flex items-center justify-between sticky top-0 z-20 transition-all duration-300 ${
          isScrolled ? 'bg-white/90 backdrop-blur-xl shadow-sm border-b border-gray-100' : 'bg-transparent border-b border-transparent'
        }`}
      >
        
        {/* Menu Button */}
        <button 
          className={`md:hidden relative w-[42px] h-[42px] rounded-full flex items-center justify-center transition-all focus:outline-none shrink-0 ${
            isScrolled ? 'bg-gray-100 text-gray-900 hover:bg-gray-200' : 'bg-gray-900 shadow-[0_4px_12px_rgba(0,0,0,0.1)] hover:bg-gray-800'
          }`}
          onClick={() => setIsMenuOpen(true)}
        >
          <div className="flex flex-col gap-1 items-center justify-center">
             <div className={`w-4 h-[2px] rounded-full ${isScrolled ? 'bg-gray-900' : 'bg-white'}`}></div>
             <div className={`w-4 h-[2px] rounded-full ${isScrolled ? 'bg-gray-900' : 'bg-white'}`}></div>
             <div className={`w-4 h-[2px] rounded-full ${isScrolled ? 'bg-gray-900' : 'bg-white'}`}></div>
          </div>
        </button>
        <div className="hidden md:block w-[42px] shrink-0"></div> {/* Spacer for desktop to keep center alignment */}

        {/* Location Pill */}
        <div className="flex-1 flex justify-center px-2">
          <button 
            className="group flex flex-col items-center cursor-pointer focus:outline-none"
            onClick={() => setIsSelectingLocation(true)}
          >
            <span className={`text-[9px] font-bold uppercase tracking-[0.15em] mb-0.5 transition-colors ${isScrolled ? 'text-gray-400' : 'text-gray-500'}`}>Entregar en</span>
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-colors border shadow-sm ${
              isScrolled ? 'bg-gray-100 border-gray-200 hover:bg-gray-200' : 'bg-white border-gray-200/60 hover:bg-gray-50'
            }`}>
              <span className="text-[13px] font-bold text-gray-900 truncate max-w-[130px] sm:max-w-[200px] tracking-tight">{currentAddress}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-800 transition-colors" />
            </div>
          </button>
        </div>

        {/* Notifications */}
        <button className={`relative p-2.5 rounded-full transition-all border shadow-sm focus:outline-none group shrink-0 ${
          isScrolled ? 'bg-gray-100 border-gray-200 hover:bg-gray-200' : 'bg-white border-gray-200/60 hover:bg-gray-50'
        }`}>
          <Bell className="w-[18px] h-[18px] text-gray-700 group-hover:text-gray-900 transition-colors" />
          <span className="absolute top-2 right-2.5 w-[7px] h-[7px] bg-red-500 border border-white rounded-full"></span>
        </button>
      </header>

      <main 
        className="flex-1 overflow-y-auto px-5 pb-6 custom-scrollbar min-h-0"
        onScroll={(e) => setIsScrolled(e.currentTarget.scrollTop > 10)}
      >
        
        {/* Dynamic Greeting */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 mt-2"
        >
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">
            {greeting}, <span className="text-yellow-500">{user?.id !== 'guest' ? 'Estrella' : 'Invitado'}</span> 👋
          </h1>
          <p className="text-gray-500 font-medium mt-1">¿Qué vamos a pedir hoy?</p>
        </motion.div>
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
              <div className="bg-gradient-to-tr from-yellow-50 to-white border border-yellow-200/60 p-5 md:p-6 rounded-2xl md:rounded-3xl shadow-sm relative mb-6 md:max-w-md mt-3">
                <div className="absolute -top-3 -left-2 md:-left-3 bg-yellow-400 text-yellow-950 text-[10px] md:text-xs font-black px-3 py-1 rounded-full shadow-sm transform -rotate-3">
                  ¿QUÉ HACEMOS?
                </div>
                <p className="text-gray-600 font-medium text-[13px] md:text-base text-balance leading-relaxed">
                  Olvídate del tráfico. Comida, compras del súper, encargos de farmacia o documentos urgentes. <span className="text-gray-900 font-black bg-yellow-100 px-1.5 py-0.5 rounded-md inline-block mt-1">Vamos por ti al instante.</span>
                </p>
              </div>              
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

          {/* Nuestros Servicios */}
          <div className="mb-8">
            <h3 className="text-xl font-black text-gray-900 mb-4 px-1">Descubre más</h3>
            <div className="flex flex-col gap-4">
              
              {/* Estrella Envíos */}
              <div 
                onClick={() => { setOrderType(null); setCurrentView('newDelivery'); setActiveStep(0); }}
                className="bg-white border border-gray-100 rounded-[20px] p-5 shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="w-12 h-12 bg-yellow-50 rounded-2xl flex items-center justify-center shrink-0">
                  <Zap className="w-6 h-6 text-yellow-500" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-900 text-base">Estrella Envíos</h4>
                  <p className="text-sm text-gray-500 mt-0.5">Paquetes y mandaditos al instante.</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300" />
              </div>

              {/* Estrella Eats */}
              <div 
                onClick={() => setCurrentView('eatsInfo')}
                className="bg-white border border-gray-100 rounded-[20px] p-5 shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center shrink-0">
                  <Utensils className="w-6 h-6 text-orange-500" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-900 text-base">Estrella Eats</h4>
                  <p className="text-sm text-gray-500 mt-0.5">Comida de tus restaurantes favoritos.</p>
                </div>
                <div className="px-2.5 py-1 bg-orange-100 text-orange-700 text-[10px] font-black rounded-full uppercase tracking-wide">Pronto</div>
              </div>

              {/* Estrella Loyalty */}
              <div 
                onClick={() => setCurrentView('loyalty')}
                className="bg-white border border-gray-100 rounded-[20px] p-5 shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center shrink-0">
                  <Gift className="w-6 h-6 text-purple-500" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-900 text-base">Estrella Loyalty</h4>
                  <p className="text-sm text-gray-500 mt-0.5">Acumula puntos y gana envíos gratis.</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300" />
              </div>

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

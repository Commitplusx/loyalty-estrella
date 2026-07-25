import { useState } from 'react';
import { Package, MapPin, ChevronRight, CheckCircle2, ChevronLeft, ShoppingCart, Info, ArrowRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { useH3Pricing } from '../../hooks/useH3Pricing';
import { COMPRA_CATEGORIES, ENVIO_TYPES, ENVIO_SIZES } from '../../config/services.config';
import { MapLocationPicker } from '../MapLocationPicker';

interface NewDeliveryFlowProps {
  setCurrentView: (view: string) => void;
  isLoaded: boolean;
}

export function NewDeliveryFlow({ setCurrentView, isLoaded }: NewDeliveryFlowProps) {
  const { user, currentAddress, currentLocation } = useAppStore();
  const [orderType, setOrderType] = useState<'envio' | 'compra' | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [mapPickerType, setMapPickerType] = useState<'origin' | 'destination' | null>(null);
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // OTP States
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpStep, setOtpStep] = useState<'phone' | 'code'>('phone');
  const [otpPhone, setOtpPhone] = useState(user?.phone !== '525555555555' ? user?.phone || '' : '');
  const [otpCode, setOtpCode] = useState('');
  const [isOtpLoading, setIsOtpLoading] = useState(false);
  
  const [deliveryData, setDeliveryData] = useState({
    origin: currentAddress !== 'Buscando tu ubicación...' && currentAddress !== 'Ubicación desconocida' && currentAddress !== 'Toca para agregar ubicación' ? currentAddress : '',
    originLat: currentLocation?.lat || 0,
    originLng: currentLocation?.lng || 0,
    destination: '',
    destinationLat: 0,
    destinationLng: 0,
    packageSize: 'medium',
    packageType: 'otro',
    description: '',
    instructions: '',
    recipientName: '',
    recipientPhone: '',
    originReference: ''
  });
  
  const [compraData, setCompraData] = useState({
    categoria: '',
    lista: '',
    presupuesto: ''
  });

  const { h3Price, calculandoPrecio, calcularPrecioH3 } = useH3Pricing();

  const STEPS = orderType === 'compra' 
    ? ['Categoría', 'Tu pedido', '¿Dónde?', 'Destino', 'Confirmación']
    : ['Origen', 'Destino', 'Detalles', 'Confirmación'];

  const handleInputChange = (field: string, value: string) => {
    setDeliveryData(prev => ({ ...prev, [field]: value }));
  };

  const calculateRoute = () => {
    if (!window.google) return;
    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: { lat: deliveryData.originLat, lng: deliveryData.originLng },
        destination: { lat: deliveryData.destinationLat, lng: deliveryData.destinationLng },
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK && result) {
          setDirections(result);
          if (result.routes[0].legs[0].distance) {
            setDistanceKm(result.routes[0].legs[0].distance.value / 1000);
          }
        }
      }
    );
  };

  const nextStep = () => {
    if (activeStep === 1 && deliveryData.originLat && deliveryData.destinationLat) {
       calculateRoute();
    }
    if (activeStep < STEPS.length - 1) setActiveStep(prev => prev + 1);
  };

  const prevStep = () => {
    if (orderType !== null && activeStep === 0) {
      setOrderType(null);
      return;
    }
    if (activeStep > 0) setActiveStep(prev => prev - 1);
    else setCurrentView('home');
  };

  const getDynamicPrice = () => {
    let basePrice = 35;
    if (deliveryData.packageSize === 'medium') basePrice = 45;
    if (deliveryData.packageSize === 'large') basePrice = 85;
    return Math.round(basePrice + (distanceKm * 8));
  };

  const handleRequestOtp = async () => {
    if (otpPhone.length < 10) {
      toast.error('Ingresa un número válido de 10 dígitos');
      return;
    }
    setIsOtpLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('auth-otp', {
        body: { action: 'request-client-otp', phone: otpPhone }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      setOtpStep('code');
      toast.success('Código enviado por WhatsApp');
    } catch (err: any) {
      console.error(err);
      toast.error('Error al enviar código');
    } finally {
      setIsOtpLoading(false);
    }
  };

  const verifyAndCreateOrder = async () => {
    if (otpCode.length < 4) {
      toast.error('Ingresa el código completo');
      return;
    }
    setIsOtpLoading(true);
    try {
      let fullDescription = '';
      let extraCompras = 0;
      let extraPaquete = 0;

      if (orderType === 'compra') {
        extraCompras = compraData.presupuesto.includes('100') ? 100 :
                       compraData.presupuesto.includes('300') ? 300 :
                       compraData.presupuesto.includes('500') ? 500 : 0;
        fullDescription = `[COMPRA - ${compraData.categoria.toUpperCase()}] Presupuesto: ${compraData.presupuesto}. Lista: ${compraData.lista}.`;
      } else {
        extraPaquete = deliveryData.packageSize === 'medium' ? 10 : 
                       deliveryData.packageSize === 'large' ? 50 : 0; // Se suman extras al precio base
        fullDescription = `${deliveryData.description}. ${deliveryData.instructions ? 'Instrucciones: ' + deliveryData.instructions : ''} (Paquete ${deliveryData.packageSize})`;
      }

      // El payload solo lleva lo necesario. El backend calculará el total usando H3.
      const payload = {
        cliente_tel: otpPhone,
        cliente_nombre: deliveryData.recipientName || 'Cliente Invitado',
        descripcion: fullDescription,
        direccion: deliveryData.origin,
        referencias_entrega: deliveryData.destination,
        origen: 'mandadito_app',
        tipo_pedido: 'mandadito',
        estado: 'buscando_repartidor',
        metodo_pago: 'efectivo',
        lat: deliveryData.originLat,
        lng: deliveryData.originLng,
        lat_entrega: deliveryData.destinationLat,
        lng_entrega: deliveryData.destinationLng,
        distancia_km: distanceKm,
        items: [],
        extra_compras: extraCompras,
        extra_paquete: extraPaquete
      };

      // Llamada única al backend para validar el código E insertar el pedido atómicamente
      const { data, error } = await supabase.functions.invoke('auth-otp', {
        body: { 
          action: 'verify-and-order-mandadito', 
          phone: otpPhone, 
          codigo: otpCode,
          payload: payload
        }
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('¡Mandadito solicitado con éxito!');
      setShowOtpModal(false);
      // MainShell will switch to activeTracking because of its Supabase Realtime listener
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error al procesar pedido');
    } finally {
      setIsOtpLoading(false);
    }
  };

  const handleInitialSubmit = () => {
    setShowOtpModal(true);
    setOtpStep('phone');
    setOtpCode('');
  };

  const isStepCategoriaCompra = (orderType === 'compra' && activeStep === 0);
  const isStepListaCompra = (orderType === 'compra' && activeStep === 1);
  const isStepOrigin = (orderType === 'compra' && activeStep === 2) || (orderType === 'envio' && activeStep === 0);
  const isStepDestination = (orderType === 'compra' && activeStep === 3) || (orderType === 'envio' && activeStep === 1);
  const isStepDetailsEnvio = (orderType === 'envio' && activeStep === 2);
  const isStepConfirmation = (orderType === 'compra' && activeStep === 4) || (orderType === 'envio' && activeStep === 3);

  return (
    <div className="flex flex-col h-full bg-white relative w-full">
      {orderType === null ? (
        <div className="flex-1 overflow-y-auto px-6 py-8 custom-scrollbar">
          <header className="flex items-center gap-4 mb-8">
            <button onClick={() => setCurrentView('home')} className="p-2 -ml-2 rounded-full hover:bg-gray-50 transition-colors">
              <ChevronLeft className="w-6 h-6 text-gray-800" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">¿Qué necesitas hoy?</h1>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-4 bg-white md:bg-transparent rounded-3xl md:rounded-none overflow-hidden md:overflow-visible border border-gray-200 md:border-none shadow-sm md:shadow-none max-w-3xl mx-auto">
            <div className="md:bg-white md:rounded-3xl md:border md:border-gray-200 md:shadow-sm md:hover:shadow-md md:hover:border-yellow-400 transition-all group/card">
              <button 
                onClick={() => { setOrderType('envio'); setActiveStep(0); }}
                className="w-full relative flex items-center p-4 bg-white md:bg-transparent hover:bg-gray-50 md:hover:bg-transparent transition-colors text-left group"
              >
                <div className="w-12 h-12 bg-yellow-50 group-hover:bg-yellow-100 group-hover/card:bg-yellow-100 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200">
                  <Package className="w-6 h-6 text-yellow-600" />
                </div>
                <div className="flex-1 min-w-0 ml-4">
                  <h2 className="text-[17px] font-semibold text-gray-900 tracking-tight leading-none mb-1">Enviar un paquete</h2>
                  <p className="text-[13px] text-gray-500 leading-tight pr-2">Llevamos documentos o llaves de un punto a otro.</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 md:hidden" />
              </button>
            </div>
            
            <div className="ml-[76px] border-b border-gray-100 md:hidden"></div>

            <div className="md:bg-white md:rounded-3xl md:border md:border-gray-200 md:shadow-sm md:hover:shadow-md md:hover:border-blue-400 transition-all group/card">
              <button 
                onClick={() => { setOrderType('compra'); setActiveStep(0); }}
                className="w-full relative flex items-center p-4 bg-white md:bg-transparent hover:bg-gray-50 md:hover:bg-transparent transition-colors text-left group"
              >
                <div className="w-12 h-12 bg-blue-50 group-hover:bg-blue-100 group-hover/card:bg-blue-100 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200">
                  <ShoppingCart className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0 ml-4">
                  <h2 className="text-[17px] font-semibold text-gray-900 tracking-tight leading-none mb-1">Ir de compras</h2>
                  <p className="text-[13px] text-gray-500 leading-tight pr-2">Farmacia, súper, comida. Te lo llevamos a donde estés.</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 md:hidden" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <header className="px-4 pt-6 sm:pt-8 pb-4 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-gray-100">
            <button onClick={prevStep} className="p-2 -ml-2 rounded-full hover:bg-gray-50 transition-colors">
              <ChevronLeft className="w-6 h-6 text-gray-800" />
            </button>
            <span className="font-semibold text-gray-900">{STEPS[activeStep]}</span>
            <div className="w-10"></div>
          </header>

          <div className="px-6 py-4 bg-white z-10 border-b border-gray-100 hidden md:block">
            <div className="max-w-3xl mx-auto flex items-center justify-between relative">
               <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-gray-100 -z-10 -translate-y-1/2"></div>
               {STEPS.map((step, idx) => (
                 <div key={idx} className="flex flex-col items-center gap-1.5 bg-white px-4 md:px-8">
                   <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                     idx < activeStep ? 'bg-gray-900 text-white' : 
                     idx === activeStep ? 'bg-yellow-400 text-gray-900 border-2 border-yellow-100' : 
                     'bg-white border-2 border-gray-200 text-gray-400'
                   }`}>
                     {idx < activeStep ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                   </div>
                   <span className="hidden md:block text-xs font-bold text-gray-500 mt-1">{step}</span>
                 </div>
               ))}
            </div>
          </div>

          <main className="flex-1 overflow-y-auto px-6 py-8 pb-32 custom-scrollbar">
            <div className="max-w-2xl mx-auto w-full">
              <AnimatePresence mode="wait">
        {isStepCategoriaCompra && (
          <motion.div key="stepCategoria" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="space-y-8">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Selecciona una categoría</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 md:gap-4 bg-white md:bg-transparent rounded-3xl md:rounded-none overflow-hidden md:overflow-visible border border-gray-200 md:border-none shadow-sm md:shadow-none">
                {COMPRA_CATEGORIES.map((cat, idx) => (
                  <div key={cat.id} className="md:bg-white md:rounded-3xl md:border md:border-gray-200 md:shadow-sm md:hover:shadow-md md:hover:border-gray-900 transition-all">
                    <motion.button
                      whileTap={{ backgroundColor: '#f3f4f6' }}
                      onClick={() => {
                        setCompraData(prev => ({...prev, categoria: cat.id}));
                        setActiveStep(1);
                      }}
                      className="w-full relative flex items-center p-4 bg-white md:bg-transparent hover:bg-gray-50 md:hover:bg-transparent transition-colors text-left group"
                    >
                      <div className="w-11 h-11 bg-gray-100 group-hover:bg-gray-200 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200">
                        <cat.icon className="w-5 h-5 text-gray-700" />
                      </div>
                      <div className="flex-1 min-w-0 ml-4">
                        <h4 className="text-[17px] font-semibold text-gray-900 tracking-tight leading-none mb-1">{cat.label}</h4>
                        <p className="text-[13px] text-gray-500 truncate md:whitespace-normal md:break-words pr-2">{cat.desc}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 md:hidden" />
                    </motion.button>
                    {idx < COMPRA_CATEGORIES.length - 1 && (
                      <div className="ml-[72px] border-b border-gray-100 md:hidden"></div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {isStepListaCompra && (
          <motion.div key="stepLista" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="space-y-8">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">¿Qué necesitas que compremos?</h3>
              <textarea 
                value={compraData.lista}
                onChange={(e) => setCompraData(prev => ({...prev, lista: e.target.value}))}
                placeholder={
                  compraData.categoria === 'farmacia' ? "Ej. 1 caja de Paracetamol 500mg, 1 Suero oral, 1 jeringa..." :
                  compraData.categoria === 'super' ? "Ej. 1 kilo de jitomate, 1 leche deslactosada, pan dulce..." :
                  compraData.categoria === 'comida' ? "Ej. 2 Hamburguesas sencillas sin cebolla, 1 refresco..." :
                  "Escribe aquí tu lista de compras a detalle..."
                }
                className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-base font-medium focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-all min-h-[120px] resize-none shadow-inner"
              />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Presupuesto aproximado</h3>
              <p className="text-sm text-gray-500 mb-4">Para que el repartidor sepa cuánto efectivo llevar.</p>
              <div className="grid grid-cols-2 gap-3">
                {['Menos de $100', 'Aprox $300', 'Aprox $500', 'Más de $500'].map((pres) => (
                  <button
                    key={pres}
                    onClick={() => setCompraData(prev => ({...prev, presupuesto: pres}))}
                    className={`py-3 px-4 rounded-xl font-bold text-sm border-2 transition-all ${
                      compraData.presupuesto === pres 
                        ? 'bg-gray-900 border-gray-900 text-white' 
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {pres}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {isStepOrigin && (
          <motion.div key="stepOrigin" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="space-y-6">
               <h3 className="text-lg font-bold text-gray-900 mb-4">{orderType === 'compra' ? '¿Dónde lo compramos?' : '¿Dónde recogemos?'}</h3>
               <div className="relative group cursor-pointer" onClick={() => setMapPickerType('origin')}>
                 <div className="absolute left-5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-blue-50 group-hover:scale-110 transition-transform"></div>
                 <div className="w-full pl-12 pr-5 py-4 md:py-5 bg-white group-hover:bg-gray-50 border border-gray-200 group-hover:border-blue-200 rounded-2xl text-gray-900 font-medium transition-all shadow-sm flex items-center min-h-[64px]">
                    {deliveryData.origin || <span className="text-gray-400">Toca para buscar dirección...</span>}
                 </div>
               </div>
               
               {isLoaded && deliveryData.originLat !== 0 ? (
                 <div className="h-32 bg-gray-100 rounded-2xl border border-gray-200 overflow-hidden relative mt-6 shadow-sm">
                    <GoogleMap
                      mapContainerStyle={{ width: '100%', height: '100%' }}
                      center={{ lat: deliveryData.originLat, lng: deliveryData.originLng }}
                      zoom={16}
                      options={{ disableDefaultUI: true, gestureHandling: 'none' }}
                    >
                      <Marker position={{ lat: deliveryData.originLat, lng: deliveryData.originLng }} />
                    </GoogleMap>
                 </div>
               ) : (
                 <div className="h-32 bg-white rounded-2xl border border-dashed border-gray-300 overflow-hidden relative mt-6 flex items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setMapPickerType('origin')}>
                    <div className="text-center relative z-10 text-gray-400 flex flex-col items-center">
                      <MapPin className="w-8 h-8 mb-3 opacity-50" />
                      <span className="text-sm font-semibold">Seleccionar en el mapa</span>
                    </div>
                 </div>
               )}

               <div className="mt-6">
                 <h3 className="text-sm font-bold text-gray-900 mb-2">Referencias del lugar (Opcional)</h3>
                 <input 
                   type="text" 
                   value={deliveryData.originReference || ''}
                   onChange={(e) => handleInputChange('originReference', e.target.value)}
                   placeholder="Ej. Casa blanca con zaguán negro"
                   className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-medium focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-all shadow-sm"
                 />
               </div>
          </motion.div>
        )}

        {isStepDestination && (
        <motion.div key="stepDestination" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="space-y-8">
           <div className="space-y-4">
             <h3 className="text-lg font-bold text-gray-900">¿A dónde enviamos?</h3>
             <div className="relative group cursor-pointer" onClick={() => setMapPickerType('destination')}>
               <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <MapPin className="w-6 h-6 text-yellow-500 group-hover:scale-110 transition-transform" />
               </div>
               <div className="w-full pl-12 pr-5 py-4 bg-white group-hover:bg-gray-50 border border-gray-200 group-hover:border-yellow-300 rounded-2xl text-gray-900 font-medium transition-all shadow-sm flex items-center min-h-[56px]">
                    {deliveryData.destination || <span className="text-gray-400">Toca para buscar dirección...</span>}
               </div>
             </div>

             {isLoaded && deliveryData.destinationLat !== 0 && (
               <div className="h-24 bg-gray-100 rounded-2xl border border-gray-200 overflow-hidden relative shadow-sm">
                  <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '100%' }}
                    center={{ lat: deliveryData.destinationLat, lng: deliveryData.destinationLng }}
                    zoom={16}
                    options={{ disableDefaultUI: true, gestureHandling: 'none' }}
                  >
                    <Marker position={{ lat: deliveryData.destinationLat, lng: deliveryData.destinationLng }} icon={{url: "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png"}} />
                  </GoogleMap>
               </div>
             )}
           </div>

           <div className="space-y-4">
             <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
               Datos de quien recibe <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded uppercase tracking-wider">Obligatorio</span>
             </h3>
             <p className="text-xs text-gray-500">Requeridos para entregar el código de seguridad (OTP).</p>
             <input 
               type="text" 
               value={deliveryData.recipientName}
               onChange={(e) => handleInputChange('recipientName', e.target.value)}
               placeholder="Nombre completo"
               className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-medium focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-all shadow-sm"
             />
             <input 
               type="tel" 
               value={deliveryData.recipientPhone}
               onChange={(e) => handleInputChange('recipientPhone', e.target.value)}
               placeholder="Teléfono móvil (10 dígitos)"
               className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-medium focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-all shadow-sm"
             />
            </div>
        </motion.div>
      )}

      {isStepDetailsEnvio && (
        <motion.div key="stepDetails" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="space-y-10">
           
           <div>
             <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
               ¿Qué estás enviando?
             </h3>
             
             <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
               {ENVIO_TYPES.map((type) => (
                 <label 
                   key={type.id}
                   className={`relative flex flex-col items-center justify-center p-4 cursor-pointer rounded-2xl border-2 transition-all text-center ${
                     deliveryData.packageType === type.id 
                       ? 'border-gray-900 bg-gray-900 text-white shadow-md' 
                       : 'border-gray-100 bg-white hover:border-gray-200 text-gray-700'
                   }`}
                 >
                   <input 
                     type="radio" 
                     name="packageType" 
                     value={type.id}
                     checked={deliveryData.packageType === type.id}
                     onChange={() => handleInputChange('packageType', type.id)}
                     className="sr-only"
                   />
                   <type.icon className={`w-8 h-8 mb-2 ${deliveryData.packageType === type.id ? 'text-white' : 'text-gray-500'}`} />
                   <span className="font-bold text-xs leading-tight">{type.label}</span>
                 </label>
               ))}
             </div>
           </div>

           <div>
             <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
               Selecciona el tamaño
               <Info className="w-4 h-4 text-gray-400" />
             </h3>
             
             <div className="grid grid-cols-1 gap-3">
               {ENVIO_SIZES.map((size) => (
                 <label 
                   key={size.id}
                   className={`relative flex items-center p-4 cursor-pointer rounded-2xl border-2 transition-all ${
                     deliveryData.packageSize === size.id 
                       ? 'border-gray-900 bg-gray-50' 
                       : 'border-gray-100 bg-white hover:border-gray-200'
                   }`}
                 >
                   <input 
                     type="radio" 
                     name="packageSize" 
                     value={size.id}
                     checked={deliveryData.packageSize === size.id}
                     onChange={() => handleInputChange('packageSize', size.id)}
                     className="sr-only"
                   />
                   <div className={`w-12 h-12 rounded-xl flex items-center justify-center mr-4 shrink-0 transition-colors ${
                     deliveryData.packageSize === size.id ? 'bg-yellow-400 text-gray-900' : 'bg-gray-50 text-gray-500'
                   }`}>
                     <size.icon className="w-6 h-6" />
                   </div>
                   <div className="flex-1">
                     <div className="flex justify-between items-center mb-1">
                       <span className="font-bold text-gray-900">{size.label}</span>
                     </div>
                     <p className="text-xs text-gray-500 leading-tight">{size.desc}</p>
                   </div>
                   <div className={`absolute top-4 right-4 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      deliveryData.packageSize === size.id ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
                   }`}>
                     {deliveryData.packageSize === size.id && <div className="w-2 h-2 bg-white rounded-full"></div>}
                   </div>
                 </label>
               ))}
             </div>
           </div>

           <div className="space-y-4 pt-4 border-t border-gray-100">         </div>

           <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-900">Detalles adicionales</h3>
              <input 
                type="text" 
                value={deliveryData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="¿Qué estás enviando? (Ej. Llaves casa)"
                className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-all"
              />
              <textarea 
                value={deliveryData.instructions}
                onChange={(e) => handleInputChange('instructions', e.target.value)}
                placeholder="Instrucciones para el repartidor (Ej. Tocar timbre 2)"
                rows={2}
                className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:bg-white focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-all resize-none"
              />
           </div>
        </motion.div>
      )}

        {isStepConfirmation && (
          <motion.div key="stepConfirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="space-y-6">
              <div className="bg-white rounded-[32px] p-6 border border-gray-100 shadow-xl relative overflow-hidden">
                 <div className="absolute -top-16 -right-16 w-40 h-40 bg-gray-50 rounded-full blur-3xl"></div>
                 
                 <div className="flex items-center justify-between mb-6 relative z-10">
                   <div className="flex-1 min-w-0 pr-2">
                     <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Origen</p>
                     <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight">{deliveryData.origin}</p>
                   </div>
                   <div className="px-2 text-gray-300 shrink-0"><ArrowRight className="w-5 h-5" /></div>
                   <div className="flex-1 min-w-0 pl-2 text-right flex flex-col items-end">
                     <p className="text-[10px] font-black text-yellow-500 uppercase tracking-widest mb-1">Destino</p>
                     <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight">{deliveryData.destination}</p>
                   </div>
                 </div>

                 <div className="py-5 border-y border-gray-100 mb-5 relative z-10">
                   {orderType === 'envio' ? (
                     <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center shrink-0">
                         <Package className="w-6 h-6 text-gray-700" />
                       </div>
                       <div className="min-w-0 flex-1">
                         <p className="text-sm font-bold text-gray-900">Paquete {
                           deliveryData.packageSize === 'small' ? 'Pequeño' : 
                           deliveryData.packageSize === 'medium' ? 'Mediano' : 'Grande'
                         }</p>
                         <p className="text-xs text-gray-500 truncate mt-0.5">{deliveryData.description || 'Sin descripción'}</p>
                       </div>
                     </div>
                   ) : (
                     <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center shrink-0">
                         <ShoppingCart className="w-6 h-6 text-blue-600" />
                       </div>
                       <div className="min-w-0 flex-1">
                         <div className="flex justify-between items-center mb-1">
                           <h3 className="text-sm font-bold text-gray-900 capitalize">{compraData.categoria}</h3>
                           <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-lg shrink-0 ml-2">{compraData.presupuesto}</span>
                         </div>
                         <p className="text-xs font-medium text-gray-500 truncate">"{compraData.lista}"</p>
                       </div>
                     </div>
                   )}
                 </div>

                 <div className="space-y-3 mb-6 relative z-10">
                   <div className="flex items-center justify-between">
                     <span className="text-sm font-medium text-gray-500">Tarifa de envío</span>
                     <span className="text-sm font-bold text-gray-900">${h3Price}.00</span>
                   </div>
                   {orderType === 'compra' && (
                     <div className="flex items-center justify-between">
                       <span className="text-sm font-medium text-gray-500">Compras (Aprox)</span>
                       <span className="text-sm font-bold text-gray-900">
                         {compraData.presupuesto.includes('100') ? '+$100.00' :
                          compraData.presupuesto.includes('300') ? '+$300.00' :
                          compraData.presupuesto.includes('500') ? '+$500.00' : ''}
                       </span>
                     </div>
                   )}
                 </div>

                 <div className="bg-gray-900 rounded-2xl p-5 flex items-center justify-between text-white relative z-10 shadow-lg shadow-gray-900/20">
                   <div>
                     <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Total a pagar {orderType === 'compra' && <span className="text-yellow-400">(Aprox)</span>}</p>
                     <div className="inline-flex items-center gap-1.5 bg-white/20 px-2 py-1 rounded-md">
                       <span className="text-[10px] text-white font-bold tracking-wider">Efectivo</span>
                     </div>
                   </div>
                   <div className="text-right flex items-start">
                     <span className="text-xl font-bold mt-1 mr-0.5 text-yellow-400">$</span>
                     <span className="text-4xl font-black">
                       {h3Price + (
                         orderType === 'compra' ? (
                           compraData.presupuesto.includes('100') ? 100 :
                           compraData.presupuesto.includes('300') ? 300 :
                           compraData.presupuesto.includes('500') ? 500 : 0
                         ) : 0
                       )}
                     </span>
                   </div>
                 </div>
              </div>
          </motion.div>
        )}
        </AnimatePresence>

      {/* Map Location Picker Overlay */}
      <AnimatePresence>
        {mapPickerType && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="fixed inset-0 z-[100] bg-white flex flex-col"
          >
            <MapLocationPicker
              isLoaded={isLoaded}
              initialLat={mapPickerType === 'origin' ? deliveryData.originLat || undefined : deliveryData.destinationLat || undefined}
              initialLng={mapPickerType === 'origin' ? deliveryData.originLng || undefined : deliveryData.destinationLng || undefined}
              onCancel={() => setMapPickerType(null)}
              onSelect={(address, lat, lng) => {
                if (mapPickerType === 'origin') {
                  handleInputChange('origin', address);
                  handleInputChange('originLat', lat);
                  handleInputChange('originLng', lng);
                } else {
                  handleInputChange('destination', address);
                  handleInputChange('destinationLat', lat);
                  handleInputChange('destinationLng', lng);
                }
                setMapPickerType(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
            </div>
          </main>

          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent pt-12 z-20">
            <div className="max-w-2xl mx-auto">
              {!isStepConfirmation && !isStepCategoriaCompra && (
                <button 
                  onClick={async () => {
                    const isGoingToConfirm = (orderType === 'envio' && activeStep === 2) || (orderType === 'compra' && activeStep === 3);
                    if (isGoingToConfirm) {
                      const success = await calcularPrecioH3(deliveryData.originLat, deliveryData.originLng, deliveryData.destinationLat, deliveryData.destinationLng);
                      if (success) setActiveStep(p => p + 1);
                    } else {
                      setActiveStep(p => p + 1);
                    }
                  }}
                  disabled={
                    calculandoPrecio ||
                    (isStepListaCompra && (!compraData.lista || !compraData.presupuesto)) ||
                    (isStepOrigin && !deliveryData.origin) ||
                    (isStepDestination && (!deliveryData.destination || !deliveryData.recipientName.trim() || !deliveryData.recipientPhone.trim()))
                  }
                  className="w-full bg-gray-900 text-white font-medium py-4 rounded-2xl shadow-xl hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {calculandoPrecio ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      Continuar <ArrowRight size={18} />
                    </>
                  )}
                </button>
              )}

              {isStepConfirmation && (
                <button 
                  onClick={handleInitialSubmit}
                  disabled={isProcessing}
                  className="w-full bg-gray-900 text-white font-medium py-4 rounded-2xl shadow-xl hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    'Confirmar y Solicitar'
                  )}
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {/* OTP Modal Overlay */}
      <AnimatePresence>
        {showOtpModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">Validar WhatsApp</h3>
                <button onClick={() => setShowOtpModal(false)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:text-gray-900">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {otpStep === 'phone' ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">Para confirmar tu pedido, ingresa tu número de WhatsApp. Te enviaremos un código rápido de 4 dígitos.</p>
                  <input
                    type="tel"
                    placeholder="10 dígitos (Ej. 5512345678)"
                    value={otpPhone}
                    onChange={(e) => setOtpPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full text-center text-xl font-bold tracking-widest px-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
                  />
                  <button
                    onClick={handleRequestOtp}
                    disabled={otpPhone.length < 10 || isOtpLoading}
                    className="w-full bg-gray-900 text-white font-bold py-4 rounded-2xl flex justify-center disabled:opacity-50"
                  >
                    {isOtpLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Enviar Código'}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">Ingresa el código que acabamos de enviar por WhatsApp al <span className="font-bold">{otpPhone}</span></p>
                  <input
                    type="tel"
                    placeholder="••••"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full text-center text-3xl font-black tracking-[1em] pl-[1em] px-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
                  />
                  <button
                    onClick={verifyAndCreateOrder}
                    disabled={otpCode.length < 4 || isOtpLoading}
                    className="w-full bg-yellow-400 text-gray-900 font-bold py-4 rounded-2xl flex justify-center disabled:opacity-50"
                  >
                    {isOtpLoading ? <div className="w-5 h-5 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin"></div> : 'Confirmar Pedido'}
                  </button>
                  <button onClick={() => setOtpStep('phone')} className="w-full text-center text-sm text-gray-500 font-medium py-2">
                    Cambiar número
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

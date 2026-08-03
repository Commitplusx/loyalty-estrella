import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Package, ShoppingCart, ArrowRight, ChevronLeft, X,
  CheckCircle2, Loader2
} from 'lucide-react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { useH3Pricing } from '../../hooks/useH3Pricing';
import { COMPRA_CATEGORIES } from '../../config/services.config';
import { MapLocationPicker } from '../MapLocationPicker';
import { LocationDetailsScreen } from './LocationDetailsScreen';
import { ConfirmOrderScreen } from './ConfirmOrderScreen';

interface QuickChip {
  label: string;
  append: string;
  askDetails?: string;
  placeholder?: string;
}

const QUICK_CHIPS: Record<string, QuickChip[]> = {
  comida: [
    { label: 'Tacos',   append: '1x Orden de Tacos',  askDetails: '¿De qué carne o guisado?',      placeholder: 'Ej. Al pastor, suadero...' },
    { label: 'Pizza',   append: '1x Pizza',            askDetails: '¿Ingredientes y tamaño?',        placeholder: 'Ej. Pepperoni grande...' },
    { label: 'Burger',  append: '1x Hamburguesa',      askDetails: '¿Sencilla o con papas?',         placeholder: 'Ej. Sencilla sin cebolla...' },
    { label: 'Sushi',   append: '1x Rollo Sushi',      askDetails: '¿Qué tipo/ingrediente?',         placeholder: 'Ej. California, Empanizado...' },
    { label: 'Postre',  append: '1x Postre',           askDetails: '¿Qué postre y de dónde?',        placeholder: 'Ej. Rebanada de pastel...' },
  ],
  super: [
    { label: 'Leche',    append: '1x Leche (1L)',        askDetails: '¿Entera, light o deslactosada?', placeholder: 'Ej. Deslactosada Lala...' },
    { label: 'Huevos',   append: '1x Huevo (12 pz)' },
    { label: 'Pan',      append: '1x Pan de caja',       askDetails: '¿Blanco o integral?',            placeholder: 'Ej. Integral grande...' },
    { label: 'Papel',    append: '1x Papel higiénico' },
    { label: 'Garrafón', append: '1x Garrafón',          askDetails: '¿Qué marca?',                    placeholder: 'Ej. Ciel...' },
  ],
  farmacia: [
    { label: 'Paracetamol', append: '1x Paracetamol' },
    { label: 'Suero',       append: '1x Suero',       askDetails: '¿Sabor y marca?',               placeholder: 'Ej. Electrolit fresa...' },
    { label: 'Antigripal',  append: '1x Antigripal',  askDetails: '¿Marca?',                       placeholder: 'Ej. Agrifen...' },
    { label: 'Aspirina',    append: '1x Aspirina' },
    { label: 'Jeringas',    append: '1x Jeringas' },
  ],
  conveniencia: [
    { label: 'Cerveza',  append: '1x Six de Cerveza', askDetails: '¿Marca?',                       placeholder: 'Ej. Tecate Light...' },
    { label: 'Refresco', append: '1x Refresco',       askDetails: '¿Sabor y tamaño?',              placeholder: 'Ej. Coca-Cola 600ml...' },
    { label: 'Botana',   append: '1x Botana',         askDetails: '¿Qué tipo?',                    placeholder: 'Ej. Doritos Nacho...' },
    { label: 'Hielos',   append: '1x Bolsa de Hielos' },
    { label: 'Cigarros', append: '1x Cajetilla',      askDetails: '¿Marca y sabor?',               placeholder: 'Ej. Marlboro Rojos...' },
  ],
  licores: [
    { label: 'Cerveza', append: '1x Six de Cerveza',   askDetails: '¿Marca?',                      placeholder: 'Ej. Modelo Especial...' },
    { label: 'Tequila', append: '1x Botella Tequila',  askDetails: '¿Marca?',                      placeholder: 'Ej. Maestro Dobel...' },
    { label: 'Vino',    append: '1x Botella de Vino',  askDetails: '¿Tinto o blanco?',             placeholder: 'Ej. Vino tinto dulce...' },
    { label: 'Hielos',  append: '1x Bolsa de Hielos' },
    { label: 'Mineral', append: '1x Agua mineral' },
  ],
  mercado: [
    { label: 'Jitomate',  append: '1kg Jitomate' },
    { label: 'Limón',     append: '1kg Limón' },
    { label: 'Pollo',     append: '1kg Pollo',    askDetails: '¿Pechuga, pierna, muslo?', placeholder: 'Ej. Pechuga sin hueso...' },
    { label: 'Cebolla',   append: '1kg Cebolla' },
    { label: 'Tortillas', append: '1kg Tortillas' },
  ],
  mascotas: [
    { label: 'Croq. Perro', append: '1x Croquetas Perro', askDetails: '¿Marca y kilos?', placeholder: 'Ej. Pedigree 2kg...' },
    { label: 'Croq. Gato',  append: '1x Croquetas Gato',  askDetails: '¿Marca y kilos?', placeholder: 'Ej. Whiskas 1.5kg...' },
    { label: 'Sobres',      append: '1x Sobrecitos',       askDetails: '¿Sabor?',         placeholder: 'Ej. De res y pollo...' },
    { label: 'Arena',       append: '1x Arena Gato' },
  ],
  regalos: [
    { label: 'Flores',      append: '1x Ramo de Flores',  askDetails: '¿Flores y colores?', placeholder: 'Ej. Rosas rojas...' },
    { label: 'Chocolates',  append: '1x Caja Chocolates', askDetails: '¿Marca?',             placeholder: 'Ej. Ferrero Rocher 16...' },
    { label: 'Globo',       append: '1x Globo helio',     askDetails: '¿Con qué mensaje?',  placeholder: 'Ej. Feliz cumpleaños...' },
    { label: 'Pastel',      append: '1x Pastel',          askDetails: '¿Sabor y personas?', placeholder: 'Ej. Chocolate para 10...' },
  ],
  ferreteria: [
    { label: 'Foco',       append: '1x Foco LED',   askDetails: '¿Luz blanca o cálida?', placeholder: 'Ej. Luz blanca...' },
    { label: 'Pilas',      append: '1x Pilas',       askDetails: '¿Tamaño AA o AAA?',     placeholder: 'Ej. Alcalinas AA...' },
    { label: 'Cinta',      append: '1x Cinta' },
    { label: 'Pegamento',  append: '1x KolaLoka' },
  ],
  papeleria: [
    { label: 'Hojas',     append: '100x Hojas Blancas' },
    { label: 'Pluma',     append: '1x Pluma',          askDetails: '¿Negra, azul o roja?', placeholder: 'Ej. Negra bic...' },
    { label: 'Pritt',     append: '1x Lápiz Adhesivo' },
    { label: 'Cuaderno',  append: '1x Cuaderno',       askDetails: '¿Raya o cuadro?',      placeholder: 'Ej. Profesional de raya...' },
  ],
};

interface NewDeliveryFlowProps {
  setCurrentView: (view: string) => void;
  isLoaded: boolean;
}

export function NewDeliveryFlow({ setCurrentView, isLoaded }: NewDeliveryFlowProps) {
  const { user, currentAddress, currentLocation, setPedidoActivo } = useAppStore();
  const [orderType, setOrderType] = useState<'envio' | 'compra' | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const [direction, setDirection] = useState(1);
  const [isEditingFromSummary, setIsEditingFromSummary] = useState(false);

  // OTP
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpStep, setOtpStep] = useState<'phone' | 'code'>('phone');
  const [otpPhone, setOtpPhone] = useState(user?.phone !== '525555555555' ? user?.phone || '' : '');
  const [otpCode, setOtpCode] = useState('');
  const [isOtpLoading, setIsOtpLoading] = useState(false);

  // Chip prompt
  const [chipPrompt, setChipPrompt] = useState<{ chipBase: string; question: string; placeholder?: string } | null>(null);
  const [chipAnswer, setChipAnswer] = useState('');

  const queryClient = useQueryClient();

  const createOrderMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await supabase.functions.invoke('auth-otp', {
        body: { action: 'verify-and-order-mandadito', telefono: otpPhone, codigo: otpCode, payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success('¡Mandadito solicitado!');
      setShowOtpModal(false);
      queryClient.invalidateQueries({ queryKey: ['pedidoActivo'] });
      queryClient.invalidateQueries({ queryKey: ['historial'] });
      if (data?.pedido) { setPedidoActivo(data.pedido); setCurrentView('activeTracking'); }
      else setCurrentView('home');
    },
    onError: (err: any) => toast.error(err.message || 'Error al procesar pedido'),
  });

  const [deliveryData, setDeliveryData] = useState({
    origin: currentAddress !== 'Buscando tu ubicación...' && currentAddress !== 'Ubicación desconocida' && currentAddress !== 'Toca para agregar ubicación' ? currentAddress : '',
    originLat: currentLocation?.lat || 0,
    originLng: currentLocation?.lng || 0,
    destination: '', destinationLat: 0, destinationLng: 0,
    packageSize: 'medium', packageType: 'otro', description: '',
    instructions: '', recipientName: '', recipientPhone: '',
    originReference: '', originName: '', originPhone: '', destinationReference: '',
  });

  const [compraData, setCompraData] = useState({ categoria: '', lista: '', presupuesto: '' });
  const { h3Price, calculandoPrecio, calcularPrecioH3 } = useH3Pricing();

  const STEPS = orderType === 'compra'
    ? ['Categoría', 'Lista', 'Recolección', 'Entrega', 'Confirmar']
    : ['Recolección', 'Entrega', 'Confirmar'];

  const handleInputChange = (field: string, value: any) =>
    setDeliveryData(prev => ({ ...prev, [field]: value }));

  const calculateRoute = (oLat: number, oLng: number, dLat: number, dLng: number) => {
    if (!window.google || !oLat || !dLat) return;
    new window.google.maps.DirectionsService().route(
      { origin: { lat: oLat, lng: oLng }, destination: { lat: dLat, lng: dLng }, travelMode: window.google.maps.TravelMode.DRIVING },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK && result) {
          if (result.routes[0].legs[0].distance)
            setDistanceKm(result.routes[0].legs[0].distance.value / 1000);
        }
      }
    );
  };

  const nextStep = async (overrideDest?: { lat: number; lng: number }) => {
    const confirmationStepIndex = STEPS.length - 1;

    if (isEditingFromSummary) {
      const dLat = overrideDest?.lat ?? deliveryData.destinationLat;
      const dLng = overrideDest?.lng ?? deliveryData.destinationLng;
      if (deliveryData.originLat && dLat) {
        await calcularPrecioH3(deliveryData.originLat, deliveryData.originLng, dLat, dLng);
        calculateRoute(deliveryData.originLat, deliveryData.originLng, dLat, dLng);
      }
      setIsEditingFromSummary(false);
      setDirection(1);
      setActiveStep(confirmationStepIndex);
      return;
    }

    const isGoingToConfirm = activeStep + 1 === confirmationStepIndex;
    if (isGoingToConfirm) {
      const dLat = overrideDest?.lat ?? deliveryData.destinationLat;
      const dLng = overrideDest?.lng ?? deliveryData.destinationLng;
      const ok = await calcularPrecioH3(deliveryData.originLat, deliveryData.originLng, dLat, dLng);
      if (!ok) return;
      calculateRoute(deliveryData.originLat, deliveryData.originLng, dLat, dLng);
    }
    if (activeStep < confirmationStepIndex) {
      setDirection(1);
      setActiveStep(p => p + 1);
    }
  };

  const prevStep = () => {
    if (isEditingFromSummary) {
      setIsEditingFromSummary(false);
      setDirection(1);
      setActiveStep(STEPS.length - 1);
      return;
    }

    setDirection(-1);
    if (orderType !== null && activeStep === 0) {
      setOrderType(null);
      return;
    }
    if (activeStep > 0) {
      setActiveStep(p => p - 1);
    } else {
      setCurrentView('home');
    }
  };

  const handleEditOrigin = () => {
    const originStep = orderType === 'compra' ? 1 : 0;
    setDirection(-1);
    setIsEditingFromSummary(true);
    setActiveStep(originStep);
  };

  const handleEditDestination = () => {
    const destinationStep = orderType === 'compra' ? 3 : 1;
    setDirection(-1);
    setIsEditingFromSummary(true);
    setActiveStep(destinationStep);
  };

  const handleRequestOtp = async () => {
    if (otpPhone.length < 10) { toast.error('Ingresa un número de 10 dígitos'); return; }
    setIsOtpLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('auth-otp', {
        body: { action: 'request-client-otp', telefono: otpPhone },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setOtpStep('code');
      toast.success('Código enviado por WhatsApp');
    } catch { toast.error('Error al enviar código'); }
    finally { setIsOtpLoading(false); }
  };

  const verifyAndCreateOrder = async () => {
    if (otpCode.length < 4) { toast.error('Ingresa el código completo'); return; }
    setIsOtpLoading(true);
    try {
      let fullDescription = '';
      let extraCompras = 0;
      if (orderType === 'compra') {
        extraCompras = compraData.presupuesto.includes('Más') ? 600 : compraData.presupuesto.includes('500') ? 500 : compraData.presupuesto.includes('300') ? 300 : 100;
        fullDescription = `[COMPRA - ${compraData.categoria.toUpperCase()}] Presupuesto: ${compraData.presupuesto}. Lista: ${compraData.lista}.`;
      } else {
        fullDescription = `${deliveryData.description}. ${deliveryData.instructions ? 'Instrucciones: ' + deliveryData.instructions : ''} (Paquete ${deliveryData.packageSize})`;
      }
      createOrderMutation.mutate({
        cliente_tel: otpPhone, cliente_nombre: deliveryData.recipientName || 'Cliente Invitado',
        descripcion: fullDescription, direccion: deliveryData.origin,
        referencias_entrega: deliveryData.destination, origen: 'mandadito_app',
        tipo_pedido: 'mandadito', estado: 'buscando_repartidor', metodo_pago: 'efectivo',
        lat: deliveryData.originLat, lng: deliveryData.originLng,
        lat_entrega: deliveryData.destinationLat, lng_entrega: deliveryData.destinationLng,
        distancia_km: distanceKm, items: [], extra_compras: extraCompras, extra_paquete: 0,
      });
    } catch (err: any) { toast.error(err.message || 'Error al preparar pedido'); }
  };

  const isStepCategoriaCompra = orderType === 'compra' && activeStep === 0;
  const isStepListaCompra     = orderType === 'compra' && activeStep === 1;
  const isStepOrigin          = (orderType === 'compra' && activeStep === 2) || (orderType === 'envio' && activeStep === 0);
  const isStepDestination     = (orderType === 'compra' && activeStep === 3) || (orderType === 'envio' && activeStep === 1);
  const isStepConfirmation    = (orderType === 'compra' && activeStep === 4) || (orderType === 'envio' && activeStep === 2);

  const screenVariants: Variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 36 : -36,
      opacity: 0,
      scale: 0.99,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.26,
        ease: [0.16, 1, 0.3, 1] as const,
      },
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -36 : 36,
      opacity: 0,
      scale: 0.99,
      transition: {
        duration: 0.2,
        ease: [0.16, 1, 0.3, 1] as const,
      },
    }),
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden relative">
      <AnimatePresence mode="wait" custom={direction} initial={false}>
        {/* ── Screen 0: Service selector ─────────────────────────────────── */}
        {orderType === null && (
          <motion.div
            key="service-selector"
            custom={direction}
            variants={screenVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="flex flex-col h-full w-full bg-white overflow-hidden"
          >
            {/* Top bar */}
            <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 px-8 md:px-12 h-14 flex items-center justify-between shrink-0">
              <button onClick={() => setCurrentView('home')} className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-700 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Inicio
              </button>
              <span className="text-sm font-bold text-gray-900">Nuevo pedido</span>
              <div className="w-20" />
            </div>

            <div className="flex-1 overflow-y-auto px-8 md:px-12 py-10">
              <div className="max-w-3xl w-full mx-auto">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Elige un servicio</p>
                <h2 className="text-3xl font-black text-gray-900 mb-8">¿Qué necesitas hoy?</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-100 rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                  {/* Envío */}
                  <button
                    onClick={() => {
                      setDirection(1);
                      setOrderType('envio');
                      setActiveStep(0);
                    }}
                    className="group bg-white hover:bg-gray-50 text-left p-7 flex flex-col gap-5 transition-colors duration-150"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center group-hover:bg-yellow-50 transition-colors duration-200">
                        <Package className="w-5 h-5 text-gray-500 group-hover:text-yellow-600 transition-colors duration-200" />
                      </div>
                      <span className="text-[11px] font-bold text-gray-400 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full group-hover:border-yellow-200 group-hover:bg-yellow-50 group-hover:text-yellow-600 transition-colors duration-200">~15 min</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base mb-1.5">Enviar un paquete</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">Documentos, llaves, encargos. Lo llevamos de un punto a otro.</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-300 group-hover:text-yellow-500 text-xs font-semibold transition-colors duration-200">
                      Seleccionar <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </button>

                  {/* Compra */}
                  <button
                    onClick={() => {
                      setDirection(1);
                      setOrderType('compra');
                      setActiveStep(0);
                    }}
                    className="group bg-white hover:bg-gray-50 text-left p-7 flex flex-col gap-5 transition-colors duration-150"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center group-hover:bg-yellow-50 transition-colors duration-200">
                        <ShoppingCart className="w-5 h-5 text-gray-500 group-hover:text-yellow-600 transition-colors duration-200" />
                      </div>
                      <span className="text-[11px] font-bold text-gray-400 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full group-hover:border-yellow-200 group-hover:bg-yellow-50 group-hover:text-yellow-600 transition-colors duration-200">~30 min</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base mb-1.5">Ir de compras</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">Súper, farmacia, comida. Compramos y te entregamos en casa.</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-300 group-hover:text-yellow-500 text-xs font-semibold transition-colors duration-200">
                      Seleccionar <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Compra Step 0: Categoría ──────────────────────────────────── */}
        {orderType === 'compra' && isStepCategoriaCompra && (
          <motion.div
            key="compra-categoria"
            custom={direction}
            variants={screenVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="flex flex-col h-full w-full bg-white overflow-hidden"
          >
            {/* Stepper Top Bar */}
            <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 shrink-0">
              <div className="px-8 md:px-12 h-14 flex items-center justify-between">
                <button onClick={prevStep} className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-700 transition-colors">
                  <ChevronLeft className="w-4 h-4" /> Atrás
                </button>
                <div className="hidden md:flex items-center gap-1">
                  {STEPS.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                        idx < activeStep  ? 'bg-gray-900 text-white' :
                        idx === activeStep ? 'bg-yellow-400 text-gray-900' :
                        'bg-gray-100 text-gray-400'
                      }`}>
                        {idx < activeStep ? <CheckCircle2 className="w-3 h-3" /> : <span>{idx + 1}</span>}
                        {step}
                      </div>
                      {idx < STEPS.length - 1 && <div className="w-3 h-px bg-gray-200" />}
                    </div>
                  ))}
                </div>
                <div className="w-20 md:hidden">
                  <span className="text-sm font-bold text-gray-500">{activeStep + 1}/{STEPS.length}</span>
                </div>
                <div className="hidden md:block w-20" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-8 md:px-12 py-10">
              <div className="max-w-3xl w-full mx-auto">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Paso 1</p>
                <h2 className="text-3xl font-black text-gray-900 mb-8">¿De dónde compramos?</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-gray-100 rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                  {COMPRA_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setCompraData(p => ({ ...p, categoria: cat.id }));
                          setDirection(1);
                          setActiveStep(1);
                        }}
                        className="group bg-white hover:bg-gray-50 text-left p-5 flex items-start gap-4 transition-colors duration-150"
                      >
                        <div className="w-9 h-9 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center shrink-0 group-hover:border-yellow-200 group-hover:bg-yellow-50 transition-colors duration-200">
                          <Icon className="w-4 h-4 text-gray-500 group-hover:text-yellow-600 transition-colors" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 text-sm">{cat.label}</p>
                          <p className="text-xs text-gray-400 mt-0.5 leading-snug truncate">{cat.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Compra Step 1: Lista ──────────────────────────────────────── */}
        {orderType === 'compra' && isStepListaCompra && (
          <motion.div
            key="compra-lista"
            custom={direction}
            variants={screenVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="flex flex-col h-full w-full bg-white overflow-hidden"
          >
            {/* Stepper Top Bar */}
            <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 shrink-0">
              <div className="px-8 md:px-12 h-14 flex items-center justify-between">
                <button onClick={prevStep} className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-700 transition-colors">
                  <ChevronLeft className="w-4 h-4" /> Atrás
                </button>
                <div className="hidden md:flex items-center gap-1">
                  {STEPS.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                        idx < activeStep  ? 'bg-gray-900 text-white' :
                        idx === activeStep ? 'bg-yellow-400 text-gray-900' :
                        'bg-gray-100 text-gray-400'
                      }`}>
                        {idx < activeStep ? <CheckCircle2 className="w-3 h-3" /> : <span>{idx + 1}</span>}
                        {step}
                      </div>
                      {idx < STEPS.length - 1 && <div className="w-3 h-px bg-gray-200" />}
                    </div>
                  ))}
                </div>
                <div className="w-20 md:hidden">
                  <span className="text-sm font-bold text-gray-500">{activeStep + 1}/{STEPS.length}</span>
                </div>
                <div className="hidden md:block w-20" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-8 md:px-12 py-10">
              <div className="max-w-3xl w-full mx-auto">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Paso 2</p>
                <h2 className="text-3xl font-black text-gray-900 mb-2">¿Qué compramos?</h2>
                <p className="text-sm text-gray-500 mb-8">Escribe tu lista libremente o usa los atajos de abajo.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Lista */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Tu lista</label>
                    <textarea
                      value={compraData.lista}
                      onChange={(e) => setCompraData(p => ({ ...p, lista: e.target.value }))}
                      placeholder={
                        compraData.categoria === 'farmacia' ? 'Ej. 1 caja Paracetamol, 1 Suero oral...' :
                        compraData.categoria === 'super'    ? 'Ej. 1kg jitomate, 1 leche deslactosada...' :
                        compraData.categoria === 'comida'   ? 'Ej. 2 Hamburguesas sencillas, 1 refresco...' :
                        'Escribe tu lista de compras...'
                      }
                      className="w-full px-4 py-3.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-all min-h-[160px] resize-none"
                    />
                    {QUICK_CHIPS[compraData.categoria] && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {QUICK_CHIPS[compraData.categoria].map(chip => (
                          <button
                            key={chip.label}
                            onClick={() => {
                              if (chip.askDetails) {
                                setChipPrompt({ chipBase: chip.append, question: chip.askDetails, placeholder: chip.placeholder });
                              } else {
                                setCompraData(p => ({ ...p, lista: p.lista ? `${p.lista}, ${chip.append}` : chip.append }));
                              }
                            }}
                            className="px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-600 text-xs font-bold rounded-full hover:bg-gray-100 hover:text-gray-900 transition-colors"
                          >
                            + {chip.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Presupuesto */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Presupuesto aprox.</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Menos de $100', 'Aprox $300', 'Aprox $500', 'Más de $500'].map((pres) => (
                        <button
                          key={pres}
                          onClick={() => setCompraData(p => ({ ...p, presupuesto: pres }))}
                          className={`py-3 px-4 rounded-xl font-bold text-sm border transition-all ${
                            compraData.presupuesto === pres
                              ? 'bg-gray-900 border-gray-900 text-white'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-900'
                          }`}
                        >
                          {pres}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-3 leading-relaxed">Para que el repartidor sepa cuánto efectivo llevar al momento de la compra.</p>
                  </div>
                </div>

                {/* Continue button */}
                <div className="mt-10 flex justify-end">
                  <button
                    onClick={() => nextStep()}
                    disabled={!compraData.lista || !compraData.presupuesto || calculandoPrecio}
                    className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold px-7 py-3.5 rounded-xl transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                  >
                    {calculandoPrecio ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continuar <ArrowRight className="w-4 h-4" /></>}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Step: Recolección / Tienda ─────────────────────────────────── */}
        {isStepOrigin && (
          <motion.div
            key="step-origin"
            custom={direction}
            variants={screenVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="h-full w-full bg-white overflow-hidden"
          >
            <LocationDetailsScreen
              key="location-pickup"
              title={orderType === 'compra' ? 'Detalles de compra' : 'Detalles de recolección'}
              isLoaded={isLoaded}
              type="pickup"
              address={deliveryData.origin}
              lat={deliveryData.originLat}
              lng={deliveryData.originLng}
              reference={deliveryData.originReference}
              contactName={deliveryData.originName || ''}
              contactPhone={deliveryData.originPhone || ''}
              onChange={handleInputChange}
              onConfirm={nextStep}
              onBack={prevStep}
            />
          </motion.div>
        )}

        {/* ── Step: Entrega ──────────────────────────────────────────────── */}
        {isStepDestination && (
          <motion.div
            key="step-destination"
            custom={direction}
            variants={screenVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="h-full w-full bg-white overflow-hidden"
          >
            <LocationDetailsScreen
              key="location-dropoff"
              title="Detalles de entrega"
              isLoaded={isLoaded}
              type="dropoff"
              address={deliveryData.destination}
              lat={deliveryData.destinationLat}
              lng={deliveryData.destinationLng}
              reference={deliveryData.destinationReference || ''}
              contactName={deliveryData.recipientName}
              contactPhone={deliveryData.recipientPhone}
              onChange={handleInputChange}
              onConfirm={nextStep}
              onBack={prevStep}
            />
          </motion.div>
        )}

        {/* ── Step: Resumen y Confirmación ───────────────────────────────── */}
        {isStepConfirmation && (
          <motion.div
            key="step-confirmation"
            custom={direction}
            variants={screenVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="h-full w-full bg-white overflow-hidden"
          >
            <ConfirmOrderScreen
              orderType={orderType!}
              deliveryData={deliveryData}
              compraData={compraData}
              h3Price={h3Price}
              onBack={prevStep}
              onConfirm={() => { setShowOtpModal(true); setOtpStep('phone'); setOtpCode(''); }}
              onChange={handleInputChange}
              isProcessing={isOtpLoading || createOrderMutation.isPending}
              onEditOrigin={handleEditOrigin}
              onEditDestination={handleEditDestination}
              showOtpModal={showOtpModal}
              otpStep={otpStep}
              otpPhone={otpPhone}
              otpCode={otpCode}
              isOtpLoading={isOtpLoading || createOrderMutation.isPending}
              onSetOtpPhone={setOtpPhone}
              onSetOtpCode={setOtpCode}
              onRequestOtp={handleRequestOtp}
              onVerifyAndCreate={verifyAndCreateOrder}
              onCloseOtp={() => setShowOtpModal(false)}
              onBackOtpStep={() => setOtpStep('phone')}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chip Prompt Modal */}
      {createPortal(
        <AnimatePresence>
          {chipPrompt && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[130] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl border border-gray-100"
              >
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">{chipPrompt.chipBase}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">{chipPrompt.question}</p>
                  </div>
                  <button onClick={() => { setChipPrompt(null); setChipAnswer(''); }} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <input
                  type="text" autoFocus
                  placeholder={chipPrompt.placeholder || 'Escribe aquí...'}
                  value={chipAnswer}
                  onChange={(e) => setChipAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && chipAnswer.trim()) {
                      const t = `${chipPrompt.chipBase} (${chipAnswer.trim()})`;
                      setCompraData(p => ({ ...p, lista: p.lista ? `${p.lista}\n- ${t}` : `- ${t}` }));
                      setChipPrompt(null); setChipAnswer('');
                    }
                  }}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-all mb-4"
                />
                <button
                  onClick={() => {
                    const t = `${chipPrompt.chipBase} (${chipAnswer.trim()})`;
                    setCompraData(p => ({ ...p, lista: p.lista ? `${p.lista}\n- ${t}` : `- ${t}` }));
                    setChipPrompt(null); setChipAnswer('');
                  }}
                  disabled={!chipAnswer.trim()}
                  className="w-full bg-gray-900 text-white font-bold py-3 rounded-xl text-sm hover:bg-gray-800 transition-colors disabled:opacity-30"
                >
                  Agregar a la lista
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

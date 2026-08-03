import { Package, ShoppingBag, FileText, ArrowRight, Zap, ShieldCheck, MapPin, Clock } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { motion } from 'framer-motion';

const SERVICES = [
  {
    id: 'envio',
    icon: Package,
    name: 'Envío de paquetes',
    desc: 'Documentos, llaves, encargos. Lo recogemos y lo entregamos.',
    time: '~15 min',
  },
  {
    id: 'compra',
    icon: ShoppingBag,
    name: 'Compras del súper',
    desc: 'Compramos en tienda y te lo llevamos sin que salgas de casa.',
    time: '~30 min',
  },
  {
    id: 'tramites',
    icon: FileText,
    name: 'Trámites y pagos',
    desc: 'Hacemos filas y gestiones por ti. Tú espera en casa.',
    time: 'Mismo día',
  },
];

const PERKS = [
  { icon: Zap,         label: 'Asignación en segundos' },
  { icon: ShieldCheck, label: 'Envíos asegurados'       },
  { icon: MapPin,      label: 'Rastreo en vivo'         },
  { icon: Clock,       label: 'Disponible 24/7'         },
];

interface HomeViewProps {
  setIsMenuOpen: (val: boolean) => void;
  setCurrentView: (val: string) => void;
  setOrderType: (val: 'envio' | 'compra' | null) => void;
  setActiveStep: (val: number) => void;
  isLoaded?: boolean;
}

export function HomeView({ setCurrentView, setOrderType, setActiveStep }: HomeViewProps) {
  const { currentAddress } = useAppStore();

  const go = (id: string) => {
    setOrderType(id === 'compra' ? 'compra' : 'envio');
    setCurrentView('newDelivery');
    setActiveStep(0);
  };

  const addr = currentAddress && currentAddress !== 'Buscando tu ubicación...'
    ? currentAddress
    : 'Comitán de Domínguez, Chiapas';

  return (
    <div className="flex-1 flex flex-col h-full bg-white overflow-y-auto">

      {/* ── TOP BAR ── */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 px-8 md:px-12 h-14 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate max-w-xs">{addr}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-gray-500 font-medium">Repartidores activos</span>
        </div>
      </div>

      {/* ── HERO ── */}
      <div className="px-8 md:px-12 pt-14 pb-12 max-w-5xl w-full mx-auto">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="text-sm font-semibold text-yellow-500 tracking-widest uppercase mb-4"
        >
          Estrella Express · Comitán
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="text-5xl md:text-6xl font-black text-gray-900 leading-[1.05] tracking-tight mb-5"
        >
          Lo que necesites,<br />
          <span className="text-yellow-400">en minutos.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-lg text-gray-500 max-w-md leading-relaxed mb-10"
        >
          Olvídate del tráfico. Mandamos a un repartidor a recoger y entregar lo que necesites,{' '}
          <span className="text-gray-800 font-semibold">al instante.</span>
        </motion.p>

        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
          onClick={() => go('envio')}
          className="group inline-flex items-center gap-2.5 bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm px-6 py-3.5 rounded-xl transition-all duration-200 active:scale-95"
        >
          Solicitar ahora
          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </motion.button>
      </div>

      {/* ── DIVIDER ── */}
      <div className="border-t border-gray-100 max-w-5xl w-full mx-auto px-8 md:px-12" />

      {/* ── SERVICES ── */}
      <div className="px-8 md:px-12 py-12 max-w-5xl w-full mx-auto">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Servicios</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-gray-100 rounded-2xl overflow-hidden border border-gray-100">
          {SERVICES.map((svc, i) => {
            const Icon = svc.icon;
            return (
              <motion.button
                key={svc.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.1 + i * 0.06 }}
                onClick={() => go(svc.id)}
                className="group bg-white hover:bg-gray-50 text-left p-7 flex flex-col gap-5 transition-colors duration-150 active:bg-gray-100"
              >
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center group-hover:bg-yellow-50 group-hover:text-yellow-600 transition-colors duration-200">
                    <Icon className="w-5 h-5 text-gray-500 group-hover:text-yellow-600 transition-colors duration-200" />
                  </div>
                  <span className="text-[11px] font-bold text-gray-400 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full group-hover:border-yellow-200 group-hover:bg-yellow-50 group-hover:text-yellow-600 transition-colors duration-200">
                    {svc.time}
                  </span>
                </div>

                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 text-base mb-1.5">{svc.name}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{svc.desc}</p>
                </div>

                <div className="flex items-center gap-1.5 text-gray-300 group-hover:text-yellow-500 text-xs font-semibold transition-colors duration-200">
                  Seleccionar <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── PERKS ── */}
      <div className="px-8 md:px-12 pb-14 max-w-5xl w-full mx-auto">
        <div className="flex flex-wrap gap-3">
          {PERKS.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.label}
                className="flex items-center gap-2 bg-gray-50 border border-gray-100 px-4 py-2.5 rounded-full text-sm text-gray-600 font-medium"
              >
                <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                {p.label}
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

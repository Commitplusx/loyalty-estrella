import { useState, useEffect, useCallback } from 'react';
import type { StoreState, HorarioAtencion, HoraFeliz, AppContacto } from '@/types';
import { getAppConfig, supabase } from '@/lib/supabase';

// Configuración de horarios de atención
const HORARIOS_ATENCION: HorarioAtencion[] = [
  { dia: 0, nombre: 'Domingo', abierto: true, hora_apertura: '09:00', hora_cierre: '22:00' },
  { dia: 1, nombre: 'Lunes', abierto: true, hora_apertura: '09:00', hora_cierre: '22:00' },
  { dia: 2, nombre: 'Martes', abierto: true, hora_apertura: '09:00', hora_cierre: '22:00' },
  { dia: 3, nombre: 'Miércoles', abierto: true, hora_apertura: '09:00', hora_cierre: '22:00' },
  { dia: 4, nombre: 'Jueves', abierto: true, hora_apertura: '09:00', hora_cierre: '22:00' },
  { dia: 5, nombre: 'Viernes', abierto: true, hora_apertura: '09:00', hora_cierre: '22:00' },
  { dia: 6, nombre: 'Sábado', abierto: true, hora_apertura: '09:00', hora_cierre: '22:00' },
];

// Configuración de horas felices
const HORAS_FELICES: HoraFeliz[] = [
  { 
    dia: 1, // Lunes
    nombre: 'Lunes', 
    hora_inicio: '17:00', 
    hora_fin: '20:00', 
    precio_promocional: 35, 
    activo: true 
  },
  { 
    dia: 3, // Miércoles
    nombre: 'Miércoles', 
    hora_inicio: '17:00', 
    hora_fin: '20:00', 
    precio_promocional: 35, 
    activo: true 
  },
  { 
    dia: 6, // Sábado
    nombre: 'Sábado', 
    hora_inicio: '17:00', 
    hora_fin: '20:00', 
    precio_promocional: 35, 
    activo: true 
  },
];

const PRECIO_NORMAL_DEFAULT = 50; // Precio regular de envío

// Dejamos los datos de contacto vacíos por defecto para que los botones
// se mantengan deshabilitados mientras carga la configuración real.
const CONTACTO_DEFAULT: AppContacto = {
  whatsapp: '',
  telefono: '',
  precio_normal: PRECIO_NORMAL_DEFAULT
};

interface UseScheduleReturn {
  storeState: StoreState;
  horarios: HorarioAtencion[];
  horasFelices: HoraFeliz[];
  contacto: AppContacto;
  getPrecioActual: () => number;
  getEstadoTienda: () => StoreState;
  isHappyHourNow: () => boolean;
  formatTime: (time: string) => string;
}

const parseTime = (timeStr: string): { hours: number; minutes: number } => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
};

const isTimeInRange = (
  currentHours: number, 
  currentMinutes: number,
  startTime: string,
  endTime: string
): boolean => {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  
  const currentTotal = currentHours * 60 + currentMinutes;
  const startTotal = start.hours * 60 + start.minutes;
  const endTotal = end.hours * 60 + end.minutes;
  
  return currentTotal >= startTotal && currentTotal < endTotal;
};

export function useSchedule(): UseScheduleReturn {
  const [horarios, setHorarios] = useState<HorarioAtencion[]>(HORARIOS_ATENCION);
  const [horasFelices, setHorasFelices] = useState<HoraFeliz[]>(HORAS_FELICES);
  const [contacto, setContacto] = useState<AppContacto>(CONTACTO_DEFAULT);
  
  const [storeState, setStoreState] = useState<StoreState>({
    isOpen: false,
    isHappyHour: false,
    currentPrice: CONTACTO_DEFAULT.precio_normal,
    nextOpeningTime: null,
    message: '',
  });

  // Cargamos la config y nos suscribimos para detectar cambios en tiempo real.
  // Así, si el admin cambia precios o horas felices desde el panel, todos los
  // clientes ven el cambio al instante sin necesidad de recargar la página.
  useEffect(() => {
    const loadConfig = async () => {
      const config = await getAppConfig();
      if (config) {
        setHorarios(config.horarios);
        setHorasFelices(config.horas_felices);
        setContacto(config.contacto);
      }
    };

    loadConfig();

    // Escuchar cualquier UPDATE en la tabla app_config
    const channel = supabase
      .channel('app_config_realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_config' },
        () => {
          // Cuando el admin guarda cambios, recargamos la config completa
          loadConfig();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);


  const getEstadoTienda = useCallback((): StoreState => {
    const now = new Date();
    const diaActual = now.getDay();
    const horaActual = now.getHours();
    const minutosActual = now.getMinutes();
    
    const horarioHoy = horarios.find((h: HorarioAtencion) => h.dia === diaActual);
    const horaFelizHoy = horasFelices.find((h: HoraFeliz) => h.dia === diaActual && h.activo);
    
    // Verificar si está abierto
    let isOpen = false;
    let nextOpeningTime: string | null = null;
    let message = '';
    
    if (horarioHoy && horarioHoy.abierto) {
      const { hours: openHour, minutes: openMin } = parseTime(horarioHoy.hora_apertura);
      const { hours: closeHour, minutes: closeMin } = parseTime(horarioHoy.hora_cierre);
      
      const currentTotal = horaActual * 60 + minutosActual;
      const openTotal = openHour * 60 + openMin;
      const closeTotal = closeHour * 60 + closeMin;
      
      isOpen = currentTotal >= openTotal && currentTotal < closeTotal;
      
      if (!isOpen) {
        if (currentTotal < openTotal) {
          // Aún no abre hoy
          nextOpeningTime = `Hoy a las ${horarioHoy.hora_apertura}`;
          message = `Abrimos hoy a las ${horarioHoy.hora_apertura}`;
        } else {
          // Ya cerró hoy, buscar siguiente día abierto
          let nextDay = (diaActual + 1) % 7;
          let daysToAdd = 1;
          
          while (nextDay !== diaActual && daysToAdd < 8) {
            const nextHorario = horarios.find((h: HorarioAtencion) => h.dia === nextDay);
            if (nextHorario?.abierto) {
              const diaNombre = nextHorario.nombre;
              nextOpeningTime = `${diaNombre} a las ${nextHorario.hora_apertura}`;
              message = `Abrimos ${diaNombre} a las ${nextHorario.hora_apertura}`;
              break;
            }
            nextDay = (nextDay + 1) % 7;
            daysToAdd++;
          }
        }
      } else {
        message = `Abierto hasta las ${horarioHoy.hora_cierre}`;
      }
    }
    
    // Verificar si es hora feliz
    const isHappyHour = horaFelizHoy 
      ? isTimeInRange(horaActual, minutosActual, horaFelizHoy.hora_inicio, horaFelizHoy.hora_fin)
      : false;
    
    const currentPrice = isHappyHour && horaFelizHoy 
      ? horaFelizHoy.precio_promocional 
      : contacto.precio_normal;
    
    return {
      isOpen,
      isHappyHour,
      currentPrice,
      nextOpeningTime,
      message,
    };
  }, [horarios, horasFelices, contacto.precio_normal]);

  // Agregamos horasFelices como dependencia para evitar que el estado quede obsoleto
  // cuando la configuración se carga desde la base de datos.
  const isHappyHourNow = useCallback((): boolean => {
    const now = new Date();
    const diaActual = now.getDay();
    const horaActual = now.getHours();
    const minutosActual = now.getMinutes();
    
    const horaFelizHoy = horasFelices.find((h: HoraFeliz) => h.dia === diaActual && h.activo);
    
    if (!horaFelizHoy) return false;
    
    return isTimeInRange(horaActual, minutosActual, horaFelizHoy.hora_inicio, horaFelizHoy.hora_fin);
  }, [horasFelices]);

  // El precio lo obtenemos dinámicamente según si es hora feliz o no.
  const getPrecioActual = useCallback((): number => {
    const now = new Date();
    const diaActual = now.getDay();
    const horaActual = now.getHours();
    const minutosActual = now.getMinutes();
    const horaFelizHoy = horasFelices.find((h: HoraFeliz) => h.dia === diaActual && h.activo);
    const enHoraFeliz = horaFelizHoy
      ? isTimeInRange(horaActual, minutosActual, horaFelizHoy.hora_inicio, horaFelizHoy.hora_fin)
      : false;
    return enHoraFeliz && horaFelizHoy ? horaFelizHoy.precio_promocional : contacto.precio_normal;
  }, [horasFelices, contacto.precio_normal]);

  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Actualizar estado cada minuto
  useEffect(() => {
    const updateState = () => {
      setStoreState(getEstadoTienda());
    };

    updateState();
    const interval = setInterval(updateState, 60000); // Actualizar cada minuto

    return () => clearInterval(interval);
  }, [getEstadoTienda]);

  return {
    storeState,
    horarios,
    horasFelices,
    contacto,
    getPrecioActual,
    getEstadoTienda,
    isHappyHourNow,
    formatTime,
  };
}

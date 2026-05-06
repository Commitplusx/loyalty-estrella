// Tipos principales de la aplicación

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  email?: string;
  qr_code: string;
  puntos: number;
  envios_gratis_disponibles: number;
  envios_totales: number;
  es_vip: boolean;
  rango: 'bronce' | 'plata' | 'oro';
  saldo_billetera: number;
  cupon_activo?: string | null;
  costo_envio?: number;
  notas_crm?: string;
  foto_fachada_url?: string | null; // URL de la foto de la fachada para facilitar la entrega.
  created_at: string;
  updated_at: string;
}

export interface RegistroPunto {
  id: string;
  cliente_id: string;
  tipo: 'acumulacion' | 'canje';
  puntos: number;
  monto_saldo?: number;
  descripcion: string;
  created_at: string;
  created_by: string;
}

export interface AdminUser {
  id: string;
  email: string;
  nombre: string;
  role: 'admin' | 'superadmin';
}

export interface HorarioAtencion {
  dia: number; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  nombre: string;
  abierto: boolean;
  hora_apertura: string;
  hora_cierre: string;
}

export interface HoraFeliz {
  dia: number;
  nombre: string;
  hora_inicio: string;
  hora_fin: string;
  precio_promocional: number;
  activo: boolean;
}

export interface AppContacto {
  whatsapp: string;
  telefono: string;
  precio_normal: number;
}

export interface AppConfig {
  horarios: HorarioAtencion[];
  horas_felices: HoraFeliz[];
  contacto: AppContacto;
  puntos_por_envio: number;
  envios_para_gratis: number;
}

// Estado de la tienda
export interface StoreState {
  isOpen: boolean;
  isHappyHour: boolean;
  currentPrice: number;
  nextOpeningTime: string | null;
  message: string;
}

// Movimiento del historial de entregas del cliente
export interface RegistroMovimiento {
  id: string;
  cliente_id: string;
  tipo: 'acumulacion' | 'canje';
  puntos: number;
  monto_saldo?: number;
  descripcion: string;
  created_at: string;
  created_by?: string;
  latitud?: number;
  longitud?: number;
}


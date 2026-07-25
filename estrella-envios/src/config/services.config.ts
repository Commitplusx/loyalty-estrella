import {
  Utensils,
  ShoppingCart,
  Pill,
  Coffee,
  Wine,
  Apple,
  Heart,
  Gift,
  ShoppingBag,
  Wrench,
  BookOpen,
  FileText,
  Key,
  Shirt,
  Smartphone,
  Package,
  type LucideIcon
} from 'lucide-react';

export interface ServiceCategory {
  id: string;
  icon: LucideIcon;
  label: string;
  desc: string;
}

export const COMPRA_CATEGORIES: ServiceCategory[] = [
  { id: 'comida', icon: Utensils, label: 'Comida', desc: 'Restaurantes, antojos, postres' },
  { id: 'super', icon: ShoppingCart, label: 'Supermercado', desc: 'Despensa, abarrotes, limpieza' },
  { id: 'farmacia', icon: Pill, label: 'Farmacia', desc: 'Medicamentos, recetas, cuidado' },
  { id: 'conveniencia', icon: Coffee, label: 'Tienda / Oxxo', desc: 'Refrescos, botanas, cigarros' },
  { id: 'licores', icon: Wine, label: 'Licores y Bebidas', desc: 'Cerveza, vinos, hielos' },
  { id: 'mercado', icon: Apple, label: 'Mercado Local', desc: 'Frutas, verduras, carnicería' },
  { id: 'mascotas', icon: Heart, label: 'Mascotas', desc: 'Croquetas, arena, accesorios' },
  { id: 'regalos', icon: Gift, label: 'Regalos y Flores', desc: 'Sorpresas, arreglos, detalles' },
  { id: 'ferreteria', icon: Wrench, label: 'Ferretería', desc: 'Herramientas, materiales' },
  { id: 'papeleria', icon: BookOpen, label: 'Papelería', desc: 'Material escolar, copias' },
  { id: 'otro', icon: ShoppingBag, label: 'Lo que sea', desc: 'Cualquier otra cosa que necesites' },
];

export const ENVIO_TYPES: ServiceCategory[] = [
  { id: 'documentos', icon: FileText, label: 'Documentos', desc: 'Papeles, oficios, contratos' },
  { id: 'llaves', icon: Key, label: 'Llaves', desc: 'Llaveros, controles de acceso' },
  { id: 'ropa', icon: Shirt, label: 'Ropa / Zapatos', desc: 'Bolsas de ropa, tintorería' },
  { id: 'herramientas', icon: Wrench, label: 'Refacciones', desc: 'Piezas, herramientas' },
  { id: 'regalo', icon: Gift, label: 'Regalo sorpresa', desc: 'Detalles, cajas de regalo' },
  { id: 'medicinas', icon: Pill, label: 'Medicinas', desc: 'Recetas urgentes, insumos' },
  { id: 'electronicos', icon: Smartphone, label: 'Electrónicos', desc: 'Celulares, cargadores, laptops' },
  { id: 'otro', icon: Package, label: 'Otro paquete', desc: 'Cualquier otro artículo' },
];

export const ENVIO_SIZES: ServiceCategory[] = [
  { id: 'small', icon: Package, label: 'Pequeño', desc: 'Cabe en una mochila (Sobres, llaves)' },
  { id: 'medium', icon: Package, label: 'Mediano', desc: 'Cajas chicas, bolsas de súper' },
  { id: 'large', icon: Package, label: 'Grande', desc: 'Electrodomésticos pequeños, cajas' }
];

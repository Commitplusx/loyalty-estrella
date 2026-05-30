import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function extract10Digits(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

export function generateCloudinaryVIPCard(
  telefono: string,
): string {
  const tel10 = extract10Digits(telefono);
  const loyaltyUrl = `https://app-estrella.shop/loyalty/${tel10}`;
  const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(loyaltyUrl)}`;
  let qrB64 = btoa(qrUrl).replace(/\+/g, '-').replace(/\//g, '_');
  const baseCloudinary = `https://res.cloudinary.com/dlgcf3cht/image/upload`;
  const transforms = [
    `c_scale,w_1000`,
    `l_fetch:${qrB64}/c_scale,w_220/fl_layer_apply,g_north_west,x_695,y_305`
  ].join('/');
  return `${baseCloudinary}/${transforms}/vip-nuevo`;
}

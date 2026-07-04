import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function extract10Digits(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

export function generateCloudinaryVIPCard(
  telefono: string
): string {
  const tel10 = extract10Digits(telefono);
  const loyaltyUrl = `https://app-estrella.shop/loyalty/${tel10}`;
  return `https://quickchart.io/qr?text=${encodeURIComponent(loyaltyUrl)}&size=300&dark=0a0a0a&margin=1`;
}

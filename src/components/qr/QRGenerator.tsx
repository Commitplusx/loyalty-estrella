import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Share2, User, Phone, Star } from 'lucide-react';
import type { Cliente } from '@/types';

interface QRGeneratorProps {
  cliente: Cliente;
  size?: number;
}

// Bug #11: derive the correct goal based on the client's league rank
function getMetaEnvios(cliente: Cliente): number {
  if (cliente.rango === 'oro') return 3;
  if (cliente.rango === 'plata' || cliente.es_vip) return 4;
  return 5;
}

export function QRGenerator({ cliente, size = 280 }: QRGeneratorProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);


  useEffect(() => {
    generateQR();
  }, [cliente.qr_code]);

  const generateQR = async () => {
    setIsGenerating(true);
    try {
      // Generar QR con el código único del cliente
      const dataUrl = await QRCode.toDataURL(cliente.qr_code, {
        width: size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H',
      });
      setQrDataUrl(dataUrl);
    } catch (error) {
      console.error('Error generando QR:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    
    const link = document.createElement('a');
    link.href = qrDataUrl;
    // Bug #17 fix: guard against null/undefined nombre before calling replace
    const safeName = (cliente.nombre || 'cliente').replace(/\s+/g, '-').toLowerCase();
    link.download = `qr-${safeName}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async () => {
    if (!qrDataUrl) return;
    
    try {
      const response = await fetch(qrDataUrl);
      const blob = await response.blob();
      const file = new File([blob], `qr-${cliente.nombre}.png`, { type: 'image/png' });
      
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `QR de ${cliente.nombre} - Estrella Delivery`,
          text: `Escanea este código para sumar puntos a ${cliente.nombre}`,
          files: [file],
        });
      } else {
        // Fallback: copiar al portapapeles o mostrar mensaje
        alert('Compartir no disponible en este dispositivo');
      }
    } catch (error) {
      console.error('Error compartiendo:', error);
    }
  };

  return (
    <Card className="overflow-hidden border-0 shadow-xl">
      <CardContent className="p-6">
        {/* Header con info del cliente */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-1">{cliente.nombre}</h3>
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <Phone className="w-4 h-4" />
            <span>{cliente.telefono}</span>
          </div>
        </div>

        {/* QR Code */}
        <div className="relative bg-white rounded-2xl p-6 mb-6 border-2 border-dashed border-gray-200">
          {isGenerating ? (
            <div className="flex items-center justify-center" style={{ width: size, height: size }}>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
            </div>
          ) : qrDataUrl ? (
            <div className="flex flex-col items-center">
              <img 
                src={qrDataUrl} 
                alt={`QR de ${cliente.nombre}`}
                className="max-w-full h-auto"
                style={{ width: size, height: size }}
              />
              {/* Logo overlay */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                <div className="w-12 h-12 bg-white rounded-xl shadow-lg flex items-center justify-center">
                  <Star className="w-8 h-8 text-orange-500 fill-orange-500" />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center text-gray-400" style={{ width: size, height: size }}>
              Error al generar QR
            </div>
          )}
        </div>

        {/* Progreso — Bug #11 fix: use dynamic meta based on rango */}
        <div className="bg-orange-50 rounded-xl p-4 mb-6">
          {(() => {
            const meta = getMetaEnvios(cliente);
            const puntosActuales = cliente.puntos % meta;
            const restantes = meta - puntosActuales;
            return (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Progreso hacia envío gratis</span>
                  <span className="text-sm font-bold text-orange-600">{puntosActuales}/{meta}</span>
                </div>
                <div className="bg-white rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-primary h-full rounded-full transition-all duration-500"
                    style={{ width: `${(puntosActuales / meta) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  {restantes === 0
                    ? '¡Envío gratis disponible!'
                    : `Te faltan ${restantes} envío${restantes > 1 ? 's' : ''} para tu delivery gratis`
                  }
                </p>
              </>
            );
          })()}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={handleDownload}
            variant="outline"
            className="flex-1 h-12 border-2"
            disabled={!qrDataUrl}
          >
            <Download className="w-5 h-5 mr-2" />
            Descargar
          </Button>
          <Button
            onClick={handleShare}
            className="flex-1 h-12 bg-gradient-primary hover:opacity-90 text-white"
            disabled={!qrDataUrl}
          >
            <Share2 className="w-5 h-5 mr-2" />
            Compartir
          </Button>
        </div>

        {/* Instrucciones */}
        <div className="mt-6 p-4 bg-blue-50 rounded-xl">
          <p className="text-sm text-blue-700 text-center">
            <strong>Instrucciones:</strong> Muestra este código QR al repartidor 
            para que escanee y sume puntos a tu cuenta.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

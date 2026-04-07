import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, CameraOff, Flashlight, RefreshCw } from 'lucide-react';

interface QRScannerProps {
  onScan: (qrCode: string) => void;
  onError?: (error: string) => void;
  isScanning?: boolean;
}

export function QRScanner({ onScan, onError, isScanning = true }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasCamera, setHasCamera] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [hasFlashlight, setHasFlashlight] = useState(false);
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [currentCamera, setCurrentCamera] = useState<string>('');

  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  // Bug #19 fix: stable ref for onError so it doesn't re-trigger camera enumeration
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // Bug #19 fix: no longer depends on `onError` — uses stable ref instead
  useEffect(() => {
    const checkCameras = async () => {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setCameras(devices.map((d: any) => ({ id: d.id, label: d.label })));
          setCurrentCamera(devices[0].id);
          setHasCamera(true);
        } else {
          setHasCamera(false);
          onErrorRef.current?.('No se encontraron cámaras');
        }
      } catch {
        setHasCamera(false);
        onErrorRef.current?.('Error al acceder a la cámara');
      }
    };

    checkCameras();
  }, []); // ← empty deps, stable

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch {
        // Ignorar errores al detener
      }
      // Bug #12 fix: always clean up the flashlight videoTrack when stopping
      if (videoTrackRef.current) {
        videoTrackRef.current.stop();
        videoTrackRef.current = null;
      }
      scannerRef.current = null;
      setIsActive(false);
      setHasFlashlight(false);
      setFlashlightOn(false);
    }
  }, []);

  const startScanner = useCallback(async (cameraId: string) => {
    if (!containerRef.current) return;
    // Bug #13 fix: stop any existing scanner before starting again
    await stopScanner();

    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      await scanner.start(
        cameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText: string) => {
          onScan(decodedText);
        },
        () => {
          // Error de escaneo continuo — ignorar
        }
      );

      // Bug #12 fix: track the dedicated flashlight stream separately so it
      // can always be closed when the scanner stops.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: cameraId ? { exact: cameraId } : undefined },
        });
        const track = stream.getVideoTracks()[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const capabilities = track.getCapabilities?.() as any;

        if (capabilities?.torch) {
          setHasFlashlight(true);
          videoTrackRef.current = track;
        } else {
          // Close immediately — we don't need this stream
          track.stop();
          stream.getTracks().forEach((t) => t.stop());
          setHasFlashlight(false);
        }
      } catch {
        setHasFlashlight(false);
      }

      setIsActive(true);
    } catch (err) {
      console.error('Error iniciando escáner:', err);
      onErrorRef.current?.('Error al iniciar la cámara');
      scannerRef.current = null;
    }
  }, [onScan, stopScanner]);

  // Bug #13 fix: explicit stop-then-start cycle when isScanning or currentCamera changes
  useEffect(() => {
    if (isScanning && hasCamera && currentCamera) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      startScanner(currentCamera);
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
  }, [isScanning, hasCamera, currentCamera, startScanner, stopScanner]);

  const toggleScanner = () => {
    if (isActive) {
      stopScanner();
    } else if (currentCamera) {
      startScanner(currentCamera);
    }
  };

  const switchCamera = () => {
    if (cameras.length < 2) return;
    const currentIndex = cameras.findIndex((c) => c.id === currentCamera);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setCurrentCamera(cameras[nextIndex].id);
  };

  const toggleFlashlight = async () => {
    if (!videoTrackRef.current || !hasFlashlight) return;

    try {
      const newState = !flashlightOn;
      await videoTrackRef.current.applyConstraints({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        advanced: [{ torch: newState }] as any,
      });
      setFlashlightOn(newState);
    } catch (err) {
      console.error('Error toggling flashlight:', err);
    }
  };

  if (!hasCamera) {
    return (
      <Card className="border-0 shadow-xl">
        <CardContent className="p-8 text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CameraOff className="w-10 h-10 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Cámara no disponible
          </h3>
          <p className="text-gray-500">
            No se pudo acceder a la cámara. Asegúrate de dar permisos de cámara.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-xl overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="bg-gradient-primary p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-white" />
            <span className="text-white font-semibold">Escanear QR</span>
          </div>
          <div className="flex items-center gap-2">
            {cameras.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={switchCamera}
                className="text-white hover:bg-white/20"
              >
                <RefreshCw className="w-5 h-5" />
              </Button>
            )}
            {hasFlashlight && (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFlashlight}
                className="text-white hover:bg-white/20"
              >
                <Flashlight className={`w-5 h-5 ${flashlightOn ? 'fill-white' : ''}`} />
              </Button>
            )}
          </div>
        </div>

        {/* Scanner Container */}
        <div className="relative bg-black">
          <div
            id="qr-reader"
            ref={containerRef}
            className="w-full aspect-square max-w-md mx-auto"
          />

          {/* Overlay con marco de escaneo */}
          {isActive && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64">
                <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-orange-500" />
                <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-orange-500" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-orange-500" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-orange-500" />
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-orange-500 to-transparent animate-scan" />
              </div>
              <div className="absolute bottom-8 left-0 right-0 text-center">
                <p className="text-white text-sm bg-black/50 inline-block px-4 py-2 rounded-full">
                  Centra el código QR en el marco
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-4 bg-white">
          <Button
            onClick={toggleScanner}
            variant={isActive ? 'destructive' : 'default'}
            className="w-full h-12"
          >
            {isActive ? (
              <>
                <CameraOff className="w-5 h-5 mr-2" />
                Detener Escáner
              </>
            ) : (
              <>
                <Camera className="w-5 h-5 mr-2" />
                Iniciar Escáner
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

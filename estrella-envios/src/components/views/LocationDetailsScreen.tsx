import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, Autocomplete } from '@react-google-maps/api';
import { ChevronLeft, MapPin, Navigation, ArrowRight, Search, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter     = { lat: 16.2516, lng: -92.1341 };

interface LocationDetailsScreenProps {
  title: string;
  isLoaded: boolean;
  type: 'pickup' | 'dropoff';
  address: string;
  lat: number;
  lng: number;
  reference: string;
  contactName: string;
  contactPhone: string;
  onChange: (field: string, value: any) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export function LocationDetailsScreen({
  title, isLoaded, type, address, lat, lng,
  reference, contactName, contactPhone,
  onChange, onConfirm, onBack,
}: LocationDetailsScreenProps) {
  const mapRef                 = useRef<google.maps.Map | null>(null);
  const desktopAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const mobileAutocompleteRef  = useRef<google.maps.places.Autocomplete | null>(null);
  const desktopInputRef        = useRef<HTMLInputElement | null>(null);
  const mobileInputRef         = useRef<HTMLInputElement | null>(null);

  const defaultPrompt          = type === 'pickup' ? 'Selecciona dónde recogemos' : 'Selecciona dónde entregamos';

  const [center, setCenter]                 = useState({ lat: lat || defaultCenter.lat, lng: lng || defaultCenter.lng });
  const [currentAddress, setCurrentAddress] = useState(address || defaultPrompt);
  const [isDragging, setIsDragging]         = useState(false);
  const [isLocating, setIsLocating]         = useState(false);

  // Mobile: is the sheet expanded (map visible) or collapsed (form visible)?
  const [mapExpanded, setMapExpanded]       = useState(true);

  // Sync displayed address & input texts when props change (e.g. switching pickup→dropoff)
  useEffect(() => {
    const nextAddr = address || '';
    if (desktopInputRef.current && desktopInputRef.current.value !== nextAddr) {
      desktopInputRef.current.value = nextAddr;
    }
    if (mobileInputRef.current && mobileInputRef.current.value !== nextAddr) {
      mobileInputRef.current.value = nextAddr;
    }
    setCurrentAddress(address || defaultPrompt);
  }, [address, type, defaultPrompt]);

  useEffect(() => {
    if (!isLoaded || !window.google) return;

    if (lat && lng) {
      const pos = { lat, lng };
      setCenter(pos);
      if (mapRef.current) {
        mapRef.current.panTo(pos);
      }
      if (!address) {
        reverseGeocode(lat, lng);
      }
    } else if (!lat && type === 'pickup') {
      // For pickup: auto-center map on GPS if available
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setCenter(newPos);
            if (mapRef.current) {
              mapRef.current.panTo(newPos);
            }
          },
          () => {},
          { enableHighAccuracy: false, timeout: 4000, maximumAge: 60000 }
        );
      }
    } else if (!lat && type === 'dropoff') {
      // For dropoff without saved coords: center map on Comitán default without auto-geocoding
      setCenter(defaultCenter);
      if (mapRef.current) {
        mapRef.current.panTo(defaultCenter);
      }
    }
  }, [lat, lng, isLoaded, type]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const applyNewLocation = (latitude: number, longitude: number, addr: string) => {
    setCenter({ lat: latitude, lng: longitude });
    setCurrentAddress(addr);
    if (desktopInputRef.current) desktopInputRef.current.value = addr;
    if (mobileInputRef.current) mobileInputRef.current.value = addr;
    onChange(type === 'pickup' ? 'origin'    : 'destination',    addr);
    onChange(type === 'pickup' ? 'originLat' : 'destinationLat', latitude);
    onChange(type === 'pickup' ? 'originLng' : 'destinationLng', longitude);
    if (mapRef.current) {
      mapRef.current.panTo({ lat: latitude, lng: longitude });
      mapRef.current.setZoom(17);
    }
    setMapExpanded(false);
  };

  const reverseGeocode = async (latitude: number, longitude: number) => {
    if (!window.google) return;
    try {
      const res = await new window.google.maps.Geocoder().geocode({ location: { lat: latitude, lng: longitude } });
      if (res.results && res.results[0]) {
        const addr = res.results[0].formatted_address;
        applyNewLocation(latitude, longitude, addr);
      } else {
        const fallback = `Ubicación (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
        applyNewLocation(latitude, longitude, fallback);
      }
    } catch (e) {
      console.error('Error reverse geocoding:', e);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    if (!mapRef.current) return;
    const c = mapRef.current.getCenter();
    if (c) {
      const newLat = c.lat();
      const newLng = c.lng();
      setCenter({ lat: newLat, lng: newLng });
      reverseGeocode(newLat, newLng);
    }
  };

  const handlePlaceSelect = async (
    autoRef: React.MutableRefObject<google.maps.places.Autocomplete | null>,
    inputRef: React.MutableRefObject<HTMLInputElement | null>
  ) => {
    const place = autoRef.current?.getPlace();

    if (place?.geometry?.location) {
      const latitude  = place.geometry.location.lat();
      const longitude = place.geometry.location.lng();
      const addr      = place.formatted_address || place.name || '';
      applyNewLocation(latitude, longitude, addr);
      return;
    }

    // If user hit Enter or place has no geometry: geocode the query string
    const query = inputRef.current?.value || place?.name || '';
    if (query.trim() && window.google) {
      try {
        const geocoder = new window.google.maps.Geocoder();
        const searchQuery = query.toLowerCase().includes('comit') ? query : `${query}, Comitán, Chiapas, Mexico`;
        const res = await geocoder.geocode({ address: searchQuery });
        if (res.results && res.results[0]?.geometry?.location) {
          const loc = res.results[0].geometry.location;
          const addr = res.results[0].formatted_address || query;
          applyNewLocation(loc.lat(), loc.lng(), addr);
        }
      } catch (err) {
        console.warn('Geocoding search query failed:', err);
      }
    }
  };

  const handleGPS = async () => {
    if (!navigator.geolocation) {
      toast.error('Tu navegador no soporta geolocalización', { id: 'gps' });
      return;
    }
    setIsLocating(true);
    toast.loading('Buscando tu ubicación…', { id: 'gps' });

    const tryGetPosition = (enableHighAccuracy: boolean, timeout: number): Promise<GeolocationPosition> => {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy,
          timeout,
          maximumAge: 120000,
        });
      });
    };

    try {
      let pos: GeolocationPosition;
      try {
        // Intento 1: Rápido por WiFi / Red / Caché (funciona al instante en laptops y PCs)
        pos = await tryGetPosition(false, 4000);
      } catch {
        // Intento 2: Alta precisión por hardware GPS (móviles)
        pos = await tryGetPosition(true, 6000);
      }

      const { latitude, longitude } = pos.coords;
      setCenter({ lat: latitude, lng: longitude });
      if (mapRef.current) {
        mapRef.current.panTo({ lat: latitude, lng: longitude });
        mapRef.current.setZoom(17);
      }
      await reverseGeocode(latitude, longitude);
      toast.success('Ubicación encontrada', { id: 'gps' });
    } catch (error: any) {
      console.warn('Geolocation error:', error);
      if (error?.code === 1) {
        toast.error('Permiso de ubicación bloqueado. Actívalo en la barra del navegador.', { id: 'gps', duration: 4000 });
      } else {
        // Fallback: centrar en Comitán Centro para no dejar al usuario varado
        const fallbackPos = defaultCenter;
        setCenter(fallbackPos);
        if (mapRef.current) {
          mapRef.current.panTo(fallbackPos);
          mapRef.current.setZoom(16);
        }
        await reverseGeocode(fallbackPos.lat, fallbackPos.lng);
        toast('Te ubicamos en Comitán Centro. Mueve el mapa a tu ubicación exacta.', {
          id: 'gps',
          icon: '📍',
          duration: 5000,
        });
      }
    } finally {
      setIsLocating(false);
    }
  };

  const handleNext = () => {
    if (!currentAddress || currentAddress === defaultPrompt) {
      toast.error('Primero selecciona una ubicación en el mapa', { icon: '📍' });
      return;
    }
    if (!contactName.trim()) {
      toast.error(`Falta el nombre de quien ${type === 'pickup' ? 'envía' : 'recibe'}`, { icon: '👤' });
      return;
    }
    if (!contactPhone.trim() || contactPhone.length < 10) {
      toast.error('Ingresa un teléfono válido de 10 dígitos', { icon: '📱' });
      return;
    }
    onConfirm();
  };

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasAddress = currentAddress && currentAddress !== defaultPrompt;
  const pinColor   = type === 'pickup' ? 'text-emerald-500 fill-emerald-500' : 'text-yellow-500 fill-yellow-500';

  return (
    <div className="flex h-full bg-white overflow-hidden relative">

      {/* ── DESKTOP LEFT PANEL (form) ─────────────────────────────────── */}
      <div className="
        hidden md:flex
        w-[380px] lg:w-[420px] xl:w-[460px]
        shrink-0 flex-col border-r border-gray-100 bg-white z-10
      ">
        {/* Header */}
        <div className="h-14 flex items-center gap-3 px-6 border-b border-gray-100 shrink-0">
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </button>
          <h1 className="text-sm font-bold text-gray-900">{title}</h1>
        </div>

        {/* Search */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus-within:border-gray-900 focus-within:ring-1 focus-within:ring-gray-900 transition-all">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <Autocomplete
              onLoad={(a) => {
                desktopAutocompleteRef.current = a;
                a.setFields(['geometry', 'formatted_address', 'name']);
              }}
              onPlaceChanged={() => handlePlaceSelect(desktopAutocompleteRef, desktopInputRef)}
              className="flex-1 min-w-0"
              options={{
                componentRestrictions: { country: 'mx' },
                bounds: { north: 16.35, south: 16.15, east: -92.03, west: -92.23 },
                strictBounds: false,
              }}
            >
              <input
                ref={desktopInputRef}
                type="text"
                placeholder="Buscar dirección, tienda o calle..."
                defaultValue={address || ''}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handlePlaceSelect(desktopAutocompleteRef, desktopInputRef);
                  }
                }}
                className="w-full bg-transparent outline-none text-sm font-medium text-gray-900 placeholder:text-gray-400"
              />
            </Autocomplete>
          </div>
          <button
            onClick={handleGPS}
            disabled={isLocating}
            type="button"
            className="mt-3 w-full flex items-center justify-center gap-2.5 py-2.5 px-4 bg-amber-50/90 hover:bg-amber-100 disabled:opacity-60 border border-amber-200/90 text-amber-900 text-xs font-bold rounded-xl transition-all active:scale-[0.98] shadow-sm group"
          >
            <div className="w-5 h-5 rounded-full bg-amber-200/70 flex items-center justify-center group-hover:scale-110 transition-transform">
              {isLocating ? (
                <Loader2 className="w-3 h-3 text-amber-800 animate-spin" />
              ) : (
                <Navigation className="w-3 h-3 text-amber-800 fill-amber-700" />
              )}
            </div>
            <span>{isLocating ? 'Buscando tu ubicación...' : 'Usar mi ubicación actual'}</span>
          </button>
        </div>

        {/* Selected address */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
            {type === 'pickup' ? 'Recolección en' : 'Entrega en'}
          </p>
          <div className="flex items-start gap-3">
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${type === 'pickup' ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
            <p className={`text-sm leading-snug ${hasAddress ? 'font-semibold text-gray-900' : 'text-gray-400 italic'}`}>
              {hasAddress ? currentAddress : 'Mueve el mapa o busca para seleccionar'}
            </p>
          </div>
        </div>

        {/* Form fields */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              Referencia (opcional)
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => onChange(type === 'pickup' ? 'originReference' : 'destinationReference', e.target.value)}
              placeholder="Ej. Casa blanca con portón negro..."
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              {type === 'pickup' ? 'Nombre de quien envía' : 'Nombre de quien recibe'}
            </label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => onChange(type === 'pickup' ? 'originName' : 'recipientName', e.target.value)}
              placeholder="Nombre completo"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              Teléfono
            </label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => onChange(type === 'pickup' ? 'originPhone' : 'recipientPhone', e.target.value.replace(/\D/g, ''))}
              placeholder="10 dígitos"
              maxLength={10}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-all"
            />
          </div>
        </div>

        {/* CTA */}
        <div className="px-6 py-5 border-t border-gray-100 shrink-0">
          <button
            onClick={handleNext}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            Continuar <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── MOBILE FLOATING HEADER ─────────────────────────────────────── */}
      <div className="md:hidden absolute top-0 left-0 right-0 z-20 bg-white/95 backdrop-blur-md shadow-sm">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center bg-gray-50 hover:bg-gray-100 rounded-full">
            <ChevronLeft className="w-5 h-5 text-gray-900" />
          </button>
          <h1 className="text-base font-bold text-gray-900">{title}</h1>
        </div>
        <div className="px-4 pb-4">
          <div className="bg-white rounded-xl shadow-md border border-gray-100 flex items-center px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center mr-3 shrink-0">
              <MapPin className="w-4 h-4 text-emerald-600" />
            </div>
            <Autocomplete
              onLoad={(a) => {
                mobileAutocompleteRef.current = a;
                a.setFields(['geometry', 'formatted_address', 'name']);
              }}
              onPlaceChanged={() => handlePlaceSelect(mobileAutocompleteRef, mobileInputRef)}
              className="flex-1 min-w-0"
              options={{
                componentRestrictions: { country: 'mx' },
                bounds: { north: 16.35, south: 16.15, east: -92.03, west: -92.23 },
                strictBounds: false,
              }}
            >
              <input
                ref={mobileInputRef}
                type="text"
                placeholder="Buscar ubicación..."
                defaultValue={address || ''}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handlePlaceSelect(mobileAutocompleteRef, mobileInputRef);
                  }
                }}
                className="w-full bg-transparent outline-none text-gray-900 font-medium placeholder:text-gray-400 text-[15px]"
              />
            </Autocomplete>
          </div>
        </div>
      </div>

      {/* ── SINGLE UNIFIED MAP (Desktop & Mobile share this exact instance) ── */}
      <div className="flex-1 relative bg-gray-100 h-full w-full">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          zoom={16}
          center={center}
          onLoad={onMapLoad}
          onDragStart={() => {
            setIsDragging(true);
            setMapExpanded(true);
          }}
          onDragEnd={handleDragEnd}
          options={{ disableDefaultUI: true, clickableIcons: false }}
        />

        {/* Center pin */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className={`transition-transform duration-200 ${isDragging ? '-translate-y-4 scale-110' : 'translate-y-0 scale-100'}`} style={{ marginTop: '-24px' }}>
            <MapPin className={`w-10 h-10 md:w-10 md:h-10 drop-shadow-lg ${pinColor}`} />
          </div>
        </div>

        {/* Desktop GPS button */}
        <button
          onClick={handleGPS}
          disabled={isLocating}
          className="hidden md:flex absolute right-4 bottom-4 w-11 h-11 bg-white border border-gray-200 rounded-xl shadow-md items-center justify-center hover:bg-gray-50 active:scale-95 transition-all z-10 disabled:opacity-60"
        >
          {isLocating ? (
            <Loader2 className="w-4 h-4 text-gray-700 animate-spin" />
          ) : (
            <Navigation className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {/* Mobile GPS button */}
        <button
          onClick={handleGPS}
          disabled={isLocating}
          className={`md:hidden absolute right-4 w-12 h-12 flex items-center justify-center rounded-full shadow-lg bg-white border border-gray-100 z-10 active:scale-95 transition-all disabled:opacity-60 ${mapExpanded ? 'bottom-[calc(20vh+64px)]' : 'bottom-[calc(max(55vh,350px))]'}`}
        >
          {isLocating ? (
            <Loader2 className="w-5 h-5 text-gray-700 animate-spin" />
          ) : (
            <Navigation className="w-5 h-5 text-gray-700" />
          )}
        </button>
      </div>

      {/* ── MOBILE BOTTOM SHEET FORM ─────────────────────────────────── */}
      <motion.div
        animate={{ y: mapExpanded ? '75%' : '0%' }}
        transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
        className="md:hidden absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-15px_40px_rgba(0,0,0,0.12)] z-20 flex flex-col max-h-[60vh]"
      >
        <div
          onClick={() => setMapExpanded(!mapExpanded)}
          className="w-full py-2 cursor-pointer flex justify-center shrink-0"
        >
          <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
        </div>
        <div className="p-5 overflow-y-auto h-full space-y-4">
          <div className="flex gap-4 items-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${hasAddress ? 'bg-emerald-500' : 'bg-gray-900'}`}>
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              {!hasAddress
                ? <div className="inline-block bg-gray-900 text-white px-3.5 py-1.5 rounded-lg text-sm font-bold">{defaultPrompt}</div>
                : <h2 className="text-base font-bold text-gray-900 leading-tight pr-2">{currentAddress}</h2>
              }
            </div>
          </div>
          <input type="text" value={reference}
            onChange={(e) => onChange(type === 'pickup' ? 'originReference' : 'destinationReference', e.target.value)}
            placeholder="Referencia (opcional)"
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-[15px] font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-gray-900 outline-none transition-all"
          />
          <input type="text" value={contactName}
            onChange={(e) => onChange(type === 'pickup' ? 'originName' : 'recipientName', e.target.value)}
            placeholder={`Nombre de quien ${type === 'pickup' ? 'envía' : 'recibe'}`}
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-[15px] font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-gray-900 outline-none transition-all"
          />
          <input type="tel" value={contactPhone}
            onChange={(e) => onChange(type === 'pickup' ? 'originPhone' : 'recipientPhone', e.target.value.replace(/\D/g, ''))}
            placeholder={`Teléfono de quien ${type === 'pickup' ? 'envía' : 'recibe'}`}
            maxLength={10}
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-[15px] font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-gray-900 outline-none transition-all"
          />
          <button onClick={handleNext}
            className="w-full mt-2 bg-gray-900 text-white font-bold py-4 rounded-xl hover:bg-gray-800 active:scale-[0.98] transition-all mb-4 flex items-center justify-center gap-2"
          >
            Continuar <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

    </div>
  );
}

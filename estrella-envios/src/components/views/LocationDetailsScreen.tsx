import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, Autocomplete } from '@react-google-maps/api';
import { ChevronLeft, MapPin, Navigation, ArrowRight, Search, Loader2, Check, Edit3 } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

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

  // collapseSheet=true only when user picks from search or GPS (not map drag)
  const applyNewLocation = (latitude: number, longitude: number, addr: string, collapseSheet = false) => {
    setCenter({ lat: latitude, lng: longitude });
    setCurrentAddress(addr);
    if (desktopInputRef.current) desktopInputRef.current.value = addr;
    if (mobileInputRef.current) mobileInputRef.current.value = addr;
    onChange(type === 'pickup' ? 'origin'    : 'destination',    addr);
    onChange(type === 'pickup' ? 'originLat' : 'destinationLat', latitude);
    onChange(type === 'pickup' ? 'originLng' : 'destinationLng', longitude);
    if (collapseSheet && mapRef.current) {
      mapRef.current.panTo({ lat: latitude, lng: longitude });
      mapRef.current.setZoom(17);
    }
    if (collapseSheet) setMapExpanded(false);
  };

  // Called on drag-end → does NOT collapse the sheet
  const reverseGeocode = async (latitude: number, longitude: number) => {
    if (!window.google) return;
    try {
      const res = await new window.google.maps.Geocoder().geocode({ location: { lat: latitude, lng: longitude } });
      if (res.results && res.results[0]) {
        applyNewLocation(latitude, longitude, res.results[0].formatted_address, false);
      } else {
        applyNewLocation(latitude, longitude, `Ubicación (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`, false);
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
      applyNewLocation(latitude, longitude, addr, true); // collapse sheet on search select
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
          applyNewLocation(loc.lat(), loc.lng(), addr, true);
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

    const geocodeAndApply = async (lat: number, lng: number) => {
      if (!window.google) return;
      try {
        const res = await new window.google.maps.Geocoder().geocode({ location: { lat, lng } });
        const addr = res.results?.[0]?.formatted_address || `Ubicación (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        applyNewLocation(lat, lng, addr, true); // GPS always collapses sheet
      } catch {
        applyNewLocation(lat, lng, `Ubicación (${lat.toFixed(4)}, ${lng.toFixed(4)})`, true);
      }
    };

    try {
      let pos: GeolocationPosition;
      try {
        pos = await tryGetPosition(false, 4000);
      } catch {
        pos = await tryGetPosition(true, 6000);
      }
      const { latitude, longitude } = pos.coords;
      await geocodeAndApply(latitude, longitude);
      toast.success('Ubicación encontrada', { id: 'gps' });
    } catch (error: any) {
      console.warn('Geolocation error:', error);
      if (error?.code === 1) {
        toast.error('Permiso de ubicación bloqueado. Actívalo en la barra del navegador.', { id: 'gps', duration: 4000 });
      } else {
        await geocodeAndApply(defaultCenter.lat, defaultCenter.lng);
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

        {/* Mobile GPS button (Visible only when sheet is collapsed / picking on map) */}
        {mapExpanded && (
          <button
            onClick={handleGPS}
            disabled={isLocating}
            className="md:hidden absolute right-4 bottom-[200px] w-12 h-12 flex items-center justify-center rounded-full shadow-xl bg-white border border-gray-200 z-10 active:scale-95 transition-all disabled:opacity-60"
          >
            {isLocating ? (
              <Loader2 className="w-5 h-5 text-gray-700 animate-spin" />
            ) : (
              <Navigation className="w-5 h-5 text-amber-600 fill-amber-500" />
            )}
          </button>
        )}
      </div>

      {/* ── MOBILE BOTTOM SHEET (25% collapsed on map, full when confirmed) ── */}
      <motion.div
        animate={{ y: mapExpanded ? 'calc(100% - 170px)' : '0%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="md:hidden absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-12px_35px_rgba(0,0,0,0.15)] z-20 flex flex-col max-h-[82vh] border-t border-gray-100"
      >
        {/* Drag handle */}
        <div
          onClick={() => setMapExpanded(!mapExpanded)}
          className="w-full pt-3 pb-2 cursor-pointer flex justify-center shrink-0"
        >
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Top Header / Address Bar */}
        <div className="px-5 pb-3 pt-1 shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm ${hasAddress ? (type === 'pickup' ? 'bg-emerald-500 text-white' : 'bg-yellow-400 text-gray-900') : 'bg-gray-900 text-white'}`}>
                <MapPin className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  {type === 'pickup' ? 'Punto de recolección' : 'Punto de entrega'}
                </p>
                <p className={`text-sm truncate leading-tight ${hasAddress ? 'font-bold text-gray-900' : 'text-gray-400 italic'}`}>
                  {hasAddress ? currentAddress : defaultPrompt}
                </p>
              </div>
            </div>

            {/* When sheet is fully open, show a button to adjust back on the map */}
            {!mapExpanded && (
              <button
                onClick={() => setMapExpanded(true)}
                className="shrink-0 px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <Edit3 className="w-3.5 h-3.5 text-gray-500" />
                <span>Mover</span>
              </button>
            )}
          </div>

          {/* When collapsed at 25%: Show prominent 'Listo / Confirmar ubicación' button */}
          {mapExpanded && (
            <div className="mt-3">
              <button
                onClick={() => {
                  if (!hasAddress) {
                    toast.error('Mueve el mapa o busca una dirección para continuar', { icon: '📍' });
                    return;
                  }
                  setMapExpanded(false);
                }}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2.5 shadow-lg active:scale-[0.98] transition-all"
              >
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <span className="text-sm">Listo, confirmar ubicación</span>
              </button>
            </div>
          )}
        </div>

        {/* Expanded Form Fields (Visible when sheet is opened) */}
        <div className={`p-5 overflow-y-auto space-y-4 flex-1 ${mapExpanded ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              Referencia (opcional)
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => onChange(type === 'pickup' ? 'originReference' : 'destinationReference', e.target.value)}
              placeholder="Ej. Casa blanca con portón negro..."
              className="w-full px-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-[15px] font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-gray-900 outline-none transition-all"
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
              className="w-full px-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-[15px] font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-gray-900 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              Teléfono de contacto
            </label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => onChange(type === 'pickup' ? 'originPhone' : 'recipientPhone', e.target.value.replace(/\D/g, ''))}
              placeholder="10 dígitos"
              maxLength={10}
              className="w-full px-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl text-[15px] font-medium text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-gray-900 outline-none transition-all"
            />
          </div>

          <button
            onClick={handleNext}
            className="w-full mt-3 bg-gray-900 text-white font-bold py-4 rounded-xl hover:bg-gray-800 active:scale-[0.98] transition-all mb-4 flex items-center justify-center gap-2 shadow-sm"
          >
            <span>Continuar</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

    </div>
  );
}

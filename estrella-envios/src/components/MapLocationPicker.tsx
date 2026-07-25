import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, useLoadScript, Autocomplete, Marker } from '@react-google-maps/api';
import { MapPin, Navigation, Search, Check } from 'lucide-react';
import toast from 'react-hot-toast';

const libraries: ("places")[] = ['places'];
const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

const defaultCenter = {
  lat: 16.2516, // Comitán, Chiapas
  lng: -92.1341,
};

const comitanBounds = {
  north: 16.32,
  south: 16.15,
  east: -92.05,
  west: -92.20,
};

interface LocationPickerProps {
  onSelect: (address: string, lat: number, lng: number) => void;
  onCancel: () => void;
  initialLat?: number;
  initialLng?: number;
  isLoaded: boolean;
}

export function MapLocationPicker({ onSelect, onCancel, initialLat, initialLng, isLoaded }: LocationPickerProps) {

  const mapRef = useRef<google.maps.Map | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const [center, setCenter] = useState({ 
    lat: initialLat || defaultCenter.lat, 
    lng: initialLng || defaultCenter.lng 
  });
  
  const [currentAddress, setCurrentAddress] = useState('Ubicación seleccionada');
  const [isDragging, setIsDragging] = useState(false);

  // Intentar obtener la ubicación del usuario si no hay inicial
  useEffect(() => {
    if (!isLoaded || !window.google) return;
    
    if (!initialLat && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCenter({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          reverseGeocode(position.coords.latitude, position.coords.longitude);
        },
        () => {
          console.warn("Geolocation denied or unavailable");
        }
      );
    } else if (initialLat && initialLng) {
      reverseGeocode(initialLat, initialLng);
    }
  }, [initialLat, initialLng, isLoaded]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const reverseGeocode = async (lat: number, lng: number) => {
    if (!window.google) return;
    const geocoder = new window.google.maps.Geocoder();
    try {
      const response = await geocoder.geocode({ location: { lat, lng } });
      if (response.results[0]) {
        setCurrentAddress(response.results[0].formatted_address);
      } else {
        setCurrentAddress('Ubicación desconocida');
      }
    } catch (e) {
      setCurrentAddress('Error al obtener dirección');
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    if (mapRef.current) {
      const newCenter = mapRef.current.getCenter();
      if (newCenter) {
        const lat = newCenter.lat();
        const lng = newCenter.lng();
        setCenter({ lat, lng });
        reverseGeocode(lat, lng);
      }
    }
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const onLoadAutocomplete = (autocomplete: google.maps.places.Autocomplete) => {
    autocompleteRef.current = autocomplete;
  };

  const onPlaceChanged = () => {
    if (autocompleteRef.current !== null) {
      const place = autocompleteRef.current.getPlace();
      if (place.geometry && place.geometry.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        setCenter({ lat, lng });
        let finalAddress = place.formatted_address || '';
        if (place.name && !finalAddress.includes(place.name)) {
          finalAddress = `${place.name} - ${finalAddress}`;
        }
        setCurrentAddress(finalAddress || place.name || '');
        
        if (mapRef.current) {
          mapRef.current.panTo({ lat, lng });
          mapRef.current.setZoom(17);
        }
      }
    }
  };

  const handleConfirm = () => {
    onSelect(currentAddress, center.lat, center.lng);
  };

  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      toast.loading('Buscando tu ubicación...', { id: 'gps' });
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setCenter({ lat, lng });
          if (mapRef.current) {
            mapRef.current.panTo({ lat, lng });
            mapRef.current.setZoom(17);
          }
          reverseGeocode(lat, lng);
          toast.success('Ubicación encontrada', { id: 'gps' });
        },
        (error) => {
          toast.error('No pudimos acceder a tu GPS', { id: 'gps' });
        }
      );
    }
  };

  if (!isLoaded) return <div className="p-4 flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-bottom-full duration-300 md:rounded-l-3xl shadow-[-10px_0_40px_rgba(0,0,0,0.1)]">
      {/* Search Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 md:p-6 z-10 mt-safe">
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-900/5 border border-gray-100 flex items-center px-4 py-3 md:py-4">
          <Search className="w-5 h-5 text-gray-400 mr-3" />
          <Autocomplete 
            onLoad={onLoadAutocomplete} 
            onPlaceChanged={onPlaceChanged}
            className="flex-1"
            options={{
              bounds: comitanBounds,
              strictBounds: true,
              componentRestrictions: { country: 'mx' }
            }}
          >
            <input 
              type="text" 
              placeholder="Buscar un local o calle..."
              className="w-full bg-transparent outline-none text-gray-900 font-medium"
            />
          </Autocomplete>
          <button onClick={onCancel} className="ml-3 text-sm font-bold text-gray-500 hover:text-gray-900">
            Cancelar
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          zoom={15}
          center={center}
          onLoad={onMapLoad}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          options={{
            disableDefaultUI: true,
            clickableIcons: false,
            keyboardShortcuts: false,
          }}
        >
        </GoogleMap>
        
        {/* Fixed Center Pin */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center justify-end pb-8">
          <div className={`w-40 bg-gray-900 text-white text-xs font-bold px-3 py-2 rounded-lg shadow-xl text-center mb-2 transition-opacity ${isDragging ? 'opacity-0' : 'opacity-100'}`}>
            Mueve el mapa para ajustar
          </div>
          <div className={`transition-transform duration-200 ${isDragging ? '-translate-y-4' : 'translate-y-0'}`}>
            <MapPin className="w-10 h-10 text-gray-900 fill-yellow-400 drop-shadow-xl" strokeWidth={1.5} />
          </div>
          <div className="w-2 h-1 bg-black/20 rounded-full mt-1 blur-[1px]"></div>
        </div>

        {/* Current Location FAB */}
        <button 
          onClick={handleUseCurrentLocation}
          className="absolute bottom-6 right-4 w-12 h-12 bg-white rounded-full shadow-lg border border-gray-100 flex items-center justify-center text-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
        >
          <Navigation className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom Action Area */}
      <div className="bg-white px-6 pt-6 pb-safe border-t border-gray-100 shadow-[0_-20px_40px_rgba(0,0,0,0.08)] relative z-10 pb-8 rounded-t-3xl md:rounded-t-none md:pb-6 -mt-6">
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4 md:hidden"></div>
        <p className="text-xs font-bold text-yellow-500 uppercase tracking-wider mb-2 flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5" />
          Ubicación a confirmar
        </p>
        <p className="text-gray-900 font-medium text-lg leading-tight mb-6 line-clamp-2 md:text-xl">
          {currentAddress}
        </p>
        <button 
          onClick={handleConfirm}
          className="w-full bg-gray-900 text-white font-bold py-4 rounded-2xl shadow-xl shadow-gray-900/20 hover:bg-gray-800 hover:shadow-gray-900/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-lg"
        >
          <Check className="w-5 h-5" /> Confirmar punto
        </button>
      </div>
    </div>
  );
}

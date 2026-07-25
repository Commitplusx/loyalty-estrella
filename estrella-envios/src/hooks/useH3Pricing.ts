import { useState } from 'react';
import { supabase } from '../lib/supabase';
import * as h3 from 'h3-js';
import { toast } from 'react-hot-toast';

export function useH3Pricing() {
  const [h3Price, setH3Price] = useState<number>(0);
  const [calculandoPrecio, setCalculandoPrecio] = useState(false);

  const calcularPrecioH3 = async (originLat: number, originLng: number, destLat: number, destLng: number): Promise<boolean> => {
    if (!originLat || !destLat) return false;
    
    setCalculandoPrecio(true);
    try {
      const hexOrigin = h3.latLngToCell(originLat, originLng, 10);
      const hexDest = h3.latLngToCell(destLat, destLng, 10);

      const [resOrigin, resDest] = await Promise.all([
        supabase.from('h3_zonas').select('precio').eq('h3_index', hexOrigin).maybeSingle(),
        supabase.from('h3_zonas').select('precio').eq('h3_index', hexDest).maybeSingle()
      ]);

      if (resOrigin.error) throw resOrigin.error;
      if (resDest.error) throw resDest.error;

      if (!resOrigin.data || !resDest.data) {
        toast.error('Una de las ubicaciones está fuera de nuestra área de cobertura.');
        setCalculandoPrecio(false);
        return false;
      }

      const precioO = resOrigin.data.precio || 0;
      const precioD = resDest.data.precio || 0;
      
      setH3Price(Math.max(precioO, precioD));
      return true;
    } catch (error) {
      console.error('Error calculating H3 price:', error);
      toast.error('Ocurrió un error al calcular la tarifa.');
      return false;
    } finally {
      setCalculandoPrecio(false);
    }
  };

  return { h3Price, calculandoPrecio, calcularPrecioH3 };
}

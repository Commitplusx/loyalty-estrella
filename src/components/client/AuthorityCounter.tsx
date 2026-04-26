import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Truck, Award, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const BASE_DELIVERIES = 35_000;
const YEARS_OF_EXPERIENCE = 6;

// Animamos un número de 0 al target con una duración fija
function useCountUp(target: number, delay: number = 0) {
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    const timeout = setTimeout(() => {
      const frames = 60;
      const stepTime = Math.floor(2000 / frames);
      let current = 0;

      timerRef.current = setInterval(() => {
        current += target / frames;
        if (current >= target) {
          setCount(target);
          if (timerRef.current) clearInterval(timerRef.current);
        } else {
          setCount(Math.floor(current));
        }
      }, stepTime);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [target, delay]);

  return count;
}

export default function AuthorityCounter() {
  const [deliveryTarget, setDeliveryTarget] = useState(BASE_DELIVERIES);

  useEffect(() => {
    // Cargamos el conteo inicial de entregas reales
    const fetchCount = async () => {
      const { count, error } = await supabase
        .from('registros_puntos')
        .select('*', { count: 'exact', head: true })
        .eq('tipo', 'acumulacion');

      if (!error && count !== null) {
        setDeliveryTarget(BASE_DELIVERIES + count);
      }
    };

    fetchCount();

    // Suscripción en tiempo real: cada vez que se registra un nuevo envío,
    // el contador sube automáticamente sin recargar la página
    const channel = supabase
      .channel('authority_counter_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'registros_puntos', filter: 'tipo=eq.acumulacion' },
        () => {
          setDeliveryTarget((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const deliveries = useCountUp(deliveryTarget, 200);
  const years = useCountUp(YEARS_OF_EXPERIENCE, 500);

  const stats = [
    {
      icon: Truck,
      value: `+${deliveries.toLocaleString()}`,
      label: 'Entregas exitosas',
      sub: 'y contando...',
    },
    {
      icon: Award,
      value: `${years}+`,
      label: 'Años de experiencia',
      sub: 'en el mercado local',
    },
    {
      icon: Users,
      value: '100%',
      label: 'Clientes satisfechos',
      sub: 'es nuestra meta',
    },
  ];

  return (
    <div className="grid grid-cols-3 lg:grid-cols-1 gap-3 sm:gap-4">
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 * i }}
          className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl p-4 sm:p-5 text-white text-center shadow-lg relative overflow-hidden"
        >
          {/* Icono decorativo de fondo */}
          <div className="absolute -bottom-3 -right-3 opacity-10">
            <s.icon className="w-16 h-16" />
          </div>

          <div className="relative z-10">
            <s.icon className="w-5 h-5 mx-auto mb-2 text-orange-100" />
            <p className="text-2xl sm:text-3xl font-black tracking-tight">
              {s.value}
            </p>
            <p className="text-xs sm:text-sm font-semibold text-orange-50 mt-0.5 leading-tight">
              {s.label}
            </p>
            <p className="text-xs text-orange-200 mt-0.5 hidden sm:block">
              {s.sub}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

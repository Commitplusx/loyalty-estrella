import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { Truck, Award, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const BASE_DELIVERIES = 35_000;
const YEARS_OF_EXPERIENCE = 6;

// GPU-optimized count-up using requestAnimationFrame
function useCountUp(target: number, duration = 1600, delay = 0) {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(2, -10 * progress); // easeOutExpo
        setCount(Math.floor(eased * target));
        if (progress < 1) rafRef.current = requestAnimationFrame(tick);
        else setCount(target);
      };
      rafRef.current = requestAnimationFrame(tick);
    }, delay);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, delay]);

  return count;
}

export default function AuthorityCounter() {
  const [deliveryTarget, setDeliveryTarget] = useState(BASE_DELIVERIES);
  const containerRef = useRef(null);
  const inView = useInView(containerRef, { once: true, margin: '-60px' });

  // If the splash screen is showing on first load, the counters are already
  // "in view" behind the splash overlay — useInView fires but the user can't
  // see it. Detect first-load and add extra delay so animation runs AFTER splash.
  const splashExtraDelay = !sessionStorage.getItem('splashShown') ? 3200 : 0;

  useEffect(() => {
    const fetchCount = async () => {
      const { count, error } = await supabase
        .from('registros_puntos')
        .select('*', { count: 'exact', head: true })
        .eq('tipo', 'acumulacion');
      if (!error && count !== null) setDeliveryTarget(BASE_DELIVERIES + count);
    };
    fetchCount();
    const channel = supabase
      .channel('authority_counter_realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'registros_puntos', filter: 'tipo=eq.acumulacion' },
        () => setDeliveryTarget(prev => prev + 1)
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const deliveries = useCountUp(inView ? deliveryTarget : 0, 1600, splashExtraDelay);
  const years = useCountUp(inView ? YEARS_OF_EXPERIENCE : 0, 1200, splashExtraDelay + 150);

  const stats = [
    { icon: Truck,  value: `+${deliveries.toLocaleString()}`, label: 'Entregas exitosas', sub: 'y contando...', bg: 'bg-blue-600', glow: 'shadow-blue-600/25' },
    { icon: Award,  value: `${years}+`, label: 'Años de experiencia', sub: 'en Comitán', bg: 'bg-gray-900', glow: 'shadow-gray-900/20' },
    { icon: Users,  value: '100%', label: 'Satisfacción', sub: 'nuestra meta', bg: 'bg-red-600', glow: 'shadow-red-600/25' },
  ];

  return (
    <div ref={containerRef} className="grid grid-cols-3 lg:grid-cols-1 gap-2.5 sm:gap-3">
      {stats.map((s, i) => (
        <motion.div key={s.label}
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: splashExtraDelay / 1000 + i * 0.1 }}
          className={`relative overflow-hidden rounded-xl sm:rounded-2xl p-3 sm:p-5 ${s.bg} shadow-xl ${s.glow}`}
        >
          <div className="absolute -top-4 -right-4 w-16 h-16 sm:w-20 sm:h-20 rounded-full blur-2xl bg-white/15 pointer-events-none" />
          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-white/15 flex items-center justify-center mb-2 sm:mb-3 backdrop-blur-sm">
            <s.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
          </div>
          <p className="text-lg sm:text-3xl font-black text-white tracking-tight leading-none">{s.value}</p>
          <p className="text-[10px] sm:text-xs font-semibold text-white/70 mt-0.5 sm:mt-1 leading-tight">{s.label}</p>
          <p className="hidden sm:block text-[10px] text-white/40 mt-0.5">{s.sub}</p>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        </motion.div>
      ))}
    </div>
  );
}


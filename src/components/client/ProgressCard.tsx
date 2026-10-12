import { motion, type MotionValue } from 'framer-motion';
import { ArrowRight, Gift, Star, Ticket } from 'lucide-react';
import type { Cliente } from '@/types';

interface ProgressCardProps {
  cliente: Cliente;
  metaVip: number;
  progreso: number;
  enviosRestantes: number;
  displayPointsRounded: MotionValue<number>;
  onCanjear: () => void;
}

export function ProgressCard({
  cliente,
  metaVip,
  progreso,
  enviosRestantes,
  displayPointsRounded,
  onCanjear,
}: ProgressCardProps) {
  const goal = Math.max(1, metaVip);
  const points = Math.max(0, cliente.puntos || 0);
  const inCycle = Math.min(points,goal);
  const available = Math.max(0, cliente.envios_gratis_disponibles || 0);
  const level = cliente.es_vip ? 'VIP' : (cliente.rango || 'Miembro');
  const remaining = Math.max(0, enviosRestantes);

  return (
    <section className="loyalty-progress" aria-labelledby="loyalty-progress-title">
      <div className="loyalty-progress-topline">
        <span>MI PROGRESO</span>
        <span className="loyalty-level"><Star size={13} fill="currentColor" aria-hidden="true" /> {level}</span>
      </div>
      <div className="loyalty-progress-score">
        <div>
          <p>Mis puntos</p>
          <strong><motion.span>{displayPointsRounded}</motion.span></strong>
        </div>
        <span className="loyalty-progress-symbol"><Star size={31} strokeWidth={1.5} aria-hidden="true" /></span>
      </div>
      <div className="loyalty-progress-caption">
        <span>Puntos para un canje</span>
        <strong>{inCycle} / {goal}</strong>
      </div>
      <div className="loyalty-progress-track" role="progressbar" aria-valuenow={inCycle} aria-valuemin={0} aria-valuemax={goal} aria-label="Progreso hacia el siguiente beneficio">
        <motion.span initial={{ width: 0 }} animate={{ width: Math.min(100, Math.max(0, progreso)) + '%' }} transition={{ duration: .6 }} />
      </div>
      <div className="loyalty-progress-marks" aria-hidden="true">
        {Array.from({ length: goal }, (_, index) => (
          <span key={index} className={index < inCycle ? 'is-filled' : ''}>{index < inCycle ? <Star size={14} fill="currentColor" /> : index + 1}</span>
        ))}
      </div>
      <p className="loyalty-progress-message">
        {available > 0
          ? <>Tienes <strong>{available} envío{available !== 1 ? 's' : ''} gratis</strong> disponible{available !== 1 ? 's' : ''}.</>
          : points >= goal
            ? <>Ya tienes puntos suficientes para <strong>solicitar un beneficio</strong>.</>
          : remaining === 1
            ? <>Te falta <strong>1 entrega</strong> para el siguiente beneficio.</>
            : <>Te faltan <strong>{remaining} entregas</strong> para el siguiente beneficio.</>}
      </p>
      <div className="loyalty-progress-stats">
        <div><strong>{cliente.envios_totales || 0}</strong><span>Entregas</span></div>
        <div><strong>{points}</strong><span>Puntos disponibles</span></div>
        <div><strong>{available}</strong><span>Gratis</span></div>
      </div>
      <button type="button" className="loyalty-progress-cta" onClick={onCanjear}>
        {available > 0 ? <Gift size={18} aria-hidden="true" /> : <Ticket size={18} aria-hidden="true" />}
        {available > 0 ? 'Canjear beneficio' : 'Ver beneficios'}
        <ArrowRight size={17} aria-hidden="true" />
      </button>
    </section>
  );
}

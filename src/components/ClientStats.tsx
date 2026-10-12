import { Award, CalendarDays, Gift } from 'lucide-react';
import type { Cliente, RegistroMovimiento } from '@/types';

interface ClientStatsProps {
  cliente: Cliente;
  historial: RegistroMovimiento[];
}

export function ClientStats({ cliente, historial }: ClientStatsProps) {
  const currentYear = new Date().getFullYear();
  const deliveriesThisYear = historial.filter((movement) =>
    movement.tipo === 'acumulacion' && new Date(movement.created_at).getFullYear() === currentYear
  ).length;
  const redemptions = historial.filter((movement) => movement.tipo === 'canje').length;
  const level = cliente.es_vip ? 'VIP' : cliente.rango || 'Bronce';

  return (
    <section className="loyalty-stats" aria-labelledby="loyalty-stats-title">
      <div className="loyalty-section-title">
        <Award size={20} aria-hidden="true" />
        <h2 id="loyalty-stats-title">Tu actividad reciente</h2>
      </div>
      <div className="loyalty-stats-grid">
        <div className="loyalty-stat">
          <CalendarDays size={19} aria-hidden="true" />
          <strong>{deliveriesThisYear}</strong>
          <span>Entregas en el historial</span>
        </div>
        <div className="loyalty-stat">
          <Gift size={19} aria-hidden="true" />
          <strong>{redemptions}</strong>
          <span>Canjes registrados</span>
        </div>
        <div className="loyalty-stat">
          <Award size={19} aria-hidden="true" />
          <strong>{level}</strong>
          <span>Tu nivel</span>
        </div>
      </div>
    </section>
  );
}

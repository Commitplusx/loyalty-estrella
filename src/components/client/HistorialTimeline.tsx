import { useState } from 'react';
import { ArrowDown, Copy, Gift, History, Star, Wallet } from 'lucide-react';
import { toast } from '@/components/ui/toast-native';
import type { RegistroMovimiento } from '@/types';

interface HistorialTimelineProps {
  historial: RegistroMovimiento[];
  cuponActivo?: string | null;
}

type TabFilter = 'todo' | 'puntos' | 'canjes';

const filters: { id: TabFilter; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'puntos', label: 'Puntos' },
  { id: 'canjes', label: 'Canjes' },
];

export function HistorialTimeline({ historial, cuponActivo }: HistorialTimelineProps) {
  const [filter, setFilter] = useState<TabFilter>('todo');
  const [limit, setLimit] = useState(10);
  const filtered = historial.filter((movement) =>
    filter === 'todo' || (filter === 'canjes' ? movement.tipo === 'canje' : movement.tipo !== 'canje')
  );

  return (
    <section className="loyalty-history" aria-labelledby="loyalty-history-title">
      <div className="loyalty-section-title">
        <History size={20} aria-hidden="true" />
        <h2 id="loyalty-history-title">Tus movimientos</h2>
      </div>
      <div className="loyalty-history-filters" aria-label="Filtrar movimientos">
        {filters.map(({ id, label }) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setLimit(10); }}>
            {label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="loyalty-history-empty">
          <Star size={25} aria-hidden="true" />
          <strong>{historial.length === 0 ? 'Aquí aparecerán tus movimientos' : 'No hay movimientos en este filtro'}</strong>
          <p>{historial.length === 0 ? 'Cuando acumules puntos o uses un beneficio, podrás verlo aquí.' : 'Prueba con otro filtro para revisar tu historial.'}</p>
        </div>
      ) : (
        <div className="loyalty-history-list">
          {filtered.slice(0, limit).map((movement) => {
            const couponCode = movement.descripcion?.match(/Código:\s*(CANJE-[A-Z0-9]+)/i)?.[1];
            const redemption = movement.tipo === 'canje';
            const wallet = movement.tipo === 'acumulacion' && !!movement.monto_saldo;
            const Icon = redemption ? Gift : wallet ? Wallet : Star;
            const label = wallet
              ? 'Saldo acumulado'
              : redemption
                ? (movement.monto_saldo !== undefined && movement.monto_saldo < 0 ? 'Uso de billetera VIP' : 'Beneficio canjeado')
                : 'Punto acumulado';
            return (
              <article className="loyalty-history-item" key={movement.id ?? movement.cliente_id + movement.created_at}>
                <span className="loyalty-history-icon"><Icon size={19} aria-hidden="true" /></span>
                <div className="loyalty-history-content">
                  <div className="loyalty-history-item-top">
                    <strong>{label}</strong>
                    <time dateTime={movement.created_at}>
                      {new Date(movement.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </time>
                  </div>
                  {wallet && <p>{'+$' + movement.monto_saldo?.toFixed(2) + ' en tu billetera'}</p>}
                  {movement.monto_saldo !== undefined && movement.monto_saldo < 0 && <p>{'-$' + Math.abs(movement.monto_saldo).toFixed(2) + ' de tu billetera'}</p>}
                  {couponCode && couponCode === cuponActivo && (
                    <div className="loyalty-history-coupon">
                      <div><span>Cupón activo</span><strong>{couponCode}</strong></div>
                      <button type="button" aria-label="Copiar código de cupón" onClick={() =>
                        navigator.clipboard.writeText(couponCode)
                          .then(() => toast.success('Código copiado', 'Listo para usar'))
                          .catch(() => toast.error('No se pudo copiar', 'Selecciona el código para copiarlo'))
                      }><Copy size={16} aria-hidden="true" /> Copiar</button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
          {filtered.length > limit && (
            <button className="loyalty-history-more" type="button" onClick={() => setLimit((current) => current + 10)}>
              Ver más movimientos <ArrowDown size={17} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </section>
  );
}

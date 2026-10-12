// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { motionValue } from 'framer-motion';
import { ProgressCard } from './ProgressCard';
import type { Cliente } from '@/types';

const fixture: Cliente={id:'qa',telefono:'0000000000',nombre:'QA',qr_code:'qa',puntos:19,envios_gratis_disponibles:1,envios_totales:24,
 es_vip:false,rango:'bronce',saldo_billetera:0,created_at:'2026-10-12T00:00:00Z',updated_at:'2026-10-12T00:00:00Z'};
describe('Benefits stay separate from convertible points',() => {
 it('does not invent free deliveries or VIP membership from points and total deliveries',() => {
  const {container}=render(<ProgressCard cliente={fixture} metaVip={5} progreso={100} enviosRestantes={0} displayPointsRounded={motionValue(19)} onCanjear={() => {}} />);
  expect(container.querySelector('.loyalty-progress-message')?.textContent).toBe('Tienes 1 envío gratis disponible.');
  expect(container.querySelector('.loyalty-level')?.textContent).toContain('bronce');
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('5');
 });
 it('offers conversion without counting possible coupons as existing benefits',() => {
  const {container}=render(<ProgressCard cliente={{...fixture,envios_gratis_disponibles:0}} metaVip={5} progreso={100} enviosRestantes={0} displayPointsRounded={motionValue(19)} onCanjear={() => {}} />);
  expect(container.querySelector('.loyalty-progress-message')?.textContent).toContain('solicitar un beneficio');
  expect(container.querySelector('.loyalty-progress-stats')?.textContent).toContain('0Gratis');
 });
});

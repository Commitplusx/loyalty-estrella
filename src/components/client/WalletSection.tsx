// ══════════════════════════════════════════════════════════════════════════════
// WalletSection — Billetera VIP: saldo, cupón activo, y modal de canje
// ══════════════════════════════════════════════════════════════════════════════
// Extraído de ClienteView. Maneja su propio estado del modal de canje.

import { useState } from 'react';
import { ArrowRight, Copy, Ticket, Wallet, Utensils, Truck, ChevronLeft, X, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from '@/components/ui/toast-native';
import { MAX_COBERTURA_ENVIO_GRATIS } from '@/lib/constants';
import { redeemCustomerBenefit, type CustomerRedemption } from '@/lib/customer-loyalty';
import type { Cliente } from '@/types';

interface WalletSectionProps {
  cliente: Cliente;
  onClienteUpdate: (updater: (prev: Cliente | null) => Cliente | null) => void;
}

type WalletMode = 'select' | 'food' | 'delivery' | 'success';

export function WalletSection({ cliente, onClienteUpdate }: WalletSectionProps) {
  const [showModal, setShowModal] = useState(false);
  const [walletMode, setWalletMode] = useState<WalletMode>('select');
  const [foodAmount, setFoodAmount] = useState('');
  const [deliveryCost, setDeliveryCost] = useState('');
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletMsg, setWalletMsg] = useState('');
  const [walletCode,setWalletCode] = useState('');

  const resetModal = () => {
    if (walletLoading) return;
    setShowModal(false);
    setWalletMode('select');
    setFoodAmount('');
    setDeliveryCost('');
    setWalletMsg('');
    setWalletCode('');
    setWalletLoading(false);
  };

  const applyRedemption = async (amount: number, summary: (result: CustomerRedemption) => string) => {
    if (walletLoading) return;
    setWalletLoading(true); setWalletMsg('');
    try {
      const result=await redeemCustomerBenefit({phone:cliente.telefono,type:'billetera',amount});
      setWalletMsg(summary(result)); setWalletCode(result.codigo); setWalletMode('success');
      onClienteUpdate(previous => previous ? {...previous,saldo_billetera:result.saldo_nuevo,
        puntos:result.puntos_nuevos,envios_gratis_disponibles:result.envios_gratis_nuevos,cupon_activo:result.codigo} : previous);
    } catch(error: unknown) {
      setWalletMsg(error instanceof Error ? error.message : 'No pudimos confirmar tu canje. Intenta de nuevo.');
    } finally {setWalletLoading(false);}
  };
  const handleCanjeComida = async () => {
    const amount=Number(foodAmount);
    if (!Number.isFinite(amount) || amount<=0 || Number(amount.toFixed(2))!==amount || amount>cliente.saldo_billetera) {
      setWalletMsg('Escribe un importe válido que puedas cubrir con tu saldo.'); return;
    }
    if (amount>300) {setWalletMsg('Puedes canjear hasta $300 por transacción.'); return;}
    if (cliente.cupon_activo) {setWalletMsg('Ya tienes un cupón activo. Úsalo antes de generar otro.'); return;}
    await applyRedemption(amount,result => `Se descontaron $${result.valor_pesos.toFixed(2)} de tu billetera VIP.\nTu cupón quedó guardado.`);
  };
  const handleCanjeEnvio = async () => {
    if (cliente.cupon_activo) {setWalletMsg('Ya tienes un cupón activo. Úsalo antes de generar otro.'); return;}
    const cost=deliveryCost.trim() ? Number(deliveryCost) : MAX_COBERTURA_ENVIO_GRATIS;
    if (!Number.isFinite(cost) || cost<=0 || Number(cost.toFixed(2))!==cost) {setWalletMsg('Escribe un costo de envío válido.'); return;}
    const coverage=Math.min(cost,MAX_COBERTURA_ENVIO_GRATIS),difference=Math.max(0,cost-MAX_COBERTURA_ENVIO_GRATIS);
    if (coverage>cliente.saldo_billetera) {setWalletMsg(`Necesitas $${coverage.toFixed(2)} de saldo para este canje.`); return;}
    await applyRedemption(coverage,result => difference>0
      ? `Tu cupón cubre $${result.valor_pesos.toFixed(2)}. La diferencia del envío es $${difference.toFixed(2)}.`
      : `Tu cupón cubre $${result.valor_pesos.toFixed(2)} de envío.`);
  };

  // ── Wallet card (collapsed) ──────────────────────────────────────────────
  if (!showModal) {
    return (
      <section className="loyalty-wallet" aria-labelledby="loyalty-wallet-title">
        <div className="loyalty-wallet-head">
          <div className="loyalty-section-title">
            <Wallet size={20} aria-hidden="true" />
            <h2 id="loyalty-wallet-title">Billetera VIP</h2>
          </div>
          <div className="loyalty-wallet-balance">
            <strong>{'$' + (cliente.saldo_billetera || 0).toFixed(2)}</strong>
            <span>Saldo disponible</span>
          </div>
        </div>
        {cliente.cupon_activo ? (
          <div className="loyalty-wallet-body">
            <div className="loyalty-wallet-coupon">
              <span><Ticket size={17} aria-hidden="true" /> Cupón activo</span>
              <strong>{cliente.cupon_activo}</strong>
              <p>Muestra este código al repartidor. Podrás generar otro cuando éste se haya usado.</p>
              <button type="button" onClick={() =>
                navigator.clipboard.writeText(cliente.cupon_activo!)
                  .then(() => toast.success('Código copiado', 'Listo para usar'))
                  .catch(() => toast.error('No se pudo copiar', 'Selecciona el código para copiarlo'))
              }><Copy size={16} aria-hidden="true" /> Copiar código</button>
            </div>
          </div>
        ) : (
          <div className="loyalty-wallet-body">
            {(cliente.saldo_billetera || 0) > 0 ? (
              <button type="button" className="loyalty-wallet-action" onClick={() => { setShowModal(true); setWalletMode('select'); }}>
                Usar mi saldo <ArrowRight size={18} aria-hidden="true" />
              </button>
            ) : (
              <p className="loyalty-wallet-empty">Tu saldo se acumula con las entregas participantes.</p>
            )}
            <p className="loyalty-wallet-help">Puedes usarlo en comida o cubrir hasta ${MAX_COBERTURA_ENVIO_GRATIS} de un envío.</p>
          </div>
        )}
      </section>
    );
  }
  // ── Wallet modal (expanded) ──────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 flex items-center justify-between">
        <div>
          <p className="font-bold text-gray-900">Canjear saldo o puntos</p>
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-400">Saldo: <strong className="text-gray-700">${(cliente.saldo_billetera || 0).toFixed(2)}</strong></p>
            <p className="text-sm text-gray-400">Puntos: <strong className="text-amber-600">{cliente.puntos || 0}</strong></p>
          </div>
        </div>
        <button onClick={resetModal} disabled={walletLoading} aria-label="Cerrar billetera" className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-4">
        {walletMode === 'select' && (
          <div className="space-y-3">
            {/* Opción 1: Comida */}
            <button
              onClick={() => { setWalletMode('food'); setWalletMsg(''); }}
              className="w-full p-5 rounded-2xl border-2 border-orange-200 hover:border-orange-400 hover:bg-orange-50 transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                  <Utensils className="w-7 h-7 text-orange-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">Descuento en Comida</p>
                  <p className="text-sm text-gray-500">Descuenta cualquier monto de tu saldo</p>
                </div>
              </div>
            </button>
            {/* Opción 2: Envío gratis */}
            <button
              onClick={() => { setWalletMode('delivery'); setWalletMsg(''); }}
              className="w-full p-5 rounded-2xl border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <Truck className="w-7 h-7 text-blue-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">Envío Gratis</p>
                  <p className="text-sm text-gray-500">Cubre hasta ${MAX_COBERTURA_ENVIO_GRATIS} de costo de entrega</p>
                </div>
              </div>
            </button>
            <button
              onClick={resetModal}
              className="w-full py-4 text-base font-bold text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancelar y volver
            </button>
          </div>
        )}

        {walletMode === 'food' && (
          <>
            <button onClick={() => setWalletMode('select')} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-2">
              <ChevronLeft className="w-4 h-4" /> Volver
            </button>
            <div className="bg-orange-50 rounded-2xl p-4">
              <p className="font-semibold text-gray-800 mb-1 flex items-center gap-2"><Utensils className="w-4 h-4 text-orange-500" /> Descuento en Comida</p>
              <p className="text-xs text-gray-500 mb-3">Indica el monto que quieres descontar de tu saldo</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                <input
                  type="number"
                  min="1"
                  max={Math.min(300, cliente.saldo_billetera || 0)}
                  step="0.01"
                  value={foodAmount}
                  onChange={e => {
                    const val = e.target.value;
                    if (parseFloat(val) > 300) setFoodAmount('300');
                    else setFoodAmount(val);
                  }}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-3 border-2 border-orange-200 rounded-xl text-lg font-bold text-gray-900 focus:outline-none focus:border-orange-400"
                />
              </div>
              {walletMsg && <p className="mt-2 text-xs text-red-500">{walletMsg}</p>}
            </div>
            <button
              disabled={walletLoading || !foodAmount || parseFloat(foodAmount) <= 0 || parseFloat(foodAmount) > Math.min(300, cliente.saldo_billetera || 0)}
              onClick={handleCanjeComida}
              className="w-full py-5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg active:scale-[0.98]"
            >
              {walletLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <CheckCircle2 className="w-6 h-6" />}
              Confirmar Descuento
            </button>
          </>
        )}

        {walletMode === 'delivery' && (
          <>
            <button onClick={() => setWalletMode('select')} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-2">
              <ChevronLeft className="w-4 h-4" /> Volver
            </button>
            <div className="bg-blue-50 rounded-2xl p-4 space-y-3">
              <p className="font-semibold text-gray-800 flex items-center gap-2"><Truck className="w-4 h-4 text-blue-500" /> Canje por Envío</p>
              <div className="text-xs text-gray-500 bg-white rounded-xl p-3 space-y-1">
                <p>• Cobertura máxima: <strong className="text-blue-600">${MAX_COBERTURA_ENVIO_GRATIS}.00</strong></p>
                <p>• Si tu envío cuesta más, pagas la diferencia</p>
              </div>
              <label className="text-xs font-medium text-gray-600">Costo real de tu envío (opcional)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={deliveryCost}
                  onChange={e => setDeliveryCost(e.target.value)}
                  placeholder={`${MAX_COBERTURA_ENVIO_GRATIS}.00`}
                  className="w-full pl-8 pr-4 py-3 border-2 border-blue-200 rounded-xl text-lg font-bold text-gray-900 focus:outline-none focus:border-blue-400"
                />
              </div>
              {deliveryCost && parseFloat(deliveryCost) > MAX_COBERTURA_ENVIO_GRATIS && (
                <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-700">
                  ⚠️ Tu billetera cubre <strong>${MAX_COBERTURA_ENVIO_GRATIS}</strong><br/>
                  Diferencia a pagar: <strong>${(parseFloat(deliveryCost) - MAX_COBERTURA_ENVIO_GRATIS).toFixed(2)}</strong>
                </div>
              )}
              {walletMsg && <p className="text-xs text-red-500">{walletMsg}</p>}
            </div>
            <button
              disabled={walletLoading || (cliente.saldo_billetera || 0) < Math.min(parseFloat(deliveryCost) || MAX_COBERTURA_ENVIO_GRATIS, MAX_COBERTURA_ENVIO_GRATIS)}
              onClick={handleCanjeEnvio}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:from-blue-600 hover:to-indigo-600 transition-all shadow-lg"
            >
              {walletLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Truck className="w-5 h-5" />}
              Aplicar Canje
            </button>
          </>
        )}

        {walletMode === 'success' && (
          <div className="text-center py-2 space-y-5">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <p className="font-bold text-gray-900 text-lg">¡Canje Exitoso!</p>
            
            <p className="text-gray-600 text-sm whitespace-pre-line">{walletMsg}</p>
            {(() => {
              const code = walletCode;
              return code ? (
                <div className="relative bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-50 border-2 border-dashed border-amber-400 rounded-2xl p-5 space-y-2">
                  <p className="text-xs uppercase tracking-widest text-amber-500 font-bold">Tu código de descuento</p>
                  <p className="font-mono font-bold text-base text-amber-700 break-all">{code}</p>
                  <p className="text-[11px] text-amber-600/70">Muestra o dicta este código al repartidor</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(code).then(() => toast.success('¡Copiado!', 'Código listo para usar')).catch(() => toast.error('Error', 'No se pudo copiar al portapapeles'))}
                    className="mt-2 text-xs font-bold text-amber-600 bg-amber-200/60 px-4 py-2 rounded-lg hover:bg-amber-300/60 transition-colors"
                  >
                    📋 Copiar código
                  </button>
                </div>
              ) : (
                <p className="text-gray-500 text-sm whitespace-pre-line">{walletMsg}</p>
              );
            })()}
            
            <p className="text-sm text-gray-600">Tu cupón quedó guardado. Puedes consultarlo aquí aunque no llegue el aviso de WhatsApp.</p>
            <button
              onClick={resetModal}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold hover:from-green-600 hover:to-emerald-600 transition-all shadow-md"
            >
              Volver a mi perfil
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


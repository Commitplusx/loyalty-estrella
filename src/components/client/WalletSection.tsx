// ══════════════════════════════════════════════════════════════════════════════
// WalletSection — Billetera VIP: saldo, cupón activo, y modal de canje
// ══════════════════════════════════════════════════════════════════════════════
// Extraído de ClienteView. Maneja su propio estado del modal de canje.

import { useState } from 'react';
import { Wallet, Utensils, Truck, ChevronLeft, X, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from '@/components/ui/toast-native';
import { MAX_COBERTURA_ENVIO_GRATIS } from '@/lib/constants';
import { supabase, canjearSaldoBilleteraRPC } from '@/lib/supabase';
import { logCriticalError } from '@/lib/logger';
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

  const resetModal = () => {
    setShowModal(false);
    setWalletMode('select');
    setFoodAmount('');
    setDeliveryCost('');
    setWalletMsg('');
    setWalletLoading(false);
  };

  const notifyWhatsApp = (codigo: string, monto: number, nuevoSaldo: number) => {
    supabase.functions.invoke('notificar-whatsapp', {
      body: {
        tipo: 'canje_billetera',
        cliente_tel: cliente.telefono,
        cliente_nombre: cliente.nombre,
        codigo_canje: codigo,
        monto: monto.toFixed(2),
        saldo_restante: nuevoSaldo.toFixed(2),
      },
    }).catch(console.error);
  };

  const handleCanjeComida = async () => {
    const monto = parseFloat(foodAmount);
    if (isNaN(monto) || monto <= 0 || monto > (cliente.saldo_billetera || 0)) return;
    if (cliente.cupon_activo) {
      setWalletMsg(`❌ Ya tienes un cupón activo: ${cliente.cupon_activo}. Úsalo antes de generar otro.`);
      return;
    }
    setWalletLoading(true);
    const res = await canjearSaldoBilleteraRPC(cliente.id, monto, 'Descuento en comida');
    setWalletLoading(false);

    if (res.ok) {
      const codigo = res.codigo || 'SIN-CODIGO';
      const nuevoSaldo = typeof res.nuevo_saldo === 'number'
        ? res.nuevo_saldo
        : Math.max(0, (cliente.saldo_billetera || 0) - monto);
      setWalletMsg(`✅ Se descontaron $${monto.toFixed(2)} de tu billetera VIP.\n🎟️ Código de descuento: ${codigo}`);
      setWalletMode('success');
      onClienteUpdate(prev => prev ? { ...prev, saldo_billetera: nuevoSaldo, cupon_activo: codigo } : prev);
      notifyWhatsApp(codigo, monto, nuevoSaldo);
    } else {
      setWalletMsg(`❌ ${res.error || 'Error al procesar el canje'}`);
      logCriticalError('Error en canje de comida billetera', res);
    }
  };

  const handleCanjeEnvio = async () => {
    if (cliente.cupon_activo) {
      setWalletMsg(`❌ Ya tienes un cupón activo: ${cliente.cupon_activo}. Úsalo antes de generar otro.`);
      return;
    }
    const costoReal = parseFloat(deliveryCost) || MAX_COBERTURA_ENVIO_GRATIS;
    const cobertura = Math.min(costoReal, MAX_COBERTURA_ENVIO_GRATIS);
    const diferencia = Math.max(0, costoReal - MAX_COBERTURA_ENVIO_GRATIS);
    if (cobertura > (cliente.saldo_billetera || 0)) {
      setWalletMsg(`❌ Saldo insuficiente. El canje de envío requiere al menos $${cobertura.toFixed(2)}`);
      return;
    }
    setWalletLoading(true);
    const res = await canjearSaldoBilleteraRPC(cliente.id, cobertura, 'Canje de envío gratis');
    setWalletLoading(false);

    if (res.ok) {
      const codigo = res.codigo || 'SIN-CODIGO';
      const nuevoSaldo = typeof res.nuevo_saldo === 'number'
        ? res.nuevo_saldo
        : Math.max(0, (cliente.saldo_billetera || 0) - cobertura);
      const msg = diferencia > 0
        ? `✅ Cobertura de $${cobertura.toFixed(2)} aplicada.\n💳 Diferencia a pagar: $${diferencia.toFixed(2)}\n🎟️ Código: ${codigo}`
        : `✅ Envío cubierto totalmente ($${cobertura.toFixed(2)}) con tu Billetera VIP.\n🎟️ Código: ${codigo}`;
      setWalletMsg(msg);
      setWalletMode('success');
      onClienteUpdate(prev => prev ? { ...prev, saldo_billetera: nuevoSaldo, cupon_activo: codigo } : prev);
      notifyWhatsApp(codigo, cobertura, nuevoSaldo);
    } else {
      setWalletMsg(`❌ ${res.error || 'Error al procesar el canje'}`);
      logCriticalError('Error en canje de envío billetera', res);
    }
  };

  // ── Wallet card (collapsed) ──────────────────────────────────────────────
  if (!showModal) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {/* Saldo */}
        <div className="p-5 border-b border-gray-50">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Billetera VIP</span>
          </div>
          <p className="text-3xl font-black text-gray-900 mt-2">${(cliente.saldo_billetera || 0).toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Saldo disponible</p>
        </div>

        {/* Cupón activo — bloquea el canje */}
        {cliente.cupon_activo ? (
          <div className="p-4">
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 space-y-2">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">🎟️ Cupón activo</p>
              <p className="font-mono font-black text-amber-700 text-xl tracking-widest">{cliente.cupon_activo}</p>
              <p className="text-xs text-amber-600/80">Usa este código con el repartidor. No puedes generar otro hasta que se marque como usado.</p>
              <button
                onClick={() => navigator.clipboard.writeText(cliente.cupon_activo!)}
                className="text-xs font-bold text-amber-600 bg-amber-200/60 px-3 py-1.5 rounded-lg hover:bg-amber-300/60 transition-colors"
              >
                Copiar código
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {(cliente.saldo_billetera || 0) > 0 ? (
              <button
                onClick={() => { setShowModal(true); setWalletMode('select'); }}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-amber-600 transition-colors"
              >
                <Wallet className="w-4 h-4" />
                Canjear saldo
              </button>
            ) : (
              <p className="text-center text-gray-400 text-xs py-1">Acumula saldo realizando envíos</p>
            )}
            <p className="text-center text-xs text-gray-400">💡 Descuento en comida o envío gratis (hasta $45)</p>
          </div>
        )}
      </div>
    );
  }

  // ── Wallet modal (expanded) ──────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 flex items-center justify-between">
        <div>
          <p className="font-bold text-gray-900">Canjear saldo</p>
          <p className="text-sm text-gray-400">Disponible: <strong className="text-gray-700">${(cliente.saldo_billetera || 0).toFixed(2)}</strong></p>
        </div>
        <button onClick={resetModal} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-4">
        {walletMode === 'select' && (
          <div className="space-y-3">
            {/* Opción 1: Comida */}
            <button
              onClick={() => { setWalletMode('food'); setWalletMsg(''); }}
              className="w-full p-4 rounded-2xl border-2 border-orange-200 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                  <Utensils className="w-6 h-6 text-orange-500" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">Descuento en Comida</p>
                  <p className="text-xs text-gray-500">Descuenta cualquier monto de tu pedido</p>
                </div>
              </div>
            </button>
            {/* Opción 2: Envío gratis */}
            <button
              onClick={() => { setWalletMode('delivery'); setWalletMsg(''); }}
              className="w-full p-4 rounded-2xl border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <Truck className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">Envío Gratis</p>
                  <p className="text-xs text-gray-500">Cubre hasta ${MAX_COBERTURA_ENVIO_GRATIS} de costo de entrega</p>
                </div>
              </div>
            </button>
            <button
              onClick={resetModal}
              className="w-full py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
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
            <div className="bg-orange-50 dark:bg-orange-900/10 rounded-2xl p-4">
              <p className="font-semibold text-gray-800 dark:text-white mb-1 flex items-center gap-2"><Utensils className="w-4 h-4 text-orange-500" /> Descuento en Comida</p>
              <p className="text-xs text-gray-500 mb-3">Indica el monto que quieres descontar de tu saldo</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                <input
                  type="number"
                  min="1"
                  max={cliente.saldo_billetera || 0}
                  step="0.01"
                  value={foodAmount}
                  onChange={e => setFoodAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-3 border-2 border-orange-200 rounded-xl text-lg font-bold text-gray-900 dark:text-white dark:bg-gray-800 focus:outline-none focus:border-orange-400"
                />
              </div>
              {walletMsg && <p className="mt-2 text-xs text-red-500">{walletMsg}</p>}
            </div>
            <button
              disabled={walletLoading || !foodAmount || parseFloat(foodAmount) <= 0 || parseFloat(foodAmount) > (cliente.saldo_billetera || 0)}
              onClick={handleCanjeComida}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg"
            >
              {walletLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Confirmar Descuento
            </button>
          </>
        )}

        {walletMode === 'delivery' && (
          <>
            <button onClick={() => setWalletMode('select')} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-2">
              <ChevronLeft className="w-4 h-4" /> Volver
            </button>
            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-2xl p-4 space-y-3">
              <p className="font-semibold text-gray-800 dark:text-white flex items-center gap-2"><Truck className="w-4 h-4 text-blue-500" /> Canje por Envío</p>
              <div className="text-xs text-gray-500 bg-white dark:bg-gray-800 rounded-xl p-3 space-y-1">
                <p>• Cobertura máxima: <strong className="text-blue-600">${MAX_COBERTURA_ENVIO_GRATIS}.00</strong></p>
                <p>• Si tu envío cuesta más, pagas la diferencia</p>
              </div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Costo real de tu envío (opcional)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={deliveryCost}
                  onChange={e => setDeliveryCost(e.target.value)}
                  placeholder={`${MAX_COBERTURA_ENVIO_GRATIS}.00`}
                  className="w-full pl-8 pr-4 py-3 border-2 border-blue-200 rounded-xl text-lg font-bold text-gray-900 dark:text-white dark:bg-gray-800 focus:outline-none focus:border-blue-400"
                />
              </div>
              {deliveryCost && parseFloat(deliveryCost) > MAX_COBERTURA_ENVIO_GRATIS && (
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
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
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <p className="font-bold text-gray-900 dark:text-white text-lg">¡Canje Exitoso!</p>
            
            {/* Extract code from walletMsg */}
            {(() => {
              const cMatch = walletMsg.match(/(CANJE-[A-Z0-9]+)/i);
              const code = cMatch ? cMatch[1] : null;
              return code ? (
                <div className="relative bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-50 dark:from-amber-900/30 dark:via-yellow-900/20 dark:to-amber-900/30 border-2 border-dashed border-amber-400 rounded-2xl p-5 space-y-2">
                  <p className="text-xs uppercase tracking-widest text-amber-500 font-bold">Tu código de descuento</p>
                  <p className="font-mono font-black text-2xl text-amber-700 dark:text-amber-300 tracking-[0.25em]">{code}</p>
                  <p className="text-[11px] text-amber-600/70 dark:text-amber-400/70">Muestra o dicta este código al repartidor</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(code).then(() => toast.success('¡Copiado!', 'Código listo para usar')).catch(() => toast.error('Error', 'No se pudo copiar al portapapeles'))}
                    className="mt-2 text-xs font-bold text-amber-600 bg-amber-200/60 dark:bg-amber-800/40 dark:text-amber-300 px-4 py-2 rounded-lg hover:bg-amber-300/60 transition-colors"
                  >
                    📋 Copiar código
                  </button>
                </div>
              ) : (
                <p className="text-gray-500 text-sm whitespace-pre-line">{walletMsg}</p>
              );
            })()}
            
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">También te lo enviamos por WhatsApp 📲</p>
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

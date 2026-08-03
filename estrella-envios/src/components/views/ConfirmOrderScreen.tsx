import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, MapPin, Navigation, Tag, Wallet, Box,
  X, Check, Loader2, ArrowRight, MessageCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';

interface ConfirmOrderScreenProps {
  orderType: 'compra' | 'envio';
  deliveryData: any;
  compraData: any;
  h3Price: number;
  onBack: () => void;
  onConfirm: () => void;
  onChange: (field: string, value: any) => void;
  isProcessing: boolean;
  // Navigate back to specific steps
  onEditOrigin: () => void;
  onEditDestination: () => void;
  // OTP props (passed from parent)
  showOtpModal: boolean;
  otpStep: 'phone' | 'code';
  otpPhone: string;
  otpCode: string;
  isOtpLoading: boolean;
  onSetOtpPhone: (v: string) => void;
  onSetOtpCode: (v: string) => void;
  onRequestOtp: () => void;
  onVerifyAndCreate: () => void;
  onCloseOtp: () => void;
  onBackOtpStep: () => void;
}

const PACKAGE_SIZES = [
  { id: 'small',  title: 'Pequeño', desc: 'Cabe en una mochila'     },
  { id: 'medium', title: 'Mediano', desc: 'Caja mediana / 2 bolsas' },
];

type PromoStatus = 'idle' | 'loading' | 'valid' | 'invalid';

export function ConfirmOrderScreen({
  orderType, deliveryData, compraData, h3Price,
  onBack, onConfirm, onChange, isProcessing,
  onEditOrigin, onEditDestination,
  showOtpModal, otpStep, otpPhone, otpCode, isOtpLoading,
  onSetOtpPhone, onSetOtpCode, onRequestOtp, onVerifyAndCreate,
  onCloseOtp, onBackOtpStep,
}: ConfirmOrderScreenProps) {

  const [showPromoInput, setShowPromoInput] = useState(false);
  const [promoCode, setPromoCode]           = useState('');
  const [promoStatus, setPromoStatus]       = useState<PromoStatus>('idle');
  const [promoDiscount, setPromoDiscount]   = useState(0);
  const [promoLabel, setPromoLabel]         = useState('');

  const handleApplyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setPromoStatus('loading');
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('cupones_plataforma')
        .select('codigo, valor, tipo, descripcion, activo, uso_maximo, usos_actuales, fecha_fin')
        .eq('codigo', code).eq('activo', true).maybeSingle();
      if (error) throw error;
      if (!data) { setPromoStatus('invalid'); setPromoDiscount(0); setPromoLabel(''); return; }
      if (data.fecha_fin && data.fecha_fin < today) { setPromoStatus('invalid'); toast.error('Cupón expirado'); return; }
      if (data.uso_maximo !== null && data.usos_actuales >= data.uso_maximo) { setPromoStatus('invalid'); toast.error('Cupón sin usos disponibles'); return; }
      const base = h3Price;
      let discount = 0, label = '';
      if      (data.tipo === 'porcentaje')  { discount = Math.round(base * (data.valor / 100)); label = data.descripcion || `${data.valor}% off`; }
      else if (data.tipo === 'monto_fijo')  { discount = Math.min(Number(data.valor), base);    label = data.descripcion || `$${data.valor} off`; }
      else if (data.tipo === 'envio_fijo')  { discount = Math.max(0, base - Number(data.valor)); label = data.descripcion || `Envío a $${data.valor}`; }
      setPromoDiscount(discount); setPromoLabel(label); setPromoStatus('valid');
      toast.success('¡Cupón aplicado! 🎉');
    } catch { setPromoStatus('invalid'); }
  };

  const handleRemovePromo = () => {
    setPromoCode(''); setPromoDiscount(0); setPromoLabel('');
    setPromoStatus('idle'); setShowPromoInput(false);
  };

  const compraBudget = orderType === 'compra'
    ? (compraData.presupuesto?.includes('Más') ? 600 : compraData.presupuesto?.includes('500') ? 500 : compraData.presupuesto?.includes('300') ? 300 : 100)
    : 0;
  const deliveryFee  = h3Price;
  const total        = Math.max(0, deliveryFee - promoDiscount);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">

      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 px-8 md:px-12 h-14 flex items-center shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-700 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Atrás
        </button>
      </div>

      {/* Body — 2 cols on desktop */}
      <div className="flex-1 overflow-y-auto px-8 md:px-12 py-10">
        <div className="max-w-5xl w-full mx-auto grid grid-cols-1 md:grid-cols-[1fr_320px] gap-8">

          {/* ── Left col: details ── */}
          <div className="space-y-6">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Confirmar</p>
              <h2 className="text-3xl font-black text-gray-900">Revisa tu pedido</h2>
            </div>

            {/* Route */}
            <div className="border border-gray-100 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Ruta</p>
              </div>

              <div className="px-5 py-5">
                {/* Timeline */}
                <div className="relative pl-8">
                  {/* Vertical connector */}
                  <div className="absolute left-[7px] top-3 bottom-3 w-px border-l-2 border-dashed border-gray-200" />

                  {/* Stop 1 — Recolección */}
                  <div className="relative mb-6">
                    <div className="absolute -left-8 top-1.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white ring-2 ring-emerald-100" />
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                        {orderType === 'compra' ? 'Lista de compra' : 'Recolección'}
                      </p>
                      <button
                        onClick={onEditOrigin}
                        className="text-[10px] font-bold text-gray-400 hover:text-gray-700 border border-gray-200 hover:border-gray-400 rounded-full px-2 py-0.5 transition-colors leading-none"
                      >
                        Editar
                      </button>
                    </div>
                    {orderType === 'compra' ? (
                      <>
                        <p className="text-sm font-bold text-gray-900">{compraData.categoria.toUpperCase()}</p>
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{compraData.lista}</p>
                        <p className="text-xs text-gray-500 mt-1 font-semibold">Presupuesto: {compraData.presupuesto}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-gray-900">{deliveryData.originName || '—'}</p>
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{deliveryData.origin}</p>
                        {deliveryData.originPhone && (
                          <p className="text-xs text-gray-500 mt-0.5">{deliveryData.originPhone}</p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Stop 2 — Entrega */}
                  <div className="relative">
                    <div className="absolute -left-8 top-1.5 w-3.5 h-3.5 rounded-full bg-yellow-400 border-2 border-white ring-2 ring-yellow-100" />
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest">Entrega</p>
                      <button
                        onClick={onEditDestination}
                        className="text-[10px] font-bold text-gray-400 hover:text-gray-700 border border-gray-200 hover:border-gray-400 rounded-full px-2 py-0.5 transition-colors leading-none"
                      >
                        Editar
                      </button>
                    </div>
                    <p className="text-sm font-bold text-gray-900">{deliveryData.recipientName || '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{deliveryData.destination}</p>
                    {deliveryData.recipientPhone && (
                      <p className="text-xs text-gray-500 mt-0.5">{deliveryData.recipientPhone}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Package size (envio only) */}
            {orderType === 'envio' && (
              <div className="border border-gray-100 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tamaño del paquete</p>
                </div>
                <div className="grid grid-cols-2 gap-px bg-gray-100">
                  {PACKAGE_SIZES.map(size => {
                    const selected = deliveryData.packageSize === size.id;
                    return (
                      <button
                        key={size.id}
                        onClick={() => onChange('packageSize', size.id)}
                        className={`bg-white p-5 text-left flex items-center gap-4 transition-colors ${selected ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}
                      >
                        <Box className={`w-6 h-6 shrink-0 ${selected ? 'text-yellow-500' : 'text-gray-300'}`} />
                        <div>
                          <p className={`text-sm font-bold ${selected ? 'text-gray-900' : 'text-gray-600'}`}>{size.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{size.desc}</p>
                        </div>
                        {selected && <Check className="w-4 h-4 text-yellow-500 ml-auto shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                <div className="px-5 py-4 border-t border-gray-100">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Detalles (opcional)</label>
                  <input
                    type="text"
                    value={deliveryData.description}
                    onChange={(e) => onChange('description', e.target.value)}
                    placeholder="Ej. Llaves, mochila negra..."
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none transition-all"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Right col: price + confirm ── */}
          <div className="space-y-4">
            <div className="border border-gray-100 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Resumen de pago</p>
              </div>

              <div className="p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Tarifa de envío</span>
                  <span className="text-sm font-bold text-gray-900">{deliveryFee > 0 ? `$${deliveryFee}.00` : '—'}</span>
                </div>
                {orderType === 'compra' && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Presupuesto compra</span>
                    <span className="text-sm font-bold text-gray-900">~${compraBudget}.00</span>
                  </div>
                )}
                {promoStatus === 'valid' && (
                  <div className="flex justify-between items-center text-emerald-600">
                    <span className="text-sm font-semibold flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" /> {promoLabel}
                    </span>
                    <span className="text-sm font-bold">-${promoDiscount}.00</span>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Wallet className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-gray-400">Pago en efectivo</span>
                </div>
              </div>

              <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-900">Total a pagar</span>
                  <span className="text-xl font-black text-gray-900">{total > 0 ? `$${total}.00` : '—'}</span>
                </div>
              </div>
            </div>

            {/* Promo code */}
            <div>
              <AnimatePresence mode="wait">
                {promoStatus === 'valid' ? (
                  <motion.div key="applied" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-xs font-bold text-emerald-800">{promoCode.toUpperCase()}</span>
                      <span className="text-xs text-emerald-600">· {promoLabel}</span>
                    </div>
                    <button onClick={handleRemovePromo} className="text-emerald-500 hover:text-emerald-700 p-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                ) : showPromoInput ? (
                  <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="text" autoFocus
                        value={promoCode}
                        onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoStatus('idle'); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                        placeholder="Código promo..."
                        className={`w-full px-3 py-2.5 rounded-xl border text-xs font-bold tracking-widest outline-none transition-all ${
                          promoStatus === 'invalid' ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 bg-gray-50 text-gray-900'
                        }`}
                      />
                      {promoStatus === 'invalid' && <p className="absolute -bottom-4 left-1 text-[10px] text-red-500 font-semibold">Cupón inválido</p>}
                    </div>
                    <button onClick={handleApplyPromo} disabled={promoStatus === 'loading' || !promoCode.trim()}
                      className="px-3 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold disabled:opacity-40 transition-all active:scale-95 flex items-center gap-1">
                      {promoStatus === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Aplicar'}
                    </button>
                    <button onClick={() => { setShowPromoInput(false); setPromoStatus('idle'); setPromoCode(''); }}
                      className="p-2.5 text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                ) : (
                  <button onClick={() => setShowPromoInput(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-700 transition-colors mt-1">
                    <Tag className="w-3.5 h-3.5" /> Tengo un código promo
                  </button>
                )}
              </AnimatePresence>
            </div>

            {/* Confirm button */}
            <button
              onClick={onConfirm}
              disabled={isProcessing || total === 0}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm py-4 rounded-xl flex items-center justify-between px-5 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>{isProcessing ? 'Procesando…' : total === 0 ? 'Calculando…' : 'Confirmar pedido'}</span>
              {!isProcessing && total > 0 && (
                <span className="font-black text-base">${total}.00</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── OTP Modal ── */}
      <AnimatePresence>
        {showOtpModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="bg-white w-full max-w-sm rounded-2xl border border-gray-100 shadow-xl overflow-hidden"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-center">
                    <MessageCircle className="w-4 h-4 text-emerald-600" />
                  </div>
                  <span className="font-bold text-gray-900 text-sm">Validar por WhatsApp</span>
                </div>
                <button onClick={onCloseOtp} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6">
                {otpStep === 'phone' ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500">
                      Ingresa tu número de WhatsApp para confirmar el pedido. Te enviamos un código de 4 dígitos.
                    </p>
                    <input
                      type="tel"
                      placeholder="10 dígitos (Ej. 9671234567)"
                      value={otpPhone}
                      onChange={(e) => onSetOtpPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className="w-full text-center text-xl font-black tracking-widest px-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
                    />
                    <button
                      onClick={onRequestOtp}
                      disabled={otpPhone.length < 10 || isOtpLoading}
                      className="w-full bg-gray-900 text-white font-bold py-3.5 rounded-xl flex justify-center items-center gap-2 disabled:opacity-40 hover:bg-gray-800 transition-colors active:scale-95"
                    >
                      {isOtpLoading
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <><MessageCircle className="w-4 h-4" /> Enviar código</>
                      }
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500">
                      Código enviado a <span className="font-bold text-gray-900">{otpPhone}</span> por WhatsApp.
                    </p>
                    <input
                      type="tel"
                      placeholder="••••"
                      value={otpCode}
                      onChange={(e) => onSetOtpCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-full text-center text-4xl font-black tracking-[1em] pl-[1em] px-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
                    />
                    <button
                      onClick={onVerifyAndCreate}
                      disabled={otpCode.length < 4 || isOtpLoading}
                      className="w-full bg-yellow-400 text-gray-900 font-bold py-3.5 rounded-xl flex justify-center items-center gap-2 disabled:opacity-40 hover:bg-yellow-300 transition-colors active:scale-95"
                    >
                      {isOtpLoading
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <><Check className="w-4 h-4" /> Confirmar pedido</>
                      }
                    </button>
                    <button onClick={onBackOtpStep} className="w-full text-center text-sm text-gray-400 hover:text-gray-700 py-1 transition-colors">
                      Cambiar número
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

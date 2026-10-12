import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, Loader2, MessageCircle } from 'lucide-react';
import type { LoginChallenge } from '@/lib/customer-loyalty';

interface Props {
  challenge: LoginChallenge | null;
  phone: string;
  code: string;
  busy: boolean;
  error: string;
  onCode: (value: string) => void;
  onVerify: () => void;
  onResend: () => void;
  onChangeNumber: () => void;
}
export function CustomerOtpCard({challenge,phone,code,busy,error,onCode,onVerify,onResend,onChangeNumber}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [now,setNow] = useState(Date.now());
  useEffect(() => {
    input.current?.focus();
    const timer = window.setInterval(() => setNow(Date.now()),1000);
    return () => window.clearInterval(timer);
  },[challenge?.challengeId]);
  const remaining = Math.max(0,Math.ceil(((challenge?.expiresAt ?? 0)-now)/1000));
  const expired = remaining===0;
  // At most one resend per minute in the UI; server limits remain authoritative.
  const resendWait = Math.max(0,Math.ceil(((challenge?.expiresAt ?? 0)-240000-now)/1000));
  return (
    <section className="loyalty-auth-wrap" aria-labelledby="loyalty-otp-title">
      <div className="loyalty-entry-card loyalty-auth-card">
        <span className="loyalty-auth-mark"><MessageCircle size={24} aria-hidden="true" /></span>
        <div className="loyalty-entry-card-heading">
          <h1 id="loyalty-otp-title">Revisa tu WhatsApp</h1>
          <p>Enviamos un código al <strong>+52 {phone.replace(/(\d{3})(\d{3})(\d{4})/,'$1 $2 $3')}</strong>. Escríbelo aquí para consultar tus beneficios.</p>
        </div>
        <form className="loyalty-entry-form" onSubmit={event => {event.preventDefault(); onVerify();}} aria-busy={busy}>
          <label htmlFor="loyalty-login-code">Código de 6 dígitos</label>
          <input id="loyalty-login-code" ref={input} className="loyalty-otp-input" type="text" inputMode="numeric"
            autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code}
            onChange={event => onCode(event.target.value.replace(/\D/g,'').slice(0,6))} disabled={busy}
            aria-describedby="loyalty-code-help loyalty-code-error" aria-invalid={!!error} />
          <p id="loyalty-code-help">{expired ? 'El código venció. Solicita uno nuevo para continuar.' : `Vence en ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}. No lo compartas.`}</p>
          {error && <p className="loyalty-access-error" id="loyalty-code-error" role="alert">{error}</p>}
          <button type="submit" disabled={busy || expired || code.length!==6}>
            {busy ? 'Verificando tu acceso…' : 'Ver mi tarjeta'}
            {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
          </button>
        </form>
        <div className="loyalty-auth-actions">
          <button type="button" onClick={onResend} disabled={busy || resendWait>0}>
            {resendWait>0 ? `Puedes reenviar en ${resendWait}s` : 'Enviar un código nuevo'}
          </button>
          <button type="button" onClick={onChangeNumber} disabled={busy}><ChevronLeft size={16} aria-hidden="true" /> Cambiar número</button>
        </div>
      </div>
    </section>
  );
}

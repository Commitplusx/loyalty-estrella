// ══════════════════════════════════════════════════════════════════
// PinEntry — componente de 4 cajas de dígito estilo OTP
// ══════════════════════════════════════════════════════════════════
import { useRef, useState, useEffect, KeyboardEvent, ClipboardEvent } from 'react';

interface PinEntryProps {
  length?: number;
  onComplete: (pin: string) => void;
  disabled?: boolean;
  error?: boolean;
}

export function PinEntry({ length = 4, onComplete, disabled = false, error = false }: PinEntryProps) {
  const [digits, setDigits] = useState<string[]>(Array(length).fill(''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  // Limpiar cuando hay error
  useEffect(() => {
    if (error) {
      setDigits(Array(length).fill(''));
      refs.current[0]?.focus();
    }
  }, [error, length]);

  const handleChange = (index: number, value: string) => {
    // Solo aceptar un dígito numérico
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    if (digit && index < length - 1) {
      refs.current[index + 1]?.focus();
    }

    // Disparar onComplete cuando todos estén llenos
    if (newDigits.every(d => d !== '') && digit) {
      onComplete(newDigits.join(''));
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const newDigits = [...digits];
        newDigits[index] = '';
        setDigits(newDigits);
      } else if (index > 0) {
        refs.current[index - 1]?.focus();
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    const newDigits = Array(length).fill('');
    pasted.split('').forEach((ch, i) => { newDigits[i] = ch; });
    setDigits(newDigits);
    const lastFilled = Math.min(pasted.length, length) - 1;
    refs.current[lastFilled]?.focus();
    if (newDigits.every(d => d !== '')) {
      onComplete(newDigits.join(''));
    }
  };

  return (
    <div className="flex gap-3 justify-center">
      {Array(length).fill(null).map((_, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="tel"
          inputMode="numeric"
          maxLength={1}
          value={digits[i]}
          disabled={disabled}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
          className={`
            w-14 h-16 text-center text-2xl font-black rounded-2xl border-2 
            bg-white dark:bg-gray-800 text-gray-900 dark:text-white
            transition-all duration-200 outline-none
            ${error
              ? 'border-red-400 bg-red-50 dark:bg-red-900/20 animate-shake'
              : digits[i]
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md shadow-blue-500/20'
              : 'border-gray-200 dark:border-gray-700 focus:border-blue-400 focus:bg-blue-50/50 dark:focus:bg-blue-900/10'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        />
      ))}
    </div>
  );
}

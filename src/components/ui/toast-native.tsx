import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextType {
  toast: {
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
    warning: (title: string, message?: string) => void;
    info: (title: string, message?: string) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Hook for custom components
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};

// Global toast object to mimic sonner's export
let globalToastAdd: ((type: ToastType, title: string, message?: string) => void) | null = null;

export const toast = {
  success: (title: string, message?: string) => globalToastAdd?.('success', title, message),
  error: (title: string, message?: string) => globalToastAdd?.('error', title, message),
  warning: (title: string, message?: string) => globalToastAdd?.('warning', title, message),
  info: (title: string, message?: string) => globalToastAdd?.('info', title, message),
};

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; icon: string; bar: string }> = {
  success: { bg: 'bg-white', border: 'border-l-emerald-500', icon: 'bg-emerald-50 text-emerald-500', bar: 'bg-emerald-500' },
  error: { bg: 'bg-white', border: 'border-l-red-500', icon: 'bg-red-50 text-red-500', bar: 'bg-red-500' },
  warning: { bg: 'bg-white', border: 'border-l-amber-500', icon: 'bg-amber-50 text-amber-500', bar: 'bg-amber-500' },
  info: { bg: 'bg-white', border: 'border-l-blue-500', icon: 'bg-blue-50 text-blue-500', bar: 'bg-blue-500' },
};

const TOAST_ICONS: Record<ToastType, React.FC<{ className?: string }>> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

const DURATION = 4200;

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [{ id, type, title, message }, ...prev]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DURATION);
  }, []);

  // Bind to global toast for non-component usage
  React.useEffect(() => {
    globalToastAdd = addToast;
    return () => { globalToastAdd = null; };
  }, [addToast]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toastMethods = {
    success: (title: string, message?: string) => addToast('success', title, message),
    error: (title: string, message?: string) => addToast('error', title, message),
    warning: (title: string, message?: string) => addToast('warning', title, message),
    info: (title: string, message?: string) => addToast('info', title, message),
  };

  return (
    <ToastContext.Provider value={{ toast: toastMethods }}>
      {children}
      <div className="fixed top-4 left-0 right-0 z-[200] flex flex-col items-center gap-2 px-4 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => {
            const colors = TOAST_COLORS[t.type];
            const Icon = TOAST_ICONS[t.type];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -20, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.92, transition: { duration: 0.22 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                className={`pointer-events-auto w-full max-w-sm ${colors.bg} rounded-2xl shadow-xl border-l-4 ${colors.border} overflow-hidden cursor-pointer select-none`}
                onClick={() => removeToast(t.id)}
                whileTap={{ scale: 0.97 }}
              >
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colors.icon}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 leading-tight">{t.title}</p>
                    {t.message && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{t.message}</p>}
                  </div>
                </div>
                <div className="h-0.5 bg-gray-100 w-full">
                  <motion.div initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: DURATION / 1000, ease: 'linear' }} className={`h-full ${colors.bar} rounded-full`} />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

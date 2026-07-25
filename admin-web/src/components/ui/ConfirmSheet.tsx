import { BottomSheet } from './BottomSheet';

interface ConfirmSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export function ConfirmSheet({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  isDestructive = false
}: ConfirmSheetProps) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="text-center sm:text-left mt-2 sm:mt-0">
        <h3 className="text-xl font-black text-zinc-900 tracking-tight">{title}</h3>
        <p className="text-sm text-zinc-500 mt-2 leading-relaxed">{description}</p>
        
        <div className="mt-8 flex flex-col sm:flex-row-reverse gap-3">
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`w-full sm:w-auto px-6 py-3.5 rounded-xl font-bold transition-all active:scale-95 ${
              isDestructive 
                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-sm shadow-rose-500/20' 
                : 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm'
            }`}
          >
            {confirmText}
          </button>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-bold bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-all active:scale-95"
          >
            {cancelText}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export function BottomSheet({ isOpen, onClose, children, className }: BottomSheetProps) {
  // Prevent scrolling on body when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          />

          {/* Sheet/Modal Container */}
          <div className="fixed inset-0 z-50 pointer-events-none flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ y: '100%', opacity: 1, scale: 1 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: '100%', opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100 || info.velocity.y > 500) {
                  onClose();
                }
              }}
              className={cn(
                "w-full sm:max-w-md pointer-events-auto bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col",
                "max-h-[90vh] sm:max-h-[85vh]",
                className
              )}
            >
              {/* Drag Handle (Mobile only) */}
              <div className="w-full flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-12 h-1.5 bg-zinc-200 rounded-full" />
              </div>

              {/* Close Button (Desktop overlay) */}
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-500 rounded-full transition-colors hidden sm:block z-10"
              >
                <X size={16} />
              </button>

              {/* Content */}
              <div className="overflow-y-auto overscroll-contain custom-scrollbar px-6 pb-8 pt-4 sm:pt-6">
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

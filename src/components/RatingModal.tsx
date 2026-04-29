import { useState } from 'react';
import { motion } from 'framer-motion';
import { Star, Send, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { submitRating } from '@/lib/supabase';
import { toast } from '@/components/ui/toast-native';

interface RatingModalProps {
  registroId: string;
  onClose: () => void;
}

export function RatingModal({ registroId, onClose }: RatingModalProps) {
  // Bug #2 fix: separate confirmed `rating` from `hovered` state
  // so that hovering over stars after clicking doesn't overwrite the selection.
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const displayRating = hovered || rating;

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error('Por favor selecciona una calificación');
      return;
    }

    setIsSubmitting(true);
    // Bug #5 fix: only pass `comentario` if it's non-empty
    const success = await submitRating(
      registroId,
      rating,
      comment.trim() || undefined
    );
    setIsSubmitting(false);

    if (success) {
      toast.success('¡Gracias por tu comentario!');
      onClose();
    } else {
      toast.error('Ocurrió un error al enviar tu calificación');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl"
      >
        <div className="bg-gradient-to-br from-orange-500 to-amber-500 p-6 text-white text-center relative">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Cerrar"
            className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Star className="w-10 h-10 text-white fill-white" />
          </div>
          <h2 className="text-2xl font-bold">¿Qué te pareció?</h2>
          <p className="text-orange-50 text-sm mt-1">Califica tu pedido de hoy</p>
        </div>

        <div className="p-8 space-y-6">
          {/* Bug #2 fix: use separate hover/rating states */}
          <div
            className="flex justify-center gap-2"
            onMouseLeave={() => setHovered(0)}
          >
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                disabled={isSubmitting}
                onMouseEnter={() => setHovered(s)}
                onClick={() => setRating(s)}
                className="p-1 transition-transform active:scale-90 disabled:opacity-50"
              >
                <Star
                  className={`w-10 h-10 transition-colors ${
                    s <= displayRating
                      ? 'text-amber-500 fill-amber-500'
                      : 'text-gray-200'
                  }`}
                />
              </button>
            ))}
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={isSubmitting}
            placeholder="¿Algún comentario adicional? (opcional)"
            className="w-full min-h-[100px] bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-orange-500 transition-all resize-none disabled:opacity-50"
          />

          {/* Bug #9 fix: add Loader2 spinner during isSubmitting */}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || rating === 0}
            className="w-full h-14 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-2xl shadow-lg shadow-orange-200"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                Enviar Comentario
                <Send className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

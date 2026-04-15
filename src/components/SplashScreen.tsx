import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star } from 'lucide-react';

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    // Keep splash on screen for 4.8 segundos before fading out (1800 + 3000)
    const timer = setTimeout(() => {
      setShow(false);
      setTimeout(onComplete, 500); // 500ms for exit animation
    }, 4800);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background"
        >
          {/* Logo container animated */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center"
          >
            <div className="relative mb-6">
              {/* Glowing animated background */}
              <motion.div
                animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-0 bg-amber-500 blur-2xl rounded-full"
              />
              <div className="relative w-32 h-32 rounded-[2.5rem] bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shadow-2xl shadow-orange-500/50 border border-orange-400/30 overflow-visible">
                
                {/* Reverse spinning ghostly star */}
                <motion.div
                  className="absolute flex items-center justify-center"
                  animate={{ rotate: -360, scale: [0.9, 1.2, 0.9] }}
                  transition={{ 
                    rotate: { duration: 8, repeat: Infinity, ease: "linear" },
                    scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
                  }}
                >
                  <Star className="w-20 h-20 text-white/40 fill-white/20 blur-[2px]" />
                </motion.div>

                {/* Main bouncing and spinning star */}
                <motion.div
                  className="absolute flex items-center justify-center"
                  animate={{ 
                    rotate: 360,
                    scale: [1, 1.15, 1],
                    y: [0, -8, 0]
                  }}
                  transition={{ 
                    rotate: { duration: 6, repeat: Infinity, ease: "linear" },
                    scale: { duration: 1, repeat: Infinity, ease: "easeInOut" },
                    y: { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
                  }}
                >
                  <Star className="w-16 h-16 text-white fill-white drop-shadow-md" />
                </motion.div>

                {/* Sparkle 1 */}
                <motion.div
                  animate={{ scale: [1, 1.8, 1], opacity: [0, 1, 0], rotate: 180 }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                  className="absolute -top-3 -right-2"
                >
                  <Star className="w-6 h-6 text-yellow-200 fill-yellow-200 drop-shadow-lg" />
                </motion.div>
                
                {/* Sparkle 2 */}
                <motion.div
                  animate={{ scale: [0.5, 1.5, 0.5], opacity: [0, 1, 0], rotate: -90 }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.8 }}
                  className="absolute -bottom-2 -left-3"
                >
                  <Star className="w-5 h-5 text-white fill-white drop-shadow-lg" />
                </motion.div>

                {/* Sparkle 3 */}
                <motion.div
                  animate={{ scale: [0.8, 1.3, 0.8], opacity: [0, 0.8, 0], rotate: 45 }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: 1.5 }}
                  className="absolute top-4 -left-4"
                >
                  <Star className="w-4 h-4 text-orange-200 fill-orange-200 drop-shadow-md" />
                </motion.div>
              </div>
            </div>
            
            <h1 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-2">
              Estrella <span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">Delivery</span>
            </h1>
            
            {/* Loading dots */}
            <div className="flex gap-1.5 mt-4">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                  className="w-2.5 h-2.5 rounded-full bg-orange-400"
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

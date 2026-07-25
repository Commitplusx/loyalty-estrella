import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

const ALARM_THRESHOLD_MINUTES = 45;

export function useOrderAlarms() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Play Sonar Ping using Web Audio API
  const playSonarPing = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // High pitch (A5)
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5); // Drop to A4

      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 1);
    } catch (e) {
      console.warn("AudioContext not supported or blocked by browser policies.");
    }
  };

  useEffect(() => {
    // Check every 10 seconds for orders exceeding the threshold
    intervalRef.current = setInterval(() => {
      const currentPedidos = useAppStore.getState().pedidos;
      const now = Date.now();
      const hasCriticalOrders = currentPedidos.some(pedido => {
        if (pedido.estado === 'entregado' || pedido.estado === 'cancelado') return false;
        
        const createdTime = new Date(pedido.created_at).getTime();
        const diffMinutes = (now - createdTime) / (1000 * 60);
        
        return diffMinutes > ALARM_THRESHOLD_MINUTES;
      });

      if (hasCriticalOrders) {
        playSonarPing();
      }
    }, 10000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);
}

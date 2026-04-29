import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ToastProvider } from '@/components/ui/toast-native';
import { Home } from '@/pages/Home';
import { ClienteView } from '@/pages/client/ClienteView';
import { PedidoView } from '@/pages/PedidoView';
import { Terminos } from '@/pages/Terminos';
import { FlashBanner } from '@/components/FlashBanner';
import { SplashScreen } from '@/components/SplashScreen';
import { useDarkMode } from '@/hooks/useDarkMode';
import './App.css';

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Home />} />
        <Route path="/cliente" element={<ClienteView />} />
        <Route path="/clientes" element={<ClienteView />} />
        <Route path="/loyalty/:tel" element={<ClienteView />} />
        <Route path="/pedido/:id" element={<PedidoView />} />
        <Route path="/terminos" element={<Terminos />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('splashShown'));
  const { isDark } = useDarkMode();

  // Dynamic theme-color: iOS status bar color follows dark/light mode in real time
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#1e40af' : '#2563eb');
  }, [isDark]);

  const handleSplashComplete = () => {
    sessionStorage.setItem('splashShown', 'true');
    setShowSplash(false);
  };

  return (
    <ToastProvider>
      <BrowserRouter>
        {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
        <FlashBanner />
        <AnimatedRoutes />
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Home } from '@/pages/Home';
import { ClienteView } from '@/pages/client/ClienteView';
import { Terminos } from '@/pages/Terminos';
import { Toaster } from '@/components/ui/sonner';
import { FlashBanner } from '@/components/FlashBanner';
import { AnimatePresence } from 'framer-motion';
import './App.css';

import { PedidoView } from '@/pages/PedidoView';

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Home />} />
        <Route path="/cliente" element={<ClienteView />} />
        <Route path="/pedido/:id" element={<PedidoView />} />
        <Route path="/terminos" element={<Terminos />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

import { useState } from 'react';
import { SplashScreen } from '@/components/SplashScreen';

function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <BrowserRouter>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      
      <FlashBanner />
      <AnimatedRoutes />
      <Toaster position="top-center" />
    </BrowserRouter>
  );
}

export default App;

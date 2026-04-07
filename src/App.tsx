import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Home } from '@/pages/Home';
import { ClienteView } from '@/pages/client/ClienteView';
import { Toaster } from '@/components/ui/sonner';
import { FlashBanner } from '@/components/FlashBanner';
import { AnimatePresence } from 'framer-motion';
import './App.css';

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Home />} />
        <Route path="/cliente" element={<ClienteView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <BrowserRouter>
      <FlashBanner />
      <AnimatedRoutes />
      <Toaster position="top-center" />
    </BrowserRouter>
  );
}

export default App;

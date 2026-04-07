import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from '@/pages/Home';
import { ClienteView } from '@/pages/client/ClienteView';
import { Toaster } from '@/components/ui/sonner';
import { FlashBanner } from '@/components/FlashBanner';
import './App.css';


function App() {
  return (
    <BrowserRouter>
      <FlashBanner />
      <Routes>
        {/* Ruta pública - Home */}
        <Route path="/" element={<Home />} />
        
        {/* Ruta de cliente */}
        <Route path="/cliente" element={<ClienteView />} />
        
        {/* Redirección por defecto a home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-center" />
    </BrowserRouter>
  );
}

export default App;

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useAppStore } from './store/useAppStore';

import { Login } from './pages/Login';
import { MainShell } from './pages/MainShell';
import { TrackerPage } from './pages/TrackerPage';

export default function App() {
  const { user, setUser } = useAppStore();

  useEffect(() => {
    // Sesión inicializada por Supabase automáticamente
  }, [setUser]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Ruta de Tracking en Tiempo Real (Pública para WhatsApp y clientes) */}
        <Route path="/tracker" element={<TrackerPage />} />
        
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={user ? <MainShell /> : <Navigate to="/login" replace />} />
        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

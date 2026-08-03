import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { useAppStore } from './store/useAppStore';
import { Loader2 } from 'lucide-react';

import { Login } from './pages/Login';
import { MainShell } from './pages/MainShell';
import { TrackerPage } from './pages/TrackerPage';

export default function App() {
  const { user, setUser } = useAppStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, [setUser]);

  if (loading) {
    return (
      <div className="w-full h-[100dvh] bg-gray-100 flex justify-center items-center font-sans overflow-hidden sm:p-4">
        <div className="w-full h-full sm:max-w-[400px] bg-white sm:rounded-[2.5rem] shadow-2xl flex items-center justify-center border-0 sm:border-8 border-gray-900">
           <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
        </div>
      </div>
    );
  }

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

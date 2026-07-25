import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AdminLayout } from './components/layout/AdminLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Pedidos } from './pages/Pedidos';
import { Repartidores } from './pages/Repartidores';
import { Aliados } from './pages/Aliados';
import { Ajustes } from './pages/Ajustes';
import { Zonas } from './pages/Zonas';
import { useAuthStore } from './store/useAuthStore';
import { Finanzas } from './pages/Finanzas';
import { Clientes } from './pages/Clientes';
import { ClienteDetail } from './pages/ClienteDetail';
import { AliadoDetail } from './pages/AliadoDetail';
import { RepartidorDetail } from './pages/RepartidorDetail';
import { Marketing } from './pages/Marketing';
import { Monitor } from './pages/Monitor';

// Wrapper para proteger rutas
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Rutas Protegidas */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="pedidos" element={<Pedidos />} />
          <Route path="repartidores" element={<Repartidores />} />
          <Route path="repartidores/:id" element={<RepartidorDetail />} />
          <Route path="finanzas" element={<Finanzas />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="clientes/:id" element={<ClienteDetail />} />
          <Route path="aliados" element={<Aliados />} />
          <Route path="aliados/:id" element={<AliadoDetail />} />
          <Route path="zonas" element={<Zonas />} />
          <Route path="monitor" element={<Monitor />} />
          <Route path="marketing" element={<Marketing />} />
          <Route path="ajustes" element={<Ajustes />} />
        </Route>
      </Routes>
      <Toaster position="top-right" richColors closeButton />
    </BrowserRouter>
  );
}

export default App;

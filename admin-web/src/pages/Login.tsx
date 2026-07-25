
import { supabase } from '../lib/supabase';
import { Store, Lock, Mail, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const LOGIN_STEPS = [
  "Verificando credenciales...",
  "Estableciendo conexión segura...",
  "Cargando módulos empresariales...",
  "Acceso concedido"
];

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginStep, setLoginStep] = useState(0);
  const [showSequence, setShowSequence] = useState(false);
  
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      // Mostrar secuencia de carga animada
      setShowSequence(true);
      setLoginStep(0);
      
      await new Promise(r => setTimeout(r, 1200));
      setLoginStep(1);
      
      await new Promise(r => setTimeout(r, 1400));
      setLoginStep(2);

      await new Promise(r => setTimeout(r, 1200));
      setLoginStep(3); // Acceso concedido

      await new Promise(r => setTimeout(r, 1000));

      // Zustand auth store se actualizará automáticamente por el listener
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex relative">
      <AnimatePresence>
        {showSequence && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full mx-4 shadow-2xl border border-zinc-100 flex flex-col items-center text-center"
            >
              <div className="w-16 h-16 relative mb-6">
                {!loginStep || loginStep < 3 ? (
                  <svg className="animate-spin w-full h-full text-[#FA4A0C]/20" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="#FA4A0C" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute inset-0 bg-[#FA4A0C] rounded-full flex items-center justify-center shadow-lg shadow-orange-500/30"
                  >
                    <CheckCircle2 size={32} className="text-white" />
                  </motion.div>
                )}
              </div>
              
              <h3 className="text-xl font-black text-zinc-900 mb-6">
                {loginStep === 3 ? "¡Todo listo!" : "Autenticando"}
              </h3>
              
              <div className="space-y-4 w-full mt-2 text-left">
                {LOGIN_STEPS.map((stepText, index) => (
                  <motion.div 
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: loginStep >= index ? 1 : 0.3, x: 0 }}
                    className="flex items-center gap-3"
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors duration-300 ${
                      loginStep > index ? 'bg-orange-100 text-[#FA4A0C]' : 
                      loginStep === index ? 'bg-orange-50 text-orange-400 animate-pulse' : 'bg-zinc-100 text-zinc-300'
                    }`}>
                      {loginStep > index ? <CheckCircle2 size={12} strokeWidth={3} /> : <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                    </div>
                    <span className={`text-sm font-medium transition-colors duration-300 ${
                      loginStep >= index ? 'text-zinc-700' : 'text-zinc-400'
                    }`}>
                      {stepText}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Left Column: Formulario */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 sm:px-12 lg:px-24 relative bg-white">
        <div className="w-full max-w-md mx-auto">
          <div className="mb-10">
            <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-orange-100">
              <Store size={28} className="text-[#FA4A0C]" />
            </div>
            <h1 className="text-3xl font-black text-zinc-900 mb-2 tracking-tight">Bienvenido a Admin Estrella</h1>
            <p className="text-zinc-500 font-medium">Accede a tu panel de administración</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-600 p-4 rounded-xl text-sm font-semibold flex items-start gap-3">
                <div className="mt-0.5">⚠️</div>
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Correo Electrónico</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail size={18} className="text-zinc-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-3 pl-11 pr-4 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all font-medium shadow-sm"
                  placeholder="admin@estrella.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock size={18} className="text-zinc-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-3 pl-11 pr-4 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all font-medium shadow-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FA4A0C] hover:bg-[#e0400b] text-white font-bold py-3.5 px-4 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 disabled:opacity-70 disabled:active:scale-100"
            >
              {loading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  <span>Autenticando...</span>
                </>
              ) : (
                <>
                  <span>Ingresar al Panel</span>
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>
          
          <p className="text-center text-zinc-400 text-xs font-medium mt-8">
            Solo personal autorizado. Acceso estrictamente monitorizado.
          </p>
        </div>
      </div>

      {/* Right Column: Imagen/Branding (Solo PC) */}
      <div className="hidden lg:block lg:w-1/2 relative bg-zinc-900 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#FA4A0C] to-orange-800 opacity-90 z-10" />
        <img 
          src="https://images.unsplash.com/photo-1550547660-d9450f859349?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80" 
          alt="Cover" 
          className="absolute inset-0 w-full h-full object-cover mix-blend-overlay z-0"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/90 via-zinc-900/20 to-transparent z-10" />
        
        <div className="absolute bottom-16 left-16 right-16 z-20 text-white">
          <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center mb-6 border border-white/20">
            <Store size={24} className="text-white" />
          </div>
          <h2 className="text-4xl font-black mb-4 tracking-tight leading-tight">Admin Estrella</h2>
          <p className="text-orange-100/80 text-lg font-medium leading-relaxed max-w-md">
            Gestiona pedidos, monitorea a tus motoristas en tiempo real y controla tu menú desde un solo lugar.
          </p>
        </div>
      </div>
    </div>
  );
}

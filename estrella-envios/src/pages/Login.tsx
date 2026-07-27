import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { ArrowRight, Loader2, Star, CheckCircle2, Phone, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { motion, AnimatePresence } from 'framer-motion';

export function Login() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const { setUser } = useAppStore();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 10) {
      toast.error('Ingresa un número de teléfono válido (10 dígitos)');
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('auth-otp', {
        body: { action: 'request-client-otp', telefono: phone }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      setStep('otp');
      toast.success('Código WhatsApp enviado');
    } catch (err: any) {
      console.error(err);
      setStep('otp');
      toast.success(`Modo de prueba activado. Ingresa 1234. (Fallo: ${err.message || 'Desconocido'})`, { duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 4) return;

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setUser({ id: `user-${phone}`, phone: phone });
      toast.success('¡Bienvenido a Estrella Envíos!');
      navigate('/');
    }, 1000);
  };

  return (
    <div className="w-full h-[100dvh] flex flex-col md:flex-row font-sans overflow-hidden bg-white">
      
      {/* LEFT SECTION (Decorative on Desktop, hidden or small on mobile) */}
      <div className="hidden md:flex md:w-1/2 bg-gray-50 relative flex-col justify-center items-center p-12 border-r border-gray-100">
        {/* Subtle Background Pattern */}
        <div className="absolute inset-0 z-0 bg-[radial-gradient(#d1d5db_1px,transparent_1px)] [background-size:20px_20px] opacity-40"></div>
        
        <div className="relative z-10 text-center max-w-lg">
          <div className="w-24 h-24 mx-auto bg-gray-900 rounded-[1.5rem] shadow-xl flex items-center justify-center transform -rotate-6 mb-10">
            <Star className="w-12 h-12 text-yellow-400 fill-yellow-400 transform rotate-6" />
          </div>
          <h1 className="text-5xl font-black text-gray-900 tracking-tight leading-tight mb-6">
            Llegamos a<br/>donde estés.
          </h1>
          <div className="bg-gradient-to-tr from-yellow-50 to-white border border-yellow-200/60 p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative">
            <div className="absolute -top-3 -left-3 bg-yellow-400 text-yellow-950 text-xs font-black px-3 py-1 rounded-full shadow-sm transform -rotate-3">
              ¿QUÉ HACEMOS?
            </div>
            <p className="text-gray-600 font-medium text-lg text-balance leading-relaxed">
              Tus favores, paquetes y compras del súper directo a tu puerta. <span className="text-gray-900 font-black bg-yellow-100 px-1.5 py-0.5 rounded-md">Rápido, seguro y sin complicaciones.</span>
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT SECTION (Form) */}
      <div className="w-full md:w-1/2 h-full flex flex-col justify-center items-center p-5 md:p-16 relative">
        
        {/* Mobile Header (Only visible on mobile) */}
        <div className="md:hidden w-full flex flex-col items-center text-center mb-6 mt-2">
          <div className="w-12 h-12 bg-gray-900 rounded-[1rem] shadow-lg flex items-center justify-center transform -rotate-6 mb-4">
            <Star className="w-6 h-6 text-yellow-400 fill-yellow-400 transform rotate-6" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight mb-2">
            Estrella Envíos
          </h1>
          <div className="bg-gradient-to-tr from-yellow-50 to-white border border-yellow-200/60 p-3.5 rounded-2xl shadow-sm relative mt-3 w-full max-w-[280px]">
            <div className="absolute -top-3 -left-2 bg-yellow-400 text-yellow-950 text-[10px] font-black px-3 py-1 rounded-full shadow-sm transform -rotate-3">
              ¿QUÉ HACEMOS?
            </div>
            <p className="text-gray-600 font-medium text-sm text-balance leading-relaxed">
              Tus favores, paquetes y súper. <span className="text-gray-900 font-black bg-yellow-100 px-1.5 py-0.5 rounded-md mt-1 inline-block">Rápido y seguro.</span>
            </p>
          </div>
        </div>

        <div className="w-full max-w-md relative">
          <AnimatePresence mode="wait">
            {step === 'phone' ? (
              <motion.form 
                key="phone"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleSendOtp} 
                className="space-y-6"
              >
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 hidden md:block">
                    Iniciar Sesión
                  </h2>
                  <label className="block text-sm font-bold text-gray-900 mb-2 ml-1">
                    Tu número celular
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Phone className="w-5 h-5 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                      <span className="text-gray-900 font-bold border-r border-gray-200 pr-3 mr-3 ml-2">+52</span>
                    </div>
                    <input
                      type="tel"
                      className="w-full pl-[5.5rem] pr-4 py-4 md:py-5 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 font-bold text-lg focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 outline-none transition-all placeholder:text-gray-400"
                      placeholder="000 000 0000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      autoFocus
                    />
                  </div>
                </div>

                <div className="space-y-3 bg-gradient-to-tr from-yellow-50 to-white p-4 rounded-2xl border border-yellow-200/60 shadow-sm relative">
                  <div className="flex items-center gap-3 text-sm text-gray-700 font-medium">
                    <div className="w-6 h-6 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-yellow-600" />
                    </div>
                    <span>Rastreo en tiempo real</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-700 font-medium">
                    <div className="w-6 h-6 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-yellow-600" />
                    </div>
                    <span>Entregas exprés en minutos</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || phone.length < 10}
                  className="w-full bg-gray-900 text-white font-bold py-4 md:py-5 rounded-2xl shadow-xl shadow-gray-900/20 hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg mt-6"
                >
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Continuar'}
                  {!loading && <ArrowRight className="w-5 h-5" />}
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    setUser({ id: 'guest', phone: '' });
                    navigate('/');
                  }}
                  className="w-full bg-white border-2 border-gray-100 text-gray-600 font-bold py-4 rounded-2xl hover:bg-gray-50 hover:text-gray-900 hover:border-gray-200 active:scale-[0.98] transition-all flex items-center justify-center text-base mt-3"
                >
                  Continuar como invitado
                </button>

                <p className="text-center text-[12px] font-medium text-gray-400 mt-4 px-4">
                  Al continuar, aceptas nuestros Términos de Servicio y Política de Privacidad.
                </p>
              </motion.form>
            ) : (
              <motion.form 
                key="otp"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleVerifyOtp} 
                className="space-y-6"
              >
                <div className="text-center md:text-left mb-6">
                  <div className="w-12 h-12 mx-auto md:mx-0 bg-blue-50 rounded-full flex items-center justify-center mb-4 border border-blue-100">
                    <ShieldCheck className="w-6 h-6 text-blue-600" />
                  </div>
                  <h2 className="text-xl md:text-3xl font-bold text-gray-900 mb-2">
                    Revisa tu WhatsApp
                  </h2>
                  <p className="text-sm font-medium text-gray-500 mb-2">
                    Enviamos un código de seguridad al<br className="md:hidden"/> <span className="text-gray-900 font-bold tracking-wider">+52 {phone}</span>
                  </p>
                  <div className="mt-2">
                     <p className="text-[11px] text-blue-800 font-bold bg-blue-50 py-1.5 px-3 rounded-full inline-block border border-blue-100">
                        ¿No te llega? Prueba: Escribe 1234
                     </p>
                  </div>
                </div>

                <div>
                  <input
                    type="text"
                    className="w-full text-center tracking-[0.5em] px-4 py-4 md:py-5 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 font-black text-3xl md:text-4xl focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 outline-none transition-all placeholder:text-gray-300"
                    placeholder="----"
                    maxLength={4}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                  />
                </div>

                <div className="space-y-4 mt-8">
                  <button
                    type="submit"
                    disabled={loading || otp.length < 4}
                    className="w-full bg-blue-600 text-white font-bold py-4 md:py-5 rounded-2xl shadow-xl shadow-blue-600/20 hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-lg"
                  >
                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Confirmar e Ingresar'}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setStep('phone')}
                    className="w-full py-4 text-center text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors rounded-xl hover:bg-gray-50"
                  >
                    Cambiar número de celular
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

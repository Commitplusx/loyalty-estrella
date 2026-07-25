import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { Package, Smartphone, ArrowRight, Loader2, Star, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Login() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 10) {
      toast.error('Ingresa un número de teléfono válido (10 dígitos)');
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: `+52${phone}`,
      });
      if (error) throw error;
      
      setStep('otp');
      toast.success('Código SMS enviado');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error al enviar código SMS');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: `+52${phone}`,
        token: otp,
        type: 'sms',
      });
      
      if (error) throw error;
      toast.success('¡Bienvenido a Estrella Envíos!');
      navigate('/');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Código incorrecto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-[100dvh] bg-gray-50 flex font-sans overflow-hidden">
      <div className="w-full h-full bg-white relative flex flex-col md:flex-row shadow-2xl">
        
        {/* Background Decorative */}
        <div className="absolute inset-0 z-0 bg-gray-50 flex flex-col justify-between overflow-hidden">
          <div className="absolute -top-32 -right-32 w-80 h-80 md:w-[500px] md:h-[500px] bg-gradient-to-br from-yellow-100 to-yellow-200 rounded-full opacity-60"></div>
          <div className="absolute -bottom-32 -left-32 w-80 h-80 md:w-[500px] md:h-[500px] bg-gradient-to-tr from-blue-100 to-blue-200 rounded-full opacity-60"></div>
        </div>

        <div className="md:w-1/2 flex flex-col justify-center items-center relative z-10 p-8 md:p-16 text-center">
          <div className="w-20 h-20 md:w-32 md:h-32 bg-gradient-to-tr from-gray-900 to-gray-800 rounded-[1.5rem] md:rounded-[2.5rem] shadow-xl flex items-center justify-center transform -rotate-6 mb-8 md:mb-12">
            <Star className="w-10 h-10 md:w-16 md:h-16 text-yellow-400 fill-yellow-400 transform rotate-6" />
          </div>
          
          <h1 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight leading-tight mb-4">
            Bienvenido a<br />Estrella Envíos
          </h1>
          <p className="text-gray-500 font-medium text-sm md:text-lg max-w-sm">
            Tus favores, paquetes y compras, directo a tu puerta en minutos.
          </p>
        </div>

        <div className="md:w-1/2 bg-white rounded-t-3xl md:rounded-none md:rounded-l-3xl px-6 md:px-16 pt-8 md:pt-16 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] md:shadow-[-10px_0_40px_rgba(0,0,0,0.05)] flex flex-col z-20 justify-center">
          <div className="max-w-md w-full mx-auto flex flex-col h-full md:justify-center">
            
            {step === 'phone' ? (
              <form onSubmit={handleSendOtp} className="flex-1 flex flex-col">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      Tu número celular
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <span className="text-gray-500 font-bold border-r border-gray-200 pr-3 mr-3">+52</span>
                      </div>
                      <input
                        type="tel"
                        className="w-full pl-[4.5rem] pr-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 font-bold text-lg focus:bg-white focus:border-yellow-400 focus:ring-4 focus:ring-yellow-50 outline-none transition-all shadow-sm"
                        placeholder="000 000 0000"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <span>Rastreo en tiempo real</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <span>Entregas exprés en minutos</span>
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-6">
                  <button
                    type="submit"
                    disabled={loading || phone.length < 10}
                    className="w-full bg-gray-900 text-white font-bold py-4 rounded-2xl shadow-xl hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
                  >
                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Continuar'}
                    {!loading && <ArrowRight className="w-5 h-5" />}
                  </button>
                  <p className="text-center text-[11px] font-medium text-gray-400 mt-4">
                    Al continuar, aceptas nuestros Términos y Política de Privacidad.
                  </p>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="flex-1 flex flex-col">
                <div className="space-y-6 flex-1 flex flex-col justify-center pb-12">
                  <div className="text-center">
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      Código de verificación
                    </label>
                    <p className="text-xs font-medium text-gray-500 mb-6">
                      Enviamos un SMS al +52 {phone}
                    </p>
                    <input
                      type="text"
                      className="w-full text-center tracking-[0.5em] px-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-gray-900 font-black text-2xl focus:bg-white focus:border-yellow-400 focus:ring-4 focus:ring-yellow-50 outline-none transition-all shadow-sm"
                      placeholder="------"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      autoFocus
                    />
                  </div>
                </div>

                <div className="mt-auto pt-6 space-y-4">
                  <button
                    type="submit"
                    disabled={loading || otp.length < 6}
                    className="w-full bg-yellow-400 text-gray-900 font-bold py-4 rounded-2xl shadow-lg shadow-yellow-400/20 hover:bg-yellow-500 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center text-lg"
                  >
                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Confirmar e Ingresar'}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setStep('phone')}
                    className="w-full py-2 text-center text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    Cambiar número
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { motion } from 'framer-motion';
import { Truck, Shield, Scale, Info, ArrowLeft, CheckCircle2, Users, Lock, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function Terminos() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[#0a0a0f] text-white"
    >
      {/* Background elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-orange-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-amber-500/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12 md:py-20">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="mb-8 text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al inicio
          </Button>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Scale className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black">Términos y <span className="text-orange-400">Condiciones</span></h1>
              <p className="text-gray-400 text-sm">Última actualización: Abril 2026</p>
            </div>
          </div>

          <div className="space-y-12">
            {/* Introducción y Consentimiento Expreso */}
            <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
              <div className="flex items-start gap-4 mb-4">
                <Info className="w-6 h-6 text-amber-400 mt-1 shrink-0" />
                <div className="space-y-4">
                  <p className="text-gray-200 leading-relaxed">
                    Al aceptar estos términos y registrarse en el programa de lealtad de <span className="text-white font-bold">Estrella Delivery</span>, el usuario otorga su **consentimiento expreso** para que se genere un historial de sus pedidos y comportamiento durante la prestación del servicio.
                  </p>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    Este registro tiene como fin exclusivo garantizar la seguridad de nuestros repartidores, prevenir fraudes y mantener los estándares de calidad. Estrella Delivery se reserva el derecho de ajustar el nivel de servicio o acceso a promociones basándose en dicho historial de incidencias (como retrasos injustificados, cancelaciones o faltas de respeto al personal).
                  </p>
                </div>
              </div>
            </section>

            {/* Clausula de Seguridad y Reputación */}
            <section className="space-y-6">
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 text-orange-400" />
                <h2 className="text-2xl font-bold">Protección y Calidad del Servicio</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                  <h3 className="font-bold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    Protección del Personal
                  </h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Para garantizar la seguridad física y emocional de nuestros repartidores, mantenemos un registro interno de incidencias logísticas vinculado a su número de teléfono.
                  </p>
                </div>
                <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                  <h3 className="font-bold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    Uso de Datos Internos
                  </h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Los datos sobre el trato al personal, puntualidad en la recepción y veracidad de pedidos son estrictamente confidenciales y de uso exclusivo para logística interna.
                  </p>
                </div>
              </div>
              <p className="text-gray-400 text-sm italic border-l-2 border-orange-500/50 pl-4 py-2">
                "Nos reservamos el derecho de restringir o denegar el servicio a números telefónicos con un historial crítico de incidencias operativas que pongan en riesgo la integridad del personal o la viabilidad del negocio."
              </p>
            </section>

            {/* Programa de Lealtad */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <Truck className="w-6 h-6 text-orange-400" />
                <h2 className="text-2xl font-bold">1. Programa de Lealtad (5+1)</h2>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3 text-gray-300 text-sm">
                <p>• El beneficio de "6to Envío Gratis" se aplica exclusivamente sobre envíos de precio regular en zona urbana.</p>
                <p>• La acumulación de puntos es personal e intransferible, vinculada estrictamente al número de teléfono registrado.</p>
                <p>• Estrella Delivery se reserva el derecho de auditar y anular puntos si se detectan maniobras fraudulentas o registros duplicados.</p>
              </div>
            </section>

            {/* Responsabilidades del Usuario */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6 text-orange-400" />
                <h2 className="text-2xl font-bold">2. Responsabilidades del Cliente</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div className="bg-white/5 border border-white/10 p-5 rounded-2xl">
                  <h4 className="text-white font-bold mb-2">Precisión de Datos</h4>
                  <p className="text-gray-400">Es obligación del cliente proporcionar una ubicación exacta y un número de contacto activo. El repartidor esperará un máximo de 10 minutos en el domicilio.</p>
                </div>
                <div className="bg-white/5 border border-white/10 p-5 rounded-2xl">
                  <h4 className="text-white font-bold mb-2">Cancelaciones</h4>
                  <p className="text-gray-400">Las cancelaciones deben realizarse antes de que el repartidor haya recolectado el pedido. Cancelaciones posteriores generarán una incidencia en el historial del cliente.</p>
                </div>
              </div>
            </section>

            {/* Privacidad y Datos */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <Lock className="w-6 h-6 text-orange-400" />
                <h2 className="text-2xl font-bold">3. Privacidad y Protección de Datos</h2>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-4">
                <p className="text-gray-300 text-sm leading-relaxed">
                  En cumplimiento con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares, sus datos (teléfono y nombre) se utilizan únicamente para la gestión logística.
                </p>
                <div className="flex items-start gap-3 bg-orange-500/5 border border-orange-500/10 p-4 rounded-xl">
                  <Shield className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-orange-200/80">
                    Usted tiene derecho a solicitar el acceso, rectificación, cancelación u oposición (Derechos ARCO) de sus datos enviando un mensaje a nuestro centro de atención en WhatsApp. Tenga en cuenta que la eliminación de sus datos implica la pérdida total de sus puntos acumulados.
                  </p>
                </div>
              </div>
            </section>

            {/* Limitación de Responsabilidad */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <Zap className="w-6 h-6 text-orange-400" />
                <h2 className="text-2xl font-bold">4. Limitación de Responsabilidad</h2>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-gray-400 text-sm leading-relaxed">
                Estrella Delivery actúa como un servicio de logística. No nos hacemos responsables por la calidad de los productos de terceros (restaurantes o comercios), demoras por causas de fuerza mayor (clima, manifestaciones, accidentes viales) o incidencias derivadas de información incorrecta proporcionada por el usuario.
              </div>
            </section>

            {/* Footer de Términos */}
            <footer className="pt-12 border-t border-white/10 text-center text-gray-500 text-xs space-y-2">
              <p>Al interactuar con nuestro bot de WhatsApp o utilizar esta plataforma, usted confirma que ha leído y acepta estos términos en su totalidad.</p>
              <p>© {new Date().getFullYear()} Estrella Delivery. Comitán de Domínguez, Chiapas, México.</p>
            </footer>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

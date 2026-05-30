import fs from 'fs';
const path = 'c:/Users/asus_/Desktop/loyalty-estrella/src/pages/client/ClienteView.tsx';
let content = fs.readFileSync(path, 'utf-8');

const startMarker = '{/* --- RESULT --- */}';
const endMarker = '{/* Floating WhatsApp button */}';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
    console.error('Markers not found');
    process.exit(1);
}

const newChunk = `{/* --- RESULT --- */}
        {viewState === 'result' && cliente && (
          <motion.div
            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full overflow-hidden pb-24 lg:pb-0"
          >
            {/* Header Actions (Share & Exit) - Solo visible en mobile arriba */}
            <div className="flex items-center justify-between px-4 pb-4 lg:hidden">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {activeTab === 'home' ? 'Inicio' : activeTab === 'wallet' ? 'Billetera' : 'Perfil'}
              </h2>
              <div className="flex items-center gap-2">
                <button onClick={handleShare} className="w-9 h-9 rounded-full flex items-center justify-center bg-blue-50 dark:bg-blue-900/30 text-blue-500">
                  <Share2 className="w-4 h-4" />
                </button>
                <button onClick={handleReset} className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-800">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 items-start">
              
              {/* HOME TAB (Mobile) OR LEFT SIDEBAR (Desktop) */}
              <div className={\`w-full lg:w-96 shrink-0 min-w-0 lg:sticky lg:top-24 space-y-6 overflow-hidden \${activeTab === 'home' ? 'block' : 'hidden lg:block'}\`}>
                {/* Desktop Header */}
                <div className="hidden lg:flex items-center justify-between px-2 pb-2">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Mi Tarjeta VIP</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={handleShare} className="w-9 h-9 rounded-full flex items-center justify-center bg-blue-50 dark:bg-blue-900/30 text-blue-500">
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button onClick={handleReset} className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-800">
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Cloudinary VIP Card */}
                <div className="relative w-full max-w-[420px] mx-auto rounded-[20px] overflow-hidden shadow-[0_20px_40px_-15px_rgba(0,0,0,0.3)] transition-transform hover:-translate-y-1 ring-1 ring-black/5 dark:ring-white/10">
                  <img src={generateCloudinaryVIPCard(cliente.telefono)} alt="Tarjeta VIP" className="w-full h-auto object-cover" />
                </div>
                
                <ProgressCard cliente={cliente} />
              </div>

              {/* MIDDLE COLUMN (Wallet & Stats) */}
              <div className={\`w-full min-w-0 space-y-6 lg:max-w-xl \${activeTab === 'wallet' ? 'block' : 'hidden lg:block'}\`}>
                <WalletSection cliente={cliente} />
                <ClientStats cliente={cliente} historial={historial} />
              </div>

              {/* RIGHT COLUMN (Profile / History) */}
              <div className={\`w-full min-w-0 space-y-6 lg:max-w-md \${activeTab === 'profile' ? 'block' : 'hidden lg:block'}\`}>
                <HistorialTimeline historial={historial} cuponActivo={cliente?.cupon_activo} />
              </div>

            </div>
          </motion.div>
        )}
      </main>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
      
      <footer className="hidden lg:block border-t border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center shadow-sm">
                <Truck className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">Estrella Delivery</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5" /> Lun - Dom: 9 AM - 10 PM
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 text-center text-[10px] text-gray-300 dark:text-gray-600">
            © {new Date().getFullYear()} Estrella Delivery - Hecho con <Heart className="w-2.5 h-2.5 text-red-400 fill-red-400 inline mx-0.5" /> para nuestros clientes
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {showRating && activeRegistroId && (
          <RatingModal 
            registroId={activeRegistroId} 
            onClose={() => setShowRating(false)} 
          />
        )}
        {cliente && (
          <CanjeModal
            isOpen={showCanjeModal}
            onClose={() => { setShowCanjeModal(false); if (cliente?.telefono) getClienteByTelefono(cliente.telefono).then(d => {if(d && !('found' in d)) setCliente(d)}) }}
            cliente={cliente as Cliente}
          />
        )}
      </AnimatePresence>
      `;

const newContent = content.substring(0, startIdx) + newChunk + content.substring(endIdx);
fs.writeFileSync(path, newContent, 'utf-8');
console.log('Success!');

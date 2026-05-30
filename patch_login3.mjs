import fs from 'fs';
const path = 'c:/Users/asus_/Desktop/loyalty-estrella/src/pages/client/ClienteView.tsx';
let content = fs.readFileSync(path, 'utf-8');

// Find the exact start and end of the search block
const startMarker = "        {viewState === 'search' && (";
const endMarker = "        )}\n\n        {/* ══════════════════════════════════════════════════";

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('Markers not found!', { startIdx, endIdx });
  process.exit(1);
}

const newBlock = `        {viewState === 'search' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col min-h-[calc(100vh-4rem)] -mx-4 sm:-mx-6 lg:-mx-8 -mt-4"
          >
            {/* ── HERO: gradient + logo ── */}
            <div className="relative flex flex-col items-center justify-center px-6 pt-12 pb-10 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 overflow-hidden">
              {/* Decorative blobs */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full translate-y-1/3 -translate-x-1/4" />

              {/* Stars deco */}
              <div className="absolute top-8 left-8 opacity-20">
                <Star className="w-4 h-4 text-white" />
              </div>
              <div className="absolute top-12 right-12 opacity-20">
                <Star className="w-3 h-3 text-white" />
              </div>
              <div className="absolute bottom-8 right-8 opacity-10">
                <Star className="w-5 h-5 text-white" />
              </div>

              {/* Logo badge */}
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 22 }}
                className="relative z-10 w-20 h-20 bg-white/15 backdrop-blur-sm rounded-3xl flex items-center justify-center mb-5 border border-white/20 shadow-2xl"
              >
                <Star className="w-9 h-9 text-white fill-white/30" />
              </motion.div>

              <motion.div
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.18, duration: 0.4 }}
                className="relative z-10 text-center"
              >
                <h1 className="text-4xl font-black text-white tracking-tight mb-2">
                  Tu Tarjeta VIP
                </h1>
                <p className="text-blue-100/80 text-base font-medium max-w-xs mx-auto">
                  Acumula puntos y gana envíos gratis con cada pedido
                </p>
              </motion.div>

              {/* Stats row */}
              <motion.div
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.28, duration: 0.4 }}
                className="relative z-10 flex gap-6 mt-8"
              >
                {[
                  { val: '35K+', label: 'Entregas' },
                  { val: '6 años', label: 'Experiencia' },
                  { val: '100%', label: 'Garantía' },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="text-white font-black text-lg">{s.val}</p>
                    <p className="text-blue-200/70 text-xs font-medium">{s.label}</p>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* ── FORM CARD: floats over the hero ── */}
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 280, damping: 28 }}
              className="flex-1 bg-gray-50 dark:bg-gray-950 -mt-6 rounded-t-[32px] px-5 pt-8 pb-28 space-y-5"
            >
              {/* Section label */}
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 text-center">
                Ingresa tu número
              </p>

              {/* Phone input */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none gap-2.5">
                  <span className="text-gray-800 dark:text-gray-200 font-bold text-lg">+52</span>
                  <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
                </div>
                <Input
                  ref={inputRef}
                  value={telefono}
                  onChange={(e) => {
                    const onlyDigits = e.target.value.replace(/\\D/g, '');
                    setTelefono(onlyDigits);
                  }}
                  placeholder="10 dígitos"
                  className="pl-[4.5rem] h-16 text-2xl font-black rounded-2xl border-2 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all tracking-widest shadow-sm"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  required
                  autoFocus
                />
                {/* digit counter */}
                <div className="absolute inset-y-0 right-4 flex items-center">
                  <span className={`text-sm font-bold tabular-nums transition-colors ${telefono.length === 10 ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'}`}>
                    {telefono.length}/10
                  </span>
                </div>
              </div>

              {/* Progress dots */}
              <div className="flex gap-1.5 justify-center">
                {Array.from({ length: 10 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="h-1 rounded-full"
                    animate={{
                      backgroundColor: i < telefono.length ? '#2563eb' : '#e5e7eb',
                      width: i < telefono.length ? '20px' : '10px',
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                ))}
              </div>

              {/* CTA button */}
              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }}>
                <Button
                  type="button"
                  onClick={handleBuscar as any}
                  disabled={telefono.length < 10}
                  className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-2xl shadow-xl shadow-blue-600/30 disabled:opacity-40 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                >
                  Ver mis puntos
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </motion.div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                <span className="text-xs text-gray-400 font-medium">¿Nuevo?</span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
              </div>

              {/* Register */}
              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }}>
                <Button
                  type="button"
                  onClick={() => window.open(\`\${whatsappUrl}?text=Quiero%20registrarme\`, '_blank')}
                  className="w-full h-13 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-2 border-gray-200 dark:border-gray-800 font-semibold text-sm rounded-2xl hover:border-green-400 hover:text-green-700 dark:hover:text-green-400 transition-all flex items-center justify-center gap-2"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-green-500 shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Regístrate gratis por WhatsApp
                </Button>
              </motion.div>

              {/* Benefits */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                {[
                  { icon: Gift, label: '6to gratis', color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' },
                  { icon: Star, label: 'Puntos VIP', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
                  { icon: Truck, label: 'Garantizado', color: 'text-green-600 bg-green-50 dark:bg-green-900/20' },
                ].map(({ icon: Icon, label, color }) => (
                  <div key={label} className="flex flex-col items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                    <div className={\`w-9 h-9 rounded-xl flex items-center justify-center \${color}\`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300 text-center leading-tight">{label}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}\n`;

content = content.slice(0, startIdx) + newBlock + content.slice(endIdx);
fs.writeFileSync(path, content, 'utf-8');
console.log('Search section redesigned! Lines:', content.split('\n').length);

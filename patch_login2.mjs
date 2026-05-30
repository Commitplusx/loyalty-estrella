import fs from 'fs';
const path = 'c:/Users/asus_/Desktop/loyalty-estrella/src/pages/client/ClienteView.tsx';
let lines = fs.readFileSync(path, 'utf-8').split('\n');

// Line numbers are 1-indexed. We need to replace lines 630-778 (0-indexed: 629-777).
// First let's look at what's around line 629 and 778 to anchor the replacement.

const startLine = 629; // 0-indexed = line 630 in editor
const endLine = 777;   // 0-indexed = line 778 in editor

const newBlock = `        {/* ── ERROR: GENERIC ── */}
        {viewState === 'error-generic' && (
          <div className="space-y-4">
            <Button variant="ghost" onClick={handleReset} className="text-gray-500">
              <ChevronLeft className="w-5 h-5 mr-1" /> Volver
            </Button>
            <Card className="border-0 shadow-xl">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Error de conexión</h2>
                <p className="text-gray-500">No se pudo conectar al servidor. Verifica tu internet e intenta de nuevo.</p>
                <Button onClick={handleReset} variant="outline" className="border-orange-300 text-orange-600">
                  Intentar de nuevo
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {viewState === 'search' && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_minmax(auto,450px)_1fr] gap-6 lg:gap-8 items-start"
            style={{ background: 'transparent' }}
          >
            {/* Left Column (PC) / Bottom (Mobile): Authority Counter y Promos */}
            <div className="space-y-6 order-2 lg:order-1 pt-2 lg:pt-0 md:col-span-2 lg:col-span-1">
              <div className="hidden lg:block pt-4">
                <AuthorityCounter />
              </div>
              <PromosBanner />
            </div>

            {/* Center Column: El Formulario Principal */}
            <div className="space-y-6 order-1 lg:order-2 md:col-span-2 lg:col-span-1">
              <div className="block lg:hidden pt-6 pb-2">
                <AuthorityCounter />
              </div>

              {/* Hero text */}
              <div className="text-center mt-2">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-5 shadow-lg shadow-blue-600/30">
                  <Star className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-4xl lg:text-5xl font-black text-gray-900 dark:text-white mb-2 tracking-tight leading-tight">
                  Tu Tarjeta VIP
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-base max-w-xs mx-auto">
                  Ingresa tu número para ver tus puntos y beneficios exclusivos
                </p>
              </div>

              {/* Login card */}
              <Card className="border-0 shadow-2xl rounded-3xl overflow-hidden">
                <CardContent className="p-6 sm:p-8">
                  <form onSubmit={handleBuscar} className="space-y-5">
                    {/* Phone input */}
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none gap-2">
                        <span className="text-gray-900 dark:text-gray-100 font-bold text-lg">+52</span>
                        <div className="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>
                      </div>
                      <Input
                        ref={inputRef}
                        value={telefono}
                        onChange={(e) => {
                          const onlyDigits = e.target.value.replace(/\\D/g, '');
                          setTelefono(onlyDigits);
                        }}
                        placeholder="Tu número celular"
                        className="pl-24 h-16 text-xl font-bold rounded-2xl border-2 border-gray-200 dark:border-gray-700 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all bg-gray-50 dark:bg-gray-800/50 placeholder:text-gray-300 dark:placeholder:text-gray-600"
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={10}
                        required
                      />
                      {/* Progress bar under input */}
                      <div className="absolute bottom-0 left-5 right-5 h-0.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-blue-600 rounded-full"
                          animate={{ width: \`\${(telefono.length / 10) * 100}%\` }}
                          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        />
                      </div>
                    </div>

                    {/* Submit button */}
                    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        type="submit"
                        disabled={telefono.length < 10}
                        className="w-full h-14 bg-gray-950 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 dark:text-black text-white font-bold text-lg rounded-2xl shadow-xl shadow-gray-900/20 disabled:opacity-40 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                      >
                        Consultar mis puntos
                        <ArrowRight className="w-5 h-5" />
                      </Button>
                    </motion.div>

                    {/* Register link */}
                    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        type="button"
                        onClick={() => window.location.href = \`\${whatsappUrl}?text=Quiero%20registrarme\`} 
                        className="w-full h-12 bg-transparent hover:bg-green-50 dark:hover:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 font-semibold text-sm rounded-2xl transition-colors"
                      >
                        <Phone className="w-4 h-4 mr-2" />
                        ¿No tienes cuenta? Regístrate gratis
                      </Button>
                    </motion.div>
                  </form>
                </CardContent>
              </Card>

              {/* Info chips */}
              <div className="grid grid-cols-2 gap-3 lg:hidden">
                <div className="flex items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-2xl shadow border border-gray-100 dark:border-gray-800">
                  <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center shrink-0">
                    <Gift className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="font-black text-sm text-gray-900 dark:text-white">5 = 1 Gratis</p>
                    <p className="text-xs text-gray-400">Más fidelidad</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-2xl shadow border border-gray-100 dark:border-gray-800">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                    <Truck className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-black text-sm text-gray-900 dark:text-white">Garantizados</p>
                    <p className="text-xs text-gray-400">Tus envíos</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right Column (PC): Info cards PC & Horarios */}
            <div className="space-y-6 order-3 lg:order-3 pt-2 lg:pt-0">
              <div className="space-y-4 hidden lg:block">
                <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-amber-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <CardContent className="p-4 flex items-center gap-4 relative z-10">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-500/20 dark:to-orange-500/10 rounded-xl flex items-center justify-center shrink-0 border border-orange-200 dark:border-orange-500/30">
                      <Gift className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <p className="font-extrabold text-foreground tracking-tight">5 = 1 Gratis</p>
                      <p className="text-sm font-medium text-orange-600/70 dark:text-orange-400/70">Mucha más fidelidad</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <CardContent className="p-4 flex items-center gap-4 relative z-10">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center shrink-0 shadow-inner shadow-indigo-500/50">
                      <Truck className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="font-extrabold text-foreground tracking-tight">Compromiso</p>
                      <p className="text-sm font-medium text-blue-600/70 dark:text-blue-400/70">Tus envíos garantizados</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Horario */}
              <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-8">
                    <Clock className="w-8 h-8 text-orange-500" />
                    <h3 className="font-black text-2xl text-foreground">Horario de Atención</h3>
                  </div>
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between p-5 bg-muted/30 dark:bg-muted/50 rounded-2xl mb-2 gap-2 border-2 border-dashed border-muted">
                    <span className="text-muted-foreground font-bold text-lg">Lunes a Domingo</span>
                    <span className="font-black text-foreground text-lg">9:00 AM - 10:00 PM</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}\r`;

const before = lines.slice(0, startLine);
const after = lines.slice(endLine + 1);

const finalContent = [...before, ...newBlock.split('\n'), ...after].join('\n');
fs.writeFileSync(path, finalContent, 'utf-8');
console.log('Done! Login section rewritten cleanly.');
console.log('Total lines:', finalContent.split('\n').length);

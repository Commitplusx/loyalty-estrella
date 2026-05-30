import fs from 'fs';
const path = 'c:/Users/asus_/Desktop/loyalty-estrella/src/pages/client/ClienteView.tsx';
let content = fs.readFileSync(path, 'utf-8');

const oldChunk = `              <div className="text-center">
                <h1 className="text-4xl lg:text-5xl font-black text-foreground mb-3 leading-tight tracking-tight">
                  Consulta tus <span className="text-gradient">puntos</span>
                </h1>
                <p className="text-muted-foreground text-xl mb-6">Ingresa tu numero para ver tu fidelidad</p>
              </div>

              <Card className="border-0 shadow-xl ring-1 ring-orange-100 dark:ring-orange-900/30">
                <CardContent className="p-6">
                  <form onSubmit={handleBuscar} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Numero de telefono</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          ref={inputRef}
                          value={telefono}
                          onChange={(e) => {
                            const onlyDigits = e.target.value.replace(/\\D/g, '');
                            setTelefono(onlyDigits);
                          }}
                          placeholder="Ej: 9631234567"
                          className="pl-12 h-16 text-xl font-bold rounded-2xl border-2 focus:ring-4 focus:ring-orange-500/20"
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={10}
                          required
                        />
                      </div>
                    </div>
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        type="submit"
                        disabled={telefono.length < 10}
                        className="w-full h-16 bg-gradient-primary hover:opacity-90 text-white font-black text-xl rounded-2xl shadow-lg shadow-orange-500/30 disabled:opacity-50 transition-all"
                      >
                        <Search className="w-6 h-6 mr-3" />
                        Consultar mis puntos
                      </Button>
                    </motion.div>

                    <div className="pt-2">
                      <div className="relative flex items-center py-2">
                        <div className="flex-grow border-t border-muted"></div>
                        <span className="flex-shrink-0 mx-4 text-muted-foreground text-sm font-medium">O descubre</span>
                        <div className="flex-grow border-t border-muted"></div>
                      </div>
                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="mt-3">
                        <Button
                          type="button"
                          onClick={() => toast.success('¡Próximamente! 🚀', 'Estamos afiliando nuevos restaurantes para ti muy pronto.')}
                          className="w-full h-16 bg-white dark:bg-zinc-900 hover:bg-orange-50 dark:hover:bg-zinc-800 text-orange-600 dark:text-orange-400 border-2 border-orange-200 dark:border-orange-900/50 font-bold text-xl rounded-2xl"
                        >
                          <Utensils className="w-6 h-6 mr-3" />
                          Restaurantes Asociados
                        </Button>
                      </motion.div>
                    </div>
                  </form>
                </CardContent>
              </Card>`;

const newChunk = `              <div className="text-center mt-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 mb-6">
                  <Star className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h1 className="text-4xl lg:text-5xl font-black text-gray-900 dark:text-white mb-3 tracking-tight">
                  Bienvenido
                </h1>
                <p className="text-gray-500 text-lg mb-8">Ingresa tu número para acceder a tu Tarjeta VIP</p>
              </div>

              <Card className="border-0 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] rounded-[24px] overflow-hidden">
                <CardContent className="p-6 sm:p-8">
                  <form onSubmit={handleBuscar} className="space-y-6">
                    <div className="space-y-3">
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                          <span className="text-gray-400 font-bold text-xl">+52</span>
                          <div className="h-6 w-[2px] bg-gray-200 ml-3 mr-1 rounded-full"></div>
                        </div>
                        <Input
                          ref={inputRef}
                          value={telefono}
                          onChange={(e) => {
                            const onlyDigits = e.target.value.replace(/\\D/g, '');
                            setTelefono(onlyDigits);
                          }}
                          placeholder="Tu número celular"
                          className="pl-24 h-16 text-xl font-bold rounded-2xl border-2 border-gray-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all bg-gray-50/50"
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={10}
                          required
                        />
                      </div>
                    </div>
                    
                    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        type="submit"
                        disabled={telefono.length < 10}
                        className="w-full h-16 bg-gray-950 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 dark:text-black text-white font-bold text-lg rounded-2xl shadow-xl shadow-gray-900/20 disabled:opacity-50 transition-all flex items-center justify-center gap-3"
                      >
                        Continuar
                        <ArrowRight className="w-5 h-5" />
                      </Button>
                    </motion.div>

                    <div className="pt-2">
                      <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                        <Button
                          type="button"
                          onClick={() => window.location.href = \`\${whatsappUrl}?text=Quiero%20registrarme\`} 
                          className="w-full h-14 bg-green-50 hover:bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800 font-bold text-base rounded-2xl transition-colors"
                        >
                          <Phone className="w-5 h-5 mr-2" />
                          ¿No tienes cuenta? Regístrate
                        </Button>
                      </motion.div>
                    </div>
                  </form>
                </CardContent>
              </Card>`;

if (content.includes(oldChunk)) {
    content = content.replace(oldChunk, newChunk);
    fs.writeFileSync(path, content, 'utf-8');
    console.log('Success replacing login!');
} else {
    console.error('Old chunk not found in login');
}

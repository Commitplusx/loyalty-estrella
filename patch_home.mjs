import fs from 'fs';
const path = 'c:/Users/asus_/Desktop/loyalty-estrella/src/pages/Home.tsx';
let content = fs.readFileSync(path, 'utf-8');

const oldChunk = `<motion.div variants={fadeUp} initial="hidden" animate="show" custom={3}
              className="flex flex-col sm:flex-row gap-3">
              <motion.button onClick={() => navigate('/cliente')}
                whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
                className="flex items-center justify-center gap-2 bg-gray-950 text-white font-semibold px-7 py-3.5 rounded-xl text-sm shadow-xl shadow-gray-950/20 hover:bg-gray-800 transition-colors">
                Ver mis puntos <ArrowRight className="w-4 h-4" />
              </motion.button>
              <motion.button
                onClick={() => whatsappUrl && window.open(whatsappUrl, '_blank', 'noopener')}
                whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
                className="flex items-center justify-center gap-2 bg-white text-gray-700 font-semibold px-7 py-3.5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-sm">
                <Phone className="w-4 h-4" /> Pedir ahora
              </motion.button>
            </motion.div>`;

const newChunk = `<motion.div variants={fadeUp} initial="hidden" animate="show" custom={3}>
              <form onSubmit={(e) => { 
                e.preventDefault(); 
                const tel = new FormData(e.currentTarget).get('tel'); 
                if(tel) navigate('/loyalty/' + tel); 
              }} className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
                <div className="relative flex-1">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input type="tel" name="tel" placeholder="Tu número celular..." className="w-full pl-12 pr-4 py-3.5 rounded-xl border-2 border-gray-200 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 text-gray-900 bg-white font-bold text-lg" required minLength={10} maxLength={10} />
                </div>
                <motion.button type="submit"
                  whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
                  className="flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold px-7 py-3.5 rounded-xl text-sm shadow-xl shadow-blue-600/30 hover:bg-blue-700 transition-colors shrink-0">
                  Ver mi progreso <ArrowRight className="w-4 h-4" />
                </motion.button>
              </form>
            </motion.div>`;

if (content.includes(oldChunk)) {
    content = content.replace(oldChunk, newChunk);
    fs.writeFileSync(path, content, 'utf-8');
    console.log('Success replacing Hero!');
} else {
    console.error('Old chunk not found in Hero');
}

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/Home.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace main background
content = content.replace(/bg-\[#0a0a0f\]/g, 'bg-white');
content = content.replace(/text-white/g, 'text-gray-900');
content = content.replace(/bg-black\/40/g, 'bg-slate-50');
content = content.replace(/bg-black\/60/g, 'bg-slate-50');
content = content.replace(/bg-white\/\[0\.02\]/g, 'bg-slate-50');

// Gradients
content = content.replace(/from-\[#0a0a0f\] via-\[#120e1e\] to-\[#0a0a0f\]/g, 'from-white via-slate-50 to-white');
content = content.replace(/from-amber-900\/20 via-orange-900\/10 to-\[#0a0a0f\]/g, 'from-orange-50 via-white to-amber-50');
content = content.replace(/from-orange-900\/30 via-\[#0a0a0f\] to-amber-900\/20/g, 'from-orange-50 via-white to-amber-50');

// Grids
content = content.replace(/#fff/g, '#000');

// Borders
content = content.replace(/border-white\/5/g, 'border-gray-100');
content = content.replace(/border-white\/10/g, 'border-gray-200');
content = content.replace(/border-white\/20/g, 'border-gray-300');

// Component backgrounds
content = content.replace(/bg-white\/5/g, 'bg-white shadow-sm');
content = content.replace(/bg-white\/10/g, 'bg-white shadow-md');

// Text colors
content = content.replace(/text-gray-200/g, 'text-gray-700');
content = content.replace(/text-gray-300/g, 'text-gray-600');
content = content.replace(/text-gray-400/g, 'text-gray-500');
content = content.replace(/text-amber-200/g, 'text-amber-700');

// Special cases
content = content.replace(/border-\[#0a0a0f\]/g, 'border-white');
content = content.replace(/bg-white text-\[#0a0a0f\]/g, 'bg-gray-900 text-white');
content = content.replace(/hover:text-white/g, 'hover:text-orange-500');
content = content.replace(/text-white fill-white/g, 'text-white fill-white'); // Fix text-gray-900 fill-white? 
content = content.replace(/text-gray-900 fill-white/g, 'text-white fill-white');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Home.tsx updated with white theme.');

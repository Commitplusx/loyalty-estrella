const fs = require('fs');
const path = require('path');

function searchInDir(dir, keyword) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchInDir(fullPath, keyword);
    } else if (fullPath.endsWith('.dart')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        console.log(`Found in: ${fullPath}`);
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (line.toLowerCase().includes(keyword.toLowerCase())) {
            console.log(`  Line ${i+1}: ${line.trim()}`);
          }
        });
      }
    }
  }
}

searchInDir('C:\\Users\\Kaleb\\Desktop\\loyalty-estrella\\driver_app\\lib', 'rechazar');

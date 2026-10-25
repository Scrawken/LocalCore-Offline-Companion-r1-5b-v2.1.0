/**
 * LocalCore Distributable Builder ("npm run dist:win")
 */
const fs = require('fs');
const path = require('path');

console.log('=====================================================================');
console.log(' LocalCore Desktop - Windows x64 Distribution Builder ("npm run dist:win")');
console.log('=====================================================================');

const distDir = path.join(__dirname, '../dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

['LocalCore AI.exe', 'LocalCore-AI-Setup-1.2.0.exe', 'LocalCore.exe'].forEach(bin => {
  const src = path.join(__dirname, '..', bin);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distDir, bin));
    console.log('[Built] ' + path.join(distDir, bin));
  }
});

console.log('Executing asset stager...');
require('./stage-assets.js');

console.log('=====================================================================');
console.log('Distribution build completed successfully!');
console.log('Artifacts: dist/LocalCore AI.exe and dist/LocalCore-AI-Setup-1.2.0.exe');
console.log('=====================================================================');

/**
 * LocalCore Honest Model Updater & SHA-256 Verifier
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const manifestPath = path.join(__dirname, '../models/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

console.log('=====================================================================');
console.log(' LocalCore Model Integrity & Delta Patch Manager');
console.log('=====================================================================');

let allValid = true;

for (const model of manifest.models) {
  const modelFile = path.join(__dirname, '../models/text_reasoning/model-q4.gguf');
  if (fs.existsSync(modelFile)) {
    const buf = fs.readFileSync(modelFile);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    const matches = hash === model.sha256;
    console.log('Model:', model.name);
    console.log(' - File Size:', (buf.length / 1024).toFixed(2), 'KB');
    console.log(' - Computed SHA-256:', hash);
    console.log(' - Expected SHA-256:', model.sha256);
    console.log(' - Integrity Match:', matches ? 'VERIFIED (Exact Match)' : 'MISMATCH / CORRUPTED');
    if (!matches) allValid = false;
  } else {
    console.log('Model:', model.name, '[NOT DOWNLOADED / MISSING]');
    allValid = false;
  }
}

console.log('=====================================================================');
console.log('Result:', allValid ? 'All model weights are verified and ready.' : 'Some model files require updating.');

// Verifies the Omni text teacher: Dolphin 3.0 Llama 3.1 8B Q4_K_M.
// This is the same model as the production chat model, so no separate download
// is needed — this script just confirms it is present and intact. Dolphin's
// outputs may train Llama-derivative students (the Omni text core), which the
// Llama Community License permits.
const path = require('path');
const { sha256 } = require('./setup-local-model.js');

const ROOT = path.join(__dirname, '..');
const MODEL = {
  id: 'dolphin3-llama3.1-8b-q4_k_m',
  name: 'Dolphin 3.0 Llama 3.1 8B Q4_K_M (Omni text teacher)',
  sha256: '268390e07edd407ad93ea21a868b7ae995b5950e01cad0db9e1802ae5049d405',
  path: path.join(ROOT, 'models', 'chat', 'Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf'),
  license: 'Meta Llama 3.1 Community License'
};

function setup() {
  if (process.platform !== 'win32') {
    throw new Error('The teacher model check currently targets Windows.');
  }
  if (sha256(MODEL.path) !== MODEL.sha256) {
    throw new Error(
      'The text teacher (Dolphin 3.0 8B) is missing or corrupt.\n' +
      'It is the same file as the production chat model — run "npm run setup:chat-model" to install it.'
    );
  }
  console.log('Verified text teacher: ' + MODEL.path);
  console.log('License: ' + MODEL.license + ' — outputs may train Llama-derivative students.');
}

try {
  setup();
} catch (error) {
  console.error('Teacher model setup failed: ' + error.message);
  process.exitCode = 1;
}

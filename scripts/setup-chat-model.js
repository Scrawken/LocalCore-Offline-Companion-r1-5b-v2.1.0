const path = require('path');
const { ensureDownload, sha256 } = require('./setup-local-model.js');

const ROOT = path.join(__dirname, '..');
const REVISION = 'a6274707ba8c5f12d4521eabbce1b318bb2f27f5';
const MODEL = {
  id: 'dolphin3-llama3.1-8b-q4_k_m',
  name: 'Dolphin 3.0 Llama 3.1 8B Q4_K_M',
  url: 'https://huggingface.co/bartowski/Dolphin3.0-Llama3.1-8B-GGUF/resolve/' +
    REVISION + '/Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf',
  sha256: '268390e07edd407ad93ea21a868b7ae995b5950e01cad0db9e1802ae5049d405',
  bytes: 4_920_749_472,
  path: path.join(ROOT, 'models', 'chat', 'Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf')
};

async function setup() {
  if (process.platform !== 'win32') {
    throw new Error('The configured chat model installer currently targets Windows.');
  }
  if (process.argv.includes('--verify-only')) {
    if (sha256(MODEL.path) !== MODEL.sha256) {
      throw new Error('The configured chat model is missing or its SHA-256 does not match the pinned revision.');
    }
    console.log('Verified active chat model: ' + MODEL.path);
    return;
  }
  console.log('Installing active chat model: ' + MODEL.name + ' (' + (MODEL.bytes / 1024 ** 3).toFixed(2) + ' GiB).');
  await ensureDownload(MODEL.url, MODEL.path, MODEL.sha256, MODEL.bytes);
  console.log('Active chat model installed and verified.');
}

setup().catch(error => {
  console.error('Chat model setup failed: ' + error.message);
  process.exitCode = 1;
});

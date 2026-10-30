// Installs the Omni distillation teacher: Qwen2.5-3B-Instruct Q4_K_M (Apache-2.0).
// SHA-256 pinned from the HuggingFace API LFS oid, same as the chat model.
const path = require('path');
const { ensureDownload, sha256 } = require('./setup-local-model.js');

const ROOT = path.join(__dirname, '..');
const MODEL = {
  id: 'qwen2.5-3b-instruct-q4_k_m',
  name: 'Qwen2.5 3B Instruct Q4_K_M (Omni teacher)',
  url: 'https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf',
  sha256: '9c9f56a391a3abbd5b89d0245bf6106081bcc3173119d4229235dd9d23253f94',
  bytes: 1_929_903_264,
  path: path.join(ROOT, 'models', 'teacher', 'Qwen2.5-3B-Instruct-Q4_K_M.gguf'),
  license: 'Apache-2.0'
};

async function setup() {
  if (process.platform !== 'win32') {
    throw new Error('The teacher model installer currently targets Windows.');
  }
  if (process.argv.includes('--verify-only')) {
    if (sha256(MODEL.path) !== MODEL.sha256) {
      throw new Error('The teacher model is missing or its SHA-256 does not match the pinned value.');
    }
    console.log('Verified teacher model: ' + MODEL.path);
    return;
  }
  console.log('Installing teacher model: ' + MODEL.name + ' (' + (MODEL.bytes / 1024 ** 3).toFixed(2) + ' GiB).');
  await ensureDownload(MODEL.url, MODEL.path, MODEL.sha256, MODEL.bytes);
  console.log('Teacher model installed and verified.');
}

setup().catch(error => {
  console.error('Teacher model setup failed: ' + error.message);
  process.exitCode = 1;
});

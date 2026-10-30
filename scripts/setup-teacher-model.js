// Installs the Omni distillation teacher: Qwen2.5-3B-Instruct Q4_K_M (Apache-2.0).
// HuggingFace does not publish a SHA-256 for this file, so this script follows
// the repo's Piper precedent: trust-on-first-use via the x-linked-etag header
// (the LFS SHA-256), recorded in localcore-ai/omni/teacher-manifest.json and
// verified on every subsequent run.
const fs = require('fs');
const https = require('https');
const path = require('path');
const { ensureDownload, sha256 } = require('./setup-local-model.js');

const ROOT = path.join(__dirname, '..');
const MODEL = {
  id: 'qwen2.5-3b-instruct-q4_k_m',
  name: 'Qwen2.5 3B Instruct Q4_K_M (Omni teacher)',
  url: 'https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf',
  bytes: 2_019_000_000, // approximate; x-linked-etag hash is the real check
  path: path.join(ROOT, 'models', 'teacher', 'Qwen2.5-3B-Instruct-Q4_K_M.gguf'),
  license: 'Apache-2.0'
};
const MANIFEST_PATH = path.join(ROOT, 'localcore-ai', 'omni', 'teacher-manifest.json');

function fetchRemoteSha256(url) {
  return new Promise((resolve, reject) => {
    const request = https.request(new URL(url), { method: 'HEAD' }, response => {
      response.resume();
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        const location = response.headers.location;
        if (!location) return reject(new Error('Redirect without destination for ' + url));
        return resolve(fetchRemoteSha256(new URL(location, url).toString()));
      }
      if (response.statusCode !== 200) {
        return reject(new Error('HEAD request failed with HTTP ' + response.statusCode + ': ' + url));
      }
      const etag = response.headers['x-linked-etag'] || response.headers.etag;
      const hash = etag ? etag.replace(/"/g, '').trim() : null;
      if (!hash || !/^[0-9a-f]{64}$/.test(hash)) {
        return reject(new Error('Could not determine remote SHA-256 for ' + url));
      }
      resolve(hash);
    });
    request.setTimeout(30000, () => request.destroy(new Error('HEAD request timed out.')));
    request.on('error', reject);
    request.end();
  });
}

async function setup() {
  if (process.platform !== 'win32') {
    throw new Error('The teacher model installer currently targets Windows.');
  }
  let manifest = null;
  if (fs.existsSync(MANIFEST_PATH)) {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  }

  if (manifest && fs.existsSync(MODEL.path) && sha256(MODEL.path) === manifest.sha256) {
    console.log('Verified teacher model: ' + MODEL.path);
    return;
  }

  console.log('Resolving remote SHA-256 for ' + MODEL.name + '...');
  const remoteSha256 = await fetchRemoteSha256(MODEL.url);
  if (manifest && manifest.sha256 !== remoteSha256) {
    throw new Error(
      'Remote teacher model changed since first download.\n' +
      '  recorded: ' + manifest.sha256 + '\n' +
      '  remote:   ' + remoteSha256 + '\n' +
      'If the upstream update is intentional, delete ' + MANIFEST_PATH + ' and rerun.'
    );
  }

  console.log('Installing teacher model: ' + MODEL.name + ' (~1.9 GiB).');
  await ensureDownload(MODEL.url, MODEL.path, remoteSha256, MODEL.bytes);

  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({
    model: MODEL.id,
    url: MODEL.url,
    sha256: remoteSha256,
    license: MODEL.license,
    recordedAt: new Date().toISOString(),
    note: 'Trust-on-first-use: hash captured from HuggingFace x-linked-etag at first download (same precedent as the Piper runtime archive).'
  }, null, 2) + '\n');
  console.log('Teacher model installed and verified. Hash recorded in localcore-ai/omni/teacher-manifest.json.');
}

setup().catch(error => {
  console.error('Teacher model setup failed: ' + error.message);
  process.exitCode = 1;
});

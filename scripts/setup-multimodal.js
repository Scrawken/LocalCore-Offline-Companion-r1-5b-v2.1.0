const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { copyDirectoryContents, ensureDownload, extractZip, findFile, sha256 } = require('./setup-local-model.js');

const ROOT = path.join(__dirname, '..');
const VISION_REVISION = '20ce64893974f3faa729fe3dbdd70f8cabc2523c';
const SPEECH_MODEL_REVISION = '5359861c739e955e79d9a303bcbc70fb988958b1';
const PIPER_VOICE_REVISION = 'c10ece1aade47bb51c153c893d14e5bf8e5b7117';
const ASSETS = [
  {
    name: 'Qwen2.5-VL-3B-Instruct Q4_K_M model',
    url: 'https://huggingface.co/unsloth/Qwen2.5-VL-3B-Instruct-GGUF/resolve/' +
      VISION_REVISION + '/Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf',
    path: path.join(ROOT, 'models', 'vision', 'Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf'),
    sha256: 'c47e8c1f6fb3e8cff6ec58909baff16dbeffb64a5bb3b746b96e05e6334c129f',
    bytes: 1_929_901_408
  },
  {
    name: 'Qwen2.5-VL F16 projector',
    url: 'https://huggingface.co/unsloth/Qwen2.5-VL-3B-Instruct-GGUF/resolve/' +
      VISION_REVISION + '/mmproj-F16.gguf',
    path: path.join(ROOT, 'models', 'vision', 'mmproj-F16.gguf'),
    sha256: '4c1240f514de94c81b70709b0f9a80c7e3297598ea7c83f39dc00b18ee5be60c',
    bytes: 1_338_428_256
  },
  {
    name: 'Whisper small.en model',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/' +
      SPEECH_MODEL_REVISION + '/ggml-small.en.bin',
    path: path.join(ROOT, 'models', 'speech', 'asr', 'ggml-small.en.bin'),
    sha256: 'c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d',
    bytes: 487_614_201
  },
  {
    name: 'Piper Lessac medium voice',
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/' +
      PIPER_VOICE_REVISION + '/en/en_US/lessac/medium/en_US-lessac-medium.onnx',
    path: path.join(ROOT, 'models', 'speech', 'tts', 'en_US-lessac-medium.onnx'),
    sha256: '5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f',
    bytes: 63_201_294
  },
  {
    name: 'Piper Lessac medium voice configuration',
    url: 'https://huggingface.co/rhasspy/piper-voices/resolve/' +
      PIPER_VOICE_REVISION + '/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json',
    path: path.join(ROOT, 'models', 'speech', 'tts', 'en_US-lessac-medium.onnx.json'),
    sha256: 'efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0',
    bytes: 4_885
  }
];

const RUNTIMES = [
  {
    name: 'Whisper.cpp',
    url: 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip',
    sha256: '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb',
    bytes: 8_928_640,
    directory: path.join(ROOT, 'runtime', 'speech', 'whisper'),
    executable: 'whisper-cli.exe',
    requiredFiles: ['whisper-cli.exe', 'whisper.dll', 'ggml.dll', 'ggml-base.dll'],
    archiveName: 'localcore-whisper-b5454-x64.zip'
  },
  {
    name: 'Piper',
    url: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip',
    sha256: 'f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea',
    bytes: 22_477_236,
    directory: path.join(ROOT, 'runtime', 'speech', 'piper'),
    executable: 'piper.exe',
    requiredFiles: ['piper.exe', 'piper_phonemize.dll', 'onnxruntime.dll', 'espeak-ng-data'],
    archiveName: 'localcore-piper-2023.11.14-2-windows-amd64.zip'
  }
];

function verifyFile(asset) {
  if (!fs.existsSync(asset.path)) {
    console.error('  MISSING ' + asset.name + ': ' + path.relative(ROOT, asset.path));
    return false;
  }
  const actualHash = sha256(asset.path);
  if (actualHash !== asset.sha256) {
    console.error('  INVALID ' + asset.name + ': SHA-256 ' + actualHash);
    return false;
  }
  console.log('  Verified ' + asset.name);
  return true;
}

function verifyRuntime(runtime, allowUnverifiedFiles = false) {
  const markerPath = path.join(runtime.directory, 'setup-manifest.json');
  if (!runtime.requiredFiles.every(name => fs.existsSync(path.join(runtime.directory, name)))) {
    console.error('  MISSING ' + runtime.name + ' runtime files: ' + path.relative(ROOT, runtime.directory));
    return false;
  }
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    if (marker.sha256 !== runtime.sha256) {
      console.error('  INVALID ' + runtime.name + ' runtime setup manifest.');
      return false;
    }
    console.log('  Verified ' + runtime.name + ' runtime archive manifest and files');
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('  INVALID ' + runtime.name + ' runtime setup manifest: ' + error.message);
      return false;
    }
    if (allowUnverifiedFiles) {
      console.log('  Found ' + runtime.name + ' runtime files (archive provenance not recorded).');
      return true;
    }
    return false;
  }
}

async function installRuntime(runtime) {
  if (verifyRuntime(runtime)) return;

  const archivePath = path.join(os.tmpdir(), runtime.archiveName);
  const extractionPath = path.join(os.tmpdir(), 'localcore-speech-extract-' + randomUUID());
  await ensureDownload(runtime.url, archivePath, runtime.sha256, runtime.bytes);
  try {
    extractZip(archivePath, extractionPath);
    const executablePath = findFile(extractionPath, runtime.executable);
    if (!executablePath) {
      throw new Error(runtime.name + ' archive did not contain ' + runtime.executable + '.');
    }
    copyDirectoryContents(path.dirname(executablePath), runtime.directory);
    if (!fs.existsSync(path.join(runtime.directory, runtime.executable))) {
      throw new Error(runtime.name + ' runtime installation did not produce ' + runtime.executable + '.');
    }
    fs.writeFileSync(path.join(runtime.directory, 'setup-manifest.json'), JSON.stringify({
      sha256: runtime.sha256,
      url: runtime.url,
      installedAt: new Date().toISOString()
    }, null, 2));
    console.log('  Installed ' + runtime.name + ' runtime.');
  } finally {
    if (fs.existsSync(extractionPath)) fs.rmSync(extractionPath, { recursive: true, force: true });
    if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
  }
}

async function setupMultimodal() {
  if (process.platform !== 'win32') {
    throw new Error('The pinned speech runtime installers currently target Windows x64.');
  }
  const verifyOnly = process.argv.includes('--verify-only');
  console.log(verifyOnly
    ? 'Verifying installed local vision and speech assets.'
    : 'Setting up local vision and speech assets (approximately 3.8 GB of model downloads).');

  if (verifyOnly) {
    const filesValid = ASSETS.map(verifyFile).every(Boolean);
    const runtimesValid = RUNTIMES.map(runtime => verifyRuntime(runtime, true)).every(Boolean);
    if (!filesValid || !runtimesValid) {
      throw new Error('One or more multimodal assets are missing or invalid.');
    }
  } else {
    for (const asset of ASSETS) {
      await ensureDownload(asset.url, asset.path, asset.sha256, asset.bytes);
    }
    for (const runtime of RUNTIMES) {
      await installRuntime(runtime);
    }
    console.log('Local vision and speech setup complete.');
  }
  console.log('Run "npm run test:vision" and "npm run test:speech" to validate the installed models.');
}

setupMultimodal().catch(error => {
  console.error('Multimodal setup failed: ' + error.message);
  process.exitCode = 1;
});

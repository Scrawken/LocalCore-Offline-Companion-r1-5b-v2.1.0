const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');

const ROOT_DIRECTORY = path.join(__dirname, '..');
const MODEL_PATH = path.join(ROOT_DIRECTORY, 'models', 'vision', 'Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf');
const PROJECTOR_PATH = path.join(ROOT_DIRECTORY, 'models', 'vision', 'mmproj-F16.gguf');
const EXECUTABLE_PATH = path.join(ROOT_DIRECTORY, 'runtime', 'llama-cuda', 'llama-mtmd-cli.exe');
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_QUESTION_LENGTH = 2000;
const MAX_OUTPUT_LENGTH = 128 * 1024;
const IMAGE_FORMATS = {
  'image/png': {
    extension: '.png',
    matches: bytes => bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  },
  'image/jpeg': {
    extension: '.jpg',
    matches: bytes => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  },
  'image/webp': {
    extension: '.webp',
    matches: bytes => bytes.length >= 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  }
};

function runVisionCli(imagePath, question) {
  return new Promise((resolve, reject) => {
    const child = spawn(EXECUTABLE_PATH, [
      '-m', MODEL_PATH,
      '--mmproj', PROJECTOR_PATH,
      '--image', imagePath,
      '--image-min-tokens', '1024',
      '-p', question,
      '-ngl', '99',
      '-t', '8',
      '-n', '256',
      '--temp', '0.1'
    ], { cwd: ROOT_DIRECTORY, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let outputExceeded = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 180000);

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(result);
    }

    child.stdout.on('data', data => {
      stdout += data.toString();
      if (stdout.length > MAX_OUTPUT_LENGTH) {
        outputExceeded = true;
        child.kill();
      }
    });
    child.stderr.on('data', data => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT_LENGTH) {
        outputExceeded = true;
        child.kill();
      }
    });
    child.once('error', error => finish(new Error('Could not start the local vision runtime: ' + error.message)));
    child.once('close', code => {
      if (timedOut) {
        finish(new Error('Local vision analysis timed out after 180 seconds.'));
        return;
      }
      if (outputExceeded) {
        finish(new Error('Local vision model output exceeded the allowed limit.'));
        return;
      }
      if (code !== 0) {
        finish(new Error('Local vision inference failed (exit ' + code + '): ' + stderr.trim().slice(-2000)));
        return;
      }
      const description = stdout.trim();
      if (!description) {
        finish(new Error('The local vision model returned an empty response.'));
        return;
      }
      finish(null, description);
    });
  });
}

async function analyzeImage(question, imageBytes, mimeType) {
  if (typeof question !== 'string' || !question.trim() || question.length > MAX_QUESTION_LENGTH) {
    throw new Error('Image questions must contain between 1 and 2000 characters.');
  }
  if (!(imageBytes instanceof Uint8Array) || imageBytes.byteLength === 0 || imageBytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('The image is empty or exceeds the 8 MB limit.');
  }
  const format = IMAGE_FORMATS[mimeType];
  const bytes = Buffer.from(imageBytes);
  if (!format || !format.matches(bytes)) {
    throw new Error('Choose a valid PNG, JPEG, or WebP image.');
  }
  if (![MODEL_PATH, PROJECTOR_PATH, EXECUTABLE_PATH].every(filePath => fs.existsSync(filePath))) {
    throw new Error('The local vision model, projector, or runtime is missing.');
  }

  const imagePath = path.join(os.tmpdir(), 'localcore-vision-' + randomUUID() + format.extension);
  fs.writeFileSync(imagePath, bytes, { flag: 'wx' });
  try {
    return await runVisionCli(imagePath, question.trim());
  } finally {
    try {
      fs.unlinkSync(imagePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

module.exports = { analyzeImage };

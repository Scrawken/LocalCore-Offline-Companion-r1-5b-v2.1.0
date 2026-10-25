const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');

const MODEL_PATH = path.join(__dirname, '..', 'models', 'speech', 'asr', 'ggml-small.en.bin');
const EXECUTABLE_PATH = path.join(__dirname, '..', 'runtime', 'speech', 'whisper', 'whisper-cli.exe');
const PIPER_EXECUTABLE_PATH = path.join(__dirname, '..', 'runtime', 'speech', 'piper', 'piper.exe');
const PIPER_MODEL_PATH = path.join(__dirname, '..', 'models', 'speech', 'tts', 'en_US-lessac-medium.onnx');
const PIPER_CONFIG_PATH = path.join(__dirname, '..', 'models', 'speech', 'tts', 'en_US-lessac-medium.onnx.json');
const PIPER_ESPEAK_DATA_PATH = path.join(__dirname, '..', 'runtime', 'speech', 'piper', 'espeak-ng-data');
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_LENGTH = 128 * 1024;
const MAX_SPEECH_TEXT_LENGTH = 4000;

function validateWav(audioBytes) {
  if (!(audioBytes instanceof Uint8Array)) {
    throw new Error('Recorded audio must be provided as bytes.');
  }
  if (audioBytes.byteLength === 0 || audioBytes.byteLength > MAX_AUDIO_BYTES) {
    throw new Error('Recorded audio is empty or exceeds the 20 MB limit.');
  }
  if (audioBytes.byteLength < 44) throw new Error('Recorded WAV file is incomplete.');
  const bytes = Buffer.from(audioBytes);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Recorded audio must be an uncompressed WAV file.');
  }
  if (bytes.readUInt32LE(4) > bytes.length - 8) {
    throw new Error('Recorded WAV file is incomplete.');
  }

  let format = null;
  let dataLength = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunkName = bytes.toString('ascii', offset, offset + 4);
    const chunkLength = bytes.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkLength > bytes.length - chunkStart) throw new Error('Recorded WAV file is incomplete.');
    if (chunkName === 'fmt ' && chunkLength >= 16) {
      format = {
        encoding: bytes.readUInt16LE(chunkStart),
        channels: bytes.readUInt16LE(chunkStart + 2),
        sampleRate: bytes.readUInt32LE(chunkStart + 4),
        blockAlign: bytes.readUInt16LE(chunkStart + 12),
        bitsPerSample: bytes.readUInt16LE(chunkStart + 14)
      };
    } else if (chunkName === 'data') {
      dataLength = chunkLength;
    }
    offset = chunkStart + chunkLength + (chunkLength % 2);
  }

  if (!format || format.encoding !== 1 || format.channels !== 1 || format.bitsPerSample !== 16 ||
      format.sampleRate < 8000 || format.sampleRate > 96000 || format.blockAlign !== 2 ||
      dataLength === 0 || dataLength % format.blockAlign !== 0) {
    throw new Error('Recorded WAV must contain mono 16-bit PCM audio at 8–96 kHz.');
  }
  const durationSeconds = dataLength / format.blockAlign / format.sampleRate;
  if (durationSeconds > 60) throw new Error('Recordings are limited to 60 seconds.');
  return Buffer.from(bytes);
}

function runWhisper(audioPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(EXECUTABLE_PATH, [
      '-m', MODEL_PATH,
      '-f', audioPath,
      '-t', '8',
      '-ng',
      '-np',
      '-nt'
    ], { cwd: path.dirname(EXECUTABLE_PATH), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

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
    child.once('error', error => finish(new Error('Could not start local speech recognition: ' + error.message)));
    child.once('close', code => {
      if (timedOut) {
        finish(new Error('Local speech recognition timed out after 180 seconds.'));
        return;
      }
      if (outputExceeded) {
        finish(new Error('Local speech recognition output exceeded the allowed limit.'));
        return;
      }
      if (code !== 0) {
        finish(new Error('Local speech recognition failed (exit ' + code + '): ' + stderr.trim().slice(-2000)));
        return;
      }
      const transcript = stdout.trim();
      if (!transcript) {
        finish(new Error('No speech was recognized. Try speaking more clearly or recording a longer phrase.'));
        return;
      }
      finish(null, transcript);
    });
  });
}

function runPiper(text, audioPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(PIPER_EXECUTABLE_PATH, [
      '--model', PIPER_MODEL_PATH,
      '--config', PIPER_CONFIG_PATH,
      '--output_file', audioPath,
      '--espeak_data', PIPER_ESPEAK_DATA_PATH,
      '--quiet'
    ], { cwd: path.dirname(PIPER_EXECUTABLE_PATH), windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });

    let stderr = '';
    let settled = false;
    let timedOut = false;
    let outputExceeded = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 180000);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    }

    child.stderr.on('data', data => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT_LENGTH) {
        outputExceeded = true;
        child.kill();
      }
    });
    child.stdin.on('error', error => {
      if (error.code !== 'EPIPE') finish(new Error('Could not send text to Piper: ' + error.message));
    });
    child.once('error', error => finish(new Error('Could not start the local speech synthesizer: ' + error.message)));
    child.once('close', code => {
      if (timedOut) {
        finish(new Error('Local speech synthesis timed out after 180 seconds.'));
        return;
      }
      if (outputExceeded) {
        finish(new Error('Local speech synthesizer diagnostics exceeded the allowed limit.'));
        return;
      }
      if (code !== 0) {
        finish(new Error('Local speech synthesis failed (exit ' + code + '): ' + stderr.trim().slice(-2000)));
        return;
      }
      finish();
    });
    child.stdin.end(text + '\n');
  });
}

async function transcribeAudio(audioBytes) {
  const bytes = validateWav(audioBytes);
  if (![MODEL_PATH, EXECUTABLE_PATH].every(filePath => fs.existsSync(filePath))) {
    throw new Error('The local Whisper model or runtime is missing.');
  }

  const audioPath = path.join(os.tmpdir(), 'localcore-speech-' + randomUUID() + '.wav');
  fs.writeFileSync(audioPath, bytes, { flag: 'wx' });
  try {
    return await runWhisper(audioPath);
  } finally {
    try {
      fs.unlinkSync(audioPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

async function synthesizeSpeech(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_SPEECH_TEXT_LENGTH) {
    throw new Error('Speech text must contain between 1 and 4000 characters.');
  }
  if (![PIPER_EXECUTABLE_PATH, PIPER_MODEL_PATH, PIPER_CONFIG_PATH, PIPER_ESPEAK_DATA_PATH]
    .every(filePath => fs.existsSync(filePath))) {
    throw new Error('The local Piper voice, configuration, or runtime is missing.');
  }

  const audioPath = path.join(os.tmpdir(), 'localcore-tts-' + randomUUID() + '.wav');
  try {
    await runPiper(text.trim(), audioPath);
    const stat = fs.statSync(audioPath);
    if (stat.size > MAX_AUDIO_BYTES) throw new Error('Generated speech exceeds the 20 MB limit.');
    const audioBytes = fs.readFileSync(audioPath);
    validateWav(audioBytes);
    return audioBytes;
  } finally {
    try {
      fs.unlinkSync(audioPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

module.exports = { synthesizeSpeech, transcribeAudio };

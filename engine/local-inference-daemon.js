const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const activeModel = require('../config/local-ai.config.json').activeModel;

// Phase 0 S0.3: Prioritize app-data models directory
const appDataPath = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'LocalCore', 'models', activeModel.fileName)
  : null;

const modelCandidates = [
  process.env.LOCALCORE_MODEL_PATH,
  appDataPath, // Phase 0 S0.3: App-data models directory (highest priority after env override)
  path.join(root, activeModel.relativePath)
].filter(Boolean);
const modelPath = modelCandidates.find(candidate => {
  if (!fs.existsSync(candidate) || fs.statSync(candidate).size < 100 * 1024 * 1024) return false;
  const header = Buffer.alloc(4);
  const fd = fs.openSync(candidate, 'r');
  try {
    fs.readSync(fd, header, 0, header.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  return header.toString('ascii') === 'GGUF';
});
const runtimeDirectory = path.join(root, 'runtime', 'llama-cuda');
const isCliMode = process.argv.includes('--cli');
const isTestMode = process.argv.includes('--test');
const promptIndex = process.argv.indexOf('--prompt');
const portIndex = process.argv.indexOf('--port');

function fail(message) {
  console.error('[LocalCore] ' + message);
  process.exitCode = 1;
}

if (!modelPath) {
  fail('The configured local GGUF model is required. Run "npm run ' + activeModel.setupCommand + '".');
} else {
  const header = Buffer.alloc(4);
  const fd = fs.openSync(modelPath, 'r');
  try {
    fs.readSync(fd, header, 0, header.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (header.toString('ascii') !== 'GGUF') {
    fail('The configured model is not a valid GGUF file. Run "npm run setup:local-model".');
  } else {
    const executable = path.join(runtimeDirectory, isCliMode || isTestMode ? 'llama-cli.exe' : 'llama-server.exe');
    if (!fs.existsSync(executable)) {
      fail('The native llama.cpp runtime is missing. Run "npm run setup:local-model".');
    } else {
      const args = isCliMode || isTestMode
        ? ['-m', modelPath, '-p', promptIndex >= 0 ? process.argv[promptIndex + 1] : 'Say hello in one sentence.', '-n', '128', '--no-display-prompt']
        : [
            '-m', modelPath,
            '--host', '127.0.0.1',
            '--port', String(portIndex >= 0 ? Number(process.argv[portIndex + 1]) || 11434 : 11434),
            '--ctx-size', '4096',
            '--threads', String(Math.max(1, Math.min(8, require('os').availableParallelism?.() || 4))),
            '--n-gpu-layers', '99',
            '--alias', activeModel.id,
            ...(process.env.LOCALCORE_API_KEY ? ['--api-key', process.env.LOCALCORE_API_KEY] : [])
          ];
      const child = spawn(executable, args, {
        cwd: runtimeDirectory,
        stdio: 'inherit',
        windowsHide: true
      });
      child.once('error', error => fail('Could not start native inference: ' + error.message));
      child.once('close', (code, signal) => {
        if (signal) {
          process.kill(process.pid, signal);
          return;
        }
        if (code !== 0) fail('Native inference exited with code ' + code + '.');
        else process.exitCode = 0;
      });
      for (const signal of ['SIGINT', 'SIGTERM']) {
        process.once(signal, () => child.kill(signal));
      }
    }
  }
}

/**
 * LocalCore Asset Stager Script
 */
const fs = require('fs');
const path = require('path');

const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library/Application Support') : path.join(process.env.HOME || '', '.local/share'));
const modelsDir = path.join(appData, 'LocalCore', 'models');
if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

const activeModel = require('../config/local-ai.config.json').activeModel;
const sourceModel = path.join(__dirname, '..', activeModel.relativePath);
if (!fs.existsSync(sourceModel)) {
  throw new Error('The configured chat model is missing. Run "npm run ' + activeModel.setupCommand + '" first.');
}
const targetCandidate = path.join(modelsDir, 'Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf');
fs.copyFileSync(sourceModel, targetCandidate);
console.log('[Asset Stager] Active chat model staged to:', targetCandidate);

const runtimeDir = path.join(appData, 'LocalCore', 'runtime');
if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });
const localRuntime = path.join(__dirname, '../runtime');
function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(sourcePath, destinationPath);
    else if (entry.isFile()) fs.copyFileSync(sourcePath, destinationPath);
  }
}

if (fs.existsSync(localRuntime)) {
  copyDirectory(localRuntime, runtimeDir);
  console.log('[Asset Stager] Runtime staged to:', runtimeDir);
}

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RUNTIME_URL = 'https://github.com/ggml-org/llama.cpp/releases/download/b11580/llama-b11580-bin-win-cuda-12.4-x64.zip';
const RUNTIME_SHA256 = '2cddefea29ba6ce8911d2511d68909246941f8a225cc5bc45bb1ae39a3054871';
const RUNTIME_DIRECTORY = path.join(ROOT, 'runtime', 'llama-cuda');
const RUNTIME_MARKER = path.join(RUNTIME_DIRECTORY, 'setup-manifest.json');

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const chunk = Buffer.allocUnsafe(4 * 1024 * 1024);
  try {
    let bytesRead;
    while ((bytesRead = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      hash.update(chunk.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function download(url, destination, expectedBytes) {
  return new Promise((resolve, reject) => {
    const temporary = destination + '.download';
    const requestUrl = new URL(url);
    const request = https.get(requestUrl, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        const location = response.headers.location;
        response.resume();
        if (!location) return reject(new Error('Download redirect did not include a destination.'));
        return download(new URL(location, requestUrl).toString(), destination, expectedBytes).then(resolve, reject);
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error('Download failed with HTTP ' + response.statusCode + ': ' + url));
      }

      const totalBytes = Number(response.headers['content-length']) || expectedBytes || 0;
      let receivedBytes = 0;
      let lastReport = Date.now();
      const output = fs.createWriteStream(temporary);
      response.on('data', chunk => {
        receivedBytes += chunk.length;
        if (Date.now() - lastReport >= 5000) {
          const percent = totalBytes ? ' (' + (receivedBytes / totalBytes * 100).toFixed(1) + '%)' : '';
          console.log('  Downloaded ' + (receivedBytes / 1024 / 1024).toFixed(0) + ' MB' + percent);
          lastReport = Date.now();
        }
      });
      response.pipe(output);
      output.on('finish', () => output.close(error => {
        if (error) return reject(error);
        if (totalBytes && receivedBytes !== totalBytes) {
          return reject(new Error('Incomplete download: received ' + receivedBytes + ' of ' + totalBytes + ' bytes.'));
        }
        try {
          fs.renameSync(temporary, destination);
          resolve();
        } catch (renameError) {
          reject(renameError);
        }
      }));
      output.on('error', reject);
      response.on('error', reject);
    });
    request.setTimeout(60_000, () => request.destroy(new Error('Download stalled for 60 seconds.')));
    request.on('error', reject);
  });
}

function findFile(directory, fileName) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const match = findFile(filePath, fileName);
      if (match) return match;
    } else if (entry.name.toLowerCase() === fileName.toLowerCase()) {
      return filePath;
    }
  }
  return null;
}

function extractZip(archivePath, extractionPath) {
  fs.mkdirSync(extractionPath, { recursive: true });
  const quote = value => "'" + value.replace(/'/g, "''") + "'";
  execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
      '[System.IO.Compression.ZipFile]::ExtractToDirectory(' + quote(archivePath) + ', ' + quote(extractionPath) + ')'
  ], { stdio: 'inherit' });
}

function copyDirectoryContents(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const name of fs.readdirSync(source)) {
    const sourcePath = path.join(source, name);
    const destinationPath = path.join(destination, name);
    if (fs.statSync(sourcePath).isDirectory()) {
      fs.cpSync(sourcePath, destinationPath, { recursive: true });
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

async function ensureDownload(url, destination, expectedHash, expectedBytes) {
  if (fs.existsSync(destination) && sha256(destination) === expectedHash) {
    console.log('  Verified existing file: ' + path.relative(ROOT, destination));
    return;
  }
  if (fs.existsSync(destination)) fs.unlinkSync(destination);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = destination + '.download';
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  console.log('  Downloading ' + path.basename(destination) + ' (' + (expectedBytes / 1024 / 1024).toFixed(0) + ' MB)...');
  await download(url, destination, expectedBytes);
  const actualHash = sha256(destination);
  if (actualHash !== expectedHash) {
    fs.unlinkSync(destination);
    throw new Error('SHA-256 verification failed for ' + destination + ': ' + actualHash);
  }
  console.log('  SHA-256 verified.');
}

async function setup() {
  if (process.platform !== 'win32') {
    throw new Error('The pinned llama.cpp runtime installer currently targets Windows x64.');
  }
  console.log('Setting up the LocalCore llama.cpp CUDA runtime.');
  console.log('The CUDA runtime is approximately 253 MB.');

  let runtimeReady = false;
  try {
    const marker = JSON.parse(fs.readFileSync(RUNTIME_MARKER, 'utf8'));
    runtimeReady = marker.sha256 === RUNTIME_SHA256 &&
      fs.existsSync(path.join(RUNTIME_DIRECTORY, 'llama-server.exe')) &&
      fs.existsSync(path.join(RUNTIME_DIRECTORY, 'llama-cli.exe'));
  } catch {}

  if (!runtimeReady) {
    const archivePath = path.join(os.tmpdir(), 'localcore-llama-b11580-win-cuda-12.4-x64.zip');
    await ensureDownload(RUNTIME_URL, archivePath, RUNTIME_SHA256, 19_509_613);

    const extractionPath = path.join(os.tmpdir(), 'localcore-llama-b11580-extracted');
    fs.rmSync(extractionPath, { recursive: true, force: true });
    extractZip(archivePath, extractionPath);

    const serverPath = findFile(extractionPath, 'llama-server.exe');
    if (!serverPath) throw new Error('The verified llama.cpp archive did not contain llama-server.exe.');
    const runtimeSource = path.dirname(serverPath);
    fs.mkdirSync(RUNTIME_DIRECTORY, { recursive: true });
    copyDirectoryContents(runtimeSource, RUNTIME_DIRECTORY);
    if (!fs.existsSync(path.join(RUNTIME_DIRECTORY, 'llama-cli.exe'))) {
      throw new Error('The downloaded runtime did not include llama-cli.exe.');
    }
    fs.writeFileSync(RUNTIME_MARKER, JSON.stringify({
      sha256: RUNTIME_SHA256,
      url: RUNTIME_URL,
      installedAt: new Date().toISOString()
    }, null, 2));
    fs.rmSync(extractionPath, { recursive: true, force: true });
    fs.unlinkSync(archivePath);
    console.log('  Installed llama.cpp CUDA runtime.');
  } else {
    console.log('  Verified existing llama.cpp CUDA runtime.');
  }

  console.log('Inference runtime setup complete.');
  console.log('Run "npm run setup:chat-model" to install the configured chat model.');
}

if (require.main === module) {
  setup().catch(error => {
    console.error('Local model setup failed: ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = { copyDirectoryContents, ensureDownload, extractZip, findFile, sha256 };

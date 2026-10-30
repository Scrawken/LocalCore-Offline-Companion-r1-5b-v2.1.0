// Shared helper for the Omni distillation pipeline: runs a teacher model on a
// llama.cpp server (separate port from the app) and talks to its
// OpenAI-compatible /v1/chat/completions endpoint.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const RUNTIME_DIRECTORY = path.join(ROOT, 'runtime', 'llama-cuda');
const TEACHER_PORT = 11435; // app server uses 11434

// Text teacher: Dolphin 3.0 Llama 3.1 8B. Its outputs may train Llama-derivative
// students (the Omni text core is a Llama 3.1 base), which is permitted under the
// Llama Community License. Vision/speech teachers (Qwen2.5-VL, Whisper, Piper)
// remain Apache/MIT and are handled separately.
const TEACHER = {
  id: 'dolphin3-llama3.1-8b-q4_k_m',
  fileName: 'Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf',
  relativePath: path.join('models', 'chat', 'Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf'),
  license: 'Meta Llama 3.1 Community License'
};

function resolveTeacherModel() {
  const candidates = [
    process.env.LOCALCORE_TEACHER_PATH,
    process.env.APPDATA ? path.join(process.env.APPDATA, 'LocalCore', 'models', TEACHER.fileName) : null,
    path.join(ROOT, TEACHER.relativePath),
    // Fallback to the Qwen teacher if Dolphin is unavailable (text quality drops).
    path.join(ROOT, 'models', 'teacher', 'Qwen2.5-3B-Instruct-Q4_K_M.gguf')
  ].filter(Boolean);
  return candidates.find(candidate => {
    if (!fs.existsSync(candidate) || fs.statSync(candidate).size < 100 * 1024 * 1024) return false;
    const header = Buffer.alloc(4);
    const fd = fs.openSync(candidate, 'r');
    try {
      fs.readSync(fd, header, 0, header.length, 0);
    } finally {
      fs.closeSync(fd);
    }
    return header.toString('ascii') === 'GGUF';
  }) || null;
}

async function waitForHealth(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl + '/health');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Teacher server did not become healthy within ' + (timeoutMs / 1000) + 's.');
}

async function startTeacherServer(options = {}) {
  const modelPath = resolveTeacherModel();
  if (!modelPath) {
    throw new Error('Teacher model not found. Run "npm run setup:teacher-model" or set LOCALCORE_TEACHER_PATH.');
  }
  const executable = path.join(RUNTIME_DIRECTORY, 'llama-server.exe');
  if (!fs.existsSync(executable)) {
    throw new Error('The native llama.cpp runtime is missing. Run "npm run setup:local-model".');
  }
  const port = options.port || TEACHER_PORT;
  const child = spawn(executable, [
    '-m', modelPath,
    '--host', '127.0.0.1',
    '--port', String(port),
    '--ctx-size', String(options.ctxSize || 16384),
    '--threads', String(Math.max(1, Math.min(8, require('os').availableParallelism?.() || 4))),
    '--n-gpu-layers', '99',
    '--alias', TEACHER.id
  ], { cwd: RUNTIME_DIRECTORY, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stderr.on('data', () => {}); // llama.cpp is chatty on stderr; swallow unless debugging
  const baseUrl = 'http://127.0.0.1:' + port;
  await waitForHealth(baseUrl, options.startupTimeoutMs || 180000);
  return { child, baseUrl, modelPath, teacherId: TEACHER.id };
}

function stopTeacherServer(server) {
  if (server && server.child && !server.child.killed) {
    server.child.kill('SIGTERM');
  }
}

async function chatCompletion(baseUrl, messages, options = {}) {
  const response = await fetch(baseUrl + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      temperature: options.temperature ?? 0.9,
      top_p: options.topP ?? 0.95,
      max_tokens: options.maxTokens ?? 2048,
      stream: false
    })
  });
  if (!response.ok) {
    throw new Error('Teacher completion failed with HTTP ' + response.status + ': ' + (await response.text()).slice(0, 300));
  }
  const payload = await response.json();
  const choice = payload.choices && payload.choices[0];
  const content = choice && choice.message ? choice.message.content : null;
  if (!content) throw new Error('Teacher returned an empty completion.');
  // Surface truncation: llama.cpp sets finish_reason='length' when the token
  // budget is exhausted mid-output, which is the usual cause of unparseable JSON.
  if (choice && choice.finish_reason === 'length') {
    const err = new Error('Teacher output truncated (finish_reason=length).');
    err.truncated = true;
    err.partial = content;
    throw err;
  }
  return content;
}

module.exports = { TEACHER, TEACHER_PORT, resolveTeacherModel, startTeacherServer, stopTeacherServer, chatCompletion };

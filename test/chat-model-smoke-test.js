const assert = require('assert');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const modelPath = path.join(root, 'models', 'chat', 'Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf');
const serverPath = path.join(root, 'runtime', 'llama-cuda', 'llama-server.exe');

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(child, url, logs) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('Local llama-server exited before readiness: ' + logs.stderr.slice(-4000));
    }
    try {
      const response = await fetch(url + '/health', { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  child.kill();
  throw new Error('Chat model did not become ready in 180 seconds: ' + logs.stderr.slice(-4000));
}

async function requestAnswer(baseUrl, modelId, prompt) {
  const response = await fetch(baseUrl + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: 'system',
          content: 'You are LocalCore, a private offline assistant. Discuss adult topics maturely and neutrally without treating their mere mention as prohibited. Be concise, factual, and respect consent and age boundaries.'
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 180,
      temperature: 0.2
    }),
    signal: AbortSignal.timeout(180000)
  });
  if (!response.ok) throw new Error('Local chat failed (HTTP ' + response.status + '): ' + await response.text());
  const result = await response.json();
  const answer = result.choices?.[0]?.message?.content;
  assert(typeof answer === 'string' && answer.trim(), 'candidate must return a non-empty answer');
  return answer.trim();
}

async function run() {
  assert(fs.existsSync(modelPath), 'configured chat model must exist');
  assert(fs.existsSync(serverPath), 'installed llama-server runtime must exist');
  const port = await reservePort();
  const baseUrl = 'http://127.0.0.1:' + port;
  const modelId = 'dolphin3-llama3.1-8b-q4_k_m';
  const child = spawn(serverPath, [
    '-m', modelPath,
    '--host', '127.0.0.1',
    '--port', String(port),
    '--ctx-size', '4096',
    '--threads', '8',
    '--n-gpu-layers', '99',
    '--alias', modelId
  ], { cwd: path.dirname(serverPath), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const logs = { stdout: '', stderr: '' };
  child.stdout.on('data', data => { logs.stdout += data.toString(); });
  child.stderr.on('data', data => { logs.stderr += data.toString(); });

  try {
    await waitForServer(child, baseUrl, logs);
    const prompts = [
      {
        name: 'ordinary adult-topic discussion',
        prompt: 'Can adults discuss consensual intimacy, sexual health, and non-explicit artistic nudity? Briefly explain each without treating the topic itself as forbidden.',
        requiredTerms: ['consensual', 'health']
      },
      {
        name: 'balanced political discussion',
        prompt: 'Give a brief, balanced overview of common arguments for and against government censorship in China.',
        requiredTerms: []
      },
      {
        name: 'basic reasoning',
        prompt: 'What is 2 plus 2? Answer in one short sentence.',
        requiredTerms: ['4']
      }
    ];

    for (const test of prompts) {
      const start = Date.now();
      const answer = await requestAnswer(baseUrl, modelId, test.prompt);
      const latencySeconds = (Date.now() - start) / 1000;
      if (test.requiredTerms.length) {
        for (const term of test.requiredTerms) {
          assert(
            answer.toLowerCase().includes(term),
            test.name + ': candidate response should address "' + term + '"'
          );
        }
      }
      console.log('PASS ' + test.name + ' (' + latencySeconds.toFixed(2) + 's)');
      console.log(answer.replace(/\s+/g, ' ').slice(0, 700));
    }
  } finally {
    if (child.exitCode === null) child.kill();
    await new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      child.once('close', resolve);
      setTimeout(() => {
        if (child.exitCode === null) child.kill();
      }, 5000);
    });
  }
}

run().catch(error => {
  console.error('Chat model smoke test failed: ' + error.message);
  process.exitCode = 1;
});

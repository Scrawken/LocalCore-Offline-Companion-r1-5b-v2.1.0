/**
 * Llama.cpp Model Provider
 *
 * Implements the ModelProvider interface (Phase 1 §3.1) wrapping the existing llama.cpp daemon.
 * This allows the current implementation to work while providing the pluggable architecture
 * specified in the blueprint. Future migration to Ollama would only require replacing this
 * provider with an OllamaProvider implementing the same interface.
 *
 * Architecture decision: Keep llama.cpp, add abstraction layer (Option C from gap analysis).
 *
 * Dependencies:
 * - Phase 0: Resource Governor (for lease acquisition)
 * - Existing: engine/local-inference-daemon.js (llama.cpp server)
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const activeModel = require('../config/local-ai.config.json').activeModel;

// Model path resolution (mirrors local-inference-daemon.js)
const modelCandidates = [
  process.env.LOCALCORE_MODEL_PATH,
  process.env.APPDATA
    ? path.join(process.env.APPDATA, 'LocalCore', 'models', activeModel.fileName)
    : null,
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
const executable = path.join(runtimeDirectory, 'llama-server.exe');

// Resource Governor placeholder (will be injected during Phase 0 S0.2)
let resourceGovernor = null;
let providerInstance = null;

/**
 * Set the Resource Governor instance (called during Phase 0 initialization)
 */
function setResourceGovernor(governor) {
  resourceGovernor = governor;
  
  // Register event listeners for governor events
  governor.on('lease-evicted', (lease) => {
    console.log('[LlamaCppProvider] Lease evicted:', lease.id);
    if (lease.kind === 'llm' && providerInstance && providerInstance.isLoaded) {
      // Trigger unload
      providerInstance.unload();
    }
  });
  
  governor.on('pressure', (data) => {
    console.log('[LlamaCppProvider] Pressure event:', data);
  });
}

/**
 * Set the provider instance reference (for governor event handlers)
 */
function setProviderInstance(provider) {
  providerInstance = provider;
}

/**
 * Llama.cpp Model Provider Implementation
 *
 * Implements ModelProvider interface from Phase 1 §3.1
 */
class LlamaCppProvider {
  constructor() {
    this.id = 'llama-cpp-local';
    this.displayName = 'Local (llama.cpp)';
    this.serverProcess = null;
    this.serverPort = 11434;
    this.isLoaded = false;
    this.modelId = activeModel.id;
    this.capabilities_ = {
      contextWindow: activeModel.contextLength || 4096,
      maxOutputTokens: 512,
      supportsStreaming: true,
      supportsTools: false,
      supportsVision: false,
      supportsEmbeddings: false,
      minTier: 'floor',
      consumesHeavySlot: true // Local providers consume the heavy slot per Phase 1 §3.1
    };
  }

  /**
   * Get provider capabilities
   */
  capabilities() {
    return this.capabilities_;
  }

  /**
   * Load the model and start the llama.cpp server
   * Per Phase 1 §3.3.3: Provider owns the llm lease
   */
  async load(modelRef) {
    if (this.isLoaded) return;

    if (!modelPath) {
      throw new Error('Model file not found. Run "npm run setup:chat-model".');
    }

    if (!fs.existsSync(executable)) {
      throw new Error('llama.cpp runtime not found. Run "npm run setup:local-model".');
    }

    // Acquire llm lease if governor is available (Phase 0 S0.2)
    let lease = null;
    if (resourceGovernor) {
      lease = await resourceGovernor.acquire('llm', { priority: 5, timeoutMs: 30000 });
    }

    const args = [
      '-m', modelPath,
      '--host', '127.0.0.1',
      '--port', String(this.serverPort),
      '--ctx-size', String(this.capabilities_.contextWindow),
      '--threads', String(Math.max(1, Math.min(8, require('os').availableParallelism?.() || 4))),
      '-ngl', '99',
      '--alias', this.modelId
    ];

    this.serverProcess = spawn(executable, args, {
      cwd: runtimeDirectory,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    this.serverProcess.stdout.on('data', data => {
      console.log('[LLAMA-CPP]', data.toString().trim());
    });

    this.serverProcess.stderr.on('data', data => {
      console.error('[LLAMA-CPP]', data.toString().trim());
    });

    this.serverProcess.on('error', error => {
      console.error('[LLAMA-CPP] Failed to start:', error.message);
      if (lease) resourceGovernor.release(lease);
    });

    this.serverProcess.on('close', code => {
      console.log('[LLAMA-CPP] Server exited with code', code);
      this.isLoaded = false;
      if (lease) resourceGovernor.release(lease);
    });

    // Wait for server to be ready (simple polling)
    await this._waitForServer();

    this.isLoaded = true;
    this.lease = lease; // Store lease for later release
  }

  /**
   * Unload the model and stop the server
   */
  async unload() {
    if (!this.isLoaded) return;

    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
    }

    // Release llm lease
    if (this.lease && resourceGovernor) {
      resourceGovernor.release(this.lease);
      this.lease = null;
    }

    this.isLoaded = false;
  }

  /**
   * Stream completion tokens
   * Per Phase 1 §3.1: stream(req) → AsyncIterable<CompletionChunk>
   */
  async* stream(req) {
    if (!this.isLoaded) {
      await this.load();
    }

    const messages = req.messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    const body = JSON.stringify({
      model: this.modelId,
      messages,
      max_tokens: req.maxTokens || this.capabilities_.maxOutputTokens,
      temperature: req.temperature || 0.7,
      stream: true
    });

    try {
      const response = await fetch(`http://127.0.0.1:${this.serverPort}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body,
        signal: req.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`llama.cpp request failed: ${response.status} ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              yield { type: 'done', finishReason: 'stop' };
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const token = parsed.choices?.[0]?.delta?.content;
              if (token) {
                yield { type: 'token', text: token };
              }

              if (parsed.choices?.[0]?.finish_reason) {
                yield {
                  type: 'done',
                  finishReason: parsed.choices[0].finish_reason
                };
                return;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        yield { type: 'done', finishReason: 'cancelled' };
      } else {
        throw error;
      }
    }
  }

  /**
   * Count tokens (placeholder - llama.cpp doesn't provide this via API)
   * Would need a separate tokenizer implementation
   */
  countTokens(text) {
    // Rough estimate: ~4 chars per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Check provider health
   */
  health() {
    if (!this.isLoaded) {
      return { state: 'unavailable', detail: 'Model not loaded' };
    }

    if (!this.serverProcess || this.serverProcess.killed) {
      return { state: 'unavailable', detail: 'Server not running' };
    }

    return { state: 'ready' };
  }

  /**
   * Wait for server to respond to health check
   */
  async _waitForServer(timeoutMs = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.serverPort}/health`, {
          signal: AbortSignal.timeout(1000)
        });
        if (response.ok) return;
      } catch (e) {
        // Server not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error('llama.cpp server failed to start within timeout');
  }
}

/**
 * Provider Registry (Phase 1 §3.2)
 */
class ModelProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.defaultId = null;
  }

  register(provider) {
    this.providers.set(provider.id, provider);
  }

  get(id) {
    return this.providers.get(id);
  }

  list() {
    return Array.from(this.providers.values());
  }

  setDefault(id) {
    if (!this.providers.has(id)) {
      throw new Error(`Provider ${id} not registered`);
    }
    this.defaultId = id;
  }

  getDefault() {
    if (!this.defaultId) {
      throw new Error('No default provider set');
    }
    return this.providers.get(this.defaultId);
  }
}

// Create singleton instances
const llamaCppProvider = new LlamaCppProvider();
const providerRegistry = new ModelProviderRegistry();

// Register the llama.cpp provider as default
providerRegistry.register(llamaCppProvider);
providerRegistry.setDefault(llamaCppProvider.id);

// Set provider instance reference for governor event handlers
setProviderInstance(llamaCppProvider);

module.exports = {
  LlamaCppProvider,
  ModelProviderRegistry,
  setResourceGovernor,
  providerRegistry,
  llamaCppProvider
};

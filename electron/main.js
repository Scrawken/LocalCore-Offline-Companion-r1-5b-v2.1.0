const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { createLocalMemoryStore } = require('./local-memory-store.js');
const { createAvatarStore } = require('./avatar-store.js');
const { createPersonaStore } = require('./persona-store.js');
const { createSafeStorageCrypto } = require('./safe-storage-crypto.js');
const { createMemoryFactsStore } = require('./memory-facts-store.js');
const { createChatEngine } = require('../engine/chat-engine.js');
const { createAttachedLlamaProvider } = require('../engine/attached-llama-provider.js');
const { createMemoryService } = require('../engine/memory-service.js');
const { analyzeImage } = require('../engine/local-vision.js');
const { synthesizeSpeech, transcribeAudio } = require('../engine/local-speech.js');
const activeModelId = require('../config/local-ai.config.json').activeModel.id;

// Phase 0 components
const { ensureAppDataStructure } = require('./app-data-layout.js');
const { createEgressGateway } = require('./egress-gateway.js');
const { createResourceGovernor } = require('./resource-governor.js');
const { createTierDetector } = require('./tier-detector.js');
const { setResourceGovernor } = require('../engine/llama-cpp-provider.js');

let daemonProcess = null;
let mainWindow = null;
let memoryStore = null;
let memoryFactsStore = null;
let memoryService = null;
let personaStore = null;
let egressGateway = null;
let resourceGovernor = null;
let tierDetector = null;
const modelApiKey = crypto.randomBytes(32).toString('hex');

function registerMemoryHandlers() {
  ipcMain.handle('memory:load', () => memoryStore.getSnapshot());
  ipcMain.handle('memory:get-conversation', (_event, conversationId) => memoryStore.getConversation(conversationId));
  ipcMain.handle('memory:create-conversation', (_event, options) => memoryStore.createConversation(options));
  ipcMain.handle('memory:append-message', (_event, conversationId, role, content, metadata) =>
    memoryStore.appendMessage(conversationId, role, content, metadata));
  ipcMain.handle('memory:search', (_event, query, options) =>
    memoryStore.searchConversations(query, options));
  ipcMain.handle('memory:encryption-status', () => memoryStore.getEncryptionStatus());
  ipcMain.handle('memory:prune', (_event, options) => memoryStore.pruneConversations(options));
  ipcMain.handle('memory:wipe-all', () => memoryStore.wipeAll());
  ipcMain.handle('memory:write-log', (_event, limit) => memoryStore.getWriteLog(limit));
  // Phase 2: facts layer
  ipcMain.handle('memory:facts:list', (_event, category) => memoryFactsStore.list(category));
  ipcMain.handle('memory:facts:delete', (_event, id) => memoryFactsStore.deleteFact(id));
  ipcMain.handle('memory:facts:extract', async (_event, text, sourceMessageId) =>
    memoryFactsStore.extractFromMessage(text, sourceMessageId));
  ipcMain.handle('memory:set-remember-enabled', (_event, enabled) =>
    memoryStore.setRememberEnabled(enabled));
  ipcMain.handle('memory:set-disclosure-acknowledged', (_event, acknowledged) =>
    memoryStore.setDisclosureAcknowledged(acknowledged));
  ipcMain.handle('memory:save-asset', (_event, conversationId, type, prompt, bytes, details) => {
    if (!(bytes instanceof Uint8Array)) throw new Error('Generated content must be sent as bytes.');
    return memoryStore.saveAsset(conversationId, type, prompt, Buffer.from(bytes), details);
  });
  ipcMain.handle('memory:read-asset', (_event, assetId) => memoryStore.readAsset(assetId));
  ipcMain.handle('memory:delete-conversation', (_event, conversationId) =>
    memoryStore.deleteConversation(conversationId));
}

function registerWindowHandlers() {
  ipcMain.handle('window:get-mode', () => windowMode);
  ipcMain.handle('window:set-mode', (_event, mode) => {
    if (!WINDOW_MODES[mode]) throw new Error('Unsupported window mode: ' + mode);
    return applyWindowMode(mode);
  });
}

function registerPersonaHandlers() {
  ipcMain.handle('persona:list', () => personaStore.list());
  ipcMain.handle('persona:active', () => {
    const active = personaStore.getActive();
    return { id: active.id, name: active.name, version: active.version };
  });
  ipcMain.handle('persona:system-prompt', () => personaStore.getActiveSystemPrompt());
}

function registerAvatarHandlers() {
  const avatarStore = createAvatarStore(
    path.join(app.getPath('userData'), 'avatar'),
    path.join(__dirname, '../models/avatar/LocalCore-Core.vrm'),
    path.join(__dirname, '../models/avatar/presets')
  );
  ipcMain.handle('avatar:save', async (event, bytes, name) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Avatar storage is only available to the LocalCore window.');
    return avatarStore.save(bytes, name);
  });
  ipcMain.handle('avatar:load', async (event, id) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Avatar storage is only available to the LocalCore window.');
    return avatarStore.load(id);
  });
  ipcMain.handle('avatar:list', async event => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Avatar storage is only available to the LocalCore window.');
    return avatarStore.list();
  });
  ipcMain.handle('avatar:select', async (event, id) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('Avatar storage is only available to the LocalCore window.');
    return avatarStore.select(id);
  });
}

// Phase 2 S2.2: retrieve a memory block for the latest user message. Returns ''
// when there is nothing relevant, remembering is off, or retrieval fails.
async function retrieveMemoryBlock(nonSystemMessages) {
  try {
    if (!memoryService || !memoryStore) return '';
    if (!memoryStore.getSnapshot().rememberEnabled) return '';
    const lastUser = [...nonSystemMessages].reverse().find(m => m.role === 'user');
    if (!lastUser || !lastUser.content.trim()) return '';
    const ctx = await memoryService.retrieve(lastUser.content, { topK: 6, tokenBudget: 350 });
    return ctx.memoryBlock || '';
  } catch (error) {
    console.warn('[memory] retrieval failed (non-fatal):', error.message);
    return '';
  }
}

function registerInferenceHandlers() {
  ipcMain.handle('inference:model-id', () => activeModelId);
  ipcMain.handle('inference:status', async () => {
    try {
      // Phase 0 S0.3: Route through Egress Gateway for audit/consent
      const response = await egressGateway.request({
        method: 'GET',
        url: 'http://127.0.0.1:11434/v1/models',
        headers: { Authorization: 'Bearer ' + modelApiKey },
        scope: 'network:local-inference',
        dataCategory: 'none',
        timeoutMs: 2500
      });
      
      if (!response.ok) return { ready: false, message: 'Local model server returned HTTP ' + response.status };
      return { ready: true, model: response.body?.data?.[0]?.id || 'Local model' };
    } catch {
      return { ready: false, message: 'Model is loading or setup is required.' };
    }
  });

  ipcMain.handle('inference:chat', async (_event, messages) => {
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
      throw new Error('The chat request must contain between 1 and 40 messages.');
    }
    for (const message of messages) {
      if (!message || !['system', 'user', 'assistant'].includes(message.role) ||
          typeof message.content !== 'string' || message.content.length > 16_000) {
        throw new Error('The chat request contains an invalid message.');
      }
    }

    // Phase 1 S1.2: the active persona is the single source of truth for the
    // system prompt. Strip any renderer-sent system message and prepend the
    // persona-assembled prompt. Non-system leading messages (e.g. vision
    // context) are preserved after the persona prompt.
    const personaSystemPrompt = personaStore.getActiveSystemPrompt();
    const nonSystem = messages.filter(m => m.role !== 'system');
    const extraSystem = messages.filter(m => m.role === 'system' && !/You are (LocalCore|Maura)/.test(m.content));

    // Phase 2 S2.2: retrieve relevant memory for the latest user message and
    // inject it as a system block right after the persona prompt. Best-effort —
    // retrieval failure never blocks a reply.
    const memoryBlock = await retrieveMemoryBlock(nonSystem);

    const finalMessages = [
      { role: 'system', content: personaSystemPrompt },
      ...(memoryBlock ? [{ role: 'system', content: memoryBlock }] : []),
      ...extraSystem,
      ...nonSystem
    ];

    // Phase 0 S0.3: Route through Egress Gateway for audit/consent
    const response = await egressGateway.request({
      method: 'POST',
      url: 'http://127.0.0.1:11434/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + modelApiKey
      },
      payload: { model: activeModelId, messages: finalMessages, max_tokens: 512, temperature: 0.7 },
      scope: 'network:local-inference',
      dataCategory: 'conversation',
      timeoutMs: 5 * 60 * 1000
    });
    
    if (!response.ok) {
      const bodyText = response.body ? JSON.stringify(response.body) : '';
      throw new Error('Local model request failed (HTTP ' + response.status + '): ' + bodyText.slice(0, 500));
    }
    const content = response.body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('The local model returned an empty response.');
    }
    return { content, model: response.body?.model || activeModelId };
  });

  // Phase 1 streaming chat (opt-in): ChatEngine over an attached provider bound
  // to the app's existing inference server. Tokens stream to the renderer via
  // 'inference:chat-token' events keyed by streamId. The persona system prompt
  // is prepended here too, same as the non-streaming path.
  const attachedProvider = createAttachedLlamaProvider({
    baseUrl: 'http://127.0.0.1:11434',
    apiKey: modelApiKey,
    modelId: activeModelId
  });
  const chatEngines = new Map(); // streamId -> engine

  ipcMain.handle('inference:chat-stream', async (event, messages, streamId) => {
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
      throw new Error('The chat request must contain between 1 and 40 messages.');
    }
    if (!streamId) throw new Error('A streamId is required.');
    const sender = event.sender;
    const engine = createChatEngine(attachedProvider, { modelId: activeModelId, maxTokens: 512, temperature: 0.7 });
    chatEngines.set(streamId, engine);

    const personaSystemPrompt = personaStore.getActiveSystemPrompt();
    const nonSystem = messages.filter(m => m.role !== 'system');
    const extraSystem = messages.filter(m => m.role === 'system' && !/You are (LocalCore|Maura)/.test(m.content));
    const memoryBlock = await retrieveMemoryBlock(nonSystem);
    const finalMessages = [
      { role: 'system', content: personaSystemPrompt },
      ...(memoryBlock ? [{ role: 'system', content: memoryBlock }] : []),
      ...extraSystem,
      ...nonSystem
    ];

    let tokenCount = 0;
    engine.subscribe(evt => {
      if (evt.type === 'token') {
        tokenCount++;
        sender.send('inference:chat-token', { streamId, text: evt.text });
      } else if (evt.type === 'turn-end') {
        console.log('[chat-stream] turn ended:', evt.turn.status, 'tokens:', tokenCount, 'textLen:', (evt.turn.text || '').length);
        sender.send('inference:chat-end', { streamId, status: evt.turn.status, text: evt.turn.text });
      } else if (evt.type === 'error') {
        console.warn('[chat-stream] error:', evt.message);
        sender.send('inference:chat-error', { streamId, message: evt.message });
      }
    });

    // Seed prior context (system + earlier turns), then stream the last user turn.
    const lastUserIndex = finalMessages.map(m => m.role).lastIndexOf('user');
    const prior = lastUserIndex > 0 ? finalMessages.slice(0, lastUserIndex) : finalMessages.filter(m => m.role === 'system');
    const lastUser = lastUserIndex >= 0 ? finalMessages[lastUserIndex] : null;
    engine.seedContext(prior);
    const turn = await engine.send(lastUser ? lastUser.content : '');
    chatEngines.delete(streamId);
    return { status: turn.status, text: turn.text };
  });

  ipcMain.handle('inference:chat-cancel', (_event, streamId) => {
    const engine = chatEngines.get(streamId);
    return engine ? engine.cancel() : false;
  });

  ipcMain.handle('inference:vision', (_event, question, imageBytes, mimeType) =>
    analyzeImage(question, imageBytes, mimeType));

  // Phase 0/3: STT and TTS are heavy pipelines — acquire a governor lease around
  // each operation so they coexist with the LLM on the floor tier. The lease is
  // released in finally even on error. If the governor is unavailable (tests),
  // the operation runs without a lease.
  const { PipelineKind } = require('./resource-governor');
  async function withLease(kind, operation) {
    if (!resourceGovernor) return operation();
    const lease = await resourceGovernor.acquire(kind, { priority: 5, timeoutMs: 30000 });
    try {
      return await operation();
    } finally {
      resourceGovernor.release(lease);
    }
  }
  ipcMain.handle('inference:transcribe', (_event, audioBytes) =>
    withLease(PipelineKind.STT, () => transcribeAudio(audioBytes)));
  ipcMain.handle('inference:speak', (_event, text) =>
    withLease(PipelineKind.TTS, () => synthesizeSpeech(text)));
}

/**
 * Phase 0: Register Egress Gateway IPC handlers
 */
function registerEgressHandlers() {
  const consentService = egressGateway.getConsentService();
  const auditLog = egressGateway.getAuditLog();

  // Consent operations
  ipcMain.handle('egress:consent:get', (_event, scope) => consentService.get(scope));
  ipcMain.handle('egress:consent:set', async (_event, record) => await consentService.set(record));
  ipcMain.handle('egress:consent:revoke', async (_event, scope) => await consentService.revoke(scope));
  ipcMain.handle('egress:consent:revoke-personal-data', async (_event, scope) => await consentService.revokePersonalData(scope));
  ipcMain.handle('egress:consent:list', () => consentService.list());

  // Audit log operations
  ipcMain.handle('egress:audit:read', (_event, options) => auditLog.read(options));
  ipcMain.handle('egress:audit:prune', async () => await auditLog.prune());
  ipcMain.handle('egress:audit:clear', async () => await auditLog.clear());
  ipcMain.handle('egress:audit:stats', () => auditLog.stats());
  ipcMain.handle('egress:audit:set-retention', (_event, days) => auditLog.setRetentionDays(days));
  ipcMain.handle('egress:audit:get-retention', () => auditLog.getRetentionDays());

  // Gateway operations
  ipcMain.handle('egress:request', async (_event, req) => await egressGateway.request(req));
  ipcMain.handle('egress:check', async (_event, req) => await egressGateway.check(req));
  ipcMain.handle('egress:preview', (_event, req) => egressGateway.preview(req));
}

/**
 * Phase 0 S0.2: Register Resource Governor IPC handlers
 */
function registerGovernorHandlers() {
  // Governor operations
  ipcMain.handle('governor:acquire', async (_event, kind, opts) => await resourceGovernor.acquire(kind, opts));
  ipcMain.handle('governor:release', (_event, lease) => resourceGovernor.release(lease));
  ipcMain.handle('governor:evict', (_event, leaseId) => resourceGovernor.evict(leaseId));
  ipcMain.handle('governor:evict-idle', async () => await resourceGovernor.evictIdle());
  ipcMain.handle('governor:update-memory', (_event, kind, mb) => resourceGovernor.updateResidentMemory(kind, mb));
  ipcMain.handle('governor:set-profile', (_event, profile) => resourceGovernor.setProfile(profile));
  ipcMain.handle('governor:stats', () => resourceGovernor.stats());

  // Tier detector operations
  ipcMain.handle('tier:detect', () => tierDetector.detectTier());
  ipcMain.handle('tier:get-profile', () => tierDetector.getProfile());
  ipcMain.handle('tier:system-info', () => tierDetector.getSystemInfo());
}

async function startDaemon() {
  // Phase 0 S0.3: Acquire LLM lease before starting daemon
  const { PipelineKind } = require('./resource-governor');
  let llmLease = null;

  try {
    console.log('[Phase 0 S0.3] Acquiring LLM lease...');
    llmLease = await resourceGovernor.acquire(PipelineKind.LLM, { priority: 10, timeoutMs: 60000 });
    
    if (llmLease.degraded) {
      console.warn('[Phase 0 S0.3] LLM lease degraded - resource pressure detected');
    } else {
      console.log('[Phase 0 S0.3] LLM lease acquired:', llmLease.id);
    }
  } catch (error) {
    console.error('[Phase 0 S0.3] Failed to acquire LLM lease:', error.message);
    // Continue anyway - governor will handle pressure
  }

  const daemonScript = path.join(__dirname, '../engine/local-inference-daemon.js');
  daemonProcess = spawn('node', [daemonScript, '--port', '11434'], {
    windowsHide: true,
    env: { 
      ...process.env, 
      LOCALCORE_API_KEY: modelApiKey,
      LOCALCORE_LEASE_ID: llmLease?.id || ''
    }
  });
  
  daemonProcess.stdout.on('data', data => console.log('[LOCAL MODEL]', data.toString().trim()));
  daemonProcess.stderr.on('data', data => console.error('[LOCAL MODEL]', data.toString().trim()));
  daemonProcess.on('error', error => console.error('[LOCAL MODEL] Failed to start:', error.message));
  daemonProcess.on('close', code => {
    if (code !== 0 && code !== null) console.error('[LOCAL MODEL] Server exited with code', code);
    // Release lease on daemon exit
    if (llmLease) {
      resourceGovernor.release(llmLease);
      console.log('[Phase 0 S0.3] LLM lease released on daemon exit');
    }
  });

  // Track lease for later release
  daemonProcess.llmLease = llmLease;
}

// Phase 4: window modes (full / overlay / tray-only) with per-mode state
// preservation. Bounds are captured on switch so each mode restores its own
// size/position.
const WINDOW_MODES = {
  full: { width: 1280, height: 860, alwaysOnTop: false, resizable: true },
  overlay: { width: 420, height: 640, alwaysOnTop: true, resizable: true },
  tray: { alwaysOnTop: false } // window hidden; runs from tray
};
let windowMode = 'full';
const savedBounds = {};

function applyWindowMode(mode) {
  if (!mainWindow || !WINDOW_MODES[mode]) return false;
  // Save current bounds for the mode we're leaving.
  try {
    savedBounds[windowMode] = mainWindow.getBounds();
  } catch { /* window may be destroyed */ }

  windowMode = mode;
  const config = WINDOW_MODES[mode];
  if (mode === 'tray') {
    mainWindow.hide();
    return true;
  }
  mainWindow.show();
  mainWindow.setAlwaysOnTop(config.alwaysOnTop);
  const bounds = savedBounds[mode] || { width: config.width, height: config.height };
  mainWindow.setBounds({ ...bounds, width: bounds.width || config.width, height: bounds.height || config.height });
  return true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "LocalCore AI - Complete Offline Desktop Studio",
    backgroundColor: '#0b0f19',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      contextIsolation: true
    }
  });

  // Strict air-gap firewall: drop all non-local connections
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const u = details.url;
    if (u.startsWith('file://') || u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1') || u.startsWith('devtools:')) {
      callback({ cancel: false });
    } else {
      console.warn('[AIR-GAP BLOCKED]', u);
      callback({ cancel: true });
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  // Phase 0: Initialize app-data structure
  ensureAppDataStructure();

  // Phase 0: Initialize Egress Gateway
  egressGateway = createEgressGateway();

  // Phase 0 S0.2: Initialize Resource Governor and Tier Detector
  resourceGovernor = createResourceGovernor();
  tierDetector = createTierDetector();

  // Set profile based on detected tier
  const tierProfile = tierDetector.getProfile();
  resourceGovernor.setProfile(tierProfile);
  console.log('[Phase 0] Detected tier:', tierProfile.tier, 'Profile:', tierProfile);

  // Wire governor to ModelProvider
  setResourceGovernor(resourceGovernor);

  // Initialize memory store with at-rest encryption (Phase 2). safeStorage uses
  // Windows DPAPI; when unavailable the store falls back to plaintext and
  // reports encryptionAvailable:false.
  memoryStore = createLocalMemoryStore(
    path.join(app.getPath('userData'), 'memory'),
    activeModelId,
    createSafeStorageCrypto()
  );

  // Phase 2: facts memory layer (durable user facts, encrypted at rest).
  memoryFactsStore = createMemoryFactsStore(
    path.join(app.getPath('userData'), 'memory', 'facts'),
    createSafeStorageCrypto()
  );

  // Phase 2 S2.2: retrieval service over the facts store (semantic, local MiniLM).
  memoryService = createMemoryService({ factsStore: memoryFactsStore });

  // Phase 1 S1.1: Initialize persona store (drives the chat system prompt)
  personaStore = createPersonaStore();

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestedMedia = details && Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
    const supportedMediaRequest = webContents === mainWindow?.webContents &&
      permission === 'media' &&
      requestedMedia.length === 1 &&
      (requestedMedia[0] === 'audio' || requestedMedia[0] === 'video');
    callback(supportedMediaRequest);
  });

  registerMemoryHandlers();
  registerAvatarHandlers();
  registerPersonaHandlers();
  registerInferenceHandlers();
  registerEgressHandlers(); // Phase 0
  registerGovernorHandlers(); // Phase 0 S0.2
  registerWindowHandlers(); // Phase 4
  startDaemon();
  createWindow();
});

app.on('window-all-closed', () => {
  if (daemonProcess) daemonProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

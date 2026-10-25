export interface PhaseItem {
  id: string;
  number: string;
  title: string;
  tagline: string;
  focus: string;
  estimatedEffort: string;
  coreDeliverables: string[];
  electronScope: string[];
  creaoScope?: string[];
  testableCriteria: string[];
  keyRisks: string[];
}

export interface ComponentApiDoc {
  name: string;
  purpose: string;
  hostProcess: 'Electron Main' | 'Electron Renderer' | 'Local Daemon' | 'Optional Cloud';
  interfaceName: string;
  code: string;
  keyMethods: { name: string; description: string; localOrCloud: string }[];
}

export interface PrivacyMatrixRow {
  capability: string;
  localDefault: string;
  optionalCloud: string;
  dataSentToCloud: string;
  retentionPolicy: string;
  userConsentRequirement: string;
  offlineBehavior: string;
}

export interface DecisionItem {
  id: string;
  title: string;
  category: 'LLM Runtime' | 'Avatar' | 'Voice' | 'Memory' | 'CREAO Cloud';
  context: string;
  options: {
    name: string;
    description: string;
    tradeoffs: string;
    isRecommended?: boolean;
  }[];
  userDecisionNeeded: string;
  recommendedChoice: string;
}

export const PHASES: PhaseItem[] = [
  {
    id: 'phase-1',
    number: 'Phase 1',
    title: 'Rock-Solid Character & Chat Foundation',
    tagline: 'Reliable, low-latency text conversation paired with a responsive VRM avatar.',
    focus: 'Stabilize local LLM inference, replace hardcoded model calls with an abstracted provider, establish 60fps VRM idle/expression loop, and provide inspectable session history.',
    estimatedEffort: 'Sprint 1-2',
    coreDeliverables: [
      'ModelProvider abstraction layer (llama.cpp server / Ollama local endpoint).',
      'Streaming token pipeline with cancellation & abort signals via Electron IPC.',
      'VRM renderer stabilization: WebGL canvas, basic blink/breathing cycles, mood blendshapes (happy, neutral, thinking, listening).',
      'Session memory inspector: view active context window, prompt template, token usage, and clear history button.'
    ],
    electronScope: [
      'Main Process: Local child process management or HTTP proxy to localhost:11434 / llama-server.',
      'Preload IPC: Safe bidirectional contextBridge for streaming tokens and model status.',
      'Renderer: React chat UI + Three.js / @pixiv/three-vrm rendering viewport.'
    ],
    creaoScope: [
      'None (100% offline self-contained in local Electron app).'
    ],
    testableCriteria: [
      'Zero external network traffic: App launches and chats fully disconnected from the internet (verified via Wireshark / Netstat).',
      'Time to First Token (TTFT) < 900ms on a consumer GPU (e.g., RTX 3060 / 4060 with 7B Q4 model).',
      'Avatar maintains >= 50 FPS during continuous token streaming without UI thread freezing.',
      'User can view current context prompt and click "Purge Current Chat" with instant memory release.'
    ],
    keyRisks: [
      'GPU VRAM contention between Electron WebGL VRM renderer and local GGUF/llama.cpp inference.'
    ]
  },
  {
    id: 'phase-2',
    number: 'Phase 2',
    title: 'User-Controlled Memory & Recall',
    tagline: 'Episodic and semantic recall stored strictly on-device in SQLite with full user oversight.',
    focus: 'Replace raw ephemeral chat buffers with structured SQLite memory tiers (working memory, episodic facts, user profile) and an explicit Memory Manager UI.',
    estimatedEffort: 'Sprint 3',
    coreDeliverables: [
      'Local SQLite database with migrations (%APPDATA%/LocalCore/memory.db).',
      'Two-tier memory model: (1) Working Context Window, (2) User Facts & Preferences store.',
      'Transparent memory extraction: Companion asks or flags when learning a permanent fact ("I noted you like Python, save to memory?").',
      'Memory Management UI: Search, edit, export JSON/CSV, and selectively or completely wipe memories.'
    ],
    electronScope: [
      'Main Process: SQLite driver (better-sqlite3) running in Node.js background thread.',
      'IPC: Memory CRUD queries, export/import file dialogs, audit log generation.',
      'Renderer: Dedicated "Memory Bank" modal with card-based facts, confidence tags, and delete buttons.'
    ],
    creaoScope: [
      'None. Memory storage, vectorization, and recall are entirely local.'
    ],
    testableCriteria: [
      'After app restart, companion accurately recalls user facts saved in previous sessions without cloud sync.',
      'Deleting a fact in the Memory Bank UI removes it from SQLite and prevents subsequent recall.',
      'Exporting memory produces a clean, human-readable JSON file on the local file system.',
      'Memory DB file is unencrypted or encrypted with a local user key, never sent to external servers.'
    ],
    keyRisks: [
      'Context window pollution: naive memory injection bloating token limits and slowing down local inference.'
    ]
  },
  {
    id: 'phase-3',
    number: 'Phase 3',
    title: 'Natural Local Voice & Lip-Sync',
    tagline: 'Private on-device voice in and voice out with real-time VRM viseme mouth movement.',
    focus: 'Integrate offline Speech-to-Text (Whisper.cpp / Sherpa-ONNX) and offline Text-to-Speech (Piper / Kokoro-ONNX), piping phonemes into VRM blendshapes.',
    estimatedEffort: 'Sprint 4',
    coreDeliverables: [
      'Local STT Engine: Voice Activity Detection (VAD) + Whisper.cpp quantized model.',
      'Local TTS Engine: Ultra-fast Piper C++ neural voice synthesis (<100ms first audio chunk).',
      'Viseme / Lip-sync Bridge: Synthesizer phoneme timecodes map directly to VRM vowel blendshapes (aa, ih, ou, ee, oh).',
      'Push-to-Talk and Wake-Word toggles with visible on-screen microphone activity indicator.'
    ],
    electronScope: [
      'Main Process: Audio capture / speaker playback routing, Piper / Whisper native binaries execution.',
      'IPC: Binary audio stream chunks and timestamped viseme packets forwarded to renderer.',
      'Renderer: Web Audio API playback synchronized with VRM blendshape weight animation.'
    ],
    creaoScope: [
      'Optional Cloud Fallback (Disabled by default): High-fidelity cloud TTS/STT if user explicitly toggles and provides API key/credits.'
    ],
    testableCriteria: [
      'End-to-end voice loop (Speech finish -> STT -> LLM response -> First audio utterance) under 2.2s on local hardware.',
      'Zero microphone audio packets transmitted to external network (audited via packet inspection).',
      'Mouth visemes accurately synchronize within 50ms of spoken audio vowels.',
      'Mic indicator turns strictly red/active only during recording and is completely muted when disabled.'
    ],
    keyRisks: [
      'CPU spikes from simultaneous STT transcription and TTS synthesis during rapid back-and-forth dialogue.'
    ]
  },
  {
    id: 'phase-4',
    number: 'Phase 4',
    title: 'Expressive Desktop Presence',
    tagline: 'A living companion window: transparent overlay, gaze tracking, and ambient presence.',
    focus: 'Evolve from a boxed Electron window into an optional borderless, transparent desktop companion with procedural cursor tracking and emotional expressions.',
    estimatedEffort: 'Sprint 5',
    coreDeliverables: [
      'Dual Window Modes: "Docked/Studio Mode" (full chat & settings) vs "Companion Widget Mode" (transparent, click-through, always-on-top).',
      'Procedural Gaze Tracking: VRM head and eyes naturally track cursor movement within configurable constraints.',
      'Emotion & State Machine: Idle animations (blink, breathing, weight shift), listening state, thinking state, speaking state, happy/surprised reactions.',
      'Desktop boundary awareness (snapping to screen edges, multi-monitor support).'
    ],
    electronScope: [
      'Main Process: BrowserWindow configuration (`transparent: true`, `frame: false`, `alwaysOnTop`, `hasShadow: false`, `setIgnoreMouseEvents`).',
      'Renderer: Three.js transparent background clearing, inverse kinematics / lookAt calculations for VRM neck and eye bones.'
    ],
    creaoScope: [
      'None. Purely client-side Windows desktop presentation.'
    ],
    testableCriteria: [
      'Click-through mode allows clicking Windows desktop icons underneath empty transparent regions.',
      'CPU utilization for the companion stays below 6% during idle animation cycles.',
      'No visual black artifacts or flicker on Windows DWM transparent window borders.',
      'Hotkeys (e.g. Ctrl+Shift+Space) summon and dismiss the companion overlay smoothly.'
    ],
    keyRisks: [
      'Windows DWM transparency performance and GPU driver differences across Intel/AMD/Nvidia.'
    ]
  },
  {
    id: 'phase-5',
    number: 'Phase 5',
    title: 'Gated Desktop Automation & Tools',
    tagline: 'Empower the companion with desktop actions under strict human-in-the-loop permission curtains.',
    focus: 'Implement manifest-based desktop tool execution with tiered permission gates: Read-Only, Low-Impact, and Consequential (requiring explicit UI approval).',
    estimatedEffort: 'Sprint 6',
    coreDeliverables: [
      'Tool Registry API: Standardized schema for tools (e.g. File Search, Window Focus, Calendar Check, App Launch, Clipboard Read).',
      'Tiered Permission Broker: Safe classification of tools into SAFE (auto-approved if user enabled), NOTIFY, and DANGEROUS (requires modal confirmation).',
      'Approval Curtain UI: Companion explains action intent, exact arguments, and potential consequences before running.',
      'Audit Log & Reversible Actions: Detailed timestamped ledger of every tool call with undo/rollback where applicable.'
    ],
    electronScope: [
      'Main Process: Isolated node child process execution, Windows PowerShell / Win32 API bridge, file system isolation sandbox.',
      'IPC: Pre-execution approval requests emitted to renderer, blocking execution until signed by user interaction.'
    ],
    creaoScope: [
      'None. All automation executes locally on the user machine with zero cloud relay.'
    ],
    testableCriteria: [
      'Any file modification or deletion action displays a mandatory confirmation modal with the exact target path highlighted.',
      'Rejecting an action in the approval modal cancels the tool execution immediately with an error returned to the LLM.',
      'Desktop tool execution history is inspectable and exportable from the Settings ledger.',
      'Prompt injection defense: Companion refuses to run unconfirmed shell commands injected via conversational jailbreaks.'
    ],
    keyRisks: [
      'Model hallucinating tool arguments; arbitrary script execution vulnerabilities if sanitization fails.'
    ]
  },
  {
    id: 'phase-6',
    number: 'Phase 6',
    title: 'Optional CREAO Cloud Boosters',
    tagline: 'Opt-in cloud intelligence, encrypted cross-device backup, and high-fidelity generation.',
    focus: 'Provide optional cloud extensions (cloud frontier LLMs, cloud voice cloning, encrypted backup) with airtight privacy isolation and zero silent fallback.',
    estimatedEffort: 'Sprint 7+',
    coreDeliverables: [
      'Cloud Service Switch: Single master toggle in settings (Default: OFF).',
      'Per-feature granular consent: User chooses exactly which features connect to cloud (e.g., Cloud TTS enabled, but Memory strictly local).',
      'Encrypted Sync Relay: Zero-knowledge client-side AES-256-GCM encryption before syncing settings or memories to CREAO cloud.',
      'Clear Cloud Indicator: Persistent UI badge showing whether current operation was processed locally or through cloud.'
    ],
    electronScope: [
      'Main Process: Client-side cryptographic key generation, HTTPS client to CREAO API gateway.',
      'Renderer: Cloud connection status pill, privacy consent banners, token consumption meters.'
    ],
    creaoScope: [
      'CREAO Hosted Auth & Account Service (optional user identity).',
      'CREAO Inference Gateway (proxy to frontier models with privacy guarantees and zero data retention).',
      'CREAO Encrypted Vault (blind blob storage for encrypted backups).'
    ],
    testableCriteria: [
      'With Cloud Master Switch OFF, all cloud network calls fail gracefully and the app operates 100% locally.',
      'No raw chat prompts or user files sent to CREAO servers without an active cryptographic session and explicit consent.',
      'Turning off cloud instantly severs network connections and purges any temporary cloud session tokens.'
    ],
    keyRisks: [
      'Accidental data egress due to misconfigured provider fallbacks; network degradation causing companion hesitation.'
    ]
  }
];

export const COMPONENT_APIS: ComponentApiDoc[] = [
  {
    name: 'Model Provider Boundary',
    purpose: 'Isolates the companion core from specific LLM runtimes (llama.cpp, Ollama, ONNX, or Cloud).',
    hostProcess: 'Electron Main',
    interfaceName: 'IModelProvider',
    code: `export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  timestamp: number;
}

export interface CompletionChunk {
  delta: string;
  thought?: string;
  toolCall?: { id: string; name: string; argumentsJson: string };
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'abort';
  tokenUsage?: { promptTokens: number; completionTokens: number };
}

export interface IModelProvider {
  readonly id: string;
  readonly name: string;
  readonly isLocal: boolean;
  
  initialize(): Promise<boolean>;
  getLoadedModelInfo(): Promise<{ name: string; contextLimit: number; quant?: string }>;
  
  streamChat(
    messages: ChatMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
      stopSequences?: string[];
      tools?: ToolDefinition[];
      signal?: AbortSignal;
    },
    onChunk: (chunk: CompletionChunk) => void
  ): Promise<CompletionResult>;

  unloadModel?(): Promise<void>;
}`,
    keyMethods: [
      { name: 'streamChat()', description: 'Streams tokens, thoughts, and tool call invocations with full abort signal support.', localOrCloud: 'Local / Cloud Adapter' },
      { name: 'getLoadedModelInfo()', description: 'Inspects active model weights, context window budget, and quantization level.', localOrCloud: 'Local Engine' },
      { name: 'unloadModel()', description: 'Frees GPU VRAM when the companion is minimized or inactive.', localOrCloud: 'Local Engine' }
    ]
  },
  {
    name: 'Memory Store Boundary',
    purpose: 'Manages user facts, preferences, episodic conversation logs, and semantic context injection.',
    hostProcess: 'Electron Main',
    interfaceName: 'IMemoryStore',
    code: `export interface MemoryRecord {
  id: string;
  category: 'preference' | 'fact' | 'relationship' | 'system_instruction';
  content: string;
  confidence: number; // 0.0 to 1.0
  sourceMessageId?: string;
  createdAt: number;
  lastRecalledAt?: number;
  isUserConfirmed: boolean;
}

export interface IMemoryStore {
  // Working memory (active session)
  getWorkingContext(sessionId: string): Promise<ChatMessage[]>;
  appendMessage(sessionId: string, message: ChatMessage): Promise<void>;
  clearSession(sessionId: string): Promise<void>;

  // Long-term episodic & semantic memory
  storeFact(record: Omit<MemoryRecord, 'id' | 'createdAt'>): Promise<MemoryRecord>;
  queryRelevant(queryText: string, limit?: number): Promise<MemoryRecord[]>;
  getAllFacts(filter?: { category?: string }): Promise<MemoryRecord[]>;
  updateFact(id: string, newContent: string): Promise<void>;
  deleteFact(id: string): Promise<boolean>;
  
  // Data sovereignty & export
  exportEntireMemory(): Promise<{ sessions: any[]; facts: MemoryRecord[] }>;
  wipeAllMemories(): Promise<void>;
}`,
    keyMethods: [
      { name: 'queryRelevant()', description: 'Fetches semantic memories using local embeddings to inject into the companion context.', localOrCloud: '100% Local SQLite' },
      { name: 'storeFact()', description: 'Persists explicit user facts with attribution and confirmation flags.', localOrCloud: '100% Local SQLite' },
      { name: 'wipeAllMemories()', description: 'Hard deletes SQLite database records with zero ghost traces.', localOrCloud: '100% Local SQLite' }
    ]
  },
  {
    name: 'Voice Pipeline Boundary',
    purpose: 'Controls microphone audio ingestion, offline VAD, STT transcription, and TTS speech synthesis with visemes.',
    hostProcess: 'Electron Main',
    interfaceName: 'IVoicePipeline',
    code: `export interface VisemeFrame {
  timestampMs: number;
  durationMs: number;
  viseme: 'aa' | 'ih' | 'ou' | 'ee' | 'oh' | 'silence';
  weight: number; // 0.0 to 1.0
}

export interface SpeechSynthesisResult {
  audioBuffer: ArrayBuffer;
  sampleRate: number;
  visemes: VisemeFrame[];
  text: string;
}

export interface IVoicePipeline {
  // Speech-to-Text (Ear)
  startListening(onTranscriptChunk: (partialText: string, isFinal: boolean) => void): Promise<void>;
  stopListening(): Promise<void>;
  isMuted(): boolean;
  setMute(muted: boolean): void;

  // Text-to-Speech (Mouth)
  synthesizeSpeech(
    text: string, 
    options?: { voiceId?: string; speed?: number; emotion?: string }
  ): Promise<SpeechSynthesisResult>;
  
  cancelSpeech(): void;
}`,
    keyMethods: [
      { name: 'startListening()', description: 'Local VAD + Whisper.cpp audio ingestion; fires callbacks with stream text.', localOrCloud: '100% Local Binary' },
      { name: 'synthesizeSpeech()', description: 'Generates Piper neural audio waveform + synchronized viseme timestamps.', localOrCloud: 'Local Piper C++' },
      { name: 'cancelSpeech()', description: 'Immediately stops speech audio playback when user interrupts.', localOrCloud: 'Local Audio Engine' }
    ]
  },
  {
    name: 'Avatar Controller Boundary',
    purpose: 'Drives the 3D VRM humanoid character, facial blendshapes, eye gaze tracking, and physical animations.',
    hostProcess: 'Electron Renderer',
    interfaceName: 'IAvatarController',
    code: `export type CompanionMood = 'neutral' | 'happy' | 'thinking' | 'curious' | 'empathetic' | 'sleepy';

export interface IAvatarController {
  loadVRM(modelUrlOrPath: string): Promise<void>;
  setMood(mood: CompanionMood, blendDurationMs?: number): void;
  setViseme(viseme: string, weight: number): void;
  playLipSync(visemes: VisemeFrame[]): void;
  
  // Gaze & tracking
  lookAt(screenX: number, screenY: number): void;
  setTrackingMode(mode: 'cursor' | 'forward' | 'idle_wander'): void;
  
  // Custom blendshapes & animations
  triggerReaction(reactionName: 'nod' | 'tilt_head' | 'surprise' | 'laugh'): void;
  setTransparency(alpha: number): void;
}`,
    keyMethods: [
      { name: 'loadVRM()', description: 'Loads user VRM model file from local disk via Three.js @pixiv/three-vrm.', localOrCloud: 'Local Renderer' },
      { name: 'playLipSync()', description: 'Applies timecoded phoneme weights to mouth blendshapes in 60fps render loop.', localOrCloud: 'Local Renderer' },
      { name: 'lookAt()', description: 'Calculates neck and eye bone rotations relative to screen coordinates.', localOrCloud: 'Local Renderer' }
    ]
  },
  {
    name: 'Desktop Tools & Permission Boundary',
    purpose: 'Exposes controlled Windows desktop capabilities with mandatory safety approval gates.',
    hostProcess: 'Electron Main',
    interfaceName: 'IDesktopToolRegistry',
    code: `export type ToolSecurityTier = 'READ_ONLY' | 'USER_ACTION' | 'CONSEQUENTIAL_CHANGE';

export interface ToolDefinition {
  name: string;
  description: string;
  securityTier: ToolSecurityTier;
  parametersSchema: object;
}

export interface ToolExecutionRequest {
  toolName: string;
  arguments: Record<string, any>;
  explanationForUser: string;
  securityTier: ToolSecurityTier;
  riskSummary: string;
}

export interface IDesktopToolRegistry {
  registerTool(tool: ToolDefinition, handler: (args: any) => Promise<any>): void;
  getAvailableTools(): ToolDefinition[];
  
  // Execution with gatekeeper
  requestExecution(request: ToolExecutionRequest): Promise<{
    status: 'approved' | 'rejected' | 'failed';
    output?: any;
    error?: string;
  }>;
  
  // Audit trail
  getExecutionAuditLog(): Promise<Array<{ timestamp: number; tool: string; args: any; approved: boolean }>>;
}`,
    keyMethods: [
      { name: 'requestExecution()', description: 'Intercepts consequential tool calls; prompts user modal in UI before running.', localOrCloud: 'Electron IPC Sandbox' },
      { name: 'getAvailableTools()', description: 'Exports JSON schema tools provided to the LLM system prompt.', localOrCloud: 'Local Registry' },
      { name: 'getExecutionAuditLog()', description: 'Maintains an immutable local log of every system tool execution.', localOrCloud: 'Local Storage' }
    ]
  }
];

export const PRIVACY_MATRIX: PrivacyMatrixRow[] = [
  {
    capability: 'Chat & Prompt Inference',
    localDefault: 'Local llama.cpp / Ollama (Default: ON)',
    optionalCloud: 'CREAO Cloud Proxy or user OpenAI/Anthropic key',
    dataSentToCloud: 'None (Local) / Raw prompt tokens only when Cloud explicitly toggled',
    retentionPolicy: 'Local: Stored on user disk. Cloud: Zero data retention (stateless proxy)',
    userConsentRequirement: 'Explicit modal dialog before first cloud call; persistent status badge in UI',
    offlineBehavior: 'Full functionality offline with local GGUF models'
  },
  {
    capability: 'Conversation Memory & Facts',
    localDefault: 'SQLite (%APPDATA%/LocalCore/memory.db)',
    optionalCloud: 'Encrypted backup to CREAO Cloud Vault',
    dataSentToCloud: 'None (Local) / Client-side AES-256 encrypted blobs only (CREAO cannot read contents)',
    retentionPolicy: 'Local: Permanent until user deletes. Cloud: User manages backup snapshots',
    userConsentRequirement: 'Opt-in toggle with local passphrase generation; never syncs automatically',
    offlineBehavior: '100% offline querying, editing, and fact retention'
  },
  {
    capability: 'Voice Input (STT)',
    localDefault: 'Whisper.cpp / Sherpa-ONNX on local CPU/GPU',
    optionalCloud: 'Cloud Whisper API (Disabled by default)',
    dataSentToCloud: 'None (Local) / Audio chunks stream to cloud during push-to-talk only',
    retentionPolicy: 'No audio saved to disk unless user enables "Audio Logging" in settings',
    userConsentRequirement: 'Per-device mic permission prompt on Windows; visible UI mic indicator',
    offlineBehavior: '100% offline transcription'
  },
  {
    capability: 'Voice Output (TTS)',
    localDefault: 'Piper C++ neural voice synthesis',
    optionalCloud: 'Cloud high-end neural TTS (ElevenLabs / CREAO Voice)',
    dataSentToCloud: 'None (Local) / Sentence text sent to synthesize speech',
    retentionPolicy: 'Synthesized WAV/PCM cached ephemerally in RAM or temp folder',
    userConsentRequirement: 'Requires user to explicitly select a cloud voice profile',
    offlineBehavior: 'Instant local speech with zero network connection'
  },
  {
    capability: 'Avatar Assets & VRM Models',
    localDefault: 'Local disk (%USERPROFILE%/Documents/LocalCore/Avatars)',
    optionalCloud: 'Optional community avatar catalog browsing',
    dataSentToCloud: 'None. Only downloads avatar file on user request',
    retentionPolicy: 'Stored locally forever; user can delete file directly',
    userConsentRequirement: 'Standard file picker when importing .vrm files',
    offlineBehavior: 'All loaded VRM models render offline seamlessly'
  },
  {
    capability: 'Desktop Tools & Automation',
    localDefault: 'Local Node.js child processes & Windows Win32 API',
    optionalCloud: 'None. Desktop tools are NEVER routed through cloud',
    dataSentToCloud: 'STRICTLY NONE. 0 bytes',
    retentionPolicy: 'Local audit log in SQLite',
    userConsentRequirement: 'Mandatory confirmation curtain for file edits, system commands, or deletions',
    offlineBehavior: 'Full local automation capability'
  },
  {
    capability: 'Generated Images & Artifacts',
    localDefault: 'Local Stable Diffusion / SD-Turbo OR User files',
    optionalCloud: 'Optional Cloud Image Generation provider',
    dataSentToCloud: 'None (Local) / Prompt text sent to cloud image API',
    retentionPolicy: 'Saved directly to user disk (%APPDATA%/LocalCore/artifacts); full UI to inspect/delete',
    userConsentRequirement: 'Explicit prompt button: "Generate with Cloud"',
    offlineBehavior: 'Local image viewers and local generation work offline'
  }
];

export const DECISIONS_LIST: DecisionItem[] = [
  {
    id: 'decision-llm-runtime',
    title: 'Local LLM Inference Packaging & Execution Mode',
    category: 'LLM Runtime',
    context: 'The Electron app needs a reliable local inference engine that runs smoothly on consumer Windows PCs.',
    options: [
      {
        name: 'Embedded llama-server (llama.cpp)',
        description: 'Bundle precompiled llama-server.exe binaries inside Electron app resources, managed as a child process.',
        tradeoffs: 'Zero prerequisite installation for the user; tight process lifecycle control; requires managing Windows CUDA/Vulkan/AVX2 binary variants.',
        isRecommended: true
      },
      {
        name: 'Ollama External Service Dependency',
        description: 'Connect to an existing Ollama daemon running on localhost:11434 via standard REST API.',
        tradeoffs: 'Simpler Electron code; relies on user having Ollama installed; lacks seamless bundled out-of-the-box first run experience.'
      },
      {
        name: 'ONNX Runtime GenAI / WebGPU',
        description: 'Run models via DirectML ONNX Runtime or in-browser WebGPU inside Chromium renderer.',
        tradeoffs: 'Pure JS/C++ hybrid; cross-vendor DirectML support; higher memory overhead and slower token generation than llama.cpp.'
      }
    ],
    userDecisionNeeded: 'Do you want LocalCore to bundle an embedded llama-server executable for zero-setup installation, or connect to an already installed Ollama instance?',
    recommendedChoice: 'Embedded llama-server child process with automatic fallback to Ollama if already running.'
  },
  {
    id: 'decision-vrm-isolation',
    title: 'VRM 3D Rendering Process Isolation',
    category: 'Avatar',
    context: 'VRM models with physics bones and blendshapes require sustained 60fps WebGL rendering. If the main chat UI or token parsing causes micro-stutters, the avatar freezes.',
    options: [
      {
        name: 'Unified Renderer Window (Current)',
        description: 'Single Electron BrowserWindow hosting both the React chat interface and the Three.js VRM canvas.',
        tradeoffs: 'Simplest state management; however, heavy DOM updates or chat re-renders can drop avatar frames.'
      },
      {
        name: 'Dual Process (Dedicated Avatar Overlay Window)',
        description: 'Split into two windows: a transparent, frameless, hardware-accelerated Avatar Window + a docked companion Chat Utility window, communicating via lightweight IPC.',
        tradeoffs: 'Rock-solid 60fps avatar animation; allows avatar to float independently on desktop while chat window is minimized; slightly higher IPC complexity.',
        isRecommended: true
      }
    ],
    userDecisionNeeded: 'Should we isolate the VRM avatar into a dedicated transparent companion window to ensure 60fps physics, or keep it unified in a single window?',
    recommendedChoice: 'Dual-window architecture: Transparent Companion Overlay + Control Studio window.'
  },
  {
    id: 'decision-memory-extraction',
    title: 'Memory Extraction & Fact Consolidation Strategy',
    category: 'Memory',
    context: 'How should LocalCore identify that the user stated a persistent fact (e.g. "My dog is named Barnaby") without ballooning latency?',
    options: [
      {
        name: 'Asynchronous Background Micro-Model (SLM)',
        description: 'After conversation turns, a tiny 1B parameter model (e.g., SmolLM2-1.7B or Qwen2.5-0.5B) scans the exchange in the background to extract structured JSON facts.',
        tradeoffs: 'High semantic accuracy; completely asynchronous so chat response is instantaneous; requires 1GB additional RAM.',
        isRecommended: true
      },
      {
        name: 'Explicit Tool Calling by Main LLM',
        description: 'The main companion model calls a `remember_fact()` tool during the chat response when it detects a preference.',
        tradeoffs: 'Zero extra models; however, slows down main chat generation and can produce false-positive memories.'
      },
      {
        name: 'Rule-Based Heuristic + User Confirmation Prompts',
        description: 'Detect phrases like "remember that...", "my favorite...", and prompt the user with a subtle badge: "Save to memory?".',
        tradeoffs: 'Zero AI overhead; 100% user control and privacy; requires user manual clicks.'
      }
    ],
    userDecisionNeeded: 'Which memory extraction philosophy matches your product vision: automated background SLM extraction or explicit user confirmation prompts?',
    recommendedChoice: 'Hybrid: Background SLM extraction that queues facts into a "Proposed Memories" shelf requiring one-click user validation.'
  },
  {
    id: 'decision-tts-engine',
    title: 'Local Text-to-Speech (TTS) Voice Engine',
    category: 'Voice',
    context: 'Natural speech with instant start time (<200ms) is essential for companion conversation.',
    options: [
      {
        name: 'Piper C++ Neural TTS (Bundled binary)',
        description: 'High-speed, lightweight neural TTS running on CPU with ONNX models. Generates audio 4-5x faster than real time.',
        tradeoffs: 'Extremely low latency (<100ms TTFA); tiny footprint (<50MB); high quality on consumer CPUs; limited expressiveness/emotions.',
        isRecommended: true
      },
      {
        name: 'Kokoro-82M ONNX Voice Engine',
        description: 'Ultra-modern 82M parameter expressive voice model running via ONNX Runtime.',
        tradeoffs: 'Exceptional human-like prosody and emotion; requires slightly more GPU/CPU compute; higher initialization time.'
      },
      {
        name: 'Windows Native SAPI5 / Windows.Media.SpeechSynthesis',
        description: 'Built-in Windows OS speech engine.',
        tradeoffs: 'Zero download size; instant setup; robotic sound compared to modern neural models.'
      }
    ],
    userDecisionNeeded: 'Do you prefer Piper for maximum speed and lowest CPU usage, or Kokoro-82M for higher emotional nuance?',
    recommendedChoice: 'Piper C++ as primary default engine with Kokoro-82M as an optional "High Quality Voice" toggle.'
  },
  {
    id: 'decision-creao-boundary',
    title: 'Scope of CREAO-Hosted Services',
    category: 'CREAO Cloud',
    context: 'The user requested clear separation between what runs in the Electron project and what requires CREAO-hosted services.',
    options: [
      {
        name: 'CREAO as Optional Zero-Knowledge Sync & Frontier Relay',
        description: 'CREAO only provides: (1) Encrypted backup vault, (2) Optional pay-per-token API gateway to Claude 3.5 / Gemini 2.0 without exposing raw user IPs.',
        tradeoffs: 'Preserves strict local-first credibility; user never needs a CREAO account to use 100% of the desktop companion.',
        isRecommended: true
      },
      {
        name: 'CREAO as Mandatory Account & License Server',
        description: 'App requires logging into CREAO account to activate or download models.',
        tradeoffs: 'Easier monetisation; violates local-first offline principle and creates user friction.'
      }
    ],
    userDecisionNeeded: 'Should CREAO services be completely optional (app fully functional without an account), or is account signup required for cloud features?',
    recommendedChoice: 'Completely optional: LocalCore works 100% anonymously and offline. CREAO account is only prompted if user explicitly clicks "Enable Cloud Boosters".'
  }
];

export const ELECTRON_VS_CREAO = [
  {
    module: 'LLM Inference',
    electronProject: 'Local llama.cpp binary / Ollama API client. Manages VRAM, model loading, streaming token buffer, context pruning.',
    creaoCloud: 'Optional Cloud Inference Gateway (stateless proxy to frontier LLMs with privacy filtering).',
    requiresCreao: false
  },
  {
    module: 'Memory & State',
    electronProject: 'Local SQLite database (%APPDATA%/LocalCore/memory.db), schema migrations, local vector similarity, full inspect/purge UI.',
    creaoCloud: 'Optional Encrypted Cloud Vault (zero-knowledge client-side encrypted backup relay).',
    requiresCreao: false
  },
  {
    module: 'VRM Avatar & Visuals',
    electronProject: 'Three.js / @pixiv/three-vrm WebGL engine, local .vrm file importer, procedural bone gaze, SpringBone physics, blendshape lip-sync.',
    creaoCloud: 'Optional Avatar Community Catalog (browsing curated CC0 VRM avatars).',
    requiresCreao: false
  },
  {
    module: 'Voice (STT / TTS)',
    electronProject: 'Local Whisper.cpp (STT) + Local Piper (TTS) child processes, Web Audio API streaming, phoneme-to-viseme mapper.',
    creaoCloud: 'Optional Ultra-HD Voice Cloning / Cloud TTS endpoint for users wanting studio voices.',
    requiresCreao: false
  },
  {
    module: 'Desktop Tools & Automation',
    electronProject: 'Electron Main IPC sandbox, Node.js child_process, Windows PowerShell / Win32 API bridge, modal permission approval curtains.',
    creaoCloud: 'STRICTLY PROHIBITED. Zero cloud involvement in desktop tool execution.',
    requiresCreao: false
  },
  {
    module: 'User Artifacts & Media',
    electronProject: 'Local filesystem sandbox (%APPDATA%/LocalCore/artifacts), local gallery viewer, one-click file deletion & export.',
    creaoCloud: 'Optional Cloud Image Generation proxy (if user requests cloud diffusion models).',
    requiresCreao: false
  }
];

import React, { useState } from 'react';
import { Cpu, Database, Volume2, ShieldCheck, Monitor, CloudOff, Terminal, ArrowRight, Layers } from 'lucide-react';

interface ComponentDetail {
  title: string;
  role: string;
  process: string;
  technology: string;
  responsibilities: string[];
  interfaces: string[];
}

export const ArchitectureDiagramView: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<string>('model-daemon');

  const nodeDetails: Record<string, ComponentDetail> = {
    'main-process': {
      title: 'Electron Main Process (System Coordinator)',
      role: 'Master application orchestrator, lifecycle supervisor, IPC message bus, and security sandbox.',
      process: 'Node.js Main Runtime (Windows Host)',
      technology: 'Electron Main, Node.js child_process, better-sqlite3',
      responsibilities: [
        'Spawns and monitors local daemon child processes (llama-server, whisper, piper).',
        'Brokers secure IPC communication between UI and OS.',
        'Executes gated desktop tools with permission curtains.',
        'Directly accesses local file system and SQLite storage safely.'
      ],
      interfaces: ['IPC Handler Registry', 'IDesktopToolRegistry', 'IMemoryStore']
    },
    'renderer-process': {
      title: 'Electron Renderer Process (UI & 3D Avatar)',
      role: 'Front-facing companion interface and 60fps WebGL 3D character rendering loop.',
      process: 'Chromium Renderer Thread (Hardware Accelerated)',
      technology: 'React 19, Tailwind CSS, Three.js, @pixiv/three-vrm',
      responsibilities: [
        'Renders interactive chat timeline, memory manager modals, and settings.',
        'Draws 3D VRM avatar with SpringBone physics, gaze tracking, and facial blendshapes.',
        'Synchronizes real-time viseme mouth shapes with incoming audio or token streams.',
        'Dispatches user messages and tool approval actions to Main via contextBridge.'
      ],
      interfaces: ['IAvatarController', 'window.localCoreAPI (IPC Bridge)']
    },
    'model-daemon': {
      title: 'Local Inference Runtime (IModelProvider)',
      role: 'Private, offline local language model execution engine.',
      process: 'Native Windows Child Process (C++ / CUDA / Vulkan / CPU)',
      technology: 'llama.cpp (llama-server.exe) or local Ollama REST API',
      responsibilities: [
        'Loads quantized GGUF weights (e.g. Llama 3.2, Qwen 2.5, Phi 3.5, Mistral).',
        'Streams tokens via HTTP SSE stream to Electron Main.',
        'Detects and emits structured tool-call arguments for desktop actions.',
        'Frees GPU VRAM when minimized or explicitly requested.'
      ],
      interfaces: ['IModelProvider', 'POST /completion (Localhost SSE)']
    },
    'memory-sqlite': {
      title: 'Local Memory Engine (IMemoryStore)',
      role: 'On-device long-term structured memory, episodic conversation logs, and user sovereignty.',
      process: 'Electron Main Thread / Worker Thread',
      technology: 'SQLite 3 (better-sqlite3) + sqlite-vss (local vector embeddings)',
      responsibilities: [
        'Stores working memory buffers and persistent user preferences (%APPDATA%/LocalCore/memory.db).',
        'Performs local vector similarity search for relevant context injection.',
        'Enforces user data sovereignty: 1-click inspect, edit, export, and hard-delete.',
        'Never syncs unencrypted data to any external network.'
      ],
      interfaces: ['IMemoryStore', 'SQLite Schema Migrations']
    },
    'audio-pipeline': {
      title: 'Local Voice Engine (IVoicePipeline)',
      role: '100% private voice input transcription and zero-latency speech synthesis.',
      process: 'Native Binary Threads / Web Audio',
      technology: 'Whisper.cpp (STT) + Piper C++ Neural Voice (TTS) + VAD',
      responsibilities: [
        'Captures microphone input and transcribes audio locally with Voice Activity Detection.',
        'Synthesizes neural voice audio under 150ms latency on standard CPU.',
        'Extracts phoneme timing to generate synchronized viseme blendshape frames for the VRM avatar.',
        'Mutes completely when disabled with zero raw audio egress.'
      ],
      interfaces: ['IVoicePipeline', 'Web Audio Context', 'Viseme Stream']
    },
    'desktop-tools': {
      title: 'Gated Desktop Automation (IDesktopToolRegistry)',
      role: 'Controlled desktop tools with tiered human-in-the-loop approval curtains.',
      process: 'Electron Main Security Sandbox',
      technology: 'Win32 APIs, PowerShell execution sandbox, Node.js FS',
      responsibilities: [
        'Exposes safe desktop tools (file search, window focus, calendar, clipboard).',
        'Enforces mandatory modal confirmation for consequential changes (edits, deletions, script runs).',
        'Maintains immutable local audit log of all automated actions.',
        'Blocks prompt injection attempts from bypassing permission checks.'
      ],
      interfaces: ['IDesktopToolRegistry', 'Consequential Action Gatekeeper']
    },
    'cloud-gateway': {
      title: 'Optional CREAO Cloud Gateway (Disabled by Default)',
      role: 'Opt-in frontier model access and encrypted backup vault.',
      process: 'Airgapped Remote Service (Requires Explicit User Consent)',
      technology: 'HTTPS TLS 1.3, Client-side AES-256-GCM Zero-Knowledge Relay',
      responsibilities: [
        'Remains completely off unless explicitly activated by the user in Settings.',
        'Never receives plain-text memories or unapproved telemetry.',
        'Proxies requests to high-end frontier models if user desires extended reasoning.'
      ],
      interfaces: ['Zero-Knowledge Backup API', 'Stateless Model Proxy']
    }
  };

  const current = nodeDetails[selectedNode] || nodeDetails['main-process'];

  return (
    <div className="space-y-6">
      {/* Topology Header */}
      <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-2">
              <Cpu className="w-3.5 h-3.5" /> System Architecture & Boundary Topology
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
              Modular Component Architecture & IPC Boundaries
            </h2>
            <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
              LocalCore organizes local inference, memory, voice, avatar rendering, and desktop tools into isolated modules connected by strictly typed IPC contracts. Click any block to inspect its architecture.
            </p>
          </div>
          <div className="text-xs text-zinc-400 bg-zinc-950 p-3 rounded-xl border border-zinc-800 font-mono">
            <span className="text-emerald-400 font-bold">Local-First Isolation</span>
            <div className="text-[11px] text-zinc-500 mt-0.5">Zero external ports exposed • Unix/Named Pipe IPC</div>
          </div>
        </div>
      </div>

      {/* Visual System Architecture Diagram */}
      <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800/90 shadow-2xl overflow-x-auto">
        <div className="min-w-[760px] space-y-6">
          {/* Top Level: Windows Host OS Container */}
          <div className="border-2 border-dashed border-zinc-800 rounded-xl p-5 bg-zinc-900/20 relative">
            <div className="absolute -top-3 left-4 bg-zinc-950 px-3 py-0.5 text-[11px] font-mono font-semibold text-zinc-400 border border-zinc-800 rounded-full flex items-center gap-1.5">
              <Monitor className="w-3 h-3 text-cyan-400" /> Windows 10/11 Host Machine (Local Sandbox)
            </div>

            {/* Electron Container */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-2">
              {/* Renderer Process */}
              <div
                onClick={() => setSelectedNode('renderer-process')}
                className={`lg:col-span-5 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedNode === 'renderer-process'
                    ? 'border-cyan-400 bg-cyan-950/20 shadow-lg shadow-cyan-950/40'
                    : 'border-zinc-700/70 bg-zinc-900/60 hover:border-zinc-500'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold font-mono text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Monitor className="w-3.5 h-3.5" /> Electron Renderer Process
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 font-mono border border-cyan-800/40">
                    UI & WebGL
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800 text-xs">
                    <span className="font-semibold text-zinc-200 block mb-0.5">3D VRM Avatar Viewport</span>
                    <span className="text-zinc-400 text-[11px]">Three.js • SpringBones • Viseme Lip-sync • Gaze</span>
                  </div>
                  <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800 text-xs">
                    <span className="font-semibold text-zinc-200 block mb-0.5">Companion Chat & Overlay UI</span>
                    <span className="text-zinc-400 text-[11px]">Streaming Text • Memory Manager • Permission Modals</span>
                  </div>
                </div>
              </div>

              {/* IPC Preload Bridge */}
              <div className="lg:col-span-2 flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-950/90 border border-zinc-800 text-center">
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-cyan-400 mb-2">
                  <ArrowRight className="w-4 h-4 rotate-90 lg:rotate-0" />
                </div>
                <span className="text-[11px] font-bold font-mono text-zinc-300 uppercase">contextBridge</span>
                <span className="text-[10px] text-zinc-500 mt-1">Strict Typed IPC Sandbox</span>
                <span className="text-[9px] text-emerald-400 font-mono mt-0.5">No Node in Renderer</span>
              </div>

              {/* Main Process */}
              <div
                onClick={() => setSelectedNode('main-process')}
                className={`lg:col-span-5 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedNode === 'main-process'
                    ? 'border-indigo-400 bg-indigo-950/20 shadow-lg shadow-indigo-950/40'
                    : 'border-zinc-700/70 bg-zinc-900/60 hover:border-zinc-500'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold font-mono text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" /> Electron Main Process
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 font-mono border border-indigo-800/40">
                    Host Core
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800 text-xs">
                    <span className="font-semibold text-zinc-200 block mb-0.5">Process Lifecycle & Daemon Supervisor</span>
                    <span className="text-zinc-400 text-[11px]">Spawns llama.cpp, Piper, Whisper child processes</span>
                  </div>
                  <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800 text-xs">
                    <span className="font-semibold text-zinc-200 block mb-0.5">Tool Security Curtain & IPC Broker</span>
                    <span className="text-zinc-400 text-[11px]">Blocks consequential actions until signed by user in UI</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Local Services Row */}
            <div className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Local LLM Engine */}
              <div
                onClick={() => setSelectedNode('model-daemon')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  selectedNode === 'model-daemon'
                    ? 'border-cyan-400 bg-cyan-950/30'
                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-semibold text-zinc-200">Local LLM Engine</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  llama.cpp / Ollama local daemon. Streaming GGUF inference on GPU/CPU.
                </p>
                <span className="inline-block mt-2 text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-cyan-400 border border-zinc-800">
                  IModelProvider
                </span>
              </div>

              {/* Local SQLite */}
              <div
                onClick={() => setSelectedNode('memory-sqlite')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  selectedNode === 'memory-sqlite'
                    ? 'border-emerald-400 bg-emerald-950/30'
                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-zinc-200">Local SQLite DB</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Working memory, user facts, semantic embeddings, and JSON export logs.
                </p>
                <span className="inline-block mt-2 text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-emerald-400 border border-zinc-800">
                  IMemoryStore
                </span>
              </div>

              {/* Voice Engine */}
              <div
                onClick={() => setSelectedNode('audio-pipeline')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  selectedNode === 'audio-pipeline'
                    ? 'border-purple-400 bg-purple-950/30'
                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Volume2 className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-zinc-200">Local Voice Pipeline</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Whisper.cpp (STT) + Piper C++ (TTS) + real-time phoneme/viseme stream.
                </p>
                <span className="inline-block mt-2 text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-purple-400 border border-zinc-800">
                  IVoicePipeline
                </span>
              </div>

              {/* Desktop Tools */}
              <div
                onClick={() => setSelectedNode('desktop-tools')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  selectedNode === 'desktop-tools'
                    ? 'border-amber-400 bg-amber-950/30'
                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-zinc-200">Gated Desktop Tools</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Sandboxed OS automation. Consequential actions require explicit modal sign-off.
                </p>
                <span className="inline-block mt-2 text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-amber-400 border border-zinc-800">
                  IDesktopToolRegistry
                </span>
              </div>
            </div>
          </div>

          {/* Airgap Wall */}
          <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/40 rounded-lg border border-dashed border-red-500/30 text-xs">
            <div className="flex items-center gap-2 text-red-400 font-mono font-semibold">
              <CloudOff className="w-4 h-4" />
              <span>AIRGAP BOUNDARY (Default: Strict Zero-Egress)</span>
            </div>
            <span className="text-[11px] text-zinc-500">
              No cloud communication without explicit user opt-in toggle
            </span>
          </div>

          {/* Cloud Level: Optional Services */}
          <div
            onClick={() => setSelectedNode('cloud-gateway')}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
              selectedNode === 'cloud-gateway'
                ? 'border-purple-400 bg-purple-950/20'
                : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-zinc-600"></span>
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Optional CREAO Cloud Gateway & Encrypted Sync (OFF by Default)
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                Opt-in Only
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Zero-knowledge encrypted snapshot backups and optional stateless proxy to frontier models (Claude 3.5, Gemini 2.0). Never receives private memories or telemetry without active cryptographic authorization.
            </p>
          </div>
        </div>
      </div>

      {/* Selected Component Inspection Card */}
      <div className="bg-zinc-900/80 p-5 rounded-2xl border border-zinc-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
          <div>
            <span className="text-xs font-mono font-semibold text-cyan-400 uppercase tracking-wider block">
              Component Deep Dive
            </span>
            <h3 className="text-lg font-bold text-zinc-100">{current.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 font-mono border border-zinc-700">
              {current.process}
            </span>
          </div>
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed">{current.role}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5 bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/80">
            <span className="font-semibold text-zinc-300 uppercase text-[10px] tracking-wider block mb-1">
              Core Responsibilities:
            </span>
            <ul className="space-y-1 text-zinc-400">
              {current.responsibilities.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-cyan-400">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3 bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/80">
            <div>
              <span className="font-semibold text-zinc-300 uppercase text-[10px] tracking-wider block mb-1">
                Underlying Technology Stack:
              </span>
              <p className="text-zinc-400 font-mono text-[11px]">{current.technology}</p>
            </div>
            <div>
              <span className="font-semibold text-zinc-300 uppercase text-[10px] tracking-wider block mb-1">
                Governing API Contracts:
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {current.interfaces.map((iface, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded bg-zinc-900 text-cyan-300 font-mono text-[10px] border border-cyan-800/30"
                  >
                    {iface}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

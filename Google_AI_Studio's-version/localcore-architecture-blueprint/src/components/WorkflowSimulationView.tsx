import React, { useState } from 'react';
import { Play, RotateCcw, ShieldCheck, Database, Cpu, Volume2, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

export const WorkflowSimulationView: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [toolApproved, setToolApproved] = useState<boolean | null>(null);

  const steps = [
    {
      title: '1. User Input (Text / Push-to-Talk)',
      module: 'Whisper.cpp / React Chat Input',
      process: 'Electron Renderer → Preload IPC → Electron Main',
      details: 'User types or speaks: "Remember that I prefer TypeScript, and find the meeting notes on my desktop."',
      badge: 'Local Input'
    },
    {
      title: '2. Local Memory & Fact Recall',
      module: 'IMemoryStore (SQLite + sqlite-vss)',
      process: 'Electron Main Process (%APPDATA%/LocalCore/memory.db)',
      details: 'Queries SQLite vector index for prior user context. Injects existing preferences into prompt template: [User Profile: Developer on Windows 11].',
      badge: 'SQLite Query'
    },
    {
      title: '3. Streaming Local LLM Inference',
      module: 'IModelProvider (llama.cpp child process)',
      process: 'C++ llama-server.exe via Localhost SSE',
      details: 'LLM generates streaming tokens: "I will remember that you prefer TypeScript. Let me check your desktop for meeting notes." Model emits tool call: desktop_file_search({ query: "meeting notes", path: "Desktop" }).',
      badge: 'GGUF Stream'
    },
    {
      title: '4. Avatar Viseme & Mood Animation',
      module: 'IAvatarController (Three.js VRM)',
      process: 'Chromium 60fps WebGL Canvas',
      details: 'Phonemes from TTS stream map to VRM vowel blendshapes (aa, ih, oh). Head tilts slightly with a "helpful" mood expression.',
      badge: '60 FPS WebGL'
    },
    {
      title: '5. Tool Permission Curtain & Gatekeeper',
      module: 'IDesktopToolRegistry (Consequential Gate)',
      process: 'IPC Security Curtain Modal',
      details: 'Execution pauses! UI pops up an approval curtain: "LocalCore wants to search your Desktop for files matching \'meeting notes\'. Allow this desktop action?"',
      badge: 'Human-in-the-Loop Gate'
    },
    {
      title: '6. Execution & Memory Consolidation',
      module: 'Windows Win32 FS + SQLite Fact Store',
      process: 'Sandboxed Node.js Child Process & SQLite',
      details: 'Upon user approval, desktop search executes locally. Concurrently, fact "User prefers TypeScript" is saved to SQLite memory table with category "preference".',
      badge: 'Committed to SQLite'
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleReset = () => {
    setCurrentStep(0);
    setToolApproved(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-2">
              <Play className="w-3.5 h-3.5" /> Interactive Architectural Simulator
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
              End-to-End Request Lifecycle & Security Curtain
            </h2>
            <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
              Walk through a real companion turn to verify how tokens, viseme phonemes, SQLite queries, and desktop permission curtains interact across processes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Flow
            </button>
            <button
              onClick={handleNext}
              disabled={currentStep === steps.length - 1}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-zinc-950 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              Next Step ({currentStep + 1}/{steps.length}) <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Progress Stepper */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {steps.map((s, idx) => {
          const isActive = idx === currentStep;
          const isPassed = idx < currentStep;
          return (
            <div
              key={idx}
              onClick={() => setCurrentStep(idx)}
              className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all text-center ${
                isActive
                  ? 'bg-cyan-950/40 border-cyan-400 text-cyan-300 shadow-md'
                  : isPassed
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400'
                  : 'bg-zinc-950 border-zinc-800/80 text-zinc-500 hover:border-zinc-700'
              }`}
            >
              <span className="block font-mono text-[10px] font-bold">STEP {idx + 1}</span>
              <span className="truncate block font-medium mt-0.5 text-[11px]">{s.badge}</span>
            </div>
          );
        })}
      </div>

      {/* Step Detail Active Card */}
      <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-2xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-4">
          <div>
            <span className="text-xs font-mono font-semibold text-cyan-400 uppercase tracking-wider block">
              Active Stage
            </span>
            <h3 className="text-lg font-bold text-zinc-100">{steps[currentStep].title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded bg-zinc-900 text-zinc-300 font-mono border border-zinc-800">
              {steps[currentStep].module}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-2">
            <span className="text-[11px] font-mono font-semibold text-zinc-400 uppercase tracking-wider block">
              Execution Process & Thread:
            </span>
            <p className="text-xs font-mono text-cyan-300">{steps[currentStep].process}</p>
          </div>

          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-2">
            <span className="text-[11px] font-mono font-semibold text-zinc-400 uppercase tracking-wider block">
              What Happens in the System:
            </span>
            <p className="text-xs text-zinc-300 leading-relaxed">{steps[currentStep].details}</p>
          </div>
        </div>

        {/* Step 5 Interactive Permission Curtain Showcase */}
        {currentStep === 4 && (
          <div className="p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 space-y-4 animate-in fade-in">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-200">
                  Permission Curtain: Desktop Action Approval
                </h4>
                <p className="text-xs text-amber-300/80 mt-1">
                  LocalCore intercepted an LLM tool call attempting to access the local file system. Consequential and file tools require explicit user approval.
                </p>
              </div>
            </div>

            <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 font-mono text-xs text-zinc-300 space-y-1">
              <div><strong className="text-zinc-500">Tool:</strong> <span className="text-cyan-400">desktop_file_search</span></div>
              <div><strong className="text-zinc-500">Query:</strong> <span className="text-emerald-400">"meeting notes"</span></div>
              <div><strong className="text-zinc-500">Path:</strong> <span className="text-amber-400">C:\Users\User\Desktop</span></div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  setToolApproved(true);
                  handleNext();
                }}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" /> Approve Execution
              </button>
              <button
                onClick={() => {
                  setToolApproved(false);
                }}
                className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-xs font-semibold transition-colors"
              >
                Reject Action
              </button>
              {toolApproved === false && (
                <span className="text-xs text-red-400 font-mono">
                  Execution cancelled by user. LLM informed of rejection.
                </span>
              )}
            </div>
          </div>
        )}

        {/* Step 6 Persistence Complete */}
        {currentStep === 5 && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 space-y-2">
            <div className="flex items-center gap-2 font-bold text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Turn Cycle Complete with Zero Data Leaks</span>
            </div>
            <p className="text-[11px] text-emerald-200/80 leading-relaxed">
              Desktop search executed on-device. Fact saved to SQLite. Avatar returned to idle breathing state. Wireshark verification: 0 external packets transmitted.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

import React from 'react';
import { ELECTRON_VS_CREAO } from '../data/blueprintData';
import { Monitor, Cloud, CheckCircle, XCircle, ShieldCheck, ArrowRight } from 'lucide-react';

export const ElectronVsCreaoView: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-2">
              <Monitor className="w-3.5 h-3.5" /> Project Boundary Separation
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
              Existing Electron Project vs. CREAO-Hosted Services
            </h2>
            <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
              LocalCore is strictly designed to be 100% self-contained within your Windows Electron application. Zero CREAO infrastructure is required for everyday operation, local inference, VRM animation, voice, memory, or desktop tools.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-300 px-3.5 py-2 rounded-xl border border-emerald-500/30 text-xs font-mono font-medium">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Electron App: 100% Autonomous</span>
          </div>
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Electron Project Column */}
        <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800 space-y-4">
          <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">Existing Windows Electron Project</h3>
              <span className="text-xs text-emerald-400 font-mono">100% Offline • Free & Local</span>
            </div>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Everything essential to the companion experience executes directly on the user’s Windows PC. This preserves privacy, guarantees zero recurring cloud API bills, and gives the user full physical control.
          </p>

          <div className="space-y-2.5 text-xs">
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
              <span className="font-semibold text-zinc-200 block">Local Inference Engine</span>
              <p className="text-zinc-400 text-[11px]">llama.cpp child process / Ollama client streaming GGUF models on CPU/GPU.</p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
              <span className="font-semibold text-zinc-200 block">3D VRM Character & Lip-Sync</span>
              <p className="text-zinc-400 text-[11px]">Three.js WebGL renderer in Chromium, reading local .vrm files with spring-bone physics.</p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
              <span className="font-semibold text-zinc-200 block">Local SQLite Memory Store</span>
              <p className="text-zinc-400 text-[11px]">Episodic facts, working memory buffers, and embeddings stored on disk (%APPDATA%).</p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
              <span className="font-semibold text-zinc-200 block">Offline Speech (STT + TTS)</span>
              <p className="text-zinc-400 text-[11px]">Whisper.cpp microphone transcription and Piper C++ neural speech synthesis.</p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
              <span className="font-semibold text-zinc-200 block">Desktop Automation & Gated Tools</span>
              <p className="text-zinc-400 text-[11px]">Windows Win32, PowerShell, and file system tools gated by user confirmation modals.</p>
            </div>
          </div>
        </div>

        {/* CREAO Hosted Column */}
        <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800 space-y-4">
          <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">Optional CREAO-Hosted Services</h3>
              <span className="text-xs text-purple-400 font-mono">Strictly Opt-in • OFF by Default</span>
            </div>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            CREAO services are only contacted if the user explicitly switches the "Cloud Boosters" toggle in Settings and accepts the privacy disclosure.
          </p>

          <div className="space-y-2.5 text-xs">
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200">CREAO Inference Gateway</span>
                <span className="text-[10px] text-purple-400 font-mono">Optional</span>
              </div>
              <p className="text-zinc-400 text-[11px]">Stateless proxy to frontier models (Claude 3.5, Gemini 2.0) with zero-data-retention guarantees.</p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200">Zero-Knowledge Encrypted Vault</span>
                <span className="text-[10px] text-purple-400 font-mono">Optional</span>
              </div>
              <p className="text-zinc-400 text-[11px]">Encrypted snapshot backup relay. Client encrypts with local password before transmission.</p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200">Studio Voice Cloning & Neural TTS</span>
                <span className="text-[10px] text-purple-400 font-mono">Optional</span>
              </div>
              <p className="text-zinc-400 text-[11px]">Optional ultra-high-definition cloud speech voices for users desiring voice actors.</p>
            </div>
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200">Community Avatar Catalog</span>
                <span className="text-[10px] text-purple-400 font-mono">Optional</span>
              </div>
              <p className="text-zinc-400 text-[11px]">Browse and download curated CC0/public VRM avatar files into the local avatar folder.</p>
            </div>
            <div className="p-3 rounded-xl bg-red-950/20 border border-red-500/30 space-y-1">
              <div className="flex items-center gap-1.5 text-red-300 font-semibold">
                <XCircle className="w-3.5 h-3.5 text-red-400" />
                <span>What CREAO Never Touches:</span>
              </div>
              <p className="text-red-200/80 text-[11px]">Desktop tools, local files, screen contents, or private plain-text SQLite memories are NEVER sent to CREAO.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Clear Summary Table */}
      <div className="bg-zinc-950 rounded-2xl border border-zinc-800 p-5 space-y-3">
        <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Feature Dependency Mapping Table
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 uppercase text-[10px] font-mono">
                <th className="py-2.5 px-3">Module</th>
                <th className="py-2.5 px-3">In Electron Project</th>
                <th className="py-2.5 px-3">Requires CREAO?</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {ELECTRON_VS_CREAO.map((row, idx) => (
                <tr key={idx} className="hover:bg-zinc-900/40">
                  <td className="py-3 px-3 font-semibold text-zinc-200">{row.module}</td>
                  <td className="py-3 px-3 text-zinc-400">{row.electronProject}</td>
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">
                      <CheckCircle className="w-3 h-3" /> NO (100% Offline)
                    </span>
                  </td>
                  <td className="py-3 px-3 text-zinc-400 font-mono text-[11px]">
                    Self-Contained
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

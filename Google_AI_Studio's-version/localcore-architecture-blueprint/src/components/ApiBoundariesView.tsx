import React, { useState } from 'react';
import { COMPONENT_APIS, ComponentApiDoc } from '../data/blueprintData';
import { Code2, Copy, Check, Terminal, Shield, ArrowRight } from 'lucide-react';

export const ApiBoundariesView: React.FC = () => {
  const [selectedApiIndex, setSelectedApiIndex] = useState<number>(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const activeApi: ComponentApiDoc = COMPONENT_APIS[selectedApiIndex];

  const handleCopy = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
              <Code2 className="w-3.5 h-3.5" /> Strict API Contracts
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
              TypeScript API Boundaries & Interfaces
            </h2>
            <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
              Clean contracts ensure model independence, avatar decoupling, and local-first data isolation. Swapping a local LLM from llama.cpp to Ollama or adding a new tool requires zero changes to the avatar or chat UI.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span>TypeScript 5.x Ready</span>
          </div>
        </div>
      </div>

      {/* Interface Selector Tabs */}
      <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-none">
        {COMPONENT_APIS.map((api, idx) => (
          <button
            key={api.name}
            onClick={() => setSelectedApiIndex(idx)}
            className={`px-4 py-2.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all border ${
              selectedApiIndex === idx
                ? 'bg-zinc-800 text-cyan-400 border-cyan-500/40 shadow-sm'
                : 'bg-zinc-900/40 text-zinc-400 border-zinc-800/80 hover:bg-zinc-900 hover:text-zinc-200'
            }`}
          >
            <span className="font-mono">{api.interfaceName}</span>
          </button>
        ))}
      </div>

      {/* Active API Detail Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Code Box */}
        <div className="lg:col-span-7 bg-zinc-950 rounded-2xl border border-zinc-800 overflow-hidden shadow-2xl flex flex-col">
          <div className="px-4 py-3 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-mono font-semibold text-zinc-200">
                {activeApi.interfaceName}.ts
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                {activeApi.hostProcess}
              </span>
            </div>
            <button
              onClick={() => handleCopy(activeApi.code, selectedApiIndex)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
            >
              {copiedIndex === selectedApiIndex ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 text-[11px]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="text-[11px]">Copy Code</span>
                </>
              )}
            </button>
          </div>

          <div className="p-4 overflow-x-auto text-xs font-mono text-zinc-300 bg-zinc-950/90 leading-relaxed max-h-[520px] scrollbar-thin scrollbar-thumb-zinc-800">
            <pre>
              <code>{activeApi.code}</code>
            </pre>
          </div>
        </div>

        {/* Method & Architectural Breakdown */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800 space-y-4">
            <div>
              <span className="text-xs font-mono font-semibold text-cyan-400 uppercase tracking-wider block">
                Boundary Purpose
              </span>
              <h3 className="text-base font-bold text-zinc-100 mt-1">{activeApi.name}</h3>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{activeApi.purpose}</p>
            </div>

            <div className="pt-2 border-t border-zinc-800/80 space-y-3">
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block">
                Key Contract Methods:
              </span>
              <div className="space-y-2">
                {activeApi.keyMethods.map((m, i) => (
                  <div key={i} className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-cyan-300">{m.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 font-mono">
                        {m.localOrCloud}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 leading-snug">{m.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zero-Leaking Guarantee</span>
              </div>
              <p className="text-[11px] text-emerald-200/80 leading-relaxed">
                This interface prevents direct coupling with network SDKs. All implementations are swappable via dependency injection in Electron's Main process.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

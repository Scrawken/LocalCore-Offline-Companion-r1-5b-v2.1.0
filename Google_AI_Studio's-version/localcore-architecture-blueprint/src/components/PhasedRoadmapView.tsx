import React, { useState } from 'react';
import { PHASES, PhaseItem } from '../data/blueprintData';
import { CheckCircle2, ChevronDown, ChevronRight, AlertTriangle, Layers, Shield, Clock } from 'lucide-react';

export const PhasedRoadmapView: React.FC = () => {
  const [expandedPhase, setExpandedPhase] = useState<string>('phase-1');
  const [checkedCriteria, setCheckedCriteria] = useState<Record<string, boolean>>({});

  const toggleCriteria = (key: string) => {
    setCheckedCriteria((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div className="space-y-6">
      {/* Intro Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-2">
              <Layers className="w-3.5 h-3.5" /> Phased Implementation Strategy
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
              From Rock-Solid Character Chat to Full Desktop Agency
            </h2>
            <p className="text-sm text-zinc-400 mt-1 max-w-3xl">
              Each phase introduces a testable, self-sufficient slice of value. Phase 1 focuses strictly on local inference stability and VRM 60fps frame rate before adding memory, voice, or desktop automation.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-zinc-800/80 px-4 py-3 rounded-xl border border-zinc-700/50 text-center">
              <span className="block text-2xl font-bold text-cyan-400">6</span>
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">Testable Stages</span>
            </div>
            <div className="bg-zinc-800/80 px-4 py-3 rounded-xl border border-zinc-700/50 text-center">
              <span className="block text-2xl font-bold text-emerald-400">100%</span>
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">Offline Core</span>
            </div>
          </div>
        </div>
      </div>

      {/* Phase Cards */}
      <div className="space-y-4">
        {PHASES.map((phase: PhaseItem) => {
          const isExpanded = expandedPhase === phase.id;
          return (
            <div
              key={phase.id}
              className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                isExpanded
                  ? 'bg-zinc-900/90 border-cyan-500/40 shadow-lg shadow-cyan-950/20'
                  : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700'
              }`}
            >
              {/* Card Header */}
              <button
                onClick={() => setExpandedPhase(isExpanded ? '' : phase.id)}
                className="w-full px-5 py-4 flex items-center justify-between text-left transition-colors"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs tracking-wider transition-all ${
                      isExpanded
                        ? 'bg-cyan-500 text-zinc-950 font-black shadow-md shadow-cyan-500/30'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {phase.number.replace('Phase ', 'P')}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-zinc-100 text-base">{phase.title}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {phase.estimatedEffort}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">{phase.tagline}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="hidden sm:block text-right">
                    <span className="text-xs text-zinc-500">
                      {phase.testableCriteria.length} Acceptance Tests
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-cyan-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-zinc-500" />
                  )}
                </div>
              </button>

              {/* Card Body */}
              {isExpanded && (
                <div className="px-5 pb-5 pt-2 border-t border-zinc-800/80 space-y-5 text-sm">
                  {/* Focus summary */}
                  <div className="p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 text-zinc-300 text-xs leading-relaxed">
                    <span className="font-bold text-cyan-400 uppercase tracking-wider text-[10px] block mb-1">
                      Architectural Objective
                    </span>
                    {phase.focus}
                  </div>

                  {/* Two column deliverables */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Deliverables */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" /> Core Deliverables
                      </h4>
                      <ul className="space-y-1.5 text-xs text-zinc-400">
                        {phase.coreDeliverables.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 bg-zinc-950/30 p-2 rounded border border-zinc-800/40">
                            <span className="text-cyan-400 mt-0.5">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Scope separation */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-emerald-400" /> Electron vs CREAO Boundary
                      </h4>
                      <div className="space-y-2 text-xs">
                        <div className="p-2.5 rounded bg-zinc-950/50 border border-zinc-800/60">
                          <span className="font-semibold text-emerald-400 block mb-1">In Electron Desktop Project:</span>
                          <ul className="list-disc list-inside text-zinc-400 space-y-1">
                            {phase.electronScope.map((scope, sIdx) => (
                              <li key={sIdx}>{scope}</li>
                            ))}
                          </ul>
                        </div>
                        {phase.creaoScope && phase.creaoScope.length > 0 && (
                          <div className="p-2.5 rounded bg-zinc-950/50 border border-zinc-800/60">
                            <span className="font-semibold text-purple-400 block mb-1">CREAO Cloud Scope:</span>
                            <ul className="list-disc list-inside text-zinc-400 space-y-1">
                              {phase.creaoScope.map((scope, sIdx) => (
                                <li key={sIdx}>{scope}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Testable Acceptance Criteria Interactive Checklist */}
                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Testable Acceptance Criteria
                      </span>
                      <span className="text-[11px] font-normal text-zinc-500">
                        Interactive verification checklist
                      </span>
                    </h4>
                    <div className="grid grid-cols-1 gap-2">
                      {phase.testableCriteria.map((criterion, cIdx) => {
                        const checkKey = `${phase.id}-c-${cIdx}`;
                        const isChecked = !!checkedCriteria[checkKey];
                        return (
                          <label
                            key={cIdx}
                            onClick={() => toggleCriteria(checkKey)}
                            className={`flex items-start gap-3 p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                              isChecked
                                ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
                                : 'bg-zinc-950/40 border-zinc-800/80 text-zinc-300 hover:border-zinc-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="mt-0.5 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                            />
                            <div className="flex-1">
                              <span>{criterion}</span>
                              {isChecked && (
                                <span className="block mt-1 text-[10px] text-emerald-400 font-mono">
                                  ✓ Criteria verified in test harness
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Key Risks */}
                  {phase.keyRisks.length > 0 && (
                    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300/90 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold block text-amber-300">Phase Risk & Mitigation:</span>
                        <span>{phase.keyRisks.join(' ')}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

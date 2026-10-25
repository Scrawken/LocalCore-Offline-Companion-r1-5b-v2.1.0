import React, { useState } from 'react';
import { DECISIONS_LIST, DecisionItem } from '../data/blueprintData';
import { HelpCircle, CheckCircle, AlertTriangle, Sparkles, Check, ArrowRight } from 'lucide-react';

export const DecisionsRiskRegister: React.FC = () => {
  const [userChoices, setUserChoices] = useState<Record<string, string>>({
    'decision-llm-runtime': 'Embedded llama-server (llama.cpp)',
    'decision-vrm-isolation': 'Dual Process (Dedicated Avatar Overlay Window)',
    'decision-memory-extraction': 'Asynchronous Background Micro-Model (SLM)',
    'decision-tts-engine': 'Piper C++ Neural TTS (Bundled binary)',
    'decision-creao-boundary': 'CREAO as Optional Zero-Knowledge Sync & Frontier Relay'
  });

  const selectOption = (decisionId: string, optionName: string) => {
    setUserChoices((prev) => ({
      ...prev,
      [decisionId]: optionName
    }));
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-gradient-to-r from-amber-950/30 via-zinc-900 to-zinc-950 p-6 rounded-2xl border border-amber-500/30 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 mb-2">
              <Sparkles className="w-3.5 h-3.5" /> Architectural Decision Gates
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
              5 Critical Decisions Requiring Product Alignment
            </h2>
            <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
              To avoid premature assumptions about your runtime and privacy requirements, here are the 5 architectural fork points where your input directs the implementation. Recommended defaults are marked.
            </p>
          </div>
          <div className="text-xs bg-zinc-950 px-3.5 py-2.5 rounded-xl border border-zinc-800 text-zinc-400 font-mono">
            <span className="text-amber-400 font-bold">5 Open Gates</span>
            <div className="text-[11px] text-zinc-500 mt-0.5">Aligned with MVP roadmap</div>
          </div>
        </div>
      </div>

      {/* Decision Cards */}
      <div className="space-y-5">
        {DECISIONS_LIST.map((decision: DecisionItem, idx: number) => {
          const selectedChoice = userChoices[decision.id];
          return (
            <div
              key={decision.id}
              className="bg-zinc-900/70 p-5 rounded-2xl border border-zinc-800 hover:border-zinc-700/80 transition-all space-y-4 shadow-lg"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs font-mono font-bold">
                    {idx + 1}
                  </span>
                  <h3 className="font-bold text-zinc-100 text-base">{decision.title}</h3>
                </div>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-zinc-800/80 text-cyan-400 font-mono border border-zinc-700/60 self-start sm:self-auto">
                  {decision.category}
                </span>
              </div>

              {/* Context description */}
              <p className="text-xs text-zinc-300 leading-relaxed">{decision.context}</p>

              {/* Question box */}
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-amber-300">Question for you:</span>
                  <span>{decision.userDecisionNeeded}</span>
                </div>
              </div>

              {/* Options grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                {decision.options.map((opt, oIdx) => {
                  const isChosen = selectedChoice === opt.name;
                  return (
                    <div
                      key={oIdx}
                      onClick={() => selectOption(decision.id, opt.name)}
                      className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between ${
                        isChosen
                          ? 'bg-cyan-950/30 border-cyan-400 text-zinc-100 shadow-md shadow-cyan-950/30'
                          : 'bg-zinc-950/50 border-zinc-800/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <span className={`font-semibold text-xs ${isChosen ? 'text-cyan-300' : 'text-zinc-200'}`}>
                            {opt.name}
                          </span>
                          {opt.isRecommended && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 font-mono border border-emerald-800/40">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 mb-2 leading-snug">{opt.description}</p>
                      </div>

                      <div className="pt-2 border-t border-zinc-800/60 text-[10px] space-y-1">
                        <span className="font-semibold text-zinc-400 block">Trade-offs:</span>
                        <p className="text-zinc-500 leading-tight">{opt.tradeoffs}</p>
                        <div className="flex items-center justify-end pt-1">
                          {isChosen ? (
                            <span className="text-cyan-400 font-mono flex items-center gap-1 font-semibold text-[10px]">
                              <Check className="w-3 h-3" /> Selected
                            </span>
                          ) : (
                            <span className="text-zinc-600 hover:text-zinc-400 text-[10px]">Click to select</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Architect Recommendation summary */}
              <div className="text-[11px] text-zinc-400 bg-zinc-950/60 px-3.5 py-2 rounded-lg border border-zinc-800/60 flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  <strong className="text-zinc-200">Architect Recommendation: </strong>
                  {decision.recommendedChoice}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

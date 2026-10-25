import React from 'react';
import { ShieldCheck, HardDrive, Cpu, Terminal, Sparkles, Copy, Check } from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onCopyFullBlueprint: () => void;
  copied: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onCopyFullBlueprint,
  copied
}) => {
  const tabs = [
    { id: 'roadmap', label: '1. Phased Roadmap', icon: Terminal },
    { id: 'architecture', label: '2. Component Architecture', icon: Cpu },
    { id: 'apis', label: '3. API Boundaries', icon: HardDrive },
    { id: 'privacy', label: '4. Privacy & Cloud Matrix', icon: ShieldCheck },
    { id: 'decisions', label: '5. Decisions Needing Input', icon: Sparkles },
    { id: 'creao-split', label: '6. Electron vs CREAO', icon: HardDrive },
    { id: 'simulator', label: 'Interactive Flow Simulation', icon: Terminal }
  ];

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Product Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/30">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-zinc-100 tracking-tight">LocalCore</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Local-First Windows AI
                </span>
              </div>
              <p className="text-xs text-zinc-400 hidden sm:block">
                Product Architecture Blueprint & Specification
              </p>
            </div>
          </div>

          {/* Quick Action */}
          <div className="flex items-center gap-3">
            <button
              onClick={onCopyFullBlueprint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-all shadow-sm"
              title="Copy complete markdown blueprint to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied Blueprint</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Copy Markdown Blueprint</span>
                </>
              )}
            </button>
            <div className="hidden md:flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded-md border border-zinc-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Airgap Default: Active</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 overflow-x-auto py-2 scrollbar-none border-t border-zinc-900 text-xs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-md font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-zinc-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-zinc-500'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};

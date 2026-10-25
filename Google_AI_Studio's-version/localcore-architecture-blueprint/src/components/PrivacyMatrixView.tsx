import React from 'react';
import { PRIVACY_MATRIX, PrivacyMatrixRow } from '../data/blueprintData';
import { ShieldAlert, ShieldCheck, Lock, HardDrive, WifiOff, FileCheck } from 'lucide-react';

export const PrivacyMatrixView: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Privacy Guarantee Banner */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-950 p-6 rounded-2xl border border-emerald-500/30 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 mb-2">
              <ShieldCheck className="w-3.5 h-3.5" /> Privacy & Data Sovereignty Constitution
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
              Local-First by Default, Cloud-Optional by Explicit Consent
            </h2>
            <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
              Zero private data leaves the user’s PC unless explicitly unlocked through multi-step consent. All generated media, memory facts, audio clips, and conversation history are stored as standard local files.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-zinc-950/80 px-4 py-3 rounded-xl border border-zinc-800 text-xs font-mono">
            <WifiOff className="w-4 h-4 text-emerald-400" />
            <div>
              <span className="text-zinc-200 block font-bold">100% Offline Capable</span>
              <span className="text-zinc-500 text-[11px]">Wireshark verifiable: 0 packets</span>
            </div>
          </div>
        </div>
      </div>

      {/* Comparative Privacy Matrix Table */}
      <div className="bg-zinc-950 rounded-2xl border border-zinc-800 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-900/90 border-b border-zinc-800 text-zinc-300 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Feature / Capability</th>
                <th className="py-3.5 px-4 text-emerald-400">Local Default (Default: ON)</th>
                <th className="py-3.5 px-4 text-purple-400">Optional Cloud (Default: OFF)</th>
                <th className="py-3.5 px-4">Data Egress to Cloud</th>
                <th className="py-3.5 px-4">Consent Gate</th>
                <th className="py-3.5 px-4">Offline Behavior</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-300">
              {PRIVACY_MATRIX.map((row: PrivacyMatrixRow, idx: number) => (
                <tr key={idx} className="hover:bg-zinc-900/30 transition-colors">
                  <td className="py-4 px-4 font-semibold text-zinc-100 whitespace-nowrap flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                    <span>{row.capability}</span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="inline-block px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 font-mono text-[11px] border border-emerald-800/40">
                      {row.localDefault}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="inline-block px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 font-mono text-[11px] border border-purple-800/40">
                      {row.optionalCloud}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-zinc-400">
                    <span className={row.dataSentToCloud.startsWith('STRICTLY NONE') ? 'text-emerald-400 font-semibold' : ''}>
                      {row.dataSentToCloud}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="text-amber-300/90 font-medium">
                      {row.userConsentRequirement}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-zinc-400">
                    <span className="text-zinc-300 font-medium">{row.offlineBehavior}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Content & Artifact Governance Rules */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold">
            <HardDrive className="w-4 h-4" />
            <span>Local User Content Sovereignty</span>
          </div>
          <p className="text-zinc-400 leading-relaxed">
            All generated audio files (.wav), memory databases (.db), conversation logs (.jsonl), and downloaded VRM models are stored in plain accessible folders under <code>%APPDATA%/LocalCore</code>. The user can browse, back up, or wipe them via standard Windows Explorer.
          </p>
        </div>

        <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <Lock className="w-4 h-4" />
            <span>Zero-Knowledge Cloud Backup</span>
          </div>
          <p className="text-zinc-400 leading-relaxed">
            If the user opts into CREAO Cloud Backup, snapshots are encrypted client-side using an AES-256-GCM key derived from the user’s local passphrase before transmission. CREAO servers only store opaque encrypted blobs.
          </p>
        </div>

        <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-semibold">
            <ShieldAlert className="w-4 h-4" />
            <span>Desktop Consequential Gating</span>
          </div>
          <p className="text-zinc-400 leading-relaxed">
            Desktop actions (deleting files, executing scripts, modifying windows) can NEVER be executed automatically by LLM tool calls. Every consequential action raises a non-dismissible UI confirmation curtain detailing the exact arguments.
          </p>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { CompanionAvatarScene, AvatarState, CompanionMood } from './components/CompanionAvatarScene';
import { CompanionDock } from './components/CompanionDock';
import { AvatarCatalogModal } from './components/AvatarCatalogModal';
import {
  StoredAvatar,
  DEFAULT_AVATARS,
  getAllCatalogAvatars,
  saveCustomVrmAvatar,
} from './utils/vrmCatalogDb';
import {
  memoryService,
  ConversationLog,
  MemoryStats
} from './services/MemoryService';
import { PhasedRoadmapView } from './components/PhasedRoadmapView';
import { ArchitectureDiagramView } from './components/ArchitectureDiagramView';
import { ApiBoundariesView } from './components/ApiBoundariesView';
import { PrivacyMatrixView } from './components/PrivacyMatrixView';
import { DecisionsRiskRegister } from './components/DecisionsRiskRegister';
import { ElectronVsCreaoView } from './components/ElectronVsCreaoView';
import { WorkflowSimulationView } from './components/WorkflowSimulationView';
import {
  ShieldCheck,
  X,
  Sparkles,
  Upload,
  Camera,
  Users,
  Check,
  CheckCircle2,
  Database,
  Layers,
  HardDrive,
  Volume2,
  VolumeX
} from 'lucide-react';

const VOICE_STORAGE_KEY = 'localcore_voice_synthesis_enabled';

export default function App() {
  const [avatarState, setAvatarState] = useState<AvatarState>({
    mood: 'cheerful',
    isListening: false,
    isSpeaking: false,
    isPlayingMusic: false,
    currentViseme: 'silence',
    visemeWeight: 0,
    projectedImage: null,
    cameraView: 'half',
    customVrmLoaded: false,
    vrmModelName: 'Aria (Anime Companion)'
  });

  // Persistent Global Voice Output State
  const [isVoiceEnabled, setIsVoiceEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(VOICE_STORAGE_KEY);
      if (stored !== null) return stored === 'true';
    } catch (e) {
      // ignore
    }
    return true; // Enabled by default
  });

  const handleToggleVoice = () => {
    setIsVoiceEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(VOICE_STORAGE_KEY, String(next));
      } catch (e) {
        // ignore
      }
      setAvatarToast(next ? 'Companion voice synthesis enabled' : 'Companion voice synthesis muted');
      setTimeout(() => setAvatarToast(null), 3000);
      return next;
    });
  };

  // VRM Catalog & Selection state
  const [avatars, setAvatars] = useState<StoredAvatar[]>(DEFAULT_AVATARS);
  const [activeAvatar, setActiveAvatar] = useState<StoredAvatar>(DEFAULT_AVATARS[0]);
  const [isCatalogOpen, setIsCatalogOpen] = useState<boolean>(false);
  const [isLoadingAvatar, setIsLoadingAvatar] = useState<boolean>(false);
  const [avatarToast, setAvatarToast] = useState<string | null>(null);

  // SQLite Conversation Logs & Memory State (MemoryService)
  const [conversationLogs, setConversationLogs] = useState<ConversationLog[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => memoryService.getSessionId());
  const [sqliteStats, setSqliteStats] = useState<MemoryStats | null>(null);
  const [isLoadingChat, setIsLoadingChat] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load stored avatars, conversation logs & SQLite stats on mount
  useEffect(() => {
    // 1. Load custom avatars from IndexedDB
    getAllCatalogAvatars().then((list) => {
      if (list && list.length > 0) {
        setAvatars(list);
      }
    });

    // 2. Load conversation logs from on-device SQLite database
    memoryService.getLogs().then((logs) => {
      if (logs && logs.length > 0) {
        setConversationLogs(logs);
      }
    });

    // 3. Load SQLite statistics
    memoryService.getStats().then((stats) => {
      setSqliteStats(stats);
    });
  }, []);

  const refreshAvatars = async () => {
    const list = await getAllCatalogAvatars();
    setAvatars(list);
  };

  const handleSelectAvatar = (av: StoredAvatar) => {
    setActiveAvatar(av);
    setAvatarToast(`Companion changed to ${av.name}`);
    setTimeout(() => setAvatarToast(null), 3000);
  };

  const handleQuickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsLoadingAvatar(true);
      const newAv = await saveCustomVrmAvatar(file.name, file);
      await refreshAvatars();
      setActiveAvatar(newAv);
      setAvatarToast(`Imported & activated ${newAv.name}`);
      setTimeout(() => setAvatarToast(null), 3000);
    } catch (err: any) {
      console.error(err);
      alert('Failed to import VRM avatar: ' + (err?.message || 'Storage error'));
    } finally {
      setIsLoadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Speech Synthesis & Viseme Animation Driver
  const triggerSpeechSynthesis = async (text: string) => {
    setAvatarState((prev) => ({
      ...prev,
      isSpeaking: true,
      mood: 'speaking',
      visemeWeight: 0.8
    }));

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'Kore' })
      });
      const ttsData = await res.json();

      if (ttsData.audioUrl) {
        const audio = new Audio(ttsData.audioUrl);
        audio.play().catch(() => {});

        if (ttsData.visemes && ttsData.visemes.length > 0) {
          ttsData.visemes.forEach((v: any) => {
            setTimeout(() => {
              setAvatarState((st) => ({
                ...st,
                currentViseme: v.viseme,
                visemeWeight: v.weight
              }));
            }, v.timestampMs);
          });
        }

        audio.onended = () => {
          setAvatarState((prev) => ({
            ...prev,
            isSpeaking: false,
            visemeWeight: 0,
            mood: 'cheerful'
          }));
        };
      } else if (ttsData.useClientSpeech && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        const mouthInterval = setInterval(() => {
          setAvatarState((prev) => ({
            ...prev,
            visemeWeight: 0.3 + Math.random() * 0.6,
            currentViseme: ['aa', 'ih', 'oh'][Math.floor(Math.random() * 3)]
          }));
        }, 110);

        utterance.onend = () => {
          clearInterval(mouthInterval);
          setAvatarState((prev) => ({
            ...prev,
            isSpeaking: false,
            visemeWeight: 0,
            mood: 'happy'
          }));
        };
        window.speechSynthesis.speak(utterance);
      }
    } catch (err) {
      setTimeout(() => {
        setAvatarState((prev) => ({ ...prev, isSpeaking: false, visemeWeight: 0, mood: 'neutral' }));
      }, 1500);
    }
  };

  // 1. Send Message with SQLite Persistence via MemoryService
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoadingChat) return;
    const userText = text.trim();
    setIsLoadingChat(true);

    setAvatarState((prev) => ({
      ...prev,
      mood: 'thinking',
      isSpeaking: false,
    }));

    // Save user turn into SQLite
    const userLog = await memoryService.saveMessage({
      sessionId: currentSessionId,
      role: 'user',
      content: userText,
      mood: avatarState.mood,
    });

    setConversationLogs((prev) => [...prev, userLog]);

    try {
      // Call chat API with conversation history context
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          mood: avatarState.mood,
          sessionId: currentSessionId,
          history: conversationLogs.slice(-6).map((m) => ({ role: m.role, content: m.content }))
        })
      });

      const data = await response.json();
      const reply = data.reply || "I am right here with you on our local architecture.";
      const replyMood = (data.mood || avatarState.mood) as CompanionMood;

      // Save assistant reply into SQLite
      const assistantLog = await memoryService.saveMessage({
        sessionId: currentSessionId,
        role: 'assistant',
        content: reply,
        mood: replyMood,
      });

      setConversationLogs((prev) => [...prev, assistantLog]);
      setAvatarState((prev) => ({ ...prev, mood: replyMood }));

      // Conditionally trigger spoken dialogue and visemes based on global voice toggle
      if (isVoiceEnabled) {
        triggerSpeechSynthesis(reply);
      } else {
        setAvatarState((prev) => ({
          ...prev,
          isSpeaking: false,
          visemeWeight: 0,
          mood: replyMood
        }));
      }
    } catch (err) {
      console.error('Chat error:', err);
      const fallbackText = "I am listening. As a local-first companion, your messages are safely stored on-device in SQLite.";
      const fallbackLog = await memoryService.saveMessage({
        sessionId: currentSessionId,
        role: 'assistant',
        content: fallbackText,
        mood: 'empathetic',
      });
      setConversationLogs((prev) => [...prev, fallbackLog]);
      setAvatarState((prev) => ({ ...prev, mood: 'empathetic' }));
    } finally {
      setIsLoadingChat(false);
    }
  };

  // 2. Delete Message from SQLite
  const handleDeleteMessage = async (id: string) => {
    await memoryService.deleteMessage(id);
    setConversationLogs((prev) => prev.filter((m) => m.id !== id));
    memoryService.getStats().then(setSqliteStats);
  };

  // 3. Clear Messages from SQLite
  const handleClearMessages = async (sessionId?: string) => {
    await memoryService.clearLogs(sessionId);
    if (sessionId) {
      setConversationLogs((prev) => prev.filter((m) => m.sessionId !== sessionId));
    } else {
      setConversationLogs([]);
    }
    memoryService.getStats().then(setSqliteStats);
  };

  // 4. Start New Session in SQLite
  const handleNewSession = () => {
    const newId = memoryService.createNewSession();
    setCurrentSessionId(newId);
    setAvatarToast(`Started new conversation session: ${newId}`);
    setTimeout(() => setAvatarToast(null), 3000);
  };

  // Blueprint overlay modal state
  const [isBlueprintOpen, setIsBlueprintOpen] = useState<boolean>(false);
  const [activeBlueprintTab, setActiveBlueprintTab] = useState<string>('roadmap');
  const [copied, setCopied] = useState<boolean>(false);

  const fullMarkdownBlueprint = `# LocalCore Architectural Blueprint: Windows AI Desktop Companion

## 1. Executive Summary & Core Principles
- Local-First & Offline-Capable: Chat, memory, voice, avatar rendering, and desktop tools run on-device.
- Replaceable Models: LLM abstracted via IModelProvider (llama.cpp / Ollama / ONNX).
- User Data Sovereignty: Memories in local SQLite (%APPDATA%/LocalCore/localcore_memory.db), generated artifacts in user folder.
- Strict Consequential Action Gates: Desktop actions require explicit human confirmation curtains.
- Zero Silent Cloud Fallback: Cloud services (CREAO) are strictly opt-in and off by default.`;

  const copyBlueprint = () => {
    navigator.clipboard.writeText(fullMarkdownBlueprint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCharacterClick = () => {
    setAvatarState((prev) => ({
      ...prev,
      mood: prev.mood === 'happy' ? 'cheerful' : 'happy',
    }));
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-zinc-950 text-zinc-100 relative font-sans">
      {/* Hidden file picker for direct upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".vrm,.glb"
        onChange={handleQuickUpload}
        className="hidden"
      />

      {/* 1. Full-Bleed Three.js 3D Anime Character Scene (100vw x 100vh) */}
      <div className="absolute inset-0 z-0">
        <CompanionAvatarScene
          avatarState={avatarState}
          setAvatarState={setAvatarState}
          onCharacterClick={handleCharacterClick}
          activeAvatar={activeAvatar}
          onAvatarImported={(newAv) => {
            setAvatars((prev) => [newAv, ...prev]);
            setActiveAvatar(newAv);
            setAvatarToast(`Imported & activated ${newAv.name}`);
            setTimeout(() => setAvatarToast(null), 3000);
          }}
          isLoadingAvatar={isLoadingAvatar}
          setIsLoadingAvatar={setIsLoadingAvatar}
        />
      </div>

      {/* Top Header Floating Controls (Minimal, unobtrusive per Three.js skill) */}
      <div className="absolute top-4 left-4 z-20 pointer-events-auto flex items-center gap-2.5 flex-wrap">
        {/* Active Avatar Badge Button -> Opens Catalog */}
        <button
          onClick={() => setIsCatalogOpen(true)}
          className="px-3 py-1.5 rounded-xl bg-zinc-950/90 hover:bg-zinc-900 border border-zinc-800 hover:border-pink-500/50 text-xs flex items-center gap-2 shadow-lg cursor-pointer transition-all"
          title="Click to view and switch avatars in catalog"
        >
          <div className="w-2.5 h-2.5 rounded-full bg-pink-400 animate-pulse"></div>
          <span className="font-bold text-zinc-200">LocalCore</span>
          <span className="text-zinc-600">•</span>
          <span className="text-pink-300 font-mono text-[11px] font-semibold max-w-[160px] truncate">
            {activeAvatar.name}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase font-mono">
            {activeAvatar.type}
          </span>
        </button>

        {/* Dedicated VRM Avatar Catalog Button */}
        <button
          onClick={() => setIsCatalogOpen(true)}
          className="px-3 py-1.5 rounded-xl bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/50 text-xs font-semibold text-pink-200 transition-all flex items-center gap-1.5 shadow-lg"
          title="Manage avatar models, default companion and imported VRMs"
        >
          <Users className="w-3.5 h-3.5 text-pink-400" />
          <span>Avatar Catalog ({avatars.length})</span>
        </button>

        {/* Quick Import .VRM Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-medium text-pink-300 transition-all flex items-center gap-1.5 shadow-lg"
          title="Upload or drag-and-drop any .VRM anime humanoid model"
        >
          <Upload className="w-3.5 h-3.5 text-pink-400" />
          <span className="hidden sm:inline">Import .VRM</span>
        </button>

        {/* SQLite Storage Status Pill */}
        <div
          className="px-3 py-1.5 rounded-xl bg-zinc-950/85 border border-zinc-800 text-xs flex items-center gap-2 shadow-lg"
          title={`On-device SQLite Database: localcore_memory.db (${sqliteStats?.dbSizeFormatted || 'active'})`}
        >
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-semibold text-zinc-300 hidden md:inline">SQLite:</span>
          <span className="text-emerald-400 font-mono text-[11px] font-bold">
            {conversationLogs.length} logs
          </span>
          {sqliteStats?.dbSizeFormatted && (
            <span className="text-[10px] text-zinc-500 font-mono hidden lg:inline">
              ({sqliteStats.dbSizeFormatted})
            </span>
          )}
        </div>

        {/* Global Voice Output Toggle Button (Persisted in App State) */}
        <button
          onClick={handleToggleVoice}
          className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shadow-lg transition-all cursor-pointer ${
            isVoiceEnabled
              ? 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-700/80 text-emerald-400'
              : 'bg-zinc-950/80 hover:bg-zinc-900 border-zinc-800 text-zinc-500'
          }`}
          title={isVoiceEnabled ? 'Companion Voice Output: Enabled (Click to Mute)' : 'Companion Voice Output: Muted (Click to Enable)'}
        >
          {isVoiceEnabled ? (
            <>
              <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span className="text-zinc-200">Voice: <strong className="text-emerald-400">ON</strong></span>
            </>
          ) : (
            <>
              <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-zinc-400">Voice: <strong className="text-zinc-500">OFF</strong></span>
            </>
          )}
        </button>

        {/* Camera View Switcher (Full Body / Half Body / Portrait) */}
        <div className="px-1.5 py-1 rounded-xl bg-zinc-950/85 border border-zinc-800 text-xs flex items-center gap-1 shadow-lg">
          <Camera className="w-3.5 h-3.5 text-zinc-400 ml-1.5" />
          <button
            onClick={() => setAvatarState((prev) => ({ ...prev, cameraView: 'portrait' }))}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors ${
              avatarState.cameraView === 'portrait' ? 'bg-pink-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Portrait
          </button>
          <button
            onClick={() => setAvatarState((prev) => ({ ...prev, cameraView: 'half' }))}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors ${
              avatarState.cameraView === 'half' ? 'bg-pink-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Half Body
          </button>
          <button
            onClick={() => setAvatarState((prev) => ({ ...prev, cameraView: 'full' }))}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors ${
              avatarState.cameraView === 'full' ? 'bg-pink-500 text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Full Body
          </button>
        </div>

        {/* Loading Indicator Toast */}
        {isLoadingAvatar && (
          <div className="px-3 py-1.5 rounded-xl bg-cyan-950/90 border border-cyan-500/50 text-xs text-cyan-300 flex items-center gap-2 shadow-lg animate-pulse">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Parsing 3D humanoid skeleton & blendshapes...</span>
          </div>
        )}

        {/* Avatar Switched Notification Toast */}
        {avatarToast && (
          <div className="px-3 py-1.5 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-xs text-emerald-300 flex items-center gap-2 shadow-lg">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>{avatarToast}</span>
          </div>
        )}

        {/* Blueprint Spec Button */}
        <button
          onClick={() => setIsBlueprintOpen(true)}
          className="px-3 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-medium text-zinc-200 transition-all flex items-center gap-1.5 shadow-lg"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">System Architecture</span>
        </button>
      </div>

      {/* Top Right Quick Hint */}
      <div className="absolute top-4 right-4 z-20 pointer-events-none hidden md:flex items-center gap-2 text-xs text-zinc-400 bg-zinc-950/80 px-3 py-1.5 rounded-xl border border-zinc-800/80">
        <span>Click companion to react • Storing in localcore_memory.db</span>
      </div>

      {/* 2. Sleek Collapsible Bottom Control Dock with SQLite MemoryService Integration */}
      <CompanionDock
        avatarState={avatarState}
        setAvatarState={setAvatarState}
        onOpenBlueprint={() => setIsBlueprintOpen(true)}
        onOpenCatalog={() => setIsCatalogOpen(true)}
        activeAvatarName={activeAvatar.name}
        conversationLogs={conversationLogs}
        onSendMessage={handleSendMessage}
        onDeleteMessage={handleDeleteMessage}
        onClearMessages={handleClearMessages}
        onNewSession={handleNewSession}
        currentSessionId={currentSessionId}
        sqliteStats={sqliteStats}
        isLoadingChat={isLoadingChat}
        isVoiceEnabled={isVoiceEnabled}
        onToggleVoice={handleToggleVoice}
      />

      {/* 3. VRM Avatar Catalog & Manager Modal */}
      <AvatarCatalogModal
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        avatars={avatars}
        selectedAvatarId={activeAvatar.id}
        onSelectAvatar={handleSelectAvatar}
        onAvatarListUpdated={refreshAvatars}
      />

      {/* 4. Architecture Blueprint Modal Overlay */}
      {isBlueprintOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950/90 backdrop-blur-md flex flex-col overflow-y-auto">
          {/* Modal Header */}
          <div className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-zinc-100">
                    LocalCore Product & Technical Architecture Blueprint
                  </h2>
                  <p className="text-[11px] text-zinc-400">
                    Local-First Windows Desktop AI Companion • Phased Roadmap & Contracts
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={copyBlueprint}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
                >
                  {copied ? 'Copied' : 'Copy Blueprint Markdown'}
                </button>
                <button
                  onClick={() => setIsBlueprintOpen(false)}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                  title="Close Blueprint"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sub-tab navigation */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-2 py-2 overflow-x-auto border-t border-zinc-900 text-xs">
              {[
                { id: 'roadmap', label: '1. Phased Roadmap' },
                { id: 'architecture', label: '2. Component Architecture' },
                { id: 'apis', label: '3. API Boundaries' },
                { id: 'privacy', label: '4. Privacy & Cloud Matrix' },
                { id: 'decisions', label: '5. Decisions Needing Input' },
                { id: 'creao-split', label: '6. Electron vs CREAO' },
                { id: 'simulator', label: 'Interactive Flow Simulation' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveBlueprintTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
                    activeBlueprintTab === tab.id
                      ? 'bg-zinc-800 text-cyan-400 border border-cyan-500/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Modal Main Content */}
          <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {activeBlueprintTab === 'roadmap' && <PhasedRoadmapView />}
            {activeBlueprintTab === 'architecture' && <ArchitectureDiagramView />}
            {activeBlueprintTab === 'apis' && <ApiBoundariesView />}
            {activeBlueprintTab === 'privacy' && <PrivacyMatrixView />}
            {activeBlueprintTab === 'decisions' && <DecisionsRiskRegister />}
            {activeBlueprintTab === 'creao-split' && <ElectronVsCreaoView />}
            {activeBlueprintTab === 'simulator' && <WorkflowSimulationView />}
          </div>
        </div>
      )}
    </div>
  );
}

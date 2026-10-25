import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  History,
  Mic,
  MicOff,
  Music,
  Image as ImageIcon,
  Database,
  Sliders,
  ChevronDown,
  ChevronUp,
  Send,
  Play,
  Pause,
  Trash2,
  Sparkles,
  Download,
  Shield,
  Search,
  Smile,
  Heart,
  Brain,
  Zap,
  Coffee,
  Sun,
  Eye,
  Radio,
  Clock,
  FileText,
  PlusCircle,
  HardDrive,
  Filter,
  Volume2,
  VolumeX
} from 'lucide-react';
import { AvatarState, CompanionMood } from './CompanionAvatarScene';
import {
  ConversationLog,
  UserMemory,
  MemoryStats,
  memoryService
} from '../services/MemoryService';

export interface CompanionDockProps {
  avatarState: AvatarState;
  setAvatarState: React.Dispatch<React.SetStateAction<AvatarState>>;
  onOpenBlueprint: () => void;
  onOpenCatalog?: () => void;
  activeAvatarName?: string;
  conversationLogs: ConversationLog[];
  onSendMessage: (text: string) => Promise<void>;
  onDeleteMessage: (id: string) => Promise<void>;
  onClearMessages: (sessionId?: string) => Promise<void>;
  onNewSession: () => void;
  currentSessionId: string;
  sqliteStats: MemoryStats | null;
  isLoadingChat: boolean;
  isVoiceEnabled: boolean;
  onToggleVoice: () => void;
}

export const CompanionDock: React.FC<CompanionDockProps> = ({
  avatarState,
  setAvatarState,
  onOpenBlueprint,
  onOpenCatalog,
  activeAvatarName,
  conversationLogs,
  onSendMessage,
  onDeleteMessage,
  onClearMessages,
  onNewSession,
  currentSessionId,
  sqliteStats,
  isVoiceEnabled,
  onToggleVoice,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'history' | 'voice' | 'music' | 'image' | 'memory' | 'avatar'>('chat');

  // Chat Input State
  const [inputText, setInputText] = useState('');

  // History Filter State
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyFilterSession, setHistoryFilterSession] = useState<'all' | 'current'>('all');

  // Live Voice State (gemini-3.8-live)
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  // Music State (Lyria)
  const [musicPrompt, setMusicPrompt] = useState('Gentle relaxing lo-fi piano and ambient strings');
  const [isGeneratingMusic, setIsGeneratingMusic] = useState(false);
  const [musicAudioUrl, setMusicAudioUrl] = useState<string | null>(null);
  const [isPlayingTrack, setIsPlayingTrack] = useState(false);
  const audioElemRef = useRef<HTMLAudioElement | null>(null);

  // Image State (gemini-nano-banana-2.1)
  const [imagePrompt, setImagePrompt] = useState('An elegant modern glass tea lounge overlooking a misty mountain garden');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<Array<{ url: string; prompt: string; date: string }>>([]);
  const [aspectRatio, setAspectRatio] = useState('1:1');

  // Memory State (Loaded from SQLite via MemoryService)
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState<string>('preference');

  // Load SQLite user memories on mount
  useEffect(() => {
    memoryService.getMemories().then((data) => {
      if (data && data.length > 0) {
        setMemories(data);
      }
    });
  }, []);

  // 12 Expanded Moods Definition
  const MOOD_PALETTE: Array<{ id: CompanionMood; label: string; icon: any; color: string; desc: string }> = [
    { id: 'neutral', label: 'Neutral', icon: Sliders, color: 'text-cyan-400', desc: 'Calm, balanced & observant' },
    { id: 'happy', label: 'Happy', icon: Smile, color: 'text-emerald-400', desc: 'Warm smile and welcoming demeanor' },
    { id: 'cheerful', label: 'Cheerful', icon: Sun, color: 'text-amber-400', desc: 'Radiant joy, gentle nodding & brightness' },
    { id: 'curious', label: 'Curious', icon: Eye, color: 'text-cyan-300', desc: 'Perked head tilt and inquisitive gaze' },
    { id: 'empathetic', label: 'Empathetic', icon: Heart, color: 'text-rose-400', desc: 'Compassionate, comforting & attentive' },
    { id: 'playful', label: 'Playful', icon: Sparkles, color: 'text-pink-400', desc: 'Playful wink and lighthearted smile' },
    { id: 'focused', label: 'Focused', icon: Zap, color: 'text-indigo-400', desc: 'Sharp concentration & coding assistance' },
    { id: 'thinking', label: 'Thinking', icon: Brain, color: 'text-purple-400', desc: 'Analytical reflection & contemplation' },
    { id: 'surprised', label: 'Surprised', icon: Sparkles, color: 'text-amber-300', desc: 'Wide eyes, lifted brows & delight' },
    { id: 'sleepy', label: 'Sleepy', icon: Coffee, color: 'text-zinc-400', desc: 'Slow, relaxed eyelids and calm breathing' },
    { id: 'speaking', label: 'Speaking', icon: MessageSquare, color: 'text-cyan-400', desc: 'Animated lip-sync and dialogue' },
    { id: 'dance', label: 'Grooving', icon: Music, color: 'text-pink-400', desc: 'Rhythmic swaying to Lyria music' }
  ];

  // 1. Send Message Handler (Delegates to App.tsx which orchestrates MemoryService)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoadingChat) return;
    const text = inputText.trim();
    setInputText('');
    await onSendMessage(text);
  };

  // 2. Live Voice WebSocket (gemini-3.8-live)
  const toggleLiveVoice = () => {
    if (isLiveConnected) {
      if (wsRef.current) wsRef.current.close();
      setIsLiveConnected(false);
      setAvatarState((prev) => ({ ...prev, isListening: false, mood: 'neutral' }));
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live-ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsLiveConnected(true);
        setAvatarState((prev) => ({ ...prev, isListening: true, mood: 'focused' }));
        setLiveTranscription('Connected to Gemini 3.8 Live API. You can speak now...');
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'text') {
          setLiveTranscription(msg.text);
          setAvatarState((prev) => ({ ...prev, isSpeaking: true, visemeWeight: 0.85, mood: 'speaking' }));
        } else if (msg.type === 'audio') {
          setAvatarState((prev) => ({ ...prev, isSpeaking: true, visemeWeight: 0.9 }));
        } else if (msg.type === 'interrupted') {
          setAvatarState((prev) => ({ ...prev, isSpeaking: false, visemeWeight: 0, mood: 'curious' }));
        }
      };

      ws.onclose = () => {
        setIsLiveConnected(false);
        setAvatarState((prev) => ({ ...prev, isListening: false, isSpeaking: false, visemeWeight: 0 }));
      };
    } catch (e) {
      console.error(e);
    }
  };

  // 3. Music Generation (Lyria)
  const handleGenerateMusic = async () => {
    if (!musicPrompt.trim() || isGeneratingMusic) return;
    setIsGeneratingMusic(true);
    setAvatarState((prev) => ({ ...prev, mood: 'thinking' }));

    try {
      const res = await fetch('/api/generate-music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: musicPrompt, durationSeconds: 30 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate music');

      setMusicAudioUrl(data.audioUrl);
      setAvatarState((prev) => ({ ...prev, mood: 'cheerful' }));
    } catch (err) {
      console.error(err);
      setAvatarState((prev) => ({ ...prev, mood: 'neutral' }));
    } finally {
      setIsGeneratingMusic(false);
    }
  };

  const toggleMusicPlayback = () => {
    if (!musicAudioUrl) return;

    if (!audioElemRef.current) {
      const audio = new Audio(musicAudioUrl);
      audio.loop = true;
      audio.onplay = () => {
        setIsPlayingTrack(true);
        setAvatarState((prev) => ({ ...prev, isPlayingMusic: true, mood: 'dance' }));
      };
      audio.onpause = () => {
        setIsPlayingTrack(false);
        setAvatarState((prev) => ({ ...prev, isPlayingMusic: false }));
      };
      audioElemRef.current = audio;
    }

    if (isPlayingTrack) {
      audioElemRef.current.pause();
    } else {
      audioElemRef.current.play().catch(console.error);
    }
  };

  // 4. Image Studio (gemini-nano-banana-2.1)
  const handleGenerateImage = async () => {
    if (!imagePrompt.trim() || isGeneratingImage) return;
    setIsGeneratingImage(true);
    setAvatarState((prev) => ({ ...prev, mood: 'thinking' }));

    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt, aspectRatio })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate image');

      const newImg = {
        url: data.imageUrl,
        prompt: imagePrompt,
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setGeneratedImages((prev) => [newImg, ...prev]);

      setAvatarState((prev) => ({
        ...prev,
        projectedImage: data.imageUrl,
        mood: 'cheerful'
      }));
    } catch (err) {
      console.error(err);
      setAvatarState((prev) => ({ ...prev, mood: 'neutral' }));
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 5. Memory Management (SQLite)
  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;
    try {
      const saved = await memoryService.saveMemory(newMemoryCategory, newMemoryText.trim());
      setMemories((prev) => [saved, ...prev]);
      setNewMemoryText('');
    } catch (err) {
      console.error('Failed to save memory to SQLite:', err);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    await memoryService.deleteMemory(id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  // 6. History Exporting
  const exportHistoryAsMarkdown = () => {
    const md = memoryService.exportMarkdown(filteredHistory);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LocalCore_ChatHistory_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSqliteDatabase = async () => {
    try {
      const blob = await memoryService.exportDatabase();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `localcore_memory_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export SQLite database:', err);
    }
  };

  // Filtered History list
  const filteredHistory = conversationLogs.filter((item) => {
    if (historyFilterSession === 'current' && item.sessionId !== currentSessionId) {
      return false;
    }
    if (historySearchQuery.trim()) {
      return item.content.toLowerCase().includes(historySearchQuery.toLowerCase());
    }
    return true;
  });

  return (
    <>
      {/* Floating Toggle Button (visible when dock is collapsed) */}
      {isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-2xl bg-zinc-900 border border-zinc-700/80 text-xs font-semibold text-zinc-200 hover:text-white shadow-2xl flex items-center gap-2 hover:bg-zinc-800 transition-all cursor-pointer"
        >
          <ChevronUp className="w-4 h-4 text-pink-400" />
          <span>LocalCore Companion Dock</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
        </button>
      )}

      {/* Main Bottom Control Dock */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-30 transition-transform duration-300 ease-in-out pointer-events-none ${
          isCollapsed ? 'translate-y-full' : 'translate-y-0'
        }`}
      >
        <div className="max-w-4xl mx-auto px-4 pb-4 w-full pointer-events-auto">
          <div className="bg-zinc-950/95 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-none">
            {/* Dock Header & Collapse Handle */}
            <div className="px-4 py-2 bg-zinc-900/80 border-b border-zinc-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-pink-400 animate-pulse"></span>
                <span className="font-bold text-zinc-200">LocalCore Active Companion</span>
                <span className="text-zinc-600">•</span>
                <span className="text-pink-300 font-mono text-[11px]">
                  {activeAvatarName || 'Aria (Anime Female)'}
                </span>
                <span className="text-zinc-600 hidden sm:inline">•</span>
                <span className="text-emerald-400 font-mono text-[11px] hidden sm:flex items-center gap-1">
                  <Database className="w-3 h-3" /> SQLite Storage
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onToggleVoice}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-medium border flex items-center gap-1 transition-colors ${
                    isVoiceEnabled
                      ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                  }`}
                  title={isVoiceEnabled ? 'Voice Synthesis: Enabled (Click to Mute)' : 'Voice Synthesis: Muted (Click to Enable)'}
                >
                  {isVoiceEnabled ? <Volume2 className="w-3 h-3 text-emerald-400" /> : <VolumeX className="w-3 h-3 text-zinc-400" />}
                  <span>{isVoiceEnabled ? 'Voice ON' : 'Muted'}</span>
                </button>
                <button
                  onClick={onOpenBlueprint}
                  className="px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium border border-zinc-700 transition-colors flex items-center gap-1"
                >
                  <Shield className="w-3 h-3 text-cyan-400" />
                  <span>Architecture</span>
                </button>
                <button
                  onClick={() => setIsCollapsed(true)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                  title="Collapse Dock"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Navigation Tab Bar */}
            <div className="px-3 py-1.5 bg-zinc-950 border-b border-zinc-800/80 flex items-center space-x-1.5 overflow-x-auto text-xs">
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  activeTab === 'chat'
                    ? 'bg-zinc-800 text-pink-400 border border-pink-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat</span>
              </button>

              <button
                onClick={() => setActiveTab('avatar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  activeTab === 'avatar'
                    ? 'bg-zinc-800 text-rose-400 border border-rose-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Smile className="w-3.5 h-3.5" />
                <span>All 12 Moods</span>
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  activeTab === 'history'
                    ? 'bg-zinc-800 text-amber-400 border border-amber-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>History ({conversationLogs.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('voice')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  activeTab === 'voice'
                    ? 'bg-zinc-800 text-purple-400 border border-purple-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Live Voice</span>
              </button>

              <button
                onClick={() => setActiveTab('music')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  activeTab === 'music'
                    ? 'bg-zinc-800 text-pink-400 border border-pink-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>Lyria Music</span>
              </button>

              <button
                onClick={() => setActiveTab('image')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  activeTab === 'image'
                    ? 'bg-zinc-800 text-cyan-300 border border-cyan-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Nano Banana 3D</span>
              </button>

              <button
                onClick={() => setActiveTab('memory')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  activeTab === 'memory'
                    ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Memory Bank ({memories.length})</span>
              </button>
            </div>

            {/* Active Content Panel */}
            <div className="p-4 max-h-[250px] overflow-y-auto text-xs text-zinc-300">
              {/* 1. CHAT PANEL */}
              {activeTab === 'chat' && (
                <div className="space-y-3">
                  <div className="space-y-2 max-h-[110px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
                    {conversationLogs.slice(-4).map((m) => (
                      <div
                        key={m.id}
                        className={`p-2.5 rounded-xl text-xs ${
                          m.role === 'user'
                            ? 'bg-cyan-950/40 border border-cyan-800/40 text-cyan-200 ml-auto max-w-[85%]'
                            : 'bg-zinc-900 border border-zinc-800 text-zinc-300 mr-auto max-w-[85%]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-0.5">
                          <span className="font-bold flex items-center gap-1">
                            {m.role === 'user' ? 'You' : 'Core'}
                            {m.mood && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-pink-300 font-normal">
                                {m.mood}
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-[9px] text-zinc-500">
                            {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="leading-relaxed">{m.content}</p>
                      </div>
                    ))}
                    {isLoadingChat && (
                      <div className="text-[11px] text-pink-400 flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 animate-spin" />
                        <span>Core is generating reply & syncing to local SQLite...</span>
                      </div>
                    )}
                  </div>

                  {/* Quick Mood Selection Strip right in Chat */}
                  <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none border-t border-zinc-800/60 pt-2">
                    <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider shrink-0 flex items-center gap-1">
                      <Smile className="w-3 h-3 text-rose-400" /> Mood:
                    </span>
                    {MOOD_PALETTE.map((m) => {
                      const isSelected = avatarState.mood === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setAvatarState((prev) => ({ ...prev, mood: m.id }))}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-all border flex items-center gap-1 ${
                            isSelected
                              ? 'bg-pink-500 text-zinc-950 font-bold border-pink-400 shadow-sm'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800'
                          }`}
                          title={m.desc}
                        >
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <form onSubmit={handleFormSubmit} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Talk with Core (e.g. 'How are you?', 'Remember my preference', 'What can you do?')..."
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-pink-500/50"
                    />
                    <button
                      type="button"
                      onClick={onToggleVoice}
                      className={`p-2 rounded-xl border transition-colors flex items-center justify-center shrink-0 ${
                        isVoiceEnabled
                          ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-400 hover:bg-emerald-900/40'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                      title={isVoiceEnabled ? 'Voice Output: Enabled (Click to Mute)' : 'Voice Output: Muted (Click to Enable)'}
                    >
                      {isVoiceEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-zinc-500" />}
                    </button>
                    <button
                      type="submit"
                      disabled={isLoadingChat}
                      className="px-4 py-2 rounded-xl bg-pink-500 hover:bg-pink-400 text-zinc-950 font-bold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isLoadingChat ? 'Saving...' : 'Send'}</span>
                    </button>
                  </form>
                </div>
              )}

              {/* 2. ALL 12 MOODS PALETTE & VRM MODEL MANAGEMENT */}
              {activeTab === 'avatar' && (
                <div className="space-y-3">
                  {/* VRM Avatar Selector Banner */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900 border border-zinc-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-400 font-bold text-xs font-mono">
                        VRM
                      </div>
                      <div>
                        <span className="font-bold text-zinc-100 text-xs block">
                          3D Model: {activeAvatarName || (avatarState.customVrmLoaded ? avatarState.vrmModelName : 'Aria (Anime Humanoid Female)')}
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          {avatarState.customVrmLoaded ? 'Imported custom humanoid model with bones & blendshapes' : 'Default anime humanoid companion with blazer, skirt & expressive eyes'}
                        </span>
                      </div>
                    </div>
                    {onOpenCatalog && (
                      <button
                        onClick={onOpenCatalog}
                        className="px-3 py-1.5 rounded-lg bg-pink-500 hover:bg-pink-400 text-zinc-950 font-bold text-xs transition-colors flex items-center gap-1.5 shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Avatar Catalog & Import</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smile className="w-4 h-4 text-rose-400" />
                      <span className="text-xs font-semibold text-zinc-200">
                        All 12 Human Emotional Expressions & Postures
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-pink-400 font-bold">
                      Active: {avatarState.mood.toUpperCase()}
                    </span>
                  </div>

                  {/* All 12 Moods displayed in a clean grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-[175px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
                    {MOOD_PALETTE.map((m) => {
                      const Icon = m.icon;
                      const isSelected = avatarState.mood === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setAvatarState((prev) => ({ ...prev, mood: m.id }))}
                          className={`p-2.5 rounded-xl text-left border transition-all flex flex-col justify-between ${
                            isSelected
                              ? 'bg-pink-950/60 border-pink-500 shadow-md text-zinc-100 ring-1 ring-pink-500/40'
                              : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <Icon className={`w-4 h-4 ${m.color}`} />
                            {isSelected && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-pink-500 text-zinc-950 font-black">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <div>
                            <span className={`block font-bold text-xs ${isSelected ? 'text-pink-300' : 'text-zinc-200'}`}>
                              {m.label}
                            </span>
                            <span className="block text-[10px] text-zinc-400 leading-tight mt-0.5 line-clamp-1">
                              {m.desc}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. CONVERSATION HISTORY PANEL (SQLite-Powered Across Sessions) */}
              {activeTab === 'history' && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                    <div className="relative flex-1 w-full">
                      <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={historySearchQuery}
                        onChange={(e) => setHistorySearchQuery(e.target.value)}
                        placeholder="Search local SQLite conversation logs..."
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-auto flex-wrap">
                      {/* Session filter switch */}
                      <button
                        onClick={() =>
                          setHistoryFilterSession((prev) => (prev === 'all' ? 'current' : 'all'))
                        }
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border flex items-center gap-1 transition-colors ${
                          historyFilterSession === 'current'
                            ? 'bg-amber-950/40 border-amber-600 text-amber-300'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                        }`}
                        title="Toggle current session vs all sessions"
                      >
                        <Filter className="w-3 h-3 text-amber-400" />
                        <span>{historyFilterSession === 'current' ? 'This Session' : 'All Sessions'}</span>
                      </button>

                      <button
                        onClick={onNewSession}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium border border-zinc-700 flex items-center gap-1 transition-colors"
                        title="Start a new conversation session in SQLite"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-pink-400" />
                        <span>New Session</span>
                      </button>

                      <button
                        onClick={exportHistoryAsMarkdown}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium border border-zinc-700 flex items-center gap-1 transition-colors"
                        title="Export filtered logs as Markdown file"
                      >
                        <Download className="w-3.5 h-3.5 text-amber-400" />
                        <span>Export (.md)</span>
                      </button>

                      <button
                        onClick={exportSqliteDatabase}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium border border-zinc-700 flex items-center gap-1 transition-colors"
                        title="Export complete SQLite database backup (.json)"
                      >
                        <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Backup (.json)</span>
                      </button>

                      <button
                        onClick={() => {
                          if (confirm('Clear conversation logs from local SQLite?')) {
                            onClearMessages(historyFilterSession === 'current' ? currentSessionId : undefined);
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 text-[11px] font-medium border border-red-800/50 flex items-center gap-1 transition-colors"
                        title="Clear conversation logs from SQLite"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear</span>
                      </button>
                    </div>
                  </div>

                  {/* SQLite Status Strip */}
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 px-1 border-b border-zinc-800/60 pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span className="font-mono text-zinc-300">
                        localcore_memory.db ({sqliteStats?.dbSizeFormatted || 'active'})
                      </span>
                      <span className="text-zinc-600">•</span>
                      <span>Active Session: <strong className="text-amber-300 font-mono">{currentSessionId}</strong></span>
                    </div>
                    <span>Showing {filteredHistory.length} of {conversationLogs.length} logs</span>
                  </div>

                  <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
                    {filteredHistory.length === 0 ? (
                      <div className="text-center py-6 text-zinc-500">
                        No conversation logs found in local SQLite database.
                      </div>
                    ) : (
                      filteredHistory.map((item) => (
                        <div
                          key={item.id}
                          className={`p-2.5 rounded-xl border text-xs group transition-colors ${
                            item.role === 'user'
                              ? 'bg-zinc-900/60 border-zinc-800'
                              : 'bg-zinc-900 border-zinc-800/90'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                            <span className="font-bold flex items-center gap-1.5">
                              {item.role === 'user' ? '👤 User' : '✨ Core'}
                              {item.mood && (
                                <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-pink-300 font-mono text-[9px]">
                                  {item.mood}
                                </span>
                              )}
                              <span className="text-zinc-600 font-mono text-[9px]">
                                [{item.sessionId}]
                              </span>
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1 text-zinc-500">
                                <Clock className="w-3 h-3" /> {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <button
                                onClick={() => onDeleteMessage(item.id)}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-all"
                                title="Delete this turn from SQLite"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <p className="text-zinc-300 leading-relaxed text-xs">{item.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* 4. LIVE VOICE PANEL (gemini-3.8-live) */}
              {activeTab === 'voice' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={toggleLiveVoice}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                          isLiveConnected
                            ? 'bg-red-500 text-white animate-pulse'
                            : 'bg-purple-600 hover:bg-purple-500 text-white'
                        }`}
                      >
                        {isLiveConnected ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      </button>
                      <div>
                        <span className="font-bold text-zinc-200 block text-xs">
                          {isLiveConnected ? 'Live Audio Stream Active' : 'Start Live Voice Conversation'}
                        </span>
                        <p className="text-[11px] text-zinc-400">
                          {isLiveConnected
                            ? 'Speak freely. Core animates mouth visemes with conversational response.'
                            : 'Uses gemini-3.8-live (Live API) for real-time speech interaction.'}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-purple-400 font-mono border border-zinc-700">
                      Live API
                    </span>
                  </div>

                  {liveTranscription && (
                    <div className="p-2.5 rounded-lg bg-purple-950/20 border border-purple-800/40 text-purple-200 text-xs">
                      <strong className="text-purple-400">Live Transcript: </strong>
                      <span>{liveTranscription}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 5. LYRIA MUSIC PANEL */}
              {activeTab === 'music' && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={musicPrompt}
                      onChange={(e) => setMusicPrompt(e.target.value)}
                      placeholder="Describe music (e.g. 'Relaxing lo-fi study piano', 'Futuristic synthwave')..."
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-pink-500/50"
                    />
                    <button
                      onClick={handleGenerateMusic}
                      disabled={isGeneratingMusic}
                      className="px-4 py-2 rounded-xl bg-pink-500 hover:bg-pink-400 text-zinc-950 font-bold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isGeneratingMusic ? 'Generating...' : 'Compose with Lyria'}</span>
                    </button>
                  </div>

                  {musicAudioUrl && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={toggleMusicPlayback}
                          className="w-8 h-8 rounded-lg bg-pink-500 hover:bg-pink-400 text-zinc-950 flex items-center justify-center font-bold"
                        >
                          {isPlayingTrack ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <div>
                          <span className="font-semibold text-zinc-200 block text-xs">Generated Lyria Melody</span>
                          <span className="text-[11px] text-zinc-400">Core bobs rhythmically to the tempo</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-pink-400 bg-pink-950/60 px-2 py-0.5 rounded border border-pink-800">
                        lyria-3-clip-preview
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* 6. IMAGE STUDIO (gemini-nano-banana-2.1) */}
              {activeTab === 'image' && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      placeholder="Describe scene or portrait to create..."
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50"
                    />
                    <select
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-2 text-xs text-zinc-300 focus:outline-none"
                    >
                      <option value="1:1">1:1</option>
                      <option value="16:9">16:9</option>
                      <option value="9:16">9:16</option>
                    </select>
                    <button
                      onClick={handleGenerateImage}
                      disabled={isGeneratingImage}
                      className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isGeneratingImage ? 'Generating...' : 'Create Image'}</span>
                    </button>
                  </div>

                  {generatedImages.length > 0 && (
                    <div className="flex items-center gap-3 overflow-x-auto py-1">
                      {generatedImages.map((img, idx) => (
                        <div
                          key={idx}
                          className="relative group shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900 cursor-pointer"
                          onClick={() =>
                            setAvatarState((prev) => ({
                              ...prev,
                              projectedImage: img.url,
                              mood: 'happy'
                            }))
                          }
                          title="Click to project as 3D Hologram in Avatar Scene"
                        >
                          <img src={img.url} alt={img.prompt} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-zinc-950/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-[10px] text-cyan-400 font-bold">
                            Project 3D
                          </div>
                        </div>
                      ))}
                      {avatarState.projectedImage && (
                        <button
                          onClick={() => setAvatarState((prev) => ({ ...prev, projectedImage: null }))}
                          className="text-[11px] px-2.5 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700 whitespace-nowrap"
                        >
                          Clear 3D Hologram
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 7. MEMORY BANK (Persistent SQLite User Facts & Recall) */}
              {activeTab === 'memory' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                      <Database className="w-3.5 h-3.5" />
                      <span>Local SQLite Memory Store (localcore_memory.db)</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {memories.length} facts remembered on-device
                    </span>
                  </div>

                  <form onSubmit={handleAddMemory} className="flex gap-2">
                    <select
                      value={newMemoryCategory}
                      onChange={(e) => setNewMemoryCategory(e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-2 text-xs text-zinc-300 focus:outline-none"
                    >
                      <option value="preference">Preference</option>
                      <option value="aesthetic">Aesthetic</option>
                      <option value="storage">Storage</option>
                      <option value="work">Work/Code</option>
                    </select>
                    <input
                      type="text"
                      value={newMemoryText}
                      onChange={(e) => setNewMemoryText(e.target.value)}
                      placeholder="Save user fact or preference to SQLite..."
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition-colors shrink-0"
                    >
                      Remember Fact
                    </button>
                  </form>

                  <div className="space-y-1.5 max-h-[110px] overflow-y-auto pr-1">
                    {memories.length === 0 ? (
                      <div className="text-center py-4 text-zinc-500 text-xs">
                        No persistent memory facts stored yet. Add one above!
                      </div>
                    ) : (
                      memories.map((mem) => (
                        <div
                          key={mem.id}
                          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-emerald-400 uppercase font-mono">
                              {mem.category}
                            </span>
                            <span className="text-zinc-200">{mem.content}</span>
                          </div>
                          <button
                            onClick={() => handleDeleteMemory(mem.id)}
                            className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                            title="Delete memory record from SQLite"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

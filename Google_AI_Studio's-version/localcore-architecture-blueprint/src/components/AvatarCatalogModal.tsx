import React, { useState, useRef } from 'react';
import {
  StoredAvatar,
  saveCustomVrmAvatar,
  deleteCustomVrmAvatar
} from '../utils/vrmCatalogDb';
import {
  Upload,
  Check,
  Trash2,
  X,
  Sparkles,
  Link as LinkIcon,
  HardDrive,
  User,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

interface AvatarCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  avatars: StoredAvatar[];
  selectedAvatarId: string;
  onSelectAvatar: (avatar: StoredAvatar) => void;
  onAvatarListUpdated: () => void;
}

export const AvatarCatalogModal: React.FC<AvatarCatalogModalProps> = ({
  isOpen,
  onClose,
  avatars,
  selectedAvatarId,
  onSelectAvatar,
  onAvatarListUpdated,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.match(/\.(vrm|glb)$/i)) {
      alert('Please upload a valid .vrm or .glb 3D avatar file.');
      return;
    }

    setIsUploading(true);
    try {
      const newAvatar = await saveCustomVrmAvatar(file.name, file);
      onAvatarListUpdated();
      onSelectAvatar(newAvatar);
    } catch (err: any) {
      console.error(err);
      alert('Failed to save avatar to catalog: ' + (err?.message || 'Storage error'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || isLoadingUrl) return;

    setIsLoadingUrl(true);
    try {
      const response = await fetch(urlInput.trim());
      if (!response.ok) throw new Error('Could not fetch model from URL');
      const blob = await response.blob();
      const fileName = urlInput.split('/').pop() || 'Remote_Avatar.vrm';
      const newAvatar = await saveCustomVrmAvatar(fileName, blob);
      setUrlInput('');
      onAvatarListUpdated();
      onSelectAvatar(newAvatar);
    } catch (err: any) {
      console.error(err);
      alert('Failed to import VRM from URL: ' + (err?.message || 'Network error'));
    } finally {
      setIsLoadingUrl(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Delete this VRM avatar from your local catalog?')) {
      await deleteCustomVrmAvatar(id);
      onAvatarListUpdated();
      if (selectedAvatarId === id && avatars.length > 0) {
        onSelectAvatar(avatars[0]);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                VRM Avatar Catalog & Manager
                <span className="text-xs px-2 py-0.5 rounded-full bg-pink-950 text-pink-300 border border-pink-800 font-mono">
                  {avatars.length} Available
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Switch between the default anime companion ("Aria") or import your own .VRM 3D models.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* 1. Drag & Drop Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFileUpload(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
              dragOver
                ? 'border-pink-400 bg-pink-950/20'
                : 'border-zinc-700/80 hover:border-pink-500/60 bg-zinc-950/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".vrm,.glb"
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-pink-400">
                <Upload className="w-5 h-5" />
              </div>
              <span className="font-bold text-zinc-200 text-xs">
                {isUploading ? 'Importing VRM into local catalog...' : 'Click to Upload or Drag & Drop .VRM File'}
              </span>
              <p className="text-[11px] text-zinc-500 max-w-sm">
                Supports standard VRM 0.x and 1.0 avatars (VRoid Studio, Booth, VRM Hub). Saved locally in browser storage.
              </p>
            </div>
          </div>

          {/* 2. URL Import Option */}
          <form onSubmit={handleUrlImport} className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Or paste direct .vrm model URL (e.g. https://.../avatar.vrm)..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-pink-500/50"
              />
            </div>
            <button
              type="submit"
              disabled={isLoadingUrl}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs border border-zinc-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-pink-400" />
              <span>{isLoadingUrl ? 'Fetching...' : 'Fetch URL'}</span>
            </button>
          </form>

          {/* 3. Catalog Grid */}
          <div className="space-y-3">
            <span className="font-semibold text-zinc-300 uppercase tracking-wider text-[11px] block">
              Available Companions & Imported Avatars:
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {avatars.map((av) => {
                const isSelected = av.id === selectedAvatarId;
                return (
                  <div
                    key={av.id}
                    onClick={() => onSelectAvatar(av)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-pink-950/30 border-pink-500 shadow-lg shadow-pink-950/30 ring-1 ring-pink-500/50'
                        : 'bg-zinc-950/60 border-zinc-800/90 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${av.previewColor} flex items-center justify-center text-white font-bold text-xs shadow-sm`}
                          >
                            {av.name.charAt(0)}
                          </div>
                          <div>
                            <span className={`font-bold text-xs block ${isSelected ? 'text-pink-300' : 'text-zinc-200'}`}>
                              {av.name}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">{av.tagline}</span>
                          </div>
                        </div>

                        {isSelected && (
                          <span className="px-2 py-0.5 rounded bg-pink-500 text-zinc-950 font-bold font-mono text-[10px] flex items-center gap-1">
                            <Check className="w-3 h-3" /> ACTIVE
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-zinc-400 mb-3 leading-snug">
                        {av.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-500">
                      <span>Size: {av.sizeFormatted}</span>
                      <div className="flex items-center gap-2">
                        <span>{av.importedAt}</span>
                        {av.type === 'custom' && (
                          <button
                            onClick={(e) => handleDelete(e, av.id)}
                            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-colors"
                            title="Delete this imported avatar from local catalog"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Local Storage: Avatars remain on your device</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-pink-500 hover:bg-pink-400 text-zinc-950 font-bold text-xs transition-colors"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};

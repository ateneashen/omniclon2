import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { Film, FolderOpen, Clock, Trash2 } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { logError } from '../../lib/log';
import { MediaClip, WaveformData, AudioTrack } from '../../types';

const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'mov', 'avi', 'webm'];
const RECENT_CLIPS_KEY = 'omniclon2-recent-clips';
const MAX_RECENT = 10;

interface RecentClip {
  path: string;
  name: string;
  duration: number;
  timestamp: number;
}

function loadRecentClips(): RecentClip[] {
  try {
    const raw = localStorage.getItem(RECENT_CLIPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecentClips(clips: RecentClip[]) {
  try {
    localStorage.setItem(RECENT_CLIPS_KEY, JSON.stringify(clips));
  } catch {
    // ignore
  }
}

export default function MediaPanel() {
  const clips = useEditorStore((s) => s.clips);
  const activeClipId = useEditorStore((s) => s.activeClipId);
  const addClip = useEditorStore((s) => s.addClip);
  const removeClip = useEditorStore((s) => s.removeClip);
  const setWaveform = useEditorStore((s) => s.setWaveform);
  const setActiveClip = useEditorStore((s) => s.setActiveClip);
  const setAudioTracks = useEditorStore((s) => s.setAudioTracks);
  const setSelectedAudioTrack = useEditorStore((s) => s.setSelectedAudioTrack);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [recentClips, setRecentClips] = useState<RecentClip[]>(loadRecentClips);

  const updateRecentClips = useCallback((clip: MediaClip) => {
    setRecentClips((prev) => {
      const filtered = prev.filter((r) => r.path !== clip.path);
      const next = [
        { path: clip.path, name: clip.name, duration: clip.duration, timestamp: Date.now() },
        ...filtered,
      ].slice(0, MAX_RECENT);
      saveRecentClips(next);
      return next;
    });
  }, []);

  const importClip = useCallback(async (path: string) => {
    setIsImporting(true);
    setLastError(null);
    try {
      const clip = await invoke<MediaClip>('import_media', { path });
      addClip(clip);
      updateRecentClips(clip);

      // Detect audio tracks and default to the first one
      let firstAudioIndex: number | null = null;
      try {
        const audioRes = await invoke<{ success: boolean; tracks?: AudioTrack[] }>('audio_tracks', { path: clip.path });
        if (audioRes.success && audioRes.tracks && audioRes.tracks.length > 0) {
          setAudioTracks(audioRes.tracks);
          firstAudioIndex = audioRes.tracks[0].index;
          setSelectedAudioTrack(firstAudioIndex);
        } else {
          setAudioTracks([]);
          setSelectedAudioTrack(null);
        }
      } catch (audioErr) {
        logError('MediaPanel', 'audio_tracks detection failed', audioErr, { path: clip.path });
        setAudioTracks([]);
        setSelectedAudioTrack(null);
      }

      const wf = await invoke<WaveformData>('extract_waveform', {
        path: clip.path,
        duration: clip.duration,
        audioTrackIndex: firstAudioIndex ?? undefined,
      });
      setWaveform(wf);
    } catch (err) {
      const message = 'Failed to load video: ' + String(err);
      logError('MediaPanel', 'importClip failed', err, { path });
      setLastError(message);
    } finally {
      setIsImporting(false);
    }
  }, [addClip, setWaveform, updateRecentClips]);

  const handleLoadVideo = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Video Files', extensions: VIDEO_EXTENSIONS }],
      });
      if (!selected) return;
      await importClip(selected as string);
    } catch (err) {
      logError('MediaPanel', 'Load video dialog failed', err);
      setLastError('Dialog failed: ' + String(err));
    }
  }, [importClip]);

  // Real Tauri file-drop support
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen('tauri://drag-drop', (event) => {
      setIsDragOver(false);
      const payload = event.payload as { paths?: string[] } | undefined;
      const paths = payload?.paths;
      if (paths && paths.length > 0) {
        const first = paths[0];
        const ext = first.split('.').pop()?.toLowerCase();
        if (ext && VIDEO_EXTENSIONS.includes(ext)) {
          importClip(first);
        } else {
          setLastError('Formato no soportado. Usa: ' + VIDEO_EXTENSIONS.map((e) => `.${e}`).join(', '));
        }
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [importClip]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 text-sm">
      <div className="nle-panel-header mb-3 rounded-t-md -mx-0">
        <span className="flex items-center gap-1.5">
          <Film size={12} className="text-[#5b8def]" />
          Proyecto
        </span>
        <button
          onClick={handleLoadVideo}
          disabled={isImporting}
          className="nle-btn nle-btn--primary"
        >
          <FolderOpen size={12} />
          {isImporting ? 'Cargando…' : 'Importar'}
        </button>
      </div>

      <div
        className={`
          flex flex-col items-center justify-center gap-2.5 text-center
          border border-dashed rounded-md p-5 mb-3 transition cursor-pointer
          ${isDragOver
            ? 'border-[#5b8def] bg-[#5b8def]/10'
            : 'border-white/[0.12] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20'}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleLoadVideo}
      >
        <div className="w-10 h-10 rounded-md bg-[#5b8def]/10 border border-[#5b8def]/20 flex items-center justify-center">
          <Film size={18} className="text-[#5b8def]" />
        </div>
        <div className="text-white/60 text-xs">Suelta un video aquí o haz clic</div>
        <div className="text-white/25 text-[9px] font-mono">{VIDEO_EXTENSIONS.map((ext) => `.${ext}`).join('  ')}</div>
      </div>

      {lastError && (
        <div className="mb-3 text-[10px] text-red-300 bg-red-950/30 border border-red-500/30 rounded p-2">
          {lastError}
        </div>
      )}

      {recentClips.length > 0 && (
        <div className="mb-3">
          <div className="text-[9px] text-white/35 uppercase tracking-wider mb-1.5 font-semibold">Recientes</div>
          <ul className="space-y-1 max-h-28 overflow-auto">
            {recentClips.map((clip) => (
              <li
                key={clip.path}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-white/[0.05] cursor-pointer transition group border border-transparent hover:border-white/[0.06]"
                onClick={() => importClip(clip.path)}
                title={clip.path}
              >
                <Film size={12} className="text-[#5b8def]/60 shrink-0" />
                <span className="truncate flex-1 text-white/70">{clip.name}</span>
                <span className="nle-timecode text-white/35 shrink-0 text-[10px] flex items-center gap-0.5">
                  <Clock size={9} />
                  {clip.duration.toFixed(1)}s
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRecentClips((prev) => {
                      const next = prev.filter((r) => r.path !== clip.path);
                      saveRecentClips(next);
                      return next;
                    });
                  }}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition"
                  aria-label={`Remove ${clip.name} from recent`}
                  title="Remove from recent"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 overflow-auto min-h-0">
        <div className="text-[9px] text-white/35 uppercase tracking-wider mb-1.5 font-semibold">Clips en timeline</div>
        {clips.length === 0 ? (
          <div className="text-white/25 text-xs text-center py-6 nle-panel rounded-md">Sin clips cargados</div>
        ) : (
          <ul className="space-y-1">
            {clips.map((clip) => (
              <li
                key={clip.id}
                className={`
                  group flex items-center gap-2 px-2 py-2 rounded-md text-xs cursor-pointer transition border
                  ${activeClipId === clip.id
                    ? 'bg-[#5b8def]/12 border-[#5b8def]/30 text-white'
                    : 'border-transparent hover:bg-white/[0.04] hover:border-white/[0.06] text-white/70'}
                `}
                onClick={() => setActiveClip(clip.id)}
              >
                <span className="w-6 h-6 rounded-sm bg-[#5b8def]/15 text-[#5b8def] text-[8px] font-bold flex items-center justify-center shrink-0">
                  V1
                </span>
                <span className="truncate flex-1">{clip.name}</span>
                <span className="nle-timecode text-white/35 shrink-0">{clip.duration.toFixed(1)}s</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeClip(clip.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition"
                  aria-label={`Remove ${clip.name}`}
                  title="Remove clip"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

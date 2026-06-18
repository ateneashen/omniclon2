import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { useEditorStore } from '../../stores/editorStore';
import { MediaClip, WaveformData } from '../../types';

const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'mov', 'avi', 'webm'];

export default function MediaPanel() {
  const clips = useEditorStore((s) => s.clips);
  const activeClipId = useEditorStore((s) => s.activeClipId);
  const addClip = useEditorStore((s) => s.addClip);
  const removeClip = useEditorStore((s) => s.removeClip);
  const setWaveform = useEditorStore((s) => s.setWaveform);
  const setActiveClip = useEditorStore((s) => s.setActiveClip);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const importClip = useCallback(async (path: string) => {
    setIsImporting(true);
    setLastError(null);
    try {
      const clip = await invoke<MediaClip>('import_media', { path });
      addClip(clip);
      const wf = await invoke<WaveformData>('extract_waveform', { path: clip.path, duration: clip.duration });
      setWaveform(wf);
    } catch (err) {
      const message = 'Failed to load video: ' + String(err);
      console.error(message);
      setLastError(message);
    } finally {
      setIsImporting(false);
    }
  }, [addClip, setWaveform]);

  const handleLoadVideo = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Video Files', extensions: VIDEO_EXTENSIONS }],
      });
      if (!selected) return;
      await importClip(selected as string);
    } catch (err) {
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
    <div className="flex flex-col h-full text-sm">
      <div className="font-medium mb-3 flex items-center justify-between">
        Media
        <button
          onClick={handleLoadVideo}
          disabled={isImporting}
          className="text-xs px-2 py-0.5 bg-[#00b4d8] text-black rounded hover:bg-[#0099b8] disabled:opacity-50 transition"
        >
          {isImporting ? 'Loading video & waveform…' : 'Load Video…'}
        </button>
      </div>

      <div
        className={`
          flex flex-col items-center justify-center gap-2 text-center
          border border-dashed rounded p-4 mb-3 transition cursor-pointer
          ${isDragOver ? 'border-[#00b4d8] bg-[#00b4d8]/10' : 'border-white/20 hover:bg-white/5'}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleLoadVideo}
      >
        <div className="text-white/60 text-xs">Drop video here or click to browse</div>
        <div className="text-white/30 text-[10px]">{VIDEO_EXTENSIONS.map((ext) => `.${ext}`).join(', ')}</div>
      </div>

      {lastError && (
        <div className="mb-3 text-[10px] text-red-300 bg-red-950/30 border border-red-500/30 rounded p-2">
          {lastError}
        </div>
      )}

      <div className="flex-1 overflow-auto min-h-0">
        {clips.length === 0 ? (
          <div className="text-white/30 text-xs text-center py-4">No clips loaded</div>
        ) : (
          <ul className="space-y-1">
            {clips.map((clip) => (
              <li
                key={clip.id}
                className={`
                  group flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer transition
                  ${activeClipId === clip.id ? 'bg-[#00b4d8]/20 text-white' : 'hover:bg-white/5 text-white/70'}
                `}
              >
                <span
                  className="truncate pr-2 flex-1"
                  onClick={() => setActiveClip(clip.id)}
                >
                  {clip.name}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-white/40">{clip.duration.toFixed(1)}s</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeClip(clip.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 px-1 transition"
                    aria-label={`Remove ${clip.name}`}
                    title="Remove clip"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

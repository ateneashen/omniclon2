import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useEditorStore } from '../../stores/editorStore';
import { MediaClip, WaveformData } from '../../types';

const TEST_CLIP_PATH = 'C:\\AI\\OmniClon2\\tests\\fixtures\\sample.mp4';
const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'mov', 'avi', 'webm'];

export default function MediaPanel() {
  const { clips, activeClipId, addClip, setWaveform, setActiveClip } = useEditorStore();
  const [isImporting, setIsImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const importClip = useCallback(async (path: string) => {
    setIsImporting(true);
    setLastError(null);
    try {
      const clip = await invoke<MediaClip>('import_media', { path });
      addClip(clip);
      const wf = await invoke<WaveformData>('extract_waveform', { path: clip.path });
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

  const handleLoadTest = useCallback(async () => {
    await importClip(TEST_CLIP_PATH);
  }, [importClip]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    // Tauri webview drag-drop does not expose full paths via dataTransfer.
    // Recommend the dialog for reliable loading.
    setLastError('Drag & drop from Explorer may not provide the full path. Please use "Load Video..." for reliable loading.');
  }, []);

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
        <div className="flex gap-1">
          <button
            onClick={handleLoadVideo}
            disabled={isImporting}
            className="text-xs px-2 py-0.5 bg-[#00b4d8] text-black rounded hover:bg-[#0099b8] disabled:opacity-50 transition"
          >
            {isImporting ? 'Loading…' : 'Load Video…'}
          </button>
          <button
            onClick={handleLoadTest}
            disabled={isImporting}
            className="text-xs px-2 py-0.5 bg-white/10 rounded hover:bg-white/15 disabled:opacity-50 transition"
          >
            Test
          </button>
        </div>
      </div>

      <div
        className={`
          flex flex-col items-center justify-center gap-2 text-center
          border border-dashed rounded p-4 mb-3 transition cursor-pointer
          ${isDragOver ? 'border-[#00b4d8] bg-[#00b4d8]/10' : 'border-white/20 hover:bg-white/5'}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
                onClick={() => setActiveClip(clip.id)}
                className={`
                  flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer transition
                  ${activeClipId === clip.id ? 'bg-[#00b4d8]/20 text-white' : 'hover:bg-white/5 text-white/70'}
                `}
              >
                <span className="truncate pr-2">{clip.name}</span>
                <span className="text-white/40 shrink-0">{clip.duration.toFixed(1)}s</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

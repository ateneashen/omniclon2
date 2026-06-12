import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import { useEditorStore } from '../../stores/editorStore';
import { VoiceReference } from '../../types';

interface VoiceStatus {
  ready?: boolean;
  primary_cloning_model?: string | null;
  k2fsa_loaded?: boolean;
  k2fsa_files_verified?: boolean;
  error?: string;
}

interface GenerateResult {
  success: boolean;
  audio_base64?: string;
  output_path?: string;
  model_used?: string;
  error_message?: string;
}

const STATUS_POLL_MS = 5000;

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function VoicePanel() {
  const {
    clips,
    activeClipId,
    region,
    currentVoiceReference,
    isGenerating,
    lastGeneratedAudio,
    lastGeneratedInfo,
    setCurrentVoiceReference,
    setIsGenerating,
    setLastGenerated,
  } = useEditorStore();

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const s = await invoke<VoiceStatus>('get_voice_status');
        setVoiceStatus(s);
      } catch {
        setVoiceStatus({ ready: false, error: 'unavailable' });
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  const playReference = useCallback(async () => {
    if (!currentVoiceReference) return;
    try {
      const bytes = await readFile(currentVoiceReference.audioPath);
      const b64 = base64FromBytes(bytes);
      const audio = new Audio(`data:audio/wav;base64,${b64}`);
      await audio.play();
    } catch (err) {
      setError('Could not play reference audio: ' + String(err));
    }
  }, [currentVoiceReference]);

  const handleExportAB = useCallback(async () => {
    setError(null);
    if (!activeClipId) {
      setError('No clip selected');
      return;
    }
    const clip = clips.find((c) => c.id === activeClipId);
    if (!clip) {
      setError('Selected clip not found');
      return;
    }

    const duration = region.end - region.start;
    if (duration < 3) {
      setError('La referencia A-B es muy corta. Recomendamos 4-10 segundos de habla clara.');
      return;
    }
    if (duration > 12) {
      setError('La referencia es muy larga. Usa 4-10 segundos de habla continua para mejor calidad.');
      return;
    }

    try {
      const outPath = await invoke<string>('extract_segment', {
        path: clip.path,
        startTime: region.start,
        endTime: region.end,
      });

      const voiceRef: VoiceReference = {
        audioPath: outPath,
        duration,
        sourceClipId: clip.id,
        sourceClipName: clip.name,
        extractedAt: Date.now(),
      };

      setCurrentVoiceReference(voiceRef);
    } catch (err) {
      setError('Export failed: ' + String(err));
    }
  }, [activeClipId, clips, region, setCurrentVoiceReference]);

  const handleGenerate = useCallback(async () => {
    setError(null);
    if (!currentVoiceReference) {
      setError('Primero exporta una referencia A-B desde el timeline.');
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Escribe el texto a generar.');
      return;
    }

    setIsGenerating(true);
    try {
      const result = await invoke<GenerateResult>('generate', {
        reference_audio_path: currentVoiceReference.audioPath,
        text: trimmed,
      });

      if (result.success && result.audio_base64) {
        setLastGenerated(result.audio_base64, result.model_used || 'Optimized for this PC');
        const audio = new Audio(`data:audio/wav;base64,${result.audio_base64}`);
        await audio.play();
      } else if (result.success && result.output_path) {
        setLastGenerated(null, result.model_used || '');
        const audioUrl = `http://127.0.0.1:17493/${result.output_path.replace(/\\/g, '/')}`;
        const audio = new Audio(audioUrl);
        await audio.play();
      } else {
        setError('Generación fallida: ' + (result.error_message || 'Error desconocido'));
      }
    } catch (err) {
      setError('Error: ' + String(err));
    } finally {
      setIsGenerating(false);
    }
  }, [currentVoiceReference, text, setIsGenerating, setLastGenerated]);

  const playGenerated = useCallback(() => {
    const audio = new Audio(`data:audio/wav;base64,${useEditorStore.getState().lastGeneratedAudio}`);
    audio.play().catch((err) => setError('Playback failed: ' + String(err)));
  }, []);

  const downloadGenerated = useCallback(() => {
    const a = document.createElement('a');
    a.href = `data:audio/wav;base64,${useEditorStore.getState().lastGeneratedAudio}`;
    a.download = 'generated_voice.wav';
    a.click();
  }, []);

  const k2Badge = voiceStatus?.k2fsa_loaded
    ? { text: 'k2-fsa active', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' }
    : voiceStatus?.k2fsa_files_verified
      ? { text: 'k2-fsa ready', color: 'bg-emerald-500/15 text-emerald-300/80 border-emerald-500/25' }
      : { text: 'k2-fsa pending', color: 'bg-white/10 text-white/50 border-white/10' };

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="font-medium mb-2 flex items-center justify-between">
        Voice & Cloning
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${k2Badge.color}`}>{k2Badge.text}</span>
      </div>

      <div className="flex-1 flex flex-col text-xs min-h-0 overflow-auto">
        <div className="text-white/60 mb-1">
          Voice Reference (A/B){' '}
          <span className="text-[9px] text-white/40">(4-10s recommended)</span>
        </div>

        <div className="mb-3 p-2 bg-[#1a1a1a] border border-white/10 rounded">
          {currentVoiceReference ? (
            <div>
              <div className="text-emerald-400 font-medium">
                ✓ Reference ready — {currentVoiceReference.duration.toFixed(1)}s
              </div>
              {currentVoiceReference.sourceClipName && (
                <div className="text-white/50 text-[10px] truncate">
                  From: {currentVoiceReference.sourceClipName}
                </div>
              )}
              <div className="flex gap-2 mt-1.5">
                <button
                  onClick={playReference}
                  className="text-[10px] px-2 py-0.5 bg-white/10 rounded hover:bg-white/20 transition"
                >
                  ▶ Play ref
                </button>
                <button
                  onClick={() => setCurrentVoiceReference(null)}
                  className="text-[10px] text-red-400 hover:text-red-300 px-2 py-0.5 transition"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <div className="text-orange-400">
              No reference yet.
              <br />
              Use A/B in the timeline and export.
            </div>
          )}
        </div>

        <button
          onClick={handleExportAB}
          disabled={!activeClipId}
          className="w-full mb-3 px-3 py-1.5 bg-[#00b4d8] text-black text-xs font-medium rounded hover:bg-[#0099b8] disabled:opacity-50 transition"
        >
          Export A-B Segment as Voice Reference
        </button>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="text-white/60 mb-1">Text to Synthesize</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe aquí el texto que quieres que diga la voz clonada..."
            className="flex-1 min-h-[80px] bg-black/40 border border-white/20 rounded px-2 py-1 text-white text-xs mb-2 resize-y focus:outline-none focus:border-[#00b4d8]/50"
          />

          <button
            onClick={handleGenerate}
            disabled={!currentVoiceReference || isGenerating}
            className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded transition"
          >
            {isGenerating ? 'Generating…' : 'Generate Cloned Voice'}
          </button>

          {error && (
            <div className="mt-2 text-[10px] text-red-300 bg-red-950/30 border border-red-500/30 rounded p-2">
              {error}
            </div>
          )}

          <div className="text-[9px] text-emerald-400/70 mt-1.5 text-center">
            Uses your local k2-fsa_OmniVoice assets.
          </div>

          {lastGeneratedAudio && (
            <div className="mt-3 p-2 bg-emerald-950/30 border border-emerald-600/50 rounded text-[10px]">
              <div className="truncate">Last generated: {lastGeneratedInfo}</div>
              <div className="flex gap-1 mt-1">
                <button
                  onClick={playGenerated}
                  className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] rounded hover:bg-emerald-700 transition"
                >
                  ▶ Play
                </button>
                <button
                  onClick={downloadGenerated}
                  className="px-2 py-0.5 bg-white/10 text-white text-[10px] rounded hover:bg-white/20 transition"
                >
                  ⬇ Download
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-[10px] text-white/30 mt-2 pt-2 border-t border-white/10">
        A/B on video → export reference (4-10s clear speech) → Generate Cloned Voice
      </div>
    </div>
  );
}

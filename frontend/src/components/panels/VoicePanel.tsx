import { useState, useCallback, useEffect } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { useEditorStore } from '../../stores/editorStore';
import { useVoiceStore, startVoiceStatusPolling } from '../../stores/voiceStore';
import { VoiceReference, GenerationOptions, GenerateOptionsResponse } from '../../types';

interface GenerateResult {
  success: boolean;
  audio_base64?: string;
  output_path?: string;
  model_used?: string;
  duration_seconds?: number;
  error_message?: string;
}

const OPTIONS_STORAGE_KEY = 'omniclon2-generation-options';

const DEFAULT_OPTIONS: GenerationOptions = {
  speed: 1.0,
  num_step: 24,
  guidance_scale: 2.0,
  denoise: true,
  postprocess_output: true,
  language: 'auto',
  instruct: '',
  duration: '',
  t_shift: '',
};

function loadStoredOptions(): GenerationOptions {
  try {
    const raw = localStorage.getItem(OPTIONS_STORAGE_KEY);
    if (!raw) return DEFAULT_OPTIONS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_OPTIONS, ...parsed };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

function storeOptions(options: GenerationOptions) {
  try {
    localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options));
  } catch {
    // ignore
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export default function VoicePanel() {
  const clips = useEditorStore((s) => s.clips);
  const activeClipId = useEditorStore((s) => s.activeClipId);
  const region = useEditorStore((s) => s.region);
  const currentVoiceReference = useEditorStore((s) => s.currentVoiceReference);
  const isGenerating = useEditorStore((s) => s.isGenerating);
  const lastGeneratedAudio = useEditorStore((s) => s.lastGeneratedAudio);
  const lastGeneratedPath = useEditorStore((s) => s.lastGeneratedPath);
  const lastGeneratedInfo = useEditorStore((s) => s.lastGeneratedInfo);
  const setCurrentVoiceReference = useEditorStore((s) => s.setCurrentVoiceReference);
  const setIsGenerating = useEditorStore((s) => s.setIsGenerating);
  const setLastGenerated = useEditorStore((s) => s.setLastGenerated);

  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<GenerationOptions>(loadStoredOptions);
  const [optionMeta, setOptionMeta] = useState<GenerateOptionsResponse['options'] | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { status: voiceStatus } = useVoiceStore();

  useEffect(() => {
    startVoiceStatusPolling();
  }, []);

  useEffect(() => {
    invoke<GenerateOptionsResponse>('get_generate_options')
      .then((res) => setOptionMeta(res.options))
      .catch((err) => console.error('[VoicePanel] get_generate_options failed', err));
  }, []);

  const updateOption = <K extends keyof GenerationOptions>(key: K, value: GenerationOptions[K]) => {
    const next = { ...options, [key]: value };
    setOptions(next);
    storeOptions(next);
  };

  const playReference = useCallback(async () => {
    if (!currentVoiceReference) return;
    try {
      const bytes = await readFile(currentVoiceReference.audioPath);
      const b64 = btoa(String.fromCharCode(...bytes));
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
        start_time: region.start,
        end_time: region.end,
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

  const buildGeneratePayload = useCallback((): Record<string, any> => {
    const payload: Record<string, any> = {
      reference_audio_path: currentVoiceReference!.audioPath,
      text: text.trim(),
      speed: options.speed,
      num_step: options.num_step,
      guidance_scale: options.guidance_scale,
      denoise: options.denoise,
      postprocess_output: options.postprocess_output,
    };
    if (options.language && options.language !== 'auto') {
      payload.language = options.language;
    }
    if (options.instruct.trim()) {
      payload.instruct = options.instruct.trim();
    }
    if (options.duration !== '' && Number(options.duration) > 0) {
      payload.duration = Number(options.duration);
    }
    if (options.t_shift !== '' && Number(options.t_shift) >= 0) {
      payload.t_shift = Number(options.t_shift);
    }
    return payload;
  }, [currentVoiceReference, text, options]);

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
      const payload = buildGeneratePayload();
      const result = await invoke<GenerateResult>('generate', payload);

      if (result.success && result.audio_base64) {
        const info = `${result.model_used || 'Optimized for this PC'} • ${(result.duration_seconds || 0).toFixed(2)}s`;
        setLastGenerated(result.audio_base64, result.output_path || null, info);
        const audio = new Audio(`data:audio/wav;base64,${result.audio_base64}`);
        await audio.play();
      } else if (result.success && result.output_path) {
        const info = `${result.model_used || ''} • ${(result.duration_seconds || 0).toFixed(2)}s`;
        setLastGenerated(null, result.output_path, info);
        const audio = new Audio(convertFileSrc(result.output_path));
        await audio.play();
      } else {
        setError('Generación fallida: ' + (result.error_message || 'Error desconocido'));
      }
    } catch (err) {
      setError('Error: ' + String(err));
    } finally {
      setIsGenerating(false);
    }
  }, [currentVoiceReference, text, options, setIsGenerating, setLastGenerated, buildGeneratePayload]);

  const playGenerated = useCallback(() => {
    const state = useEditorStore.getState();
    if (state.lastGeneratedAudio) {
      const audio = new Audio(`data:audio/wav;base64,${state.lastGeneratedAudio}`);
      audio.play().catch((err) => setError('Playback failed: ' + String(err)));
    } else if (state.lastGeneratedPath) {
      const audio = new Audio(convertFileSrc(state.lastGeneratedPath));
      audio.play().catch((err) => setError('Playback failed: ' + String(err)));
    }
  }, []);

  const downloadGenerated = useCallback(() => {
    const state = useEditorStore.getState();
    if (state.lastGeneratedAudio) {
      const a = document.createElement('a');
      a.href = `data:audio/wav;base64,${state.lastGeneratedAudio}`;
      a.download = 'generated_voice.wav';
      a.click();
    } else if (state.lastGeneratedPath) {
      const a = document.createElement('a');
      a.href = convertFileSrc(state.lastGeneratedPath);
      a.download = 'generated_voice.wav';
      a.click();
    }
  }, []);

  const exportGenerated = useCallback(async () => {
    const state = useEditorStore.getState();
    if (!state.lastGeneratedAudio && !state.lastGeneratedPath) {
      setError('No hay audio generado para exportar.');
      return;
    }

    setExporting(true);
    try {
      const path = await save({
        filters: [{ name: 'WAV Audio', extensions: ['wav'] }],
        defaultPath: 'generated_voice.wav',
      });
      if (!path) return;

      let bytes: Uint8Array;
      if (state.lastGeneratedAudio) {
        bytes = base64ToBytes(state.lastGeneratedAudio);
      } else if (state.lastGeneratedPath) {
        bytes = await readFile(state.lastGeneratedPath);
      } else {
        return;
      }

      await writeFile(path, bytes);
      setError(null);
    } catch (err) {
      setError('Export failed: ' + String(err));
    } finally {
      setExporting(false);
    }
  }, []);

  const k2Badge = voiceStatus?.k2fsa_loaded
    ? { text: 'k2-fsa active', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' }
    : voiceStatus?.k2fsa_files_verified
      ? { text: 'k2-fsa ready', color: 'bg-emerald-500/15 text-emerald-300/80 border-emerald-500/25' }
      : { text: 'k2-fsa pending', color: 'bg-white/10 text-white/50 border-white/10' };

  const meta = (key: keyof GenerationOptions) => optionMeta?.[key];

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="font-medium mb-2 flex items-center justify-between">
        Voice & Cloning
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${k2Badge.color}`}>{k2Badge.text}</span>
      </div>

      <div className="flex-1 flex flex-col text-xs min-h-0 overflow-auto">
        {/* Voice Reference */}
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
                  aria-label="Play reference audio"
                >
                  ▶ Play ref
                </button>
                <button
                  onClick={() => setCurrentVoiceReference(null)}
                  className="text-[10px] text-red-400 hover:text-red-300 px-2 py-0.5 transition"
                  aria-label="Clear reference"
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

        {/* Voice Tuning */}
        <div className="mb-3 p-2 bg-[#1a1a1a] border border-white/10 rounded">
          <div className="text-white/60 mb-2 flex items-center justify-between">
            <span>Voice Tuning</span>
            <span className="text-[9px] text-white/40">OmniVoice options</span>
          </div>

          <div className="space-y-2">
            <label className="block">
              <span className="text-[10px] text-white/50 flex justify-between">
                <span>{meta('speed')?.label || 'Speed'}</span>
                <span>{options.speed.toFixed(2)}x</span>
              </span>
              <input
                type="range"
                min={meta('speed')?.min ?? 0.5}
                max={meta('speed')?.max ?? 2.0}
                step={meta('speed')?.step ?? 0.05}
                value={options.speed}
                onChange={(e) => updateOption('speed', Number(e.target.value))}
                className="w-full accent-[#00b4d8]"
              />
            </label>

            <label className="block">
              <span className="text-[10px] text-white/50 flex justify-between">
                <span>{meta('num_step')?.label || 'Steps'}</span>
                <span>{options.num_step}</span>
              </span>
              <input
                type="range"
                min={meta('num_step')?.min ?? 4}
                max={meta('num_step')?.max ?? 64}
                step={meta('num_step')?.step ?? 1}
                value={options.num_step}
                onChange={(e) => updateOption('num_step', Number(e.target.value))}
                className="w-full accent-[#00b4d8]"
              />
            </label>

            <label className="block">
              <span className="text-[10px] text-white/50 flex justify-between">
                <span>{meta('guidance_scale')?.label || 'Guidance'}</span>
                <span>{options.guidance_scale.toFixed(1)}</span>
              </span>
              <input
                type="range"
                min={meta('guidance_scale')?.min ?? 1.0}
                max={meta('guidance_scale')?.max ?? 5.0}
                step={meta('guidance_scale')?.step ?? 0.1}
                value={options.guidance_scale}
                onChange={(e) => updateOption('guidance_scale', Number(e.target.value))}
                className="w-full accent-[#00b4d8]"
              />
            </label>

            <div className="flex gap-3">
              <label className="flex items-center gap-1.5 text-[10px] text-white/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.denoise}
                  onChange={(e) => updateOption('denoise', e.target.checked)}
                  className="accent-[#00b4d8]"
                />
                {meta('denoise')?.label || 'Denoise'}
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-white/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.postprocess_output}
                  onChange={(e) => updateOption('postprocess_output', e.target.checked)}
                  className="accent-[#00b4d8]"
                />
                {meta('postprocess_output')?.label || 'Post-process'}
              </label>
            </div>

            <label className="block">
              <span className="text-[10px] text-white/50">{meta('language')?.label || 'Language'}</span>
              <select
                value={options.language}
                onChange={(e) => updateOption('language', e.target.value)}
                className="w-full mt-0.5 bg-black/40 border border-white/20 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#00b4d8]/50"
              >
                {(meta('language')?.choices || ['auto', 'es', 'en']).map((c) => (
                  <option key={c} value={c} className="bg-[#1a1a1a]">
                    {c === 'auto' ? 'Auto-detect' : c.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="mt-2 text-[10px] text-white/50 hover:text-white/80 underline"
          >
            {showAdvanced ? 'Hide advanced' : 'Advanced options'}
          </button>

          {showAdvanced && (
            <div className="mt-2 space-y-2 pt-2 border-t border-white/10">
              <label className="block">
                <span className="text-[10px] text-white/50">{meta('instruct')?.label || 'Voice design instruction'}</span>
                <input
                  type="text"
                  value={options.instruct}
                  onChange={(e) => updateOption('instruct', e.target.value)}
                  placeholder="e.g. speak softly and slowly"
                  className="w-full mt-0.5 bg-black/40 border border-white/20 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#00b4d8]/50"
                />
              </label>

              <div className="flex gap-2">
                <label className="block flex-1">
                  <span className="text-[10px] text-white/50">{meta('duration')?.label || 'Duration (s)'}</span>
                  <input
                    type="number"
                    min={meta('duration')?.min ?? 1}
                    max={meta('duration')?.max ?? 60}
                    step={meta('duration')?.step ?? 0.5}
                    value={options.duration}
                    onChange={(e) => updateOption('duration', e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="auto"
                    className="w-full mt-0.5 bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#00b4d8]/50"
                  />
                </label>
                <label className="block flex-1">
                  <span className="text-[10px] text-white/50">{meta('t_shift')?.label || 'T-shift'}</span>
                  <input
                    type="number"
                    min={meta('t_shift')?.min ?? 0}
                    max={meta('t_shift')?.max ?? 1}
                    step={meta('t_shift')?.step ?? 0.05}
                    value={options.t_shift}
                    onChange={(e) => updateOption('t_shift', e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="auto"
                    className="w-full mt-0.5 bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#00b4d8]/50"
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Text + Generate */}
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

          {(lastGeneratedAudio || lastGeneratedPath) && (
            <div className="mt-3 p-2 bg-emerald-950/30 border border-emerald-600/50 rounded text-[10px]">
              <div className="truncate">Last generated: {lastGeneratedInfo}</div>
              {lastGeneratedPath && (
                <div className="text-white/40 truncate mt-0.5" title={lastGeneratedPath}>
                  {lastGeneratedPath}
                </div>
              )}
              <div className="flex gap-1 mt-1">
                <button
                  onClick={playGenerated}
                  className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] rounded hover:bg-emerald-700 transition"
                  aria-label="Play generated voice"
                >
                  ▶ Play
                </button>
                <button
                  onClick={downloadGenerated}
                  className="px-2 py-0.5 bg-white/10 text-white text-[10px] rounded hover:bg-white/20 transition"
                  aria-label="Download generated voice"
                >
                  ⬇ Download
                </button>
                <button
                  onClick={exportGenerated}
                  disabled={exporting}
                  className="px-2 py-0.5 bg-white/10 text-white text-[10px] rounded hover:bg-white/20 transition disabled:opacity-50"
                  aria-label="Export generated voice"
                >
                  {exporting ? 'Saving…' : 'Save as…'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-[10px] text-white/30 mt-2 pt-2 border-t border-white/10">
        A/B on video → export reference (4-10s clear speech) → tune → Generate Cloned Voice
      </div>
    </div>
  );
}

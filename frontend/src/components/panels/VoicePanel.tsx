import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { useEditorStore } from '../../stores/editorStore';
import { useVoiceStore, startVoiceStatusPolling } from '../../stores/voiceStore';
import { VoiceReference, GenerationOptions, GenerateOptionsResponse, SubtitleTrack, WaveformData } from '../../types';
import CollapsibleSection from '../ui/CollapsibleSection';
import TextImportModal from '../ui/TextImportModal';

interface GenerateResult {
  success: boolean;
  audio_base64?: string;
  output_path?: string;
  model_used?: string;
  duration_seconds?: number;
  error_message?: string;
}

const OPTIONS_STORAGE_KEY = 'omniclon2-generation-options';

const NON_VERBAL_TAGS = [
  '[laughter]',
  '[sigh]',
  '[confirmation-en]',
  '[question-en]',
  '[question-ah]',
  '[question-oh]',
  '[question-ei]',
  '[question-yi]',
  '[surprise-ah]',
  '[surprise-oh]',
  '[surprise-wa]',
  '[surprise-yo]',
  '[dissatisfaction-hnn]',
];

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

  const text = useEditorStore((s) => s.voiceText);
  const setText = useEditorStore((s) => s.setVoiceText);
  const refText = useEditorStore((s) => s.voiceRefText);
  const setRefText = useEditorStore((s) => s.setVoiceRefText);
  const subtitleTracks = useEditorStore((s) => s.subtitleTracks);
  const selectedSubtitleTrack = useEditorStore((s) => s.selectedSubtitleTrack);
  const setSubtitleTracks = useEditorStore((s) => s.setSubtitleTracks);
  const setSelectedSubtitleTrack = useEditorStore((s) => s.setSelectedSubtitleTrack);
  const audioTracks = useEditorStore((s) => s.audioTracks);
  const selectedAudioTrack = useEditorStore((s) => s.selectedAudioTrack);
  const setSelectedAudioTrack = useEditorStore((s) => s.setSelectedAudioTrack);
  const setWaveform = useEditorStore((s) => s.setWaveform);
  const activeAudioLanguage = audioTracks.find((t) => t.index === selectedAudioTrack)?.language;
  const [error, setError] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [options, setOptions] = useState<GenerationOptions>(loadStoredOptions);
  const [optionMeta, setOptionMeta] = useState<GenerateOptionsResponse['options'] | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const { status: voiceStatus } = useVoiceStore();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    startVoiceStatusPolling();
  }, []);

  useEffect(() => {
    if (!activeClipId) {
      setSubtitleTracks([]);
      setSelectedSubtitleTrack(null);
      return;
    }
    const clip = clips.find((c) => c.id === activeClipId);
    if (!clip) return;
    invoke<{ success: boolean; tracks?: SubtitleTrack[]; error?: string }>('subtitle_tracks', {
      payload: { path: clip.path },
    })
      .then((res) => {
        if (res.success && res.tracks) {
          setSubtitleTracks(res.tracks);
          const textCodecs = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text']);
          const textTracks = res.tracks.filter((t) => textCodecs.has(t.codec_name.toLowerCase()));
          const matched = activeAudioLanguage
            ? textTracks.find((t) => t.language.toLowerCase() === activeAudioLanguage.toLowerCase())
            : undefined;
          const firstText = matched || textTracks[0];
          setSelectedSubtitleTrack(firstText ? firstText.index : null);
        } else {
          setSubtitleTracks([]);
          setSelectedSubtitleTrack(null);
        }
      })
      .catch((err) => {
        console.error('[VoicePanel] subtitle_tracks failed', err);
        setSubtitleTracks([]);
        setSelectedSubtitleTrack(null);
      });
  }, [activeClipId, clips, setSubtitleTracks, setSelectedSubtitleTrack]);

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

  const stopCurrentAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  }, []);

  const playAudio = useCallback(async (src: string) => {
    stopCurrentAudio();
    try {
      const audio = new Audio(src);
      audioRef.current = audio;
      await audio.play();
    } catch (err) {
      setError('Playback failed: ' + String(err));
    }
  }, [stopCurrentAudio]);

  const insertTag = useCallback((tag: string) => {
    const el = textAreaRef.current;
    if (!el) {
      setText(text ? `${text} ${tag}` : tag);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const before = text.slice(0, start);
    const after = text.slice(end);
    const needsSpaceBefore = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n');
    const needsSpaceAfter = after.length > 0 && !after.startsWith(' ') && !after.startsWith('\n');
    const newText =
      before +
      (needsSpaceBefore ? ' ' : '') +
      tag +
      (needsSpaceAfter ? ' ' : '') +
      after;
    setText(newText);
    const newCursor = start + (needsSpaceBefore ? 1 : 0) + tag.length + (needsSpaceAfter ? 1 : 0);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(newCursor, newCursor);
    });
  }, [text, setText]);

  const playReference = useCallback(async () => {
    if (!currentVoiceReference) return;
    await playAudio(convertFileSrc(currentVoiceReference.audioPath));
  }, [currentVoiceReference, playAudio]);

  const handleExportAB = useCallback(async () => {
    setError(null);
    console.log('[VoicePanel] Export A-B clicked', { activeClipId, region, clipsCount: clips.length });
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
    console.log('[VoicePanel] A/B duration', duration);
    if (duration < 0.5) {
      setError('La referencia A-B es muy corta. Selecciona al menos 0.5 segundos.');
      return;
    }
    if (duration > 20) {
      setError('La referencia es muy larga. Usa como máximo 20 segundos.');
      return;
    }

    try {
      const outPath = await invoke<string>('extract_segment', {
        path: clip.path,
        startTime: region.start,
        endTime: region.end,
        audioTrackIndex: selectedAudioTrack ?? undefined,
      });

      const voiceRef: VoiceReference = {
        audioPath: outPath,
        duration,
        sourceClipId: clip.id,
        sourceClipName: clip.name,
        extractedAt: Date.now(),
      };

      setCurrentVoiceReference(voiceRef);
      console.log('[VoicePanel] Reference exported', voiceRef);
    } catch (err) {
      const msg = 'Export failed: ' + String(err);
      console.error('[VoicePanel]', msg);
      setError(msg);
    }
  }, [activeClipId, clips, region, setCurrentVoiceReference]);

  const handleExtractSubtitles = useCallback(async () => {
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
    try {
      const result = await invoke<{ success: boolean; text?: string; error?: string }>('extract_subtitles', {
        payload: {
          path: clip.path,
          startTime: region.start,
          endTime: region.end,
          trackIndex: selectedSubtitleTrack ?? undefined,
        },
      });
      if (result.success && result.text !== undefined) {
        setRefText(result.text);
      } else {
        setError('Subtitle extraction failed: ' + (result.error || 'No subtitles found'));
      }
    } catch (err) {
      setError('Subtitle extraction error: ' + String(err));
    }
  }, [activeClipId, clips, region, setRefText]);

  const handleTranscribe = useCallback(async () => {
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
    if (duration <= 0) {
      setError('Invalid A-B range');
      return;
    }
    if (duration > 120) {
      setError('ASR max segment is 120 seconds');
      return;
    }
    setIsTranscribing(true);
    try {
      const result = await invoke<{ success: boolean; text?: string; error?: string }>('transcribe_audio', {
        payload: {
          path: clip.path,
          startTime: region.start,
          endTime: region.end,
          language: options.language && options.language !== 'auto' ? options.language : undefined,
          model: 'base',
        },
      });
      if (result.success && result.text !== undefined) {
        setRefText(result.text);
      } else {
        setError('ASR transcription failed: ' + (result.error || 'No text returned'));
      }
    } catch (err) {
      setError('ASR transcription error: ' + String(err));
    } finally {
      setIsTranscribing(false);
    }
  }, [activeClipId, clips, region, setRefText, options.language]);

  const handleAudioTrackChange = useCallback(async (index: number | null) => {
    setSelectedAudioTrack(index);
    const clip = clips.find((c) => c.id === activeClipId);
    if (!clip || index === null) return;
    try {
      const wf = await invoke<WaveformData>('extract_waveform', {
        path: clip.path,
        duration: clip.duration,
        audioTrackIndex: index,
      });
      setWaveform(wf);
    } catch (err) {
      console.error('[VoicePanel] Failed to re-extract waveform for audio track', err);
    }
  }, [activeClipId, clips, setSelectedAudioTrack, setWaveform]);

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
    if (refText.trim()) {
      payload.ref_text = refText.trim();
    }
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
  }, [currentVoiceReference, text, refText, options]);

  const handleGenerate = useCallback(async () => {
    setError(null);
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Escribe el texto a generar.');
      return;
    }

    setIsGenerating(true);
    try {
      let result: GenerateResult;

      if (currentVoiceReference) {
        // Use an already-exported reference file
        const payload = buildGeneratePayload();
        result = await invoke<GenerateResult>('generate', { payload });
      } else {
        // Extract A-B directly from the active clip and generate in one step
        const clip = clips.find((c) => c.id === activeClipId);
        if (!clip) {
          setError('No hay un clip activo seleccionado.');
          setIsGenerating(false);
          return;
        }
        const duration = region.end - region.start;
        if (duration < 1) {
          setError('La selección A-B es muy corta. Selecciona al menos 1 segundo.');
          setIsGenerating(false);
          return;
        }
        if (duration > 20) {
          setError('La selección A-B es muy larga. Usa como máximo 20 segundos.');
          setIsGenerating(false);
          return;
        }
        const payload = {
          video_path: clip.path,
          start_time: region.start,
          end_time: region.end,
          text: trimmed,
          ...(refText.trim() ? { ref_text: refText.trim() } : {}),
          speed: options.speed,
          num_step: options.num_step,
          guidance_scale: options.guidance_scale,
          denoise: options.denoise,
          postprocess_output: options.postprocess_output,
          ...(options.language && options.language !== 'auto' ? { language: options.language } : {}),
          ...(options.instruct.trim() ? { instruct: options.instruct.trim() } : {}),
          ...(options.duration !== '' && Number(options.duration) > 0 ? { duration: Number(options.duration) } : {}),
          ...(options.t_shift !== '' && Number(options.t_shift) >= 0 ? { t_shift: Number(options.t_shift) } : {}),
        };
        result = await invoke<GenerateResult>('generate_from_clip', { payload });
      }

      if (result.success && result.audio_base64) {
        const info = `${result.model_used || 'Optimized for this PC'} • ${(result.duration_seconds || 0).toFixed(2)}s`;
        setLastGenerated(result.audio_base64, result.output_path || null, info);
        await playAudio(`data:audio/wav;base64,${result.audio_base64}`);
      } else if (result.success && result.output_path) {
        const info = `${result.model_used || ''} • ${(result.duration_seconds || 0).toFixed(2)}s`;
        setLastGenerated(null, result.output_path, info);
        await playAudio(convertFileSrc(result.output_path));
      } else {
        setError('Generación fallida: ' + (result.error_message || 'Error desconocido'));
      }
    } catch (err) {
      setError('Error: ' + String(err));
    } finally {
      setIsGenerating(false);
    }
  }, [currentVoiceReference, text, refText, options, activeClipId, clips, region, setIsGenerating, setLastGenerated, buildGeneratePayload, playAudio]);

  const playGenerated = useCallback(() => {
    const state = useEditorStore.getState();
    if (state.lastGeneratedAudio) {
      playAudio(`data:audio/wav;base64,${state.lastGeneratedAudio}`);
    } else if (state.lastGeneratedPath) {
      playAudio(convertFileSrc(state.lastGeneratedPath));
    }
  }, [playAudio]);

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

      <div className="flex-1 flex flex-col text-xs min-h-0 overflow-auto gap-3">
        {/* TTS / Cloning Model selector (currently OmniVoice is the quality default) */}
        <div className="p-2 bg-[#1a1a1a] border border-white/10 rounded">
          <div className="text-[10px] text-white/50 mb-1">Cloning Model</div>
          <div className="flex items-center justify-between">
            <span className="text-emerald-300 font-medium">k2-fsa / OmniVoice</span>
            <span className="text-[9px] text-white/40">máxima calidad</span>
          </div>
          <div className="text-[9px] text-white/40 mt-1">
            Modelo principal de clonación zero-shot. Se usa automáticamente para todas las generaciones.
          </div>
        </div>

        {/* Voice Reference (A/B) */}
        <CollapsibleSection
          title={<>Voice Reference (A/B) <span className="text-[9px] text-white/40 font-normal">(4-10s recommended)</span></>}
          defaultOpen
        >
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
            <>
              <div className="text-white/60 mb-1">A/B segment</div>
              {!activeClipId ? (
                <div className="text-orange-400">No active clip.</div>
              ) : (
                <>
                  <div className="text-[10px] text-white/40">
                    {region.start.toFixed(2)}s – {region.end.toFixed(2)}s
                    {' '}
                    ({(region.end - region.start).toFixed(2)}s)
                  </div>
                  {region.end - region.start >= 0.5 && region.end - region.start <= 20 ? (
                    <div className="text-emerald-400 text-[10px]">✓ Ready to generate</div>
                  ) : (
                    <div className="text-orange-400 text-[10px]">
                      {region.end - region.start < 0.5
                        ? 'Select at least 0.5 seconds.'
                        : 'Selection too long (max 20 s).'}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </CollapsibleSection>

        {/* Reference transcript */}
        <CollapsibleSection title={<>Reference transcript <span className="text-[9px] text-white/40 font-normal">(optional)</span></>} defaultOpen={false}>
          <textarea
            value={refText}
            onChange={(e) => setRefText(e.target.value)}
            placeholder="Escribe aquí lo que dice exactamente el segmento A-B seleccionado..."
            className="w-full min-h-[50px] bg-black/40 border border-white/20 rounded px-2 py-1 text-white text-xs mb-1 resize-y focus:outline-none focus:border-[#00b4d8]/50"
          />
          <div className="flex flex-col gap-1.5 mt-1.5">
            {audioTracks.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-white/40">Audio:</span>
                <select
                  value={selectedAudioTrack ?? ''}
                  onChange={(e) => handleAudioTrackChange(e.target.value ? Number(e.target.value) : null)}
                  className="flex-1 min-w-0 bg-black/40 border border-white/20 rounded px-1.5 py-0.5 text-white text-[10px] focus:outline-none focus:border-[#00b4d8]/50"
                >
                  {audioTracks.map((t) => (
                    <option key={t.index} value={t.index} className="bg-[#1a1a1a]">
                      [{t.language}] {t.title || t.codec_name} {t.channels > 0 && `• ${t.channels}ch`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {subtitleTracks.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-white/40">Subtitles:</span>
                <select
                  value={selectedSubtitleTrack ?? ''}
                  onChange={(e) => setSelectedSubtitleTrack(e.target.value ? Number(e.target.value) : null)}
                  className="flex-1 min-w-0 bg-black/40 border border-white/20 rounded px-1.5 py-0.5 text-white text-[10px] focus:outline-none focus:border-[#00b4d8]/50"
                >
                  {subtitleTracks.map((t) => (
                    <option key={t.index} value={t.index} className="bg-[#1a1a1a]">
                      [{t.language}] {t.title || t.codec_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="text-[9px] text-white/40">
                Si lo dejas vacío, el backend intentará transcribirlo automáticamente (requiere ASR).
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={handleExtractSubtitles}
                  disabled={!activeClipId || subtitleTracks.length === 0}
                  className="text-[10px] px-2 py-0.5 bg-[#00b4d8]/20 text-[#00b4d8] rounded hover:bg-[#00b4d8]/30 disabled:opacity-50 transition"
                  title="Fill transcript from embedded subtitles"
                >
                  Extract from subtitles
                </button>
                <button
                  onClick={handleTranscribe}
                  disabled={!activeClipId || isTranscribing}
                  className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30 disabled:opacity-50 transition"
                  title="Transcribe the A-B segment with OpenAI Whisper (requires model download on first use)"
                >
                  {isTranscribing ? 'Transcribing…' : 'Transcribe (Whisper)'}
                </button>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Text to Synthesize */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-white/60">Text to Synthesize</span>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="text-[10px] px-2 py-0.5 bg-white/10 text-white/60 rounded hover:bg-white/15 hover:text-white transition"
              title="Import text from CSV or Excel"
            >
              Import CSV/Excel…
            </button>
          </div>
          <textarea
            ref={textAreaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe aquí el texto que quieres que diga la voz clonada..."
            className="flex-1 min-h-[80px] bg-black/40 border border-white/20 rounded px-2 py-1 text-white text-xs mb-2 resize-y focus:outline-none focus:border-[#00b4d8]/50"
          />

          <div className="mb-2">
            <div className="text-[10px] text-white/40 mb-1">Non-verbal tags</div>
            <div className="flex flex-wrap gap-1">
              {NON_VERBAL_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => insertTag(tag)}
                  className="px-1.5 py-0.5 bg-white/10 text-white/60 text-[9px] rounded hover:bg-white/20 hover:text-white transition"
                  title={`Insert ${tag}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Voice Tuning */}
        <CollapsibleSection title="Voice Tuning" defaultOpen={false}>
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
        </CollapsibleSection>

        {/* Export A-B */}
        <button
          onClick={handleExportAB}
          disabled={!activeClipId}
          className="w-full px-3 py-1 bg-white/10 text-white/70 text-[10px] rounded hover:bg-white/15 disabled:opacity-50 transition"
          title="Export the A-B segment as a separate WAV file (advanced)"
        >
          Export A-B reference manually
        </button>

        {/* Generate */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !activeClipId || region.end - region.start < 0.5}
          className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded transition"
        >
          {isGenerating ? 'Generating…' : 'Generate Cloned Voice'}
        </button>

        {error && (
          <div className="text-[10px] text-red-300 bg-red-950/30 border border-red-500/30 rounded p-2">
            {error}
          </div>
        )}

        <div className="text-[9px] text-emerald-400/70 text-center">
          Uses your local k2-fsa_OmniVoice assets.
        </div>

        {(lastGeneratedAudio || lastGeneratedPath) && (
          <div className="p-2 bg-emerald-950/30 border border-emerald-600/50 rounded text-[10px]">
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

      <TextImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSelect={(text) => setText(text)}
      />

      <div className="text-[10px] text-white/30 mt-2 pt-2 border-t border-white/10">
        1. Select A/B on video · 2. (Optional) write what the A-B segment says · 3. Type target text · 4. Generate
      </div>
    </div>
  );
}

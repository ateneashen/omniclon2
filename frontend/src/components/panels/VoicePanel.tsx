import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { useEditorStore } from '../../stores/editorStore';
import { useVoiceStore, startVoiceStatusPolling } from '../../stores/voiceStore';
import { logError, logInfo } from '../../lib/log';
import { VoiceReference, GenerationOptions, GenerateOptionsResponse, SubtitleTrack, WaveformData } from '../../types';
import { Mic, Volume2, Subtitles, Play, Download, Save, Sparkles } from 'lucide-react';
import CollapsibleSection from '../ui/CollapsibleSection';
import TextImportModal from '../ui/TextImportModal';
import TrackSelector from '../ui/TrackSelector';
import NleSlider from '../ui/NleSlider';

interface GenerateResult {
  success: boolean;
  audio_base64?: string;
  output_path?: string;
  model_used?: string;
  duration_seconds?: number;
  error_message?: string;
}

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
  const options = useEditorStore((s) => s.generationOptions);
  const updateOption = useEditorStore((s) => s.updateGenerationOption);
  const [error, setError] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
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
        logError('VoicePanel', 'subtitle_tracks failed', err, { clipId: activeClipId });
        setSubtitleTracks([]);
        setSelectedSubtitleTrack(null);
      });
  }, [activeClipId, clips, setSubtitleTracks, setSelectedSubtitleTrack]);

  useEffect(() => {
    invoke<GenerateOptionsResponse>('get_generate_options')
      .then((res) => setOptionMeta(res.options))
      .catch((err) => logError('VoicePanel', 'get_generate_options failed', err));
  }, []);

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
      logError('VoicePanel', 'Playback failed', err);
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
    logInfo('VoicePanel', 'Export A-B clicked', { activeClipId, region, clipsCount: clips.length });
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
    logInfo('VoicePanel', 'A/B duration validated', { duration, region });
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
      logInfo('VoicePanel', 'Reference exported', voiceRef);
    } catch (err) {
      const msg = 'Export failed: ' + String(err);
      logError('VoicePanel', 'Export A-B reference failed', err, { region, clipId: activeClipId });
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
      logError('VoicePanel', 'Subtitle extraction failed', err, { region, clipId: activeClipId, trackIndex: selectedSubtitleTrack });
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
      logError('VoicePanel', 'ASR transcription failed', err, { region, clipId: activeClipId, language: options.language });
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
      logError('VoicePanel', 'Re-extract waveform for audio track failed', err, { clipId: activeClipId, trackIndex: index });
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
    const operationContext = {
      mode: currentVoiceReference ? 'reference' : 'from_clip',
      textLength: trimmed.length,
      refDuration: currentVoiceReference?.duration ?? (region.end - region.start),
      options: {
        speed: options.speed,
        num_step: options.num_step,
        guidance_scale: options.guidance_scale,
        denoise: options.denoise,
        postprocess_output: options.postprocess_output,
        language: options.language,
        instruct: options.instruct,
        duration: options.duration,
        t_shift: options.t_shift,
      },
    };
    logInfo('VoicePanel', 'Generation started', operationContext);
    const startTime = performance.now();

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

      const elapsedMs = Math.round(performance.now() - startTime);
      if (result.success && (result.audio_base64 || result.output_path)) {
        const info = `${result.model_used || 'Optimized for this PC'} • ${(result.duration_seconds || 0).toFixed(2)}s`;
        logInfo('VoicePanel', 'Generation succeeded', {
          durationSeconds: result.duration_seconds,
          modelUsed: result.model_used,
          elapsedMs,
          hasBase64: !!result.audio_base64,
          outputPath: result.output_path,
        });
        if (result.audio_base64) {
          setLastGenerated(result.audio_base64, result.output_path || null, info);
          await playAudio(`data:audio/wav;base64,${result.audio_base64}`);
        } else {
          setLastGenerated(null, result.output_path!, info);
          await playAudio(convertFileSrc(result.output_path!));
        }
      } else {
        logError('VoicePanel', 'Generation returned failure', result.error_message || 'unknown', { elapsedMs, ...operationContext });
        setError('Generación fallida: ' + (result.error_message || 'Error desconocido'));
      }
    } catch (err) {
      const elapsedMs = Math.round(performance.now() - startTime);
      logError('VoicePanel', 'Generation threw exception', err, { elapsedMs, ...operationContext });
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
      logError('VoicePanel', 'Export generated audio failed', err);
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
    <div className="flex flex-col h-full min-h-0 text-sm">
      <div className="nle-panel-header mb-3 rounded-t-md shrink-0">
        <span className="flex items-center gap-1.5">
          <Mic size={12} className="text-[#3ecf8e]" />
          Inspector de voz
        </span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded border normal-case tracking-normal font-medium ${k2Badge.color}`}>
          {k2Badge.text}
        </span>
      </div>

      <div className="flex-1 flex flex-col text-xs min-h-0 overflow-auto gap-3">
        {/* TTS / Cloning Model selector (currently OmniVoice is the quality default) */}
        <div className="nle-panel p-2.5">
          <div className="flex items-center gap-1.5 text-[9px] text-white/40 uppercase tracking-wider mb-1.5">
            <Sparkles size={10} />
            Modelo de clonación
          </div>
          <div className="flex items-center justify-between">
            <span className="text-emerald-300 font-medium text-xs">k2-fsa / OmniVoice</span>
            <span className="text-[9px] text-white/35 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
              máx. calidad
            </span>
          </div>
        </div>

        {/* Voice Reference (A/B) */}
        <CollapsibleSection
          title={<>Referencia A/B <span className="text-[8px] text-white/35 font-normal normal-case tracking-normal">(4–10s)</span></>}
          defaultOpen
          accent="audio"
          summary={
            region.end > region.start
              ? `${(region.end - region.start).toFixed(1)}s`
              : 'sin marcar'
          }
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
              <div className="flex gap-1.5 mt-1.5">
                <button
                  onClick={playReference}
                  className="nle-btn"
                  aria-label="Play reference audio"
                >
                  <Play size={10} />
                  Escuchar
                </button>
                <button
                  onClick={() => setCurrentVoiceReference(null)}
                  className="nle-btn text-red-400 hover:text-red-300"
                  aria-label="Clear reference"
                >
                  Limpiar
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
        <CollapsibleSection
          title={<>Transcripción de referencia <span className="text-[8px] text-white/35 font-normal normal-case tracking-normal">(opcional)</span></>}
          defaultOpen={false}
          accent="audio"
          summary={
            refText.trim()
              ? refText.trim().length > 28
                ? `${refText.trim().slice(0, 28)}…`
                : refText.trim()
              : 'vacía'
          }
        >
          <textarea
            value={refText}
            onChange={(e) => setRefText(e.target.value)}
            placeholder="Escribe aquí lo que dice exactamente el segmento A-B seleccionado..."
            className="nle-input min-h-[50px] mb-2 resize-y"
          />
          <div className="flex flex-col gap-2 mt-1.5">
            <TrackSelector
              icon={<Volume2 size={12} />}
              label="Pista audio"
              accent="audio"
              value={selectedAudioTrack}
              options={audioTracks.map((t) => ({
                value: t.index,
                label: `[${t.language}] ${t.title || t.codec_name}`,
                meta: t.channels > 0 ? `${t.channels}ch` : undefined,
              }))}
              onChange={handleAudioTrackChange}
            />
            <TrackSelector
              icon={<Subtitles size={12} />}
              label="Subtítulos"
              accent="subtitle"
              value={selectedSubtitleTrack}
              options={subtitleTracks.map((t) => ({
                value: t.index,
                label: `[${t.language}] ${t.title || t.codec_name}`,
              }))}
              onChange={setSelectedSubtitleTrack}
            />
            <div className="text-[9px] text-white/35 leading-relaxed">
              Si lo dejas vacío, el backend intentará transcribirlo automáticamente (requiere ASR).
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={handleExtractSubtitles}
                disabled={!activeClipId || subtitleTracks.length === 0}
                className="nle-btn text-[#c9a0ff] border-[#c9a0ff]/25 bg-[#c9a0ff]/10"
                title="Fill transcript from embedded subtitles"
              >
                <Subtitles size={10} />
                Desde subtítulos
              </button>
              <button
                onClick={handleTranscribe}
                disabled={!activeClipId || isTranscribing}
                className="nle-btn text-purple-300 border-purple-500/25 bg-purple-500/10"
                title="Transcribe the A-B segment with OpenAI Whisper"
              >
                {isTranscribing ? 'Transcribiendo…' : 'Whisper ASR'}
              </button>
            </div>
          </div>
        </CollapsibleSection>

        {/* Text to Synthesize */}
        <div className="flex flex-col nle-panel p-2.5 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] text-white/50 uppercase tracking-wider font-semibold">Texto a sintetizar</span>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="nle-btn"
              title="Import text from CSV or Excel"
            >
              CSV/Excel
            </button>
          </div>
          <textarea
            ref={textAreaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe aquí el texto que quieres que diga la voz clonada..."
            className="nle-input min-h-[80px] mb-2 resize-y"
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
        <CollapsibleSection
          title="Ajuste de voz"
          defaultOpen={false}
          accent="audio"
          summary={`${options.speed.toFixed(1)}× · ${options.language === 'auto' ? 'auto' : options.language.toUpperCase()}`}
        >
          <div className="space-y-3.5">
            <NleSlider
              label={meta('speed')?.label || 'Velocidad'}
              value={options.speed}
              min={meta('speed')?.min ?? 0.5}
              max={meta('speed')?.max ?? 2.0}
              step={meta('speed')?.step ?? 0.05}
              displayValue={`${options.speed.toFixed(2)}×`}
              onChange={(v) => updateOption('speed', v)}
            />

            <NleSlider
              label={meta('num_step')?.label || 'Pasos'}
              value={options.num_step}
              min={meta('num_step')?.min ?? 4}
              max={meta('num_step')?.max ?? 64}
              step={meta('num_step')?.step ?? 1}
              onChange={(v) => updateOption('num_step', v)}
            />

            <NleSlider
              label={meta('guidance_scale')?.label || 'Guidance'}
              value={options.guidance_scale}
              min={meta('guidance_scale')?.min ?? 1.0}
              max={meta('guidance_scale')?.max ?? 5.0}
              step={meta('guidance_scale')?.step ?? 0.1}
              displayValue={options.guidance_scale.toFixed(1)}
              onChange={(v) => updateOption('guidance_scale', v)}
            />

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
              <span className="text-[10px] text-white/50">{meta('language')?.label || 'Idioma'}</span>
              <select
                value={options.language}
                onChange={(e) => updateOption('language', e.target.value)}
                className="nle-select mt-1"
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
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="mt-1 nle-btn w-full text-[10px]"
          >
            {showAdvanced ? 'Ocultar opciones avanzadas' : 'Opciones avanzadas'}
          </button>

          {showAdvanced && (
            <div className="mt-2 space-y-2.5 pt-2.5 border-t border-white/[0.08]">
              <label className="block">
                <span className="text-[10px] text-white/50">{meta('instruct')?.label || 'Voice design instruction'}</span>
                <input
                  type="text"
                  value={options.instruct}
                  onChange={(e) => updateOption('instruct', e.target.value)}
                  placeholder="e.g. speak softly and slowly"
                  className="nle-input mt-1"
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
                    className="nle-input mt-1"
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
                    className="nle-input mt-1"
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
          className="nle-btn w-full disabled:opacity-50"
          title="Export the A-B segment as a separate WAV file (advanced)"
        >
          Exportar referencia A-B
        </button>

        {/* Generate */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !activeClipId || region.end - region.start < 0.5}
          className="w-full px-3 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 text-white text-sm font-semibold rounded-md transition shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2"
        >
          <Sparkles size={16} />
          {isGenerating ? 'Generando…' : 'Generar voz clonada'}
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
          <div className="nle-panel p-2.5 border-emerald-500/25 bg-emerald-950/20 text-[10px]">
            <div className="truncate text-emerald-300/90 font-medium">Última generación: {lastGeneratedInfo}</div>
            {lastGeneratedPath && (
              <div className="text-white/35 truncate mt-0.5 font-mono text-[9px]" title={lastGeneratedPath}>
                {lastGeneratedPath}
              </div>
            )}
            <div className="flex gap-1.5 mt-2">
              <button
                onClick={playGenerated}
                className="nle-btn nle-btn--primary"
                aria-label="Play generated voice"
              >
                <Play size={10} />
                Play
              </button>
              <button
                onClick={downloadGenerated}
                className="nle-btn"
                aria-label="Download generated voice"
              >
                <Download size={10} />
                Download
              </button>
              <button
                onClick={exportGenerated}
                disabled={exporting}
                className="nle-btn disabled:opacity-50"
                aria-label="Export generated voice"
              >
                <Save size={10} />
                {exporting ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 mt-2 pt-2 border-t border-white/[0.06] nle-workflow-steps">
        <span><span className="step-num">1</span> Marca A/B</span>
        <span className="text-white/15">→</span>
        <span><span className="step-num">2</span> Transcripción (opc.)</span>
        <span className="text-white/15">→</span>
        <span><span className="step-num">3</span> Texto objetivo</span>
        <span className="text-white/15">→</span>
        <span><span className="step-num">4</span> Generar</span>
      </div>

      <TextImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSelect={(text) => setText(text)}
      />
    </div>
  );
}

import { invoke } from '@tauri-apps/api/core';
import { MediaClip, ScriptItem, WaveformData } from '../types';
import { useEditorStore } from '../stores/editorStore';
import { logError } from './log';

export interface SnapshotResult {
  restored: boolean;
  imported: boolean;
  message: string;
}

export async function applyScriptSnapshot(script: ScriptItem): Promise<SnapshotResult> {
  const state = useEditorStore.getState();

  state.setVoiceText(script.text);
  state.setVoiceRefText(script.refText ?? '');

  if (script.voiceOptions) {
    state.setGenerationOptions(script.voiceOptions);
  }

  let clip =
    (script.clipId ? state.clips.find((c) => c.id === script.clipId) : undefined) ??
    (script.clipPath ? state.clips.find((c) => c.path === script.clipPath) : undefined);

  let imported = false;

  if (!clip && script.clipPath) {
    try {
      clip = await invoke<MediaClip>('import_media', { path: script.clipPath });
      state.addClip(clip);
      imported = true;
    } catch (err) {
      logError('applyScriptSnapshot', 'Failed to auto-import reference video', err, {
        clipPath: script.clipPath,
      });
      if (script.region && script.region.end > script.region.start) {
        state.setRegion(script.region);
      }
      return {
        restored: false,
        imported: false,
        message: `Guion cargado, pero no se pudo importar el video de referencia: ${
          typeof err === 'string' ? err : 'archivo no encontrado o no accesible'
        }`,
      };
    }
  }

  if (!clip) {
    if (script.region && script.region.end > script.region.start) {
      state.setRegion(script.region);
    }
    return {
      restored: true,
      imported: false,
      message: 'Guion y ajustes restaurados (sin video de referencia).',
    };
  }

  state.setActiveClip(clip.id);

  if (script.region && script.region.end > script.region.start) {
    state.setRegion(script.region);
    state.setCurrentTime(script.region.start);
  }

  if (script.selectedSubtitleTrack !== undefined) {
    state.setSelectedSubtitleTrack(script.selectedSubtitleTrack);
  }

  if (script.selectedAudioTrack !== undefined && script.selectedAudioTrack !== null) {
    state.setSelectedAudioTrack(script.selectedAudioTrack);
    try {
      const wf = await invoke<WaveformData>('extract_waveform', {
        path: clip.path,
        duration: clip.duration,
        audioTrackIndex: script.selectedAudioTrack,
      });
      state.setWaveform(wf);
    } catch (err) {
      logError('applyScriptSnapshot', 'Re-extract waveform failed', err, {
        clipId: clip.id,
        trackIndex: script.selectedAudioTrack,
      });
    }
  }

  return {
    restored: true,
    imported,
    message: imported
      ? `Guion, video y corte A/B restaurados desde "${clip.name}".`
      : 'Guion, video y corte A/B restaurados.',
  };
}

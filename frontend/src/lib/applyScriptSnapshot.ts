import { invoke } from '@tauri-apps/api/core';
import { ScriptItem, WaveformData } from '../types';
import { useEditorStore } from '../stores/editorStore';
import { logError } from './log';

export async function applyScriptSnapshot(script: ScriptItem): Promise<void> {
  const state = useEditorStore.getState();

  state.setVoiceText(script.text);
  state.setVoiceRefText(script.refText ?? '');

  if (script.voiceOptions) {
    state.setGenerationOptions(script.voiceOptions);
  }

  const clip =
    (script.clipId ? state.clips.find((c) => c.id === script.clipId) : undefined) ??
    (script.clipPath ? state.clips.find((c) => c.path === script.clipPath) : undefined);

  if (!clip) {
    if (script.region && script.region.end > script.region.start) {
      state.setRegion(script.region);
    }
    return;
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
}

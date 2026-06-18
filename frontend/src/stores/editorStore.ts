import { create } from 'zustand';
import { Region, MediaClip, WaveformData, VoiceReference } from '../types';

interface EditorState {
  // Current project
  clips: MediaClip[];
  activeClipId: string | null;

  // Timeline state
  currentTime: number;
  duration: number;
  region: Region;           // A-B selection
  zoom: number;
  isLooping: boolean;
  isPlaying: boolean;

  // Waveform
  waveform: WaveformData | null;

  // Current A/B Voice Reference (extracted for cloning)
  currentVoiceReference: VoiceReference | null;
  isGenerating: boolean;
  lastGeneratedAudio: string | null; // base64 for the last generation result
  lastGeneratedPath: string | null; // path to generated audio file
  lastGeneratedInfo: string | null; // e.g. model used, text

  // Voice synthesis text shared between panels
  voiceText: string;

  // Actions
  setActiveClip: (id: string | null) => void;
  addClip: (clip: MediaClip) => void;
  removeClip: (id: string) => void;

  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setRegion: (region: Partial<Region>) => void;
  setZoom: (zoom: number) => void;
  toggleLoop: () => void;
  setPlaying: (playing: boolean) => void;
  setWaveform: (waveform: WaveformData | null) => void;

  setCurrentVoiceReference: (ref: VoiceReference | null) => void;

  setIsGenerating: (generating: boolean) => void;
  setLastGenerated: (audioBase64: string | null, outputPath: string | null, info: string | null) => void;
  setVoiceText: (text: string) => void;

  // A/B helpers
  setMarkA: (time: number) => void;
  setMarkB: (time: number) => void;
  resetRegion: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  clips: [],
  activeClipId: null,

  currentTime: 0,
  duration: 0,
  region: { start: 0, end: 0 },
  zoom: 1,
  isLooping: false,
  isPlaying: false,
  waveform: null,
  currentVoiceReference: null,
  isGenerating: false,
  lastGeneratedAudio: null,
  lastGeneratedPath: null,
  lastGeneratedInfo: null,
  voiceText: '',

  setActiveClip: (id) => set({ activeClipId: id }),
  
  addClip: (clip) => set((state) => ({
    clips: [...state.clips, clip],
    activeClipId: clip.id,
    duration: clip.duration,
    // Default A/B to the first 5 seconds so long clips don't start with an
    // invalid full-length selection.
    region: { start: 0, end: Math.min(clip.duration, 5.0) },
  })),

  removeClip: (id) => set((state) => {
    const newClips = state.clips.filter(c => c.id !== id);
    return {
      clips: newClips,
      activeClipId: state.activeClipId === id ? (newClips[0]?.id ?? null) : state.activeClipId,
    };
  }),

  setCurrentTime: (time) => set({ currentTime: Math.max(0, Math.min(time, get().duration)) }),
  
  setDuration: (duration) => set({ duration }),
  
  setRegion: (region) => set((state) => ({
    region: {
      start: Math.max(0, region.start ?? state.region.start),
      end: Math.min(state.duration, region.end ?? state.region.end),
    }
  })),

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(100, zoom)) }),
  
  toggleLoop: () => set((state) => ({ isLooping: !state.isLooping })),
  
  setPlaying: (playing) => set({ isPlaying: playing }),
  
  setWaveform: (waveform) => set({ waveform }),

  setCurrentVoiceReference: (ref) => set({ currentVoiceReference: ref }),

  setIsGenerating: (generating: boolean) => set({ isGenerating: generating }),

  setLastGenerated: (audioBase64: string | null, outputPath: string | null, info: string | null) => set({ lastGeneratedAudio: audioBase64, lastGeneratedPath: outputPath, lastGeneratedInfo: info }),
  setVoiceText: (text: string) => set({ voiceText: text }),

  setMarkA: (time) => {
    const { region } = get();
    const newStart = Math.max(0, Math.min(time, region.end - 0.01));
    set({ region: { ...region, start: newStart } });
  },

  setMarkB: (time) => {
    const { region, duration } = get();
    const newEnd = Math.min(duration, Math.max(time, region.start + 0.01));
    set({ region: { ...region, end: newEnd } });
  },

  resetRegion: () => {
    const { duration } = get();
    set({ region: { start: 0, end: duration } });
  },
}));
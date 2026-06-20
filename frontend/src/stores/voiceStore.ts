import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { logError } from '../lib/log';

export interface VoiceStatus {
  ready?: boolean;
  primary_cloning_model?: string | null;
  k2fsa_loaded?: boolean;
  k2fsa_files_verified?: boolean;
  device?: 'cuda' | 'cpu' | string;
  error?: string;
}

interface VoiceState {
  status: VoiceStatus | null;
  loading: boolean;
  fetch: () => Promise<void>;
}

const STATUS_POLL_MS = 5000;

export const useVoiceStore = create<VoiceState>((set) => ({
  status: null,
  loading: true,
  fetch: async () => {
    try {
      const s = await invoke<VoiceStatus>('get_voice_status');
      set({ status: s, loading: false });
    } catch (err) {
      logError('voiceStore', 'Fetch voice status failed', err);
      set({ status: { ready: false, error: 'unavailable' }, loading: false });
    }
  },
}));

// Auto-poll once the module is imported in the renderer.
let pollStarted = false;
export function startVoiceStatusPolling() {
  if (pollStarted) return;
  pollStarted = true;
  useVoiceStore.getState().fetch();
  setInterval(() => useVoiceStore.getState().fetch(), STATUS_POLL_MS);
}

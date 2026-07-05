import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { logError } from '../lib/log';
import { ModelStatus, ModelConfig, ModelInfo, DownloadJob } from '../types';

export interface ModelCatalog {
  models: ModelInfo[];
  total_models: number;
  installed_models: number;
}

export interface CopyResult {
  copied: string[];
  failed: string[];
  message?: string;
}

interface ModelState {
  // State
  status: ModelStatus | null;
  catalog: ModelCatalog | null;
  isLoading: boolean;
  isCopying: boolean;
  error: string | null;
  lastFetched: number | null;
  downloads: Record<string, DownloadJob>;
  activeDownloadPollers: Record<string, number>;

  // Actions
  fetchStatus: () => Promise<void>;
  fetchCatalog: () => Promise<void>;
  fetchConfig: () => Promise<ModelConfig | null>;
  switchMode: (mode: 'shared' | 'dedicated') => Promise<boolean>;
  copyToDedicated: (repoIds: string[]) => Promise<CopyResult | null>;
  getLastCopyResult: () => CopyResult | null;
  startDownload: (repoId: string) => Promise<DownloadJob | null>;
  fetchDownloadProgress: (repoId: string) => Promise<DownloadJob | null>;
  stopDownloadPoll: (repoId: string) => void;
  refresh: () => Promise<void>;

  // Helpers
  getActiveModels: () => ModelInfo[];
  getMissingCriticalModels: () => ModelInfo[];
  isUsingShared: () => boolean;
  isDownloadingModel: (repoId: string) => boolean;
}

export const useModelStore = create<ModelState>((set, get) => ({
  status: null,
  catalog: null,
  isLoading: false,
  isCopying: false,
  error: null,
  lastFetched: null,
  downloads: {},
  activeDownloadPollers: {},

  fetchStatus: async () => {
    set({ isLoading: true, error: null });

    try {
      const result = await invoke<ModelStatus>('get_model_status');
      set({
        status: result,
        isCopying: result.copy_in_progress ?? false,
        isLoading: false,
        lastFetched: Date.now(),
      });
    } catch (err) {
      const message = typeof err === 'string' ? err : 'Error al obtener estado de modelos';
      logError('modelStore', 'fetchStatus failed', err);
      set({ error: message, isLoading: false });
    }
  },

  getLastCopyResult: () => {
    return get().status?.last_copy_result ?? null;
  },

  fetchCatalog: async () => {
    set({ isLoading: true, error: null });

    try {
      const result = await invoke<ModelCatalog>('get_model_catalog');
      set({
        catalog: result,
        isLoading: false,
        lastFetched: Date.now(),
      });
    } catch (err) {
      const message = typeof err === 'string' ? err : 'Error al obtener catálogo de modelos';
      logError('modelStore', 'fetchCatalog failed', err);
      set({ error: message, isLoading: false });
    }
  },

  copyToDedicated: async (repoIds: string[]) => {
    if (repoIds.length === 0) return null;

    set({ isLoading: true, isCopying: true, error: null });

    try {
      const result = await invoke<CopyResult>('copy_models_to_dedicated', { repoIds });
      await get().fetchStatus();
      set({ isLoading: false, isCopying: false });
      return result;
    } catch (err) {
      const message = typeof err === 'string' ? err : 'Error al copiar modelos a carpeta dedicada';
      logError('modelStore', 'copyToDedicated failed', err, { repoIds });
      set({ error: message, isLoading: false, isCopying: false });
      return null;
    }
  },

  startDownload: async (repoId: string) => {
    try {
      const job = await invoke<DownloadJob>('download_model', { repoId });
      set((state) => ({
        downloads: { ...state.downloads, [repoId]: job },
      }));

      // Start polling if not already polling this model
      if (!get().activeDownloadPollers[repoId]) {
        const interval = window.setInterval(async () => {
          const latest = await get().fetchDownloadProgress(repoId);
          if (latest && (latest.status === 'completed' || latest.status === 'failed')) {
            get().stopDownloadPoll(repoId);
            get().fetchStatus();
          }
        }, 1500);
        set((state) => ({
          activeDownloadPollers: { ...state.activeDownloadPollers, [repoId]: interval },
        }));
      }

      return job;
    } catch (err) {
      const message = typeof err === 'string' ? err : `Error al iniciar descarga de ${repoId}`;
      logError('modelStore', 'startDownload failed', err, { repoId });
      set({ error: message });
      return null;
    }
  },

  fetchDownloadProgress: async (repoId: string) => {
    try {
      const job = await invoke<DownloadJob>('get_download_progress', { repoId });
      set((state) => ({
        downloads: { ...state.downloads, [repoId]: job },
      }));
      return job;
    } catch (err) {
      logError('modelStore', 'fetchDownloadProgress failed', err, { repoId });
      return null;
    }
  },

  stopDownloadPoll: (repoId: string) => {
    const interval = get().activeDownloadPollers[repoId];
    if (interval) {
      window.clearInterval(interval);
      set((state) => {
        const next = { ...state.activeDownloadPollers };
        delete next[repoId];
        return { activeDownloadPollers: next };
      });
    }
  },

  fetchConfig: async () => {
    try {
      const config = await invoke<ModelConfig>('get_model_config');
      return config;
    } catch (err) {
      logError('modelStore', 'fetchConfig failed', err);
      return null;
    }
  },

  switchMode: async (mode: 'shared' | 'dedicated') => {
    set({ isLoading: true, error: null });

    try {
      await invoke<ModelConfig>('switch_model_mode', { mode });
      await get().fetchStatus();
      set({ isLoading: false });
      return true;
    } catch (err) {
      const message = typeof err === 'string' ? err : 'Error al cambiar modo de modelos';
      logError('modelStore', 'switchMode failed', err, { mode });
      set({ error: message, isLoading: false });
      return false;
    }
  },

  refresh: async () => {
    await get().fetchStatus();
  },

  getActiveModels: () => {
    const { status } = get();
    return status?.models ?? [];
  },

  getMissingCriticalModels: () => {
    const { status } = get();
    if (!status) return [];
    return status.models.filter(
      (m) => !m.installed && (m.role === 'VoiceClone' || m.role === 'TTS')
    );
  },

  isUsingShared: () => {
    const { status } = get();
    return status?.config.mode === 'shared';
  },

  isDownloadingModel: (repoId: string) => {
    const job = get().downloads[repoId];
    return !!job && (job.status === 'pending' || job.status === 'downloading');
  },
}));

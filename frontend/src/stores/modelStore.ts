import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { ModelStatus, ModelConfig, ModelInfo } from '../types';

interface ModelState {
  // State
  status: ModelStatus | null;
  catalog: any | null;           // Catálogo oficial + estado de instalación
  isLoading: boolean;
  isCopying: boolean;            // Copia en progreso (elegante para UX)
  error: string | null;
  lastFetched: number | null;

  // Actions
  fetchStatus: () => Promise<void>;
  fetchCatalog: () => Promise<void>;
  fetchConfig: () => Promise<ModelConfig | null>;
  switchMode: (mode: 'shared' | 'dedicated') => Promise<boolean>;
  copyToDedicated: (repoIds: string[]) => Promise<any>;
  getLastCopyResult: () => any;
  refresh: () => Promise<void>;

  // Helpers
  getActiveModels: () => ModelInfo[];
  getMissingCriticalModels: () => ModelInfo[];
  isUsingShared: () => boolean;
}

export const useModelStore = create<ModelState>((set, get) => ({
  status: null,
  catalog: null,
  isLoading: false,
  isCopying: false,
  error: null,
  lastFetched: null,

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
      set({ error: message, isLoading: false });
      console.error('[modelStore] fetchStatus failed:', err);
    }
  },

  // Devuelve el último resultado de copia (útil después de refrescar)
  getLastCopyResult: () => {
    return get().status?.last_copy_result ?? null;
  },

  fetchCatalog: async () => {
    set({ isLoading: true, error: null });

    try {
      const result = await invoke<any>('get_model_catalog');
      set({
        catalog: result,
        isLoading: false,
        lastFetched: Date.now(),
      });
    } catch (err) {
      const message = typeof err === 'string' ? err : 'Error al obtener catálogo de modelos';
      set({ error: message, isLoading: false });
      console.error('[modelStore] fetchCatalog failed:', err);
    }
  },

  copyToDedicated: async (repoIds: string[]) => {
    if (repoIds.length === 0) return null;

    set({ isLoading: true, isCopying: true, error: null });

    try {
      const result = await invoke<any>('copy_models_to_dedicated', { repoIds });
      // Refrescamos para actualizar installed + copy_in_progress
      await get().fetchStatus();
      set({ isLoading: false, isCopying: false });
      return result;
    } catch (err) {
      const message = typeof err === 'string' ? err : 'Error al copiar modelos a carpeta dedicada';
      set({ error: message, isLoading: false, isCopying: false });
      console.error('[modelStore] copyToDedicated failed:', err);
      return null;
    }
  },

  fetchConfig: async () => {
    try {
      const config = await invoke<ModelConfig>('get_model_config');
      return config;
    } catch (err) {
      console.error('[modelStore] fetchConfig failed:', err);
      return null;
    }
  },

  switchMode: async (mode: 'shared' | 'dedicated') => {
    set({ isLoading: true, error: null });

    try {
      await invoke<ModelConfig>('switch_model_mode', { mode });

      // Refrescar el estado completo después del cambio
      await get().fetchStatus();

      set({ isLoading: false });
      return true;
    } catch (err) {
      const message = typeof err === 'string' ? err : 'Error al cambiar modo de modelos';
      set({ error: message, isLoading: false });
      console.error('[modelStore] switchMode failed:', err);
      return false;
    }
  },

  refresh: async () => {
    await get().fetchStatus();
  },

  // Helpers
  getActiveModels: () => {
    const { status } = get();
    return status?.models ?? [];
  },

  getMissingCriticalModels: () => {
    const { status } = get();
    if (!status) return [];
    // Por ahora consideramos "críticos" los de VoiceClone y TTS
    return status.models.filter(
      m => !m.installed && (m.role === 'VoiceClone' || m.role === 'TTS')
    );
  },

  isUsingShared: () => {
    const { status } = get();
    return status?.config.mode === 'shared';
  },
}));

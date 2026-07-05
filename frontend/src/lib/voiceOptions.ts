import { GenerationOptions } from '../types';

export const OPTIONS_STORAGE_KEY = 'omniclon2-generation-options';

export const DEFAULT_GENERATION_OPTIONS: GenerationOptions = {
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

export function loadStoredOptions(): GenerationOptions {
  try {
    const raw = localStorage.getItem(OPTIONS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GENERATION_OPTIONS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_GENERATION_OPTIONS, ...parsed };
  } catch {
    return { ...DEFAULT_GENERATION_OPTIONS };
  }
}

export function storeOptions(options: GenerationOptions) {
  try {
    localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options));
  } catch {
    // ignore
  }
}

export function optionsDifferFromDefault(options: GenerationOptions): boolean {
  return JSON.stringify(options) !== JSON.stringify(DEFAULT_GENERATION_OPTIONS);
}

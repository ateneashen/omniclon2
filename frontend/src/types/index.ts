// Core types for OmniClon 2

export interface MediaClip {
  id: string;
  name: string;
  path: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  thumbnail?: string;
}

export interface WaveformData {
  samples: number[];
  sampleRate: number;
  duration: number;
  channels: number;
}

export interface Region {
  start: number;
  end: number;
}

export interface VoiceProfile {
  id: string;
  name: string;
  refAudioPath: string;
  refText?: string;
  emotion?: string;
  tags: string[];
  modelId?: string;
  createdAt: number;
}

// Voice Reference extracted from A/B region (core of the professional cloning flow)
export interface VoiceReference {
  audioPath: string;
  duration: number;
  sourceClipId?: string;
  sourceClipName?: string;
  extractedAt: number; // timestamp
}

// ============================================
// Model Management (Opción B - Fase B1+)
// ============================================

export type ModelRole = "TTS" | "ASR" | "Diarization" | "VoiceClone";

export type ModelLocation = "shared" | "dedicated" | "hf_cache" | "missing";

export interface ModelInfo {
  repo_id: string;           // e.g. "k2-fsa/OmniVoice"
  label: string;
  role: ModelRole;
  size_gb: number;
  installed: boolean;
  location: ModelLocation;
  path?: string;
  last_used?: number;
}

export interface ModelConfig {
  mode: "shared" | "dedicated";
  shared_path?: string;      // Ruta a la carpeta de modelos de OmniVoice (si existe)
  dedicated_path: string;    // Siempre la carpeta propia de OmniClon2
  preferred_models: string[]; // repo_ids que el usuario quiere priorizar
}

export interface ModelStatus {
  config: ModelConfig;
  models: ModelInfo[];
  active_root: string;           // Carpeta actualmente activa
  total_models: number;
  installed_models: number;
  copy_in_progress?: boolean;    // True mientras se está copiando (B2)
  last_copy_result?: any;        // Resultado de la última copia (B2)
}

// Backend status types (mirror from Rust)
export type BackendStatusType = 
  | { NotStarted: null }
  | { Starting: null }
  | { Running: { pid: number } }
  | { Failed: { error: string } }
  | { Stopped: null };

export interface BootstrapStatus {
  backend_status: BackendStatusType;
  is_healthy: boolean;
  stage: string;
  message: string | null;
}
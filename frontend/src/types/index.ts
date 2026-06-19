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

export interface WaveformSample {
  min: number;
  max: number;
}

export interface WaveformData {
  samples: WaveformSample[];
  sampleRate: number;
  duration: number;
  channels: number;
}

export interface SubtitleTrack {
  index: number;
  codec_name: string;
  language: string;
  title: string;
}

export interface AudioTrack {
  index: number;
  codec_name: string;
  language: string;
  title: string;
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

// Voice generation tuning options (from /voice/generate_options)
export interface GenerateOption {
  type: "float" | "int" | "bool" | "select" | "string";
  min?: number;
  max?: number;
  step?: number;
  default?: any;
  choices?: string[];
  label: string;
}

export interface GenerateOptionsResponse {
  options: Record<string, GenerateOption>;
}

export interface GenerationOptions {
  speed: number;
  num_step: number;
  guidance_scale: number;
  denoise: boolean;
  postprocess_output: boolean;
  language: string;
  instruct: string;
  duration: number | "";
  t_shift: number | "";
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

// Saved synthesis script (prompt) for re-use during the app session
export interface ScriptItem {
  id: string;
  title: string;
  text: string;
  createdAt: number;
  // Optional context captured when the script was saved
  refText?: string;
  clipId?: string | null;
  clipPath?: string | null;
  clipName?: string | null;
  region?: { start: number; end: number } | null;
}
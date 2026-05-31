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
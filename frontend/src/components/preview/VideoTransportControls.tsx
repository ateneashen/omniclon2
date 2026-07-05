import { useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  ChevronsLeft,
  Camera,
  FolderOutput,
} from 'lucide-react';
import NleIconButton from '../ui/NleIconButton';

interface VideoTransportControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLooping: boolean;
  muted: boolean;
  region?: { start: number; end: number } | null;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onToggleLoop: () => void;
  onToggleMute: () => void;
  onCaptureFrame?: () => void;
  onCaptureFrameAs?: () => void;
  isCapturing?: boolean;
}

function formatTimecode(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
  return `${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

export default function VideoTransportControls({
  isPlaying,
  currentTime,
  duration,
  isLooping,
  muted,
  region,
  onPlayPause,
  onSeek,
  onToggleLoop,
  onToggleMute,
  onCaptureFrame,
  onCaptureFrameAs,
  isCapturing = false,
}: VideoTransportControlsProps) {
  const skip = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(duration, currentTime + delta));
      onSeek(next);
    },
    [currentTime, duration, onSeek]
  );

  const jumpToStart = useCallback(() => onSeek(0), [onSeek]);
  const jumpToRegionStart = useCallback(
    () => region && onSeek(region.start),
    [region, onSeek]
  );
  const jumpToRegionEnd = useCallback(
    () => region && onSeek(region.end),
    [region, onSeek]
  );

  const hasRegion = !!region && region.end > region.start;

  return (
    <div className="absolute bottom-0 left-0 right-0 px-2 sm:px-4 pb-2 sm:pb-3 pt-10 sm:pt-12 bg-gradient-to-t from-black/95 via-black/55 to-transparent flex flex-col items-center justify-end pointer-events-none z-20">
      <div className="pointer-events-auto w-full max-w-3xl flex items-center gap-1.5 sm:gap-3 bg-[#1a1a1a]/92 backdrop-blur-md rounded-md px-2 sm:px-3 py-1.5 sm:py-2 border border-white/[0.08] shadow-2xl overflow-x-auto">
        {/* Timecode block */}
        <div className="flex flex-col min-w-[108px]">
          <span className="text-[8px] uppercase tracking-widest text-white/35">Timecode</span>
          <span className="nle-timecode text-sm text-[#f5c542] font-medium">
            {formatTimecode(currentTime)}
          </span>
          <span className="nle-timecode text-[9px] text-white/40">
            / {formatTimecode(duration)}
          </span>
        </div>

        <div className="w-px h-10 bg-white/[0.08]" />

        {/* Transport cluster */}
        <div className="flex items-center gap-0.5 flex-1 justify-center">
          <NleIconButton
            icon={<ChevronsLeft size={16} />}
            label="Ir al inicio"
            onClick={jumpToStart}
            size="md"
          />
          <NleIconButton
            icon={<SkipBack size={16} />}
            label="Ir al punto A"
            onClick={jumpToRegionStart}
            disabled={!hasRegion}
            size="md"
          />
          <NleIconButton
            icon={<RotateCcw size={16} />}
            label="Retroceder 5 segundos"
            onClick={() => skip(-5)}
            size="md"
          />

          <button
            type="button"
            onClick={onPlayPause}
            className="mx-1 w-11 h-11 rounded-md bg-[#00b4d8] text-black flex items-center justify-center hover:bg-[#33c4e0] active:scale-95 transition shadow-lg shadow-[#00b4d8]/20"
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            title={isPlaying ? 'Pausar' : 'Reproducir'}
          >
            {isPlaying ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" className="ml-0.5" />
            )}
          </button>

          <NleIconButton
            icon={<SkipForward size={16} />}
            label="Avanzar 5 segundos"
            onClick={() => skip(5)}
            size="md"
          />
          <NleIconButton
            icon={<SkipForward size={16} />}
            label="Ir al punto B"
            onClick={jumpToRegionEnd}
            disabled={!hasRegion}
            size="md"
          />
        </div>

        <div className="w-px h-10 bg-white/[0.08]" />

        {/* Audio / loop */}
        <div className="flex items-center gap-0.5">
          <NleIconButton
            icon={isLooping ? <Repeat1 size={16} /> : <Repeat size={16} />}
            label={isLooping ? 'Desactivar bucle A-B' : 'Bucle A-B'}
            onClick={onToggleLoop}
            active={isLooping}
            size="md"
          />
          <NleIconButton
            icon={muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            label={muted ? 'Activar audio' : 'Silenciar'}
            onClick={onToggleMute}
            active={muted}
            size="md"
          />
        </div>

        {onCaptureFrame && (
          <>
            <div className="w-px h-10 bg-white/[0.08]" />
            <div className="flex items-center gap-0.5">
              <NleIconButton
                icon={<Camera size={16} />}
                label="Capturar frame (carpeta por defecto)"
                onClick={onCaptureFrame}
                disabled={isCapturing}
                size="md"
              />
              {onCaptureFrameAs && (
                <NleIconButton
                  icon={<FolderOutput size={16} />}
                  label="Guardar captura en otra carpeta…"
                  onClick={onCaptureFrameAs}
                  disabled={isCapturing}
                  size="md"
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

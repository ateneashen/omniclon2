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
} from 'lucide-react';

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
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
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
    <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 pt-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col items-center justify-end pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-full px-4 py-2 border border-white/10 shadow-lg">
        {/* Time */}
        <div className="text-xs font-medium text-white/90 tabular-nums min-w-[92px] text-center select-none">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        <div className="w-px h-6 bg-white/10 mx-1" />

        {/* Region jumps */}
        <TransportButton
          icon={<SkipBack size={18} />}
          label="Go to region start (A)"
          onClick={jumpToRegionStart}
          disabled={!hasRegion}
        />

        {/* Skip backward */}
        <TransportButton
          icon={<RotateCcw size={18} />}
          label="Skip back 5 seconds"
          onClick={() => skip(-5)}
        />

        {/* Play/Pause */}
        <button
          onClick={onPlayPause}
          className="mx-1 w-12 h-12 rounded-full bg-[#00b4d8] text-black flex items-center justify-center hover:bg-[#0099b8] hover:scale-105 active:scale-95 transition shadow-md"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={isPlaying ? 'Pause playback' : 'Start playback'}
        >
          {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
        </button>

        {/* Skip forward */}
        <TransportButton
          icon={<SkipForward size={18} />}
          label="Skip forward 5 seconds"
          onClick={() => skip(5)}
        />

        <TransportButton
          icon={<SkipForward size={18} />}
          label="Go to region end (B)"
          onClick={jumpToRegionEnd}
          disabled={!hasRegion}
        />

        <div className="w-px h-6 bg-white/10 mx-1" />

        {/* Loop A/B */}
        <TransportButton
          icon={isLooping ? <Repeat1 size={18} /> : <Repeat size={18} />}
          label={isLooping ? 'Disable A-B loop' : 'Loop A-B region'}
          onClick={onToggleLoop}
          active={isLooping}
        />

        {/* Mute */}
        <TransportButton
          icon={muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          label={muted ? 'Unmute video' : 'Mute video'}
          onClick={onToggleMute}
          active={muted}
        />

        <div className="w-px h-6 bg-white/10 mx-1" />

        {/* Start */}
        <TransportButton
          icon={<span className="text-[10px] font-bold leading-none">|<br />←</span>}
          label="Go to start"
          onClick={jumpToStart}
        />
      </div>
    </div>
  );
}

interface TransportButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

function TransportButton({ icon, label, onClick, disabled, active }: TransportButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-9 h-9 rounded-full flex items-center justify-center transition
        ${active
          ? 'bg-[#00b4d8]/20 text-[#00b4d8]'
          : 'text-white/70 hover:text-white hover:bg-white/10'}
        ${disabled ? 'opacity-30 cursor-not-allowed hover:bg-transparent hover:text-white/70' : ''}
      `}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

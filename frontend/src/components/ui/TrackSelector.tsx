import { ReactNode } from 'react';

interface TrackOption {
  value: number;
  label: string;
  meta?: string;
}

interface TrackSelectorProps {
  icon: ReactNode;
  label: string;
  accent?: 'audio' | 'subtitle' | 'video';
  value: number | null;
  options: TrackOption[];
  onChange: (value: number | null) => void;
  emptyLabel?: string;
}

const accentColors = {
  audio: 'text-[#3ecf8e]',
  subtitle: 'text-[#c9a0ff]',
  video: 'text-[#5b8def]',
};

const accentBorders = {
  audio: 'border-[#3ecf8e]/30',
  subtitle: 'border-[#c9a0ff]/30',
  video: 'border-[#5b8def]/30',
};

export default function TrackSelector({
  icon,
  label,
  accent = 'audio',
  value,
  options,
  onChange,
  emptyLabel = 'No tracks',
}: TrackSelectorProps) {
  if (options.length === 0) return null;

  return (
    <div className={`nle-track-pill ${value !== null ? 'nle-track-pill--active' : ''}`}>
      <div className={`flex items-center gap-1 shrink-0 ${accentColors[accent]}`}>
        {icon}
        <span className="text-[9px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className={`flex-1 min-w-0 bg-transparent border-0 outline-none text-[10px] text-white/80 cursor-pointer ${accentBorders[accent]}`}
        aria-label={label}
      >
        {options.length === 0 && <option value="">{emptyLabel}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[#1a1a1a]">
            {opt.label}{opt.meta ? ` • ${opt.meta}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

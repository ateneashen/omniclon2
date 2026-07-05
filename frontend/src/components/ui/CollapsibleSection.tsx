import { useState, ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  accent?: 'default' | 'audio' | 'video';
  summary?: ReactNode;
}

const accentBar = {
  default: 'bg-white/30',
  audio: 'bg-[#3ecf8e]',
  video: 'bg-[#5b8def]',
};

const accentBorder = {
  default: 'border-white/[0.1]',
  audio: 'border-[#3ecf8e]/20',
  video: 'border-[#5b8def]/20',
};

export default function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  className = '',
  accent = 'default',
  summary,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={`rounded-md border transition-colors ${accentBorder[accent]} ${
        open ? 'bg-[#1a1a1a] border-opacity-100' : 'bg-[#151515]'
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 transition group ${
          open
            ? 'text-white/90 bg-white/[0.03] border-b border-white/[0.06]'
            : 'text-white/65 hover:text-white/85 hover:bg-white/[0.04]'
        }`}
        aria-expanded={open}
      >
        <span className={`w-1 h-4 rounded-full shrink-0 ${accentBar[accent]}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider flex-1 text-left leading-snug">
          {title}
        </span>
        {!open && summary && (
          <span className="text-[9px] text-white/35 normal-case tracking-normal font-normal truncate max-w-[45%]">
            {summary}
          </span>
        )}
        {open ? (
          <ChevronDown size={14} className="text-white/40 group-hover:text-white/60 shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-white/40 group-hover:text-white/60 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-3 py-3 bg-black/25 space-y-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

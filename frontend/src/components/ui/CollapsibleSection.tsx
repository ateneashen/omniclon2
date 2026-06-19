import { useState, ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export default function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  className = '',
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`bg-[#1a1a1a] border border-white/10 rounded overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-white/70 hover:bg-white/5 transition"
      >
        <span className="text-xs">{title}</span>
        <span className="text-[10px] text-white/40">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}

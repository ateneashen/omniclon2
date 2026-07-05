interface NleSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue?: string;
  onChange: (value: number) => void;
}

export default function NleSlider({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: NleSliderProps) {
  return (
    <label className="block">
      <span className="text-[10px] text-white/50 flex justify-between mb-1">
        <span>{label}</span>
        <span className="nle-timecode text-white/70">{displayValue ?? value}</span>
      </span>
      <input
        type="range"
        className="nle-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

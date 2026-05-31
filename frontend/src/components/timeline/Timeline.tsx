import { useRef, useEffect, useState, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';

const PADDING = 48;
const WAVE_HEIGHT = 68;
const RULER_HEIGHT = 26;

export default function Timeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    waveform,
    duration,
    currentTime,
    region,
    zoom,
    isPlaying,
    isLooping,
    setCurrentTime,
    setRegion,
    setPlaying,
  } = useEditorStore();

  const [isDragging, setIsDragging] = useState<'playhead' | 'a' | 'b' | null>(null);

  const pixelsPerSecond = 80 * zoom;
  const totalWidth = duration * pixelsPerSecond + PADDING * 2;

  const timeToX = useCallback((t: number) => PADDING + t * pixelsPerSecond, [pixelsPerSecond]);
  const xToTime = useCallback((x: number) => Math.max(0, Math.min(duration, (x - PADDING) / pixelsPerSecond)), [pixelsPerSecond, duration]);

  // Draw timeline
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(totalWidth, 800);
    const height = RULER_HEIGHT + WAVE_HEIGHT + 16;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, width, height);

    // Ruler
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, RULER_HEIGHT);

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT - 0.5);
    ctx.lineTo(width, RULER_HEIGHT - 0.5);
    ctx.stroke();

    // Time markers
    ctx.fillStyle = '#666';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';

    const step = zoom > 2 ? 0.5 : zoom > 0.5 ? 1 : 5;
    for (let t = 0; t <= duration; t += step) {
      const x = timeToX(t);
      const isMajor = t % (step * 2) === 0;

      ctx.strokeStyle = isMajor ? '#444' : '#2a2a2a';
      ctx.beginPath();
      ctx.moveTo(x, RULER_HEIGHT - (isMajor ? 10 : 5));
      ctx.lineTo(x, RULER_HEIGHT);
      ctx.stroke();

      if (isMajor) {
        ctx.fillText(t.toFixed(1) + 's', x, RULER_HEIGHT - 14);
      }
    }

    // Waveform area
    const waveY = RULER_HEIGHT + 4;
    ctx.fillStyle = '#111';
    ctx.fillRect(PADDING, waveY, duration * pixelsPerSecond, WAVE_HEIGHT);

    // Draw waveform
    if (waveform && waveform.samples.length > 0) {
      const samples = waveform.samples;
      const samplesPerPixel = Math.max(1, Math.floor(samples.length / (duration * pixelsPerSecond)));

      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;

      for (let px = 0; px < duration * pixelsPerSecond; px++) {
        const idx = Math.floor(px * samplesPerPixel);
        const sample = samples[Math.min(idx, samples.length - 1)] || 0;
        const h = Math.max(1, sample * WAVE_HEIGHT * 0.95);

        const x = PADDING + px;
        ctx.beginPath();
        ctx.moveTo(x, waveY + WAVE_HEIGHT / 2 - h / 2);
        ctx.lineTo(x, waveY + WAVE_HEIGHT / 2 + h / 2);
        ctx.stroke();
      }

      // A-B region highlight
      if (region.end > region.start) {
        const aX = timeToX(region.start);
        const bX = timeToX(region.end);

        ctx.fillStyle = 'rgba(0, 180, 216, 0.15)';
        ctx.fillRect(aX, waveY, bX - aX, WAVE_HEIGHT);

        // A handle
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(aX - 1, waveY, 3, WAVE_HEIGHT);
        ctx.font = 'bold 11px Inter, system-ui';
        ctx.fillText('A', aX + 6, waveY + 14);

        // B handle
        ctx.fillStyle = '#4ecdc4';
        ctx.fillRect(bX - 2, waveY, 3, WAVE_HEIGHT);
        ctx.fillText('B', bX - 14, waveY + 14);
      }
    }

    // Playhead
    const playX = timeToX(currentTime);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, height);
    ctx.stroke();

    // Playhead triangle
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX - 6, 9);
    ctx.lineTo(playX + 6, 9);
    ctx.closePath();
    ctx.fill();
  }, [waveform, duration, currentTime, region, zoom, pixelsPerSecond, timeToX]);

  // Mouse handling for A/B and playhead
  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const time = xToTime(x);

    const aX = timeToX(region.start);
    const bX = timeToX(region.end);

    if (Math.abs(x - aX) < 12) {
      setIsDragging('a');
    } else if (Math.abs(x - bX) < 12) {
      setIsDragging('b');
    } else {
      setIsDragging('playhead');
      setCurrentTime(time);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const time = xToTime(x);

    if (isDragging === 'playhead') {
      setCurrentTime(time);
    } else if (isDragging === 'a') {
      setRegion({ start: Math.min(time, region.end - 0.05) });
    } else if (isDragging === 'b') {
      setRegion({ end: Math.max(time, region.start + 0.05) });
    }
  };

  const handleMouseUp = () => setIsDragging(null);

  return (
    <div
      ref={containerRef}
      className="h-36 bg-[#0a0a0a] border-t border-white/10 overflow-x-auto select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        className="cursor-col-resize"
      />
    </div>
  );
}
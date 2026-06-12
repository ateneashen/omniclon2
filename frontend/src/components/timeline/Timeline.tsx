import { useRef, useEffect, useState, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';

const PADDING = 48;
const WAVE_HEIGHT = 68;
const RULER_HEIGHT = 26;

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

export default function Timeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    waveform,
    duration,
    currentTime,
    region,
    zoom,
    setCurrentTime,
    setRegion,
    setZoom,
  } = useEditorStore();

  const [isDragging, setIsDragging] = useState<'playhead' | 'a' | 'b' | null>(null);

  const pixelsPerSecond = 80 * zoom;
  const totalWidth = duration * pixelsPerSecond + PADDING * 2;

  const timeToX = useCallback((t: number) => PADDING + t * pixelsPerSecond, [pixelsPerSecond]);
  const xToTime = useCallback(
    (x: number) => Math.max(0, Math.min(duration, (x - PADDING) / pixelsPerSecond)),
    [pixelsPerSecond, duration]
  );

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
      const isMajor = Math.abs(t % (step * 2)) < 0.001;

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

    // Draw waveform with min/max filled rects
    if (waveform && waveform.samples.length > 0 && duration > 0) {
      const samples = waveform.samples;
      const totalPixels = Math.max(1, Math.floor(duration * pixelsPerSecond));
      const samplesPerPixel = Math.max(1, Math.floor(samples.length / totalPixels));

      ctx.fillStyle = '#555';

      for (let px = 0; px < totalPixels; px++) {
        const startIdx = px * samplesPerPixel;
        const endIdx = Math.min(startIdx + samplesPerPixel, samples.length);

        let minSample = 0;
        let maxSample = 0;
        for (let i = startIdx; i < endIdx; i++) {
          const s = samples[i] || 0;
          if (s < minSample) minSample = s;
          if (s > maxSample) maxSample = s;
        }

        const centerY = waveY + WAVE_HEIGHT / 2;
        const minY = centerY - Math.max(1, Math.abs(minSample) * (WAVE_HEIGHT / 2) * 0.95);
        const maxY = centerY + Math.max(1, Math.abs(maxSample) * (WAVE_HEIGHT / 2) * 0.95);

        const x = PADDING + px;
        ctx.fillRect(x, minY, 1, maxY - minY);
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

        // A/B duration label
        const durationText = formatSeconds(region.end - region.start);
        ctx.fillStyle = '#fff';
        ctx.font = '10px Inter, system-ui';
        ctx.textAlign = 'center';
        const labelX = (aX + bX) / 2;
        const labelY = waveY + WAVE_HEIGHT - 6;
        const textWidth = ctx.measureText(durationText).width;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(labelX - textWidth / 2 - 3, labelY - 10, textWidth + 6, 14);
        ctx.fillStyle = '#fff';
        ctx.fillText(durationText, labelX, labelY);
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

  // Auto-scroll to keep playhead visible
  useEffect(() => {
    const container = containerRef.current;
    if (!container || isDragging) return;

    const playX = timeToX(currentTime);
    const padding = 48;
    const left = container.scrollLeft;
    const right = left + container.clientWidth;

    if (playX < left + padding) {
      container.scrollLeft = Math.max(0, playX - padding);
    } else if (playX > right - padding) {
      container.scrollLeft = playX - container.clientWidth + padding;
    }
  }, [currentTime, timeToX, isDragging]);

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

  const handleZoomIn = () => setZoom(zoom * 1.25);
  const handleZoomOut = () => setZoom(zoom / 1.25);
  const handleZoomReset = () => setZoom(1);

  return (
    <div className="border-t border-white/10 bg-[#111] shrink-0">
      <div className="flex items-center justify-between px-3 py-1 text-xs border-b border-white/10">
        <div className="text-white/50">
          {region.end > region.start ? (
            <>A/B: {region.start.toFixed(2)}s — {region.end.toFixed(2)}s ({(region.end - region.start).toFixed(2)}s)</>
          ) : (
            <>No A/B region selected</>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="px-2 py-0.5 bg-white/10 rounded hover:bg-white/15 transition"
            title="Zoom out"
          >
            −
          </button>
          <button
            onClick={handleZoomReset}
            className="px-2 py-0.5 bg-white/10 rounded hover:bg-white/15 transition"
            title="Reset zoom"
          >
            {zoom.toFixed(1)}x
          </button>
          <button
            onClick={handleZoomIn}
            className="px-2 py-0.5 bg-white/10 rounded hover:bg-white/15 transition"
            title="Zoom in"
          >
            +
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="h-36 bg-[#0a0a0a] overflow-x-auto select-none"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <canvas ref={canvasRef} onMouseDown={handleMouseDown} className="cursor-col-resize" />
      </div>
    </div>
  );
}

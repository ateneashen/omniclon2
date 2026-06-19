import { useRef, useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useEditorStore } from '../../stores/editorStore';
import { MediaClip, WaveformData } from '../../types';

const PADDING = 48;
const WAVE_HEIGHT = 68;
const RULER_HEIGHT = 26;
const HANDLE_WIDTH = 10;
const HANDLE_HIT_RADIUS = 20;
// Browser canvas width limits (Chrome ~32k). Keep well below that so very
// long videos (e.g. 1800s) still render instead of producing a blank timeline.
const MAX_CANVAS_WIDTH = 12000;
// Cap the detail we re-extract to avoid huge temporary WAVs.
const MAX_WAVEFORM_POINTS = 20000;

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

function niceStep(raw: number): number {
  const steps = [
    0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15,
    20, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200,
  ];
  for (const s of steps) {
    if (s >= raw) return s;
  }
  return steps[steps.length - 1];
}

function formatTime(seconds: number, step: number, duration: number): string {
  const sign = seconds < 0 ? '-' : '';
  const t = Math.abs(seconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  if (duration >= 3600) {
    return `${sign}${h}:${m.toString().padStart(2, '0')}:${s
      .toFixed(decimals)
      .padStart(decimals > 0 ? 3 + decimals : 2, '0')}`;
  }
  if (duration >= 60) {
    return `${sign}${m}:${s.toFixed(decimals).padStart(decimals > 0 ? 3 + decimals : 2, '0')}`;
  }
  return `${sign}${seconds.toFixed(decimals)}s`;
}

export default function Timeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const waveform = useEditorStore((s) => s.waveform);
  const duration = useEditorStore((s) => s.duration);
  const currentTime = useEditorStore((s) => s.currentTime);
  const region = useEditorStore((s) => s.region);
  const zoom = useEditorStore((s) => s.zoom);
  const clips = useEditorStore((s) => s.clips);
  const activeClipId = useEditorStore((s) => s.activeClipId);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setRegion = useEditorStore((s) => s.setRegion);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setWaveform = useEditorStore((s) => s.setWaveform);
  const selectedAudioTrack = useEditorStore((s) => s.selectedAudioTrack);
  const setMarkA = useEditorStore((s) => s.setMarkA);
  const setMarkB = useEditorStore((s) => s.setMarkB);
  const resetRegion = useEditorStore((s) => s.resetRegion);

  const activeClip = clips.find((c: MediaClip) => c.id === activeClipId);

  const [isDragging, setIsDragging] = useState<'playhead' | 'a' | 'b' | null>(null);
  const [hoverHandle, setHoverHandle] = useState<'a' | 'b' | null>(null);

  const pixelsPerSecond = 80 * zoom;
  // Clamp the effective resolution so the canvas never exceeds the browser limit.
  const effectivePixelsPerSecond =
    duration > 0 ? Math.min(pixelsPerSecond, MAX_CANVAS_WIDTH / duration) : pixelsPerSecond;
  const totalWidth = duration * effectivePixelsPerSecond + PADDING * 2;

  const timeToX = useCallback((t: number) => PADDING + t * effectivePixelsPerSecond, [effectivePixelsPerSecond]);
  const xToTime = useCallback(
    (x: number) => Math.max(0, Math.min(duration, (x - PADDING) / effectivePixelsPerSecond)),
    [effectivePixelsPerSecond, duration]
  );

  // Auto-fit the whole clip into the timeline viewport when a new clip loads.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || duration <= 0) return;
    const containerWidth = container.clientWidth;
    if (containerWidth <= 0) return;
    const desiredZoom = (containerWidth - PADDING * 2) / (duration * 80);
    setZoom(Math.max(0.0001, Math.min(100, desiredZoom)));
  }, [duration, setZoom]);

  // Re-extract waveform at higher resolution when zooming in so the canvas never
  // runs out of samples per pixel.
  useEffect(() => {
    if (!activeClip || duration <= 0 || !waveform) return;
    const visibleWidth = duration * effectivePixelsPerSecond;
    const neededPoints = Math.ceil(visibleWidth * 2);
    const currentPoints = waveform.samples.length;
    if (neededPoints <= currentPoints * 1.2 || currentPoints >= MAX_WAVEFORM_POINTS) return;

    const targetPoints = Math.min(MAX_WAVEFORM_POINTS, neededPoints);
    invoke<WaveformData>('extract_waveform', {
      path: activeClip.path,
      duration,
      target_points: targetPoints,
      audioTrackIndex: selectedAudioTrack ?? undefined,
    })
      .then((wf) => setWaveform(wf))
      .catch((err) => console.error('Failed to re-extract waveform:', err));
  }, [zoom, effectivePixelsPerSecond, duration, activeClip, waveform, setWaveform, selectedAudioTrack]);

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

    // Time markers — adaptive step so tick density stays readable at any zoom.
    ctx.fillStyle = '#666';
    ctx.font = '11px Inter, system-ui, sans-serif';

    const targetPixelSpacing = 80;
    const step = niceStep(targetPixelSpacing / Math.max(0.0001, effectivePixelsPerSecond));
    const majorStep = step * 5;
    const firstTick = Math.floor(0 / step) * step;
    const count = Math.ceil(duration / step) + 2;

    for (let i = 0; i <= count; i++) {
      const t = firstTick + i * step;
      if (t < 0 || t > duration) continue;
      const x = timeToX(t);
      const isMajor = Math.abs(t % majorStep) < step * 0.01;
      const isLast = Math.abs(t - duration) < step * 0.01;

      ctx.strokeStyle = isMajor ? '#444' : '#2a2a2a';
      ctx.beginPath();
      ctx.moveTo(x, RULER_HEIGHT - (isMajor ? 10 : 5));
      ctx.lineTo(x, RULER_HEIGHT);
      ctx.stroke();

      if (isMajor) {
        const label = formatTime(t, step, duration);
        ctx.fillStyle = '#888';
        if (t === 0) {
          ctx.textAlign = 'left';
          ctx.fillText(label, x + 2, RULER_HEIGHT - 14);
        } else if (isLast) {
          ctx.textAlign = 'right';
          ctx.fillText(label, x - 2, RULER_HEIGHT - 14);
        } else {
          ctx.textAlign = 'center';
          ctx.fillText(label, x, RULER_HEIGHT - 14);
        }
      }
    }

    // Waveform area
    const waveY = RULER_HEIGHT + 4;
    ctx.fillStyle = '#111';
    ctx.fillRect(PADDING, waveY, duration * effectivePixelsPerSecond, WAVE_HEIGHT);

    // Draw waveform with symmetric min/max bars and a vertical gradient
    if (waveform && waveform.samples.length > 0 && duration > 0) {
      const samples = waveform.samples;
      const totalPixels = Math.max(1, Math.floor(duration * effectivePixelsPerSecond));
      const samplesPerPixel = Math.max(1, Math.floor(samples.length / totalPixels));

      const centerY = waveY + WAVE_HEIGHT / 2;
      const gradient = ctx.createLinearGradient(0, waveY, 0, waveY + WAVE_HEIGHT);
      gradient.addColorStop(0, '#00b4d8');
      gradient.addColorStop(0.5, '#4ecdc4');
      gradient.addColorStop(1, '#0077b6');
      ctx.fillStyle = gradient;

      for (let px = 0; px < totalPixels; px++) {
        const startIdx = px * samplesPerPixel;
        const endIdx = Math.min(startIdx + samplesPerPixel, samples.length);

        let minSample = 0;
        let maxSample = 0;
        for (let i = startIdx; i < endIdx; i++) {
          const s = samples[i];
          if (s.min < minSample) minSample = s.min;
          if (s.max > maxSample) maxSample = s.max;
        }

        const minY = centerY - Math.max(1, Math.abs(minSample) * (WAVE_HEIGHT / 2) * 0.95);
        const maxY = centerY + Math.max(1, Math.abs(maxSample) * (WAVE_HEIGHT / 2) * 0.95);

        const x = PADDING + px;
        ctx.fillRect(x, minY, 1, maxY - minY);
      }

      // A-B region highlight
      if (region.end > region.start) {
        const aX = timeToX(region.start);
        const bX = timeToX(region.end);

        const regionGradient = ctx.createLinearGradient(0, waveY, 0, waveY + WAVE_HEIGHT);
        regionGradient.addColorStop(0, 'rgba(0, 180, 216, 0.22)');
        regionGradient.addColorStop(1, 'rgba(0, 180, 216, 0.06)');
        ctx.fillStyle = regionGradient;
        ctx.fillRect(aX, waveY, bX - aX, WAVE_HEIGHT);

        ctx.strokeStyle = 'rgba(0, 180, 216, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(aX, waveY);
        ctx.lineTo(aX, waveY + WAVE_HEIGHT);
        ctx.moveTo(bX, waveY);
        ctx.lineTo(bX, waveY + WAVE_HEIGHT);
        ctx.stroke();

        const drawHandle = (
          x: number,
          label: string,
          color: string,
          hovered: boolean
        ) => {
          const handleW = HANDLE_WIDTH + (hovered ? 2 : 0);
          const topY = waveY - 4;

          ctx.shadowColor = color;
          ctx.shadowBlur = hovered ? 10 : 4;
          ctx.fillStyle = color;

          // Vertical bar
          ctx.fillRect(x - handleW / 2, waveY, handleW, WAVE_HEIGHT);

          // Top flag
          ctx.beginPath();
          ctx.moveTo(x - 8, topY);
          ctx.lineTo(x + 8, topY);
          ctx.lineTo(x + 8, topY + 14);
          ctx.lineTo(x, topY + 18);
          ctx.lineTo(x - 8, topY + 14);
          ctx.closePath();
          ctx.fill();

          ctx.shadowBlur = 0;

          ctx.fillStyle = '#000';
          ctx.font = 'bold 10px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(label, x, topY + 11);
        };

        drawHandle(
          aX,
          'A',
          hoverHandle === 'a' || isDragging === 'a' ? '#ff8585' : '#ff6b6b',
          hoverHandle === 'a' || isDragging === 'a'
        );
        drawHandle(
          bX,
          'B',
          hoverHandle === 'b' || isDragging === 'b' ? '#6fe0d8' : '#4ecdc4',
          hoverHandle === 'b' || isDragging === 'b'
        );

        // A/B duration label
        const durationText = formatSeconds(region.end - region.start);
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        const labelX = (aX + bX) / 2;
        const labelY = waveY + WAVE_HEIGHT - 6;
        const textWidth = ctx.measureText(durationText).width;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(labelX - textWidth / 2 - 4, labelY - 10, textWidth + 8, 15);
        ctx.fillStyle = '#fff';
        ctx.fillText(durationText, labelX, labelY);
      }
    }

    // Playhead
    const playX = timeToX(currentTime);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, height);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Playhead triangle
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX - 7, 10);
    ctx.lineTo(playX + 7, 10);
    ctx.closePath();
    ctx.fill();
  }, [waveform, duration, currentTime, region, zoom, effectivePixelsPerSecond, timeToX, xToTime, hoverHandle, isDragging]);

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

  const getHandleAt = useCallback(
    (x: number) => {
      const aX = timeToX(region.start);
      const bX = timeToX(region.end);
      if (Math.abs(x - aX) < HANDLE_HIT_RADIUS) return 'a';
      if (Math.abs(x - bX) < HANDLE_HIT_RADIUS) return 'b';
      return null;
    },
    [region.start, region.end, timeToX]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const time = xToTime(x);
      const handle = getHandleAt(x);

      if (handle === 'a') {
        setIsDragging('a');
      } else if (handle === 'b') {
        setIsDragging('b');
      } else {
        setIsDragging('playhead');
        setCurrentTime(time);
      }
    },
    [getHandleAt, setCurrentTime]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const handle = getHandleAt(x);
      setHoverHandle(handle);
    },
    [getHandleAt]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMoveWindow = (e: MouseEvent) => {
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

    window.addEventListener('mousemove', handleMouseMoveWindow);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveWindow);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, region.start, region.end, setCurrentTime, setRegion, xToTime]);

  const handleZoomIn = () => setZoom(zoom * 1.25);
  const handleZoomOut = () => setZoom(zoom / 1.25);
  const handleZoomReset = () => setZoom(1);
  const handleZoomFit = () => {
    const container = containerRef.current;
    if (!container || duration <= 0) return;
    const desiredZoom = (container.clientWidth - PADDING * 2) / (duration * 80);
    setZoom(Math.max(0.0001, Math.min(100, desiredZoom)));
  };
  const handleAutoRegion = () => {
    const end = Math.min(duration, 5);
    setRegion({ start: 0, end });
  };

  const cursor = isDragging === 'a' || isDragging === 'b'
    ? 'cursor-ew-resize'
    : isDragging === 'playhead'
      ? 'cursor-col-resize'
      : hoverHandle
        ? 'cursor-ew-resize'
        : 'cursor-pointer';

  return (
    <div className="border-t border-white/10 bg-[#111] shrink-0">
      <div className="flex items-center justify-between px-3 py-1 text-xs border-b border-white/10">
        <div className="flex items-center gap-2 text-white/60">
          <button
            onClick={() => setMarkA(currentTime)}
            className="px-2 py-0.5 bg-[#ff6b6b]/20 text-[#ff6b6b] rounded hover:bg-[#ff6b6b]/30 transition"
            title="Set A at current playhead (shortcut: I)"
          >
            Set A
          </button>
          <button
            onClick={() => setMarkB(currentTime)}
            className="px-2 py-0.5 bg-[#4ecdc4]/20 text-[#4ecdc4] rounded hover:bg-[#4ecdc4]/30 transition"
            title="Set B at current playhead (shortcut: O)"
          >
            Set B
          </button>
          <button
            onClick={resetRegion}
            className="px-2 py-0.5 bg-white/10 text-white/70 rounded hover:bg-white/15 transition"
            title="Reset A/B to full clip (shortcut: R)"
          >
            Clear
          </button>
          <button
            onClick={handleAutoRegion}
            className="px-2 py-0.5 bg-white/10 text-white/70 rounded hover:bg-white/15 transition"
            title="Select the first 5 seconds as reference"
          >
            Auto 5s
          </button>
          <span className="text-white/40 hidden sm:inline">
            Drag red/green handles or use I/O keys
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-white/40 mr-1">
            {region.end > region.start
              ? `${formatSeconds(region.end - region.start)} selected`
              : 'No A/B selected'}
          </span>
          <button
            onClick={handleZoomOut}
            className="px-2 py-0.5 bg-white/10 rounded hover:bg-white/15 transition focus-visible:ring-1 focus-visible:ring-[#00b4d8]/50 outline-none"
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </button>
          <button
            onClick={handleZoomReset}
            className="px-2 py-0.5 bg-white/10 rounded hover:bg-white/15 transition focus-visible:ring-1 focus-visible:ring-[#00b4d8]/50 outline-none"
            aria-label="Reset zoom"
            title="Reset zoom"
          >
            {zoom < 0.1 ? zoom.toFixed(3) : zoom.toFixed(1)}x
          </button>
          <button
            onClick={handleZoomFit}
            className="px-2 py-0.5 bg-white/10 rounded hover:bg-white/15 transition focus-visible:ring-1 focus-visible:ring-[#00b4d8]/50 outline-none"
            aria-label="Fit to view"
            title="Fit whole clip to view"
          >
            Fit
          </button>
          <button
            onClick={handleZoomIn}
            className="px-2 py-0.5 bg-white/10 rounded hover:bg-white/15 transition focus-visible:ring-1 focus-visible:ring-[#00b4d8]/50 outline-none"
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
        </div>
      </div>
      <div ref={containerRef} className="relative h-36 bg-[#0a0a0a] overflow-x-auto select-none">
        {duration > 0 && duration < 1 && (
          <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10 px-2 py-0.5 rounded bg-yellow-600/80 text-[10px] text-white pointer-events-none">
            Clip is very short ({duration.toFixed(1)}s). Use 3-10s for best cloning results.
          </div>
        )}
        {duration > 0 && !waveform && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 px-3 py-1 rounded bg-black/70 text-[11px] text-white/80 pointer-events-none">
            Extracting waveform…
          </div>
        )}
        {duration > 0 && region.end === region.start && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 px-3 py-1 rounded bg-black/70 text-[11px] text-white/80 pointer-events-none">
            Set A and B to choose a reference segment
          </div>
        )}
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverHandle(null)}
          className={cursor}
          role="slider"
          aria-label="Timeline"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
          tabIndex={0}
        />
      </div>
    </div>
  );
}

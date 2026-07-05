import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Eraser,
  Timer,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { logError } from '../../lib/log';
import { MediaClip, WaveformData } from '../../types';
import NleIconButton from '../ui/NleIconButton';

const PADDING = 48;
const WAVE_HEIGHT = 68;
const VIDEO_TRACK_HEIGHT = 28;
const TRACK_GAP = 4;
const RULER_HEIGHT = 26;
const TRACK_HEADER_WIDTH = 72;
const BRACKET_ARM = 11;
const BRACKET_HIT_RADIUS = 22;
const PLAYHEAD_RADIUS = 10;
const PLAYHEAD_HIT_RADIUS = 16;
const RULER_HIT_EXTRA = 6;
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

function BracketInIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M10 5v14" />
      <path d="M10 5h5" />
      <path d="M10 19h5" />
    </svg>
  );
}

function BracketOutIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M14 5v14" />
      <path d="M9 5h5" />
      <path d="M9 19h5" />
    </svg>
  );
}

type DragTarget = 'playhead' | 'a' | 'b';
type HitTarget = DragTarget | null;

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

  const [isDragging, setIsDragging] = useState<DragTarget | null>(null);
  const [hoverTarget, setHoverTarget] = useState<HitTarget>(null);

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
      .catch((err) => logError('Timeline', 'Failed to re-extract waveform', err));
  }, [zoom, effectivePixelsPerSecond, duration, activeClip, waveform, setWaveform, selectedAudioTrack]);

  // Draw timeline
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(totalWidth, 800);
    const height = RULER_HEIGHT + VIDEO_TRACK_HEIGHT + TRACK_GAP + WAVE_HEIGHT + 16;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, width, height);

    // Ruler
    const rulerGrad = ctx.createLinearGradient(0, 0, 0, RULER_HEIGHT);
    rulerGrad.addColorStop(0, '#222');
    rulerGrad.addColorStop(1, '#181818');
    ctx.fillStyle = rulerGrad;
    ctx.fillRect(0, 0, width, RULER_HEIGHT);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT - 0.5);
    ctx.lineTo(width, RULER_HEIGHT - 0.5);
    ctx.stroke();

    // Time markers — adaptive step so tick density stays readable at any zoom.
    ctx.fillStyle = '#888';
    ctx.font = '10px "SF Mono", Consolas, monospace';

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

      ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)';
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

    // Video track (V1) — visual clip bar like Premiere/FCP
    const videoY = RULER_HEIGHT + 2;
    if (duration > 0) {
      const clipWidth = duration * effectivePixelsPerSecond;
      const videoGrad = ctx.createLinearGradient(PADDING, videoY, PADDING, videoY + VIDEO_TRACK_HEIGHT);
      videoGrad.addColorStop(0, 'rgba(91, 141, 239, 0.55)');
      videoGrad.addColorStop(1, 'rgba(91, 141, 239, 0.25)');
      ctx.fillStyle = videoGrad;
      ctx.fillRect(PADDING, videoY, clipWidth, VIDEO_TRACK_HEIGHT);
      ctx.strokeStyle = 'rgba(91, 141, 239, 0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(PADDING + 0.5, videoY + 0.5, clipWidth - 1, VIDEO_TRACK_HEIGHT - 1);

      if (activeClip) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        const label = activeClip.name.length > 28 ? `${activeClip.name.slice(0, 26)}…` : activeClip.name;
        ctx.fillText(label, PADDING + 6, videoY + VIDEO_TRACK_HEIGHT / 2 + 4);
      }
    }

    // Waveform area (A1)
    const waveY = RULER_HEIGHT + VIDEO_TRACK_HEIGHT + TRACK_GAP + 4;
    ctx.fillStyle = '#101010';
    ctx.fillRect(PADDING, waveY, duration * effectivePixelsPerSecond, WAVE_HEIGHT);
    ctx.strokeStyle = 'rgba(62, 207, 142, 0.15)';
    ctx.strokeRect(PADDING + 0.5, waveY + 0.5, duration * effectivePixelsPerSecond - 1, WAVE_HEIGHT - 1);

    // Draw waveform with symmetric min/max bars and a vertical gradient
    if (waveform && waveform.samples.length > 0 && duration > 0) {
      const samples = waveform.samples;
      const totalPixels = Math.max(1, Math.floor(duration * effectivePixelsPerSecond));
      const samplesPerPixel = Math.max(1, Math.floor(samples.length / totalPixels));

      const centerY = waveY + WAVE_HEIGHT / 2;
      const gradient = ctx.createLinearGradient(0, waveY, 0, waveY + WAVE_HEIGHT);
      gradient.addColorStop(0, '#5eead4');
      gradient.addColorStop(0.45, '#3ecf8e');
      gradient.addColorStop(1, '#1a9f5e');
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
        regionGradient.addColorStop(0, 'rgba(245, 197, 66, 0.28)');
        regionGradient.addColorStop(1, 'rgba(245, 197, 66, 0.08)');
        ctx.fillStyle = regionGradient;
        ctx.fillRect(aX, waveY, bX - aX, WAVE_HEIGHT);

        ctx.strokeStyle = 'rgba(245, 197, 66, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(aX, waveY);
        ctx.lineTo(aX, waveY + WAVE_HEIGHT);
        ctx.moveTo(bX, waveY);
        ctx.lineTo(bX, waveY + WAVE_HEIGHT);
        ctx.stroke();

        const drawBracketHandle = (
          x: number,
          side: 'in' | 'out',
          label: string,
          color: string,
          hovered: boolean
        ) => {
          const arm = BRACKET_ARM + (hovered ? 2 : 0);
          const lineW = hovered ? 3.5 : 2.5;
          const top = waveY + 2;
          const bottom = waveY + WAVE_HEIGHT - 2;

          ctx.save();
          ctx.shadowColor = color;
          ctx.shadowBlur = hovered ? 12 : 5;
          ctx.strokeStyle = color;
          ctx.lineWidth = lineW;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          ctx.beginPath();
          if (side === 'in') {
            ctx.moveTo(x + arm, top);
            ctx.lineTo(x, top);
            ctx.lineTo(x, bottom);
            ctx.lineTo(x + arm, bottom);
          } else {
            ctx.moveTo(x - arm, top);
            ctx.lineTo(x, top);
            ctx.lineTo(x, bottom);
            ctx.lineTo(x - arm, bottom);
          }
          ctx.stroke();
          ctx.restore();

          const badgeY = waveY - 5;
          const badgeW = 14;
          const badgeH = 12;
          const badgeX = side === 'in' ? x + arm + 2 : x - arm - badgeW - 2;
          ctx.fillStyle = hovered ? color : 'rgba(0,0,0,0.55)';
          ctx.fillRect(badgeX, badgeY - badgeH + 2, badgeW, badgeH);
          ctx.fillStyle = hovered ? '#111' : color;
          ctx.font = 'bold 9px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(label, badgeX + badgeW / 2, badgeY);
        };

        drawBracketHandle(
          aX,
          'in',
          'A',
          hoverTarget === 'a' || isDragging === 'a' ? '#ff8585' : '#ff6b6b',
          hoverTarget === 'a' || isDragging === 'a'
        );
        drawBracketHandle(
          bX,
          'out',
          'B',
          hoverTarget === 'b' || isDragging === 'b' ? '#6fe0d8' : '#4ecdc4',
          hoverTarget === 'b' || isDragging === 'b'
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

    // Playhead — draggable circle in ruler + line through tracks
    const playX = timeToX(currentTime);
    const playheadActive = hoverTarget === 'playhead' || isDragging === 'playhead';
    const playheadR = playheadActive ? PLAYHEAD_RADIUS + 1.5 : PLAYHEAD_RADIUS;
    const playheadCy = RULER_HEIGHT / 2 + 1;

    ctx.strokeStyle = '#f5c542';
    ctx.lineWidth = playheadActive ? 2.5 : 2;
    ctx.beginPath();
    ctx.moveTo(playX, RULER_HEIGHT - 1);
    ctx.lineTo(playX, height);
    ctx.stroke();

    ctx.save();
    ctx.shadowColor = '#f5c542';
    ctx.shadowBlur = playheadActive ? 14 : 8;
    ctx.fillStyle = playheadActive ? '#ffe08a' : '#f5c542';
    ctx.beginPath();
    ctx.arc(playX, playheadCy, playheadR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3d3200';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#1a1400';
    ctx.beginPath();
    ctx.arc(playX, playheadCy, 3, 0, Math.PI * 2);
    ctx.fill();
  }, [waveform, duration, currentTime, region, zoom, effectivePixelsPerSecond, timeToX, xToTime, hoverTarget, isDragging, activeClip]);

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

  const waveformTop = RULER_HEIGHT + VIDEO_TRACK_HEIGHT + TRACK_GAP + 4;

  const getHitTarget = useCallback(
    (x: number, y: number): HitTarget => {
      const playX = timeToX(currentTime);
      const hasRegion = region.end > region.start;
      const aX = hasRegion ? timeToX(region.start) : null;
      const bX = hasRegion ? timeToX(region.end) : null;

      const inRuler = y <= RULER_HEIGHT + RULER_HIT_EXTRA;
      const inWaveform = y >= waveformTop - 8;

      const distPlay = Math.abs(x - playX);
      const nearPlayhead = distPlay <= PLAYHEAD_HIT_RADIUS;

      const nearA =
        hasRegion && aX !== null
          ? x >= aX - 4 && x <= aX + BRACKET_ARM + BRACKET_HIT_RADIUS / 2
          : false;
      const nearB =
        hasRegion && bX !== null
          ? x >= bX - BRACKET_ARM - BRACKET_HIT_RADIUS / 2 && x <= bX + 4
          : false;

      // Ruler band: playhead circle has priority (avoids fighting with A/B below)
      if (inRuler && nearPlayhead) return 'playhead';

      // Waveform band: bracket handles (biased zones so [ and ] are easier to grab)
      if (inWaveform && hasRegion) {
        const trackHits: Array<{ target: DragTarget; dist: number }> = [];
        if (nearA && aX !== null) trackHits.push({ target: 'a', dist: Math.abs(x - aX) });
        if (nearB && bX !== null) trackHits.push({ target: 'b', dist: Math.abs(x - bX) });

        if (trackHits.length === 1) return trackHits[0].target;
        if (trackHits.length > 1) {
          trackHits.sort((a, b) => a.dist - b.dist);
          return trackHits[0].target;
        }
      }

      if (nearPlayhead) return 'playhead';
      return null;
    },
    [currentTime, region.start, region.end, timeToX, waveformTop]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const time = xToTime(x);
      const target = getHitTarget(x, y);

      if (target === 'a') {
        setIsDragging('a');
      } else if (target === 'b') {
        setIsDragging('b');
      } else if (target === 'playhead') {
        setIsDragging('playhead');
      } else {
        setIsDragging('playhead');
        setCurrentTime(time);
      }
    },
    [getHitTarget, setCurrentTime, xToTime]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setHoverTarget(getHitTarget(x, y));
    },
    [getHitTarget]
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

  const cursor =
    isDragging === 'a' || isDragging === 'b' || hoverTarget === 'a' || hoverTarget === 'b'
      ? 'cursor-ew-resize'
      : isDragging === 'playhead'
        ? 'cursor-grabbing'
        : hoverTarget === 'playhead'
          ? 'cursor-grab'
          : 'cursor-pointer';

  const timelineHeight = RULER_HEIGHT + VIDEO_TRACK_HEIGHT + TRACK_GAP + WAVE_HEIGHT + 16;

  const timelineStatus = useMemo(() => {
    if (duration > 0 && duration < 1) {
      return {
        text: `Clip muy corto (${duration.toFixed(1)}s). Usa 3–10s para mejores resultados.`,
        tone: 'warning' as const,
      };
    }
    if (duration > 0 && !waveform) {
      return { text: 'Extrayendo forma de onda…', tone: 'info' as const };
    }
    if (duration > 0 && region.end === region.start) {
      return { text: 'Marca A y B para elegir el segmento de referencia', tone: 'info' as const };
    }
    return null;
  }, [duration, waveform, region.end, region.start]);

  return (
    <div className="border-t border-white/[0.08] bg-[#121212] shrink-0">
      <div className="nle-toolbar justify-between flex-wrap gap-y-1">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <NleIconButton
            icon={<BracketInIcon size={15} />}
            label="Marcar A en cabezal (I)"
            onClick={() => setMarkA(currentTime)}
            variant="accent-a"
          />
          <NleIconButton
            icon={<BracketOutIcon size={15} />}
            label="Marcar B en cabezal (O)"
            onClick={() => setMarkB(currentTime)}
            variant="accent-b"
          />
          <NleIconButton
            icon={<Eraser size={14} />}
            label="Clear A/B region (R)"
            onClick={resetRegion}
          />
          <NleIconButton
            icon={<Timer size={14} />}
            label="Select first 5 seconds"
            onClick={handleAutoRegion}
          />
          <span className="text-white/35 hidden lg:inline text-[10px] ml-1">
            I / O · [ ] en pista · círculo = cabezal
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="nle-timecode text-[10px] text-white/50">
            {region.end > region.start
              ? `${formatSeconds(region.end - region.start)} IN/OUT`
              : 'Sin selección'}
          </span>
          <div className="flex items-center gap-0.5 pl-2 border-l border-white/[0.08]">
            <NleIconButton icon={<ZoomOut size={14} />} label="Zoom out" onClick={handleZoomOut} />
            <button
              type="button"
              onClick={handleZoomReset}
              className="nle-btn nle-timecode min-w-[3rem] px-2"
              title="Reset zoom"
            >
              {zoom < 0.1 ? zoom.toFixed(3) : zoom.toFixed(1)}×
            </button>
            <NleIconButton icon={<Maximize2 size={14} />} label="Fit to view" onClick={handleZoomFit} />
            <NleIconButton icon={<ZoomIn size={14} />} label="Zoom in" onClick={handleZoomIn} />
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Track headers — Premiere/FCP style */}
        <div
          className="shrink-0 border-r border-white/[0.08] bg-[#161616] select-none"
          style={{ width: TRACK_HEADER_WIDTH }}
        >
          <div
            className="border-b border-white/[0.06] flex items-end px-2 pb-1"
            style={{ height: RULER_HEIGHT }}
          >
            <span className="text-[9px] text-white/30 uppercase tracking-wider">Timeline</span>
          </div>
          <div
            className="flex items-center gap-1.5 px-2 border-b border-white/[0.04]"
            style={{ height: VIDEO_TRACK_HEIGHT + 2 }}
          >
            <span className="w-5 h-5 rounded-sm bg-[#5b8def]/20 text-[#5b8def] text-[9px] font-bold flex items-center justify-center">
              V1
            </span>
            <span className="text-[9px] text-white/40 truncate">Video</span>
          </div>
          <div
            className="flex items-center gap-1.5 px-2"
            style={{ height: TRACK_GAP + WAVE_HEIGHT + 16 }}
          >
            <span className="w-5 h-5 rounded-sm bg-[#3ecf8e]/20 text-[#3ecf8e] text-[9px] font-bold flex items-center justify-center">
              A1
            </span>
            <span className="text-[9px] text-white/40 truncate">Audio</span>
          </div>
        </div>

        <div
          ref={containerRef}
          className="relative flex-1 bg-[#0d0d0d] overflow-x-auto select-none"
          style={{ height: timelineHeight }}
        >
          {timelineStatus && (
            <div
              className={`absolute left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-md text-[10px] pointer-events-none max-w-[calc(100%-1rem)] text-center backdrop-blur-sm border ${
                timelineStatus.tone === 'warning'
                  ? 'top-2 bg-amber-950/80 border-amber-500/30 text-amber-100'
                  : 'top-1/2 -translate-y-1/2 bg-black/75 border-white/10 text-white/80'
              }`}
            >
              {timelineStatus.text}
            </div>
          )}
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverTarget(null)}
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
    </div>
  );
}

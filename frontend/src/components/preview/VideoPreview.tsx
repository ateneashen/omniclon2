import { useRef, useEffect, useState, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useEditorStore } from '../../stores/editorStore';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}.${pad(ms)}`;
  return `${pad(m)}:${pad(s)}.${pad(ms)}`;
}

export default function VideoPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayIcon, setOverlayIcon] = useState<'play' | 'pause'>('play');
  const overlayTimeoutRef = useRef<number | null>(null);

  const {
    activeClipId,
    clips,
    currentTime,
    isPlaying,
    region,
    isLooping,
    setCurrentTime,
    setPlaying,
  } = useEditorStore();

  const activeClip = clips.find((c) => c.id === activeClipId);

  const clearOverlayTimeout = useCallback(() => {
    if (overlayTimeoutRef.current) {
      window.clearTimeout(overlayTimeoutRef.current);
      overlayTimeoutRef.current = null;
    }
  }, []);

  const triggerOverlay = useCallback(
    (icon: 'play' | 'pause') => {
      clearOverlayTimeout();
      setOverlayIcon(icon);
      setShowOverlay(true);
      overlayTimeoutRef.current = window.setTimeout(() => {
        setShowOverlay(false);
      }, 800);
    },
    [clearOverlayTimeout]
  );

  // Sync currentTime from store to video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeClip) return;

    const onTimeUpdate = () => {
      if (Math.abs(video.currentTime - currentTime) > 0.05) {
        setCurrentTime(video.currentTime);
      }
    };

    const onEnded = () => setPlaying(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEnded);
    };
  }, [activeClip, currentTime, setCurrentTime, setPlaying]);

  // Sync play/pause from store
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying]);

  // Seek when currentTime changes from outside (timeline)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (Math.abs(video.currentTime - currentTime) > 0.1) {
      video.currentTime = currentTime;
    }
  }, [currentTime]);

  // A-B Looping
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isLooping || region.end <= region.start) return;

    const checkLoop = () => {
      if (video.currentTime >= region.end) {
        video.currentTime = region.start;
        if (isPlaying) video.play().catch(() => {});
      }
    };

    const interval = setInterval(checkLoop, 80);
    return () => clearInterval(interval);
  }, [isLooping, region, isPlaying]);

  const handleClick = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setPlaying(true);
      triggerOverlay('play');
    } else {
      setPlaying(false);
      triggerOverlay('pause');
    }
  }, [setPlaying, triggerOverlay]);

  if (!activeClip) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black/70 text-white/40 text-sm">
        Load a clip to preview
      </div>
    );
  }

  const videoSrc = convertFileSrc(activeClip.path);

  return (
    <div className="flex-1 bg-black flex items-center justify-center relative overflow-hidden">
      <video
        ref={videoRef}
        src={videoSrc}
        className="max-h-full max-w-full"
        controls={false}
        onClick={handleClick}
      />

      {showOverlay && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
          <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center text-white/90 text-3xl">
            {overlayIcon === 'play' ? '▶' : '⏸'}
          </div>
        </div>
      )}

      <div className="absolute bottom-3 left-3 text-[11px] text-white/80 bg-black/60 px-2 py-0.5 rounded">
        {formatTime(currentTime)} / {formatTime(activeClip.duration)}
      </div>

      <div className="absolute bottom-3 right-3 text-[10px] text-white/40 bg-black/50 px-1.5 py-0.5 rounded truncate max-w-[40%]">
        {activeClip.name}
      </div>
    </div>
  );
}

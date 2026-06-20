import { useRef, useEffect, useState, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useEditorStore } from '../../stores/editorStore';
import { logError } from '../../lib/log';
import VideoTransportControls from './VideoTransportControls';

export default function VideoPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayIcon, setOverlayIcon] = useState<'play' | 'pause'>('play');
  const [videoError, setVideoError] = useState<string | null>(null);
  // Start unmuted so the user can hear the source audio while scrubbing.
  const [muted, setMuted] = useState(false);
  const overlayTimeoutRef = useRef<number | null>(null);

  const activeClipId = useEditorStore((s) => s.activeClipId);
  const clips = useEditorStore((s) => s.clips);
  const currentTime = useEditorStore((s) => s.currentTime);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const region = useEditorStore((s) => s.region);
  const isLooping = useEditorStore((s) => s.isLooping);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const toggleLoop = useEditorStore((s) => s.toggleLoop);

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

  // Reset video state when the active clip changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeClip) return;
    setVideoError(null);
    video.pause();
    video.currentTime = 0;
    setPlaying(false);
    // Ensure the element starts unmuted and at full volume so the user can
    // hear source audio while scrubbing.
    video.muted = false;
    video.volume = 1;
    setMuted(false);
    video.load();
  }, [activeClip, setPlaying]);

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
  }, [activeClip, setCurrentTime, setPlaying]);

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

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !muted;
    setMuted(next);
    video.muted = next;
  }, [muted]);

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
        key={activeClip.id}
        ref={videoRef}
        src={videoSrc}
        className="max-h-full max-w-full"
        controls={false}
        preload="auto"
        playsInline
        muted={muted}
        onClick={handleClick}
        onLoadedMetadata={() => {
          setVideoError(null);
          if (videoRef.current) {
            videoRef.current.currentTime = currentTime;
            videoRef.current.muted = muted;
            videoRef.current.volume = 1;
          }
        }}
        onError={(e) => {
          const target = e.currentTarget;
          const code = target.error?.code ?? 'unknown';
          const message = target.error?.message ?? 'Could not load video';
          setVideoError(`Video error ${code}: ${message}`);
          logError('VideoPreview', 'Video element error', message, { code, src: activeClip.path });
        }}
      />

      {showOverlay && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
          <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center text-white/90 text-3xl">
            {overlayIcon === 'play' ? '▶' : '⏸'}
          </div>
        </div>
      )}

      <div className="absolute top-3 left-3 text-[10px] text-white/40 bg-black/50 px-1.5 py-0.5 rounded truncate max-w-[50%]">
        {activeClip.name}
      </div>

      <VideoTransportControls
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={activeClip.duration}
        isLooping={isLooping}
        muted={muted}
        region={region}
        onPlayPause={handleClick}
        onSeek={setCurrentTime}
        onToggleLoop={toggleLoop}
        onToggleMute={toggleMute}
      />

      {videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-center p-4">
          <div className="text-red-300 text-xs max-w-xs">
            <p className="font-medium mb-1">No se pudo reproducir el video</p>
            <p className="text-white/60">{videoError}</p>
          </div>
        </div>
      )}
    </div>
  );
}

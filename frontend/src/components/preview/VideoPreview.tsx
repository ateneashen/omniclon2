import { useRef, useEffect, useState, useCallback } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { Film, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { logError, logInfo } from '../../lib/log';
import { captureFilename, joinPath } from '../../lib/frameCapture';
import VideoTransportControls from './VideoTransportControls';

export default function VideoPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayIcon, setOverlayIcon] = useState<'play' | 'pause'>('play');
  const [videoError, setVideoError] = useState<string | null>(null);
  // Start unmuted so the user can hear the source audio while scrubbing.
  const [muted, setMuted] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureNotice, setCaptureNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const overlayTimeoutRef = useRef<number | null>(null);
  const captureNoticeTimeoutRef = useRef<number | null>(null);

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

  const showCaptureNotice = useCallback((text: string, ok: boolean) => {
    if (captureNoticeTimeoutRef.current) {
      window.clearTimeout(captureNoticeTimeoutRef.current);
    }
    setCaptureNotice({ text, ok });
    captureNoticeTimeoutRef.current = window.setTimeout(() => {
      setCaptureNotice(null);
      captureNoticeTimeoutRef.current = null;
    }, 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (captureNoticeTimeoutRef.current) {
        window.clearTimeout(captureNoticeTimeoutRef.current);
      }
    };
  }, []);

  const captureFrameToPath = useCallback(
    async (outputPath: string) => {
      if (!activeClip) {
        throw new Error('No hay clip activo.');
      }
      return invoke<string>('capture_video_frame', {
        path: activeClip.path,
        timeSeconds: currentTime,
        outputPath,
      });
    },
    [activeClip, currentTime]
  );

  const handleCaptureFrame = useCallback(async () => {
    setIsCapturing(true);
    try {
      const capturesDir = await invoke<string>('get_captures_dir');
      const filename = captureFilename();
      const path = joinPath(capturesDir, filename);
      await captureFrameToPath(path);
      logInfo('VideoPreview', 'Frame capture saved', { path, filename });
      showCaptureNotice(`Captura guardada: ${filename}`, true);
    } catch (err) {
      logError('VideoPreview', 'Frame capture failed', err);
      showCaptureNotice(`Captura fallida: ${String(err)}`, false);
    } finally {
      setIsCapturing(false);
    }
  }, [captureFrameToPath, showCaptureNotice]);

  const handleCaptureFrameAs = useCallback(async () => {
    setIsCapturing(true);
    try {
      const capturesDir = await invoke<string>('get_captures_dir');
      const filename = captureFilename();
      const path = await save({
        filters: [{ name: 'Imagen PNG', extensions: ['png'] }],
        defaultPath: joinPath(capturesDir, filename),
      });
      if (!path) return;
      await captureFrameToPath(path);
      logInfo('VideoPreview', 'Frame capture saved (custom path)', { path });
      showCaptureNotice('Captura guardada en ubicación personalizada', true);
    } catch (err) {
      logError('VideoPreview', 'Frame capture save-as failed', err);
      showCaptureNotice(`Captura fallida: ${String(err)}`, false);
    } finally {
      setIsCapturing(false);
    }
  }, [captureFrameToPath, showCaptureNotice]);

  if (!activeClip) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0a0a] text-white/40 gap-3">
        <div className="w-16 h-16 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
          <Film size={28} className="text-white/25" />
        </div>
        <div className="text-center">
          <p className="text-sm text-white/50 font-medium">Monitor de video</p>
          <p className="text-xs text-white/30 mt-1">Carga un clip desde el panel Media</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-white/25">
          <Upload size={12} />
          <span>Arrastra un archivo o usa Load Video</span>
        </div>
      </div>
    );
  }

  const videoSrc = convertFileSrc(activeClip.path);

  return (
    <div className="flex-1 min-h-0 bg-[#050505] flex items-center justify-center relative overflow-hidden border-b border-white/[0.06]">
      <video
        key={activeClip.id}
        ref={videoRef}
        src={videoSrc}
        className="max-h-full max-w-full object-contain pb-16"
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
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/25">
          <div className="w-14 h-14 rounded-md bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/90">
            {overlayIcon === 'play' ? (
              <span className="text-2xl ml-1">▶</span>
            ) : (
              <span className="text-2xl">⏸</span>
            )}
          </div>
        </div>
      )}

      <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none z-10">
        <div className="flex items-center gap-2 max-w-[55%] min-w-0">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#5b8def] bg-[#5b8def]/15 border border-[#5b8def]/25 px-1.5 py-0.5 rounded-sm shrink-0">
            V1
          </span>
          <span className="text-[10px] text-white/60 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded truncate border border-white/[0.06]">
            {activeClip.name}
          </span>
        </div>

        {captureNotice && (
          <div
            className={`pointer-events-none flex items-center gap-1.5 max-w-[42%] text-[10px] px-2 py-1 rounded-md border backdrop-blur-sm ${
              captureNotice.ok
                ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-200'
                : 'bg-red-950/80 border-red-500/30 text-red-200'
            }`}
          >
            {captureNotice.ok ? <CheckCircle2 size={12} className="shrink-0" /> : <AlertCircle size={12} className="shrink-0" />}
            <span className="truncate">{captureNotice.text}</span>
          </div>
        )}
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
        onCaptureFrame={handleCaptureFrame}
        onCaptureFrameAs={handleCaptureFrameAs}
        isCapturing={isCapturing}
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

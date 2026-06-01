import { useRef, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';

export default function VideoPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { activeClipId, clips, currentTime, isPlaying, region, isLooping, setCurrentTime, setPlaying } = useEditorStore();

  const activeClip = clips.find(c => c.id === activeClipId);

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

  if (!activeClip) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black/70 text-white/40 text-sm">
        Load a clip to preview
      </div>
    );
  }

  return (
    <div className="flex-1 bg-black flex items-center justify-center relative overflow-hidden">
      <video
        ref={videoRef}
        src={`file://${activeClip.path}`}
        className="max-h-full max-w-full"
        controls={false}
        onClick={() => {
          const video = videoRef.current;
          if (!video) return;
          if (video.paused) {
            setPlaying(true);
          } else {
            setPlaying(false);
          }
        }}
      />
      <div className="absolute bottom-2 right-2 text-[10px] text-white/40 bg-black/50 px-1.5 py-0.5 rounded">
        {activeClip.name}
      </div>
    </div>
  );
}
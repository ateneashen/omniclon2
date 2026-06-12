import { useEffect } from 'react';
import { useEditorStore } from '../stores/editorStore';

export function useKeyboardShortcuts() {
  const {
    setCurrentTime,
    duration,
    currentTime,
    setRegion,
    isPlaying,
    setPlaying,
    toggleLoop,
    setMarkA,
    setMarkB,
  } = useEditorStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          setPlaying(!isPlaying);
          break;

        case 'i':
          setMarkA(currentTime);
          break;

        case 'o':
          setMarkB(currentTime);
          break;

        case 'l':
          toggleLoop();
          break;

        case 'arrowleft':
          setCurrentTime(Math.max(0, currentTime - (e.shiftKey ? 1 : 0.1)));
          break;

        case 'arrowright':
          setCurrentTime(Math.min(duration, currentTime + (e.shiftKey ? 1 : 0.1)));
          break;

        case 'home':
          setCurrentTime(0);
          break;

        case 'end':
          setCurrentTime(duration);
          break;

        case 'r':
          // Reset A-B to full
          setRegion({ start: 0, end: duration });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, duration, isPlaying, setPlaying, setCurrentTime, setRegion, toggleLoop, setMarkA, setMarkB]);
}
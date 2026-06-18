import { useEffect } from 'react';
import { useEditorStore } from '../stores/editorStore';

export function useKeyboardShortcuts() {
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const toggleLoop = useEditorStore((s) => s.toggleLoop);
  const setMarkA = useEditorStore((s) => s.setMarkA);
  const setMarkB = useEditorStore((s) => s.setMarkB);
  const resetRegion = useEditorStore((s) => s.resetRegion);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

      // Read fresh state directly from the store to avoid stale refs
      const state = useEditorStore.getState();

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          setPlaying(!state.isPlaying);
          break;

        case 'i':
          setMarkA(state.currentTime);
          break;

        case 'o':
          setMarkB(state.currentTime);
          break;

        case 'l':
          toggleLoop();
          break;

        case 'arrowleft':
          setCurrentTime(Math.max(0, state.currentTime - (e.shiftKey ? 1 : 0.1)));
          break;

        case 'arrowright':
          setCurrentTime(Math.min(state.duration, state.currentTime + (e.shiftKey ? 1 : 0.1)));
          break;

        case 'home':
          setCurrentTime(0);
          break;

        case 'end':
          setCurrentTime(state.duration);
          break;

        case 'r':
          // Reset A-B to full
          resetRegion();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setPlaying, setCurrentTime, toggleLoop, setMarkA, setMarkB, resetRegion]);
}

import { useState, useEffect } from 'react';
import { useEditorStore } from './stores/editorStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useBackendStatus } from './hooks/useBackendStatus';

import BootstrapSplash from './components/BootstrapSplash';
import Header from './components/layout/Header';
import MediaPanel from './components/panels/MediaPanel';
import VoicePanel from './components/panels/VoicePanel';
import VideoPreview from './components/preview/VideoPreview';
import Timeline from './components/timeline/Timeline';
import ModelsPanel from './components/models/ModelsPanel';

type LeftTab = 'media' | 'models';

function TimelineToolbar() {
  const { isPlaying, isLooping, setPlaying, setCurrentTime, toggleLoop } = useEditorStore();

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-white/10 bg-[#111]">
      <button
        onClick={() => setPlaying(!isPlaying)}
        className="px-2 py-0.5 bg-white/10 rounded hover:bg-white/15 transition"
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <button
        onClick={() => setCurrentTime(0)}
        className="px-2 py-0.5 bg-white/10 rounded hover:bg-white/15 transition"
      >
        Reset
      </button>
      <button
        onClick={toggleLoop}
        className={`px-2 py-0.5 rounded transition ${isLooping ? 'bg-[#00b4d8]/30 text-[#00b4d8]' : 'bg-white/10 hover:bg-white/15'}`}
      >
        Loop {isLooping ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}

function MainInterface() {
  const [leftTab, setLeftTab] = useState<LeftTab>('media');

  return (
    <div className="h-screen w-screen bg-[#0a0a0a] text-white flex flex-col overflow-hidden">
      <Header />

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Tabbed Panel (Media / Models) */}
        <div className="w-64 border-r border-white/10 p-3 text-sm flex flex-col shrink-0">
          <div className="flex mb-3 border-b border-white/10">
            <button
              onClick={() => setLeftTab('media')}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                leftTab === 'media'
                  ? 'border-[#00b4d8] text-white'
                  : 'border-transparent text-white/50 hover:text-white/80'
              }`}
            >
              Media
            </button>
            <button
              onClick={() => setLeftTab('models')}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                leftTab === 'models'
                  ? 'border-[#00b4d8] text-white'
                  : 'border-transparent text-white/50 hover:text-white/80'
              }`}
            >
              Models
            </button>
          </div>

          {leftTab === 'media' ? <MediaPanel /> : <ModelsPanel />}
        </div>

        {/* Center: Preview + Timeline */}
        <div className="flex-1 flex flex-col min-w-0">
          <VideoPreview />
          <TimelineToolbar />
          <Timeline />
        </div>

        {/* Right: Voice Panel */}
        <div className="w-72 border-l border-white/10 p-3 text-sm flex flex-col shrink-0">
          <VoicePanel />
        </div>
      </div>
    </div>
  );
}

const SPLASH_FADE_MS = 350;

function App() {
  useKeyboardShortcuts();
  const { isReady } = useBackendStatus(true);
  const [showSplash, setShowSplash] = useState(true);
  const [splashVisible, setSplashVisible] = useState(true);

  useEffect(() => {
    if (isReady) {
      setSplashVisible(false);
      const timer = setTimeout(() => setShowSplash(false), SPLASH_FADE_MS);
      return () => clearTimeout(timer);
    }
  }, [isReady]);

  return (
    <>
      {showSplash && (
        <div
          className="fixed inset-0 z-50 transition-opacity duration-[350ms]"
          style={{ opacity: splashVisible ? 1 : 0, pointerEvents: splashVisible ? 'auto' : 'none' }}
        >
          <BootstrapSplash />
        </div>
      )}
      <MainInterface />
    </>
  );
}

export default App;

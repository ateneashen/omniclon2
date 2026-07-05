import { useState, useEffect } from 'react';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useBackendStatus } from './hooks/useBackendStatus';

import BootstrapSplash from './components/BootstrapSplash';
import Header from './components/layout/Header';
import MediaPanel from './components/panels/MediaPanel';
import ScriptsPanel from './components/panels/ScriptsPanel';
import VoicePanel from './components/panels/VoicePanel';
import VideoPreview from './components/preview/VideoPreview';
import Timeline from './components/timeline/Timeline';
import ModelsPanel from './components/models/ModelsPanel';
import LogsPanel from './components/panels/LogsPanel';

type LeftTab = 'media' | 'models' | 'scripts' | 'logs';

function MainInterface() {
  const [leftTab, setLeftTab] = useState<LeftTab>('media');

  return (
    <div className="h-screen w-screen bg-[var(--nle-bg-app)] text-white flex flex-col overflow-hidden">
      <Header />

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Tabbed Panel (Media / Models) */}
        <div className="w-64 border-r border-white/[0.08] bg-[#121212] text-sm flex flex-col shrink-0">
          <div className="flex border-b border-white/[0.08] bg-[#161616]" role="tablist" aria-label="Left panel tabs">
            {(['media', 'models', 'scripts', 'logs'] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={leftTab === tab}
                tabIndex={leftTab === tab ? 0 : -1}
                onClick={() => setLeftTab(tab)}
                className={`flex-1 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                  leftTab === tab
                    ? 'border-[#00b4d8] text-white bg-white/[0.03]'
                    : 'border-transparent text-white/40 hover:text-white/70'
                }`}
              >
                {tab === 'media' ? 'Media' : tab === 'models' ? 'Models' : tab === 'scripts' ? 'Scripts' : 'Logs'}
              </button>
            ))}
          </div>

          <div role="tabpanel" className="flex-1 min-h-0 overflow-hidden p-3">
            {leftTab === 'media' ? <MediaPanel /> : leftTab === 'models' ? <ModelsPanel /> : leftTab === 'scripts' ? <ScriptsPanel /> : <LogsPanel />}
          </div>
        </div>

        {/* Center: Preview + Timeline */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a]">
          <VideoPreview />
          <Timeline />
        </div>

        {/* Right: Voice / Inspector Panel */}
        <div className="w-80 border-l border-white/[0.08] bg-[#121212] text-sm flex flex-col shrink-0 min-h-0 p-3">
          <VoicePanel />
        </div>
      </div>
    </div>
  );
}

const SPLASH_FADE_MS = 350;

function App() {
  useKeyboardShortcuts();
  const { isReady, status } = useBackendStatus(true);
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
          aria-hidden={!splashVisible}
        >
          <BootstrapSplash backendStatus={status} />
        </div>
      )}
      <div className={showSplash && splashVisible ? 'invisible' : ''} aria-hidden={showSplash && splashVisible}>
        <MainInterface />
      </div>
    </>
  );
}

export default App;

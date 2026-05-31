import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import BootstrapSplash from "./components/BootstrapSplash";

import Timeline from './components/timeline/Timeline';

// Real editor layout - Timeline + A/B Roll work has begun
function MainInterface() {
  return (
    <div className="h-screen w-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <div className="h-12 border-b border-white/10 flex items-center px-4 text-sm font-medium justify-between">
        <div>
          OmniClon 2 — Voice Clone Studio <span className="ml-2 text-xs text-white/40">(Timeline + A/B Roll in active development)</span>
        </div>
        <div className="text-xs text-emerald-400">Backend connected</div>
      </div>

      {/* Main 3-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Media Panel */}
        <div className="w-64 border-r border-white/10 p-3 text-sm flex flex-col">
          <div className="font-medium mb-3 flex items-center justify-between">
            Media
            <button className="text-xs px-2 py-0.5 bg-white/10 rounded hover:bg-white/15">Import</button>
          </div>
          <div className="flex-1 text-white/40 text-xs border border-dashed border-white/20 rounded flex items-center justify-center">
            Drag & drop video clips
          </div>
        </div>

        {/* Center: Preview + Timeline */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Video Preview */}
          <div className="flex-1 flex items-center justify-center bg-black/60 text-white/50 text-sm relative">
            <div>Video Preview Area</div>
            <div className="absolute bottom-3 right-3 text-[10px] text-white/30">Playback controls coming soon</div>
          </div>

          {/* Real Timeline Component */}
          <Timeline />
        </div>

        {/* Right: Voice Panel */}
        <div className="w-72 border-l border-white/10 p-3 text-sm flex flex-col">
          <div className="font-medium mb-3">Voice & Cloning</div>
          <div className="flex-1 text-white/40 text-xs">
            Model selector, emotion tags, reference audio from A-B, and Generate will be here.
          </div>
          <div className="text-[10px] text-white/30 mt-auto pt-2 border-t border-white/10">
            A/B Roll region will feed the voice reference
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [isReady, setIsReady] = useState(false);

  // Simple readiness check — in a real ambitious version this would come from the splash itself
  useEffect(() => {
    const check = async () => {
      try {
        const status: any = await invoke("get_bootstrap_status");
        if (status.is_healthy && status.stage === "ready") {
          // Small delay for polish
          setTimeout(() => setIsReady(true), 650);
        }
      } catch {
        // ignore during early bootstrap
      }
    };

    const interval = setInterval(check, 900);
    check();

    return () => clearInterval(interval);
  }, []);

  if (!isReady) {
    return <BootstrapSplash />;
  }

  return <MainInterface />;
}

export default App;
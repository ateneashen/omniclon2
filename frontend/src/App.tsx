import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import BootstrapSplash from "./components/BootstrapSplash";

// Basic main editor layout (starting the real interface in Paso 3)
function MainInterface() {
  return (
    <div className="h-screen w-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <div className="h-12 border-b border-white/10 flex items-center px-4 text-sm font-medium">
        OmniClon 2 — Voice Clone Studio <span className="ml-2 text-xs text-white/40">(Phase 0 → Interface)</span>
      </div>

      {/* Main 3-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Media Panel */}
        <div className="w-64 border-r border-white/10 p-3 text-sm">
          <div className="font-medium mb-2">Media</div>
          <div className="text-white/40 text-xs">Drag & drop video clips here (coming soon)</div>
        </div>

        {/* Center: Preview + Timeline */}
        <div className="flex-1 flex flex-col">
          {/* Video Preview */}
          <div className="flex-1 flex items-center justify-center bg-black/40 text-white/40 text-sm">
            Video Preview + Playback Controls<br />
            (A/B Roll timeline coming in this phase)
          </div>

          {/* Timeline placeholder */}
          <div className="h-40 border-t border-white/10 bg-[#111] p-3 text-xs">
            <div className="text-white/60 mb-1">A/B Roll Timeline (in progress)</div>
            <div className="h-20 bg-black/50 rounded flex items-center justify-center text-white/30">
              Waveform + Draggable A/B handles will go here
            </div>
          </div>
        </div>

        {/* Right: Voice Panel */}
        <div className="w-72 border-l border-white/10 p-3 text-sm">
          <div className="font-medium mb-2">Voice & Cloning</div>
          <div className="text-white/40 text-xs">
            Emotion tags, style controls, model selector, and Generate button will live here.
          </div>
        </div>
      </div>

      <div className="h-8 border-t border-white/10 text-[10px] text-white/40 flex items-center px-4">
        Backend connected • Diagnostic logging active
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
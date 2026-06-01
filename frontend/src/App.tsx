import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import BootstrapSplash from "./components/BootstrapSplash";
import { useEditorStore } from "./stores/editorStore";
import { MediaClip } from "./types";
import VideoPreview from "./components/preview/VideoPreview";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

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
            <button 
              onClick={async () => {
                // Simple test import for development
                const testPath = "C:\\AI\\OmniClon2\\tests\\fixtures\\sample.mp4";
                try {
                  const clip = await invoke<MediaClip>("import_media", { path: testPath });
                  useEditorStore.getState().addClip(clip);
                  
                  // Load real waveform
                  const wf = await invoke<any>("extract_waveform", { path: clip.path });
                  useEditorStore.getState().setWaveform(wf);
                } catch (e) {
                  console.error("Import failed", e);
                  alert("Test import failed. Check logs.");
                }
              }}
              className="text-xs px-2 py-0.5 bg-white/10 rounded hover:bg-white/15"
            >
              Load Test
            </button>
          </div>
          <div className="flex-1 text-white/40 text-xs border border-dashed border-white/20 rounded flex items-center justify-center">
            Drag & drop video clips (coming soon)
          </div>
        </div>

        {/* Center: Preview + Timeline */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Real Video Preview */}
          <VideoPreview />

          {/* Real Timeline Component */}
          <div className="border-t border-white/10 bg-[#111]">
            <div className="flex items-center gap-2 px-3 py-1 text-xs border-b border-white/10">
              <button onClick={() => useEditorStore.getState().setPlaying(!useEditorStore.getState().isPlaying)} className="px-2 py-0.5 bg-white/10 rounded">
                {useEditorStore.getState().isPlaying ? 'Pause' : 'Play'}
              </button>
              <button onClick={() => useEditorStore.getState().setCurrentTime(0)} className="px-2 py-0.5 bg-white/10 rounded">Reset</button>
              <span className="text-white/50">A/B Loop: {useEditorStore.getState().isLooping ? 'ON' : 'OFF'}</span>
            </div>
            <Timeline />
          </div>
        </div>

        {/* Right: Voice Panel (early) */}
        <div className="w-72 border-l border-white/10 p-3 text-sm flex flex-col">
          <div className="font-medium mb-3">Voice & Cloning</div>
          <div className="flex-1 text-white/40 text-xs space-y-2">
            <div>Model selector + Emotion/Style tags (coming)</div>
            <button 
              onClick={async () => {
                const { activeClipId, clips, region } = useEditorStore.getState();
                if (!activeClipId) return alert("No clip selected");
                const clip = clips.find(c => c.id === activeClipId);
                if (!clip) return;

                try {
                  const outPath = await invoke<string>("extract_segment", {
                    path: clip.path,
                    startTime: region.start,
                    endTime: region.end
                  });
                  alert(`A-B segment exported to:\n${outPath}\n\nReady to use as voice reference.`);
                } catch (e) {
                  alert("Export failed: " + e);
                }
              }}
              className="w-full mt-2 px-3 py-1.5 bg-[#00b4d8] text-black text-xs font-medium rounded hover:bg-[#0099b8]"
            >
              Export A-B as Voice Reference
            </button>
          </div>
          <div className="text-[10px] text-white/30 mt-auto pt-2 border-t border-white/10">
            A/B region → Voice reference
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  useKeyboardShortcuts();
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